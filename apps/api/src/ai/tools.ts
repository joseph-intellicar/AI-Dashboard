/**
 * Insight AI tools (REQUIREMENTS §17.5). The model only describes what it wants; the server validates
 * it with the builder's rules and runs queries through the same engine as /api/query.
 */
import {
  AI_QUERY_MAX_ROWS,
  ATTRIBUTE_KEYS,
  ATTRIBUTES,
  ClarifyArgsSchema,
  describeQuery,
  effectiveDateFilter,
  formatChange,
  formatDate,
  formatValue,
  GRAINS,
  getAttribute,
  MEASURE_KEYS,
  MEASURES,
  normaliseOptions,
  PRESET_LABELS,
  PRESETS,
  previousRange,
  proposalToConfig,
  ProposeArgsSchema,
  queryArgsToTableConfig,
  queryPart,
  QueryDataArgsSchema,
  resolveDateFilter,
  WIDGET_TYPES,
  type AiClarification,
  type AiEvent,
  type AiSource,
  type DateFilter,
  type QueryDataArgs,
  type QueryResult,
  type ResultColumn,
  type WidgetConfig,
  type WidgetDateRange,
} from '@insightflow/shared';
import { randomBytes } from 'node:crypto';
import type { ZodError } from 'zod';
import type { ToolCall, ToolDef } from './model';

// ---------------------------------------------------------------------------
// Tool definitions (JSON Schema generated from the catalog)
// ---------------------------------------------------------------------------

const CATEGORICAL = ATTRIBUTES.filter((a) => a.kind !== 'date').map((a) => a.key);

const dateRangeSchema = {
  type: 'object',
  description:
    'Period. mode "dashboard" follows the dashboard filter; "preset" needs preset; "custom" needs from and to (YYYY-MM-DD, IST).',
  properties: {
    mode: { type: 'string', enum: ['dashboard', 'preset', 'custom'] },
    preset: { type: 'string', enum: [...PRESETS] },
    from: { type: 'string', description: 'YYYY-MM-DD' },
    to: { type: 'string', description: 'YYYY-MM-DD' },
  },
  required: ['mode'],
};

const filterSchema = {
  type: 'object',
  description:
    'Optional filter on one categorical attribute. Values must be exact values listed in the catalog.',
  properties: {
    attribute: { type: 'string', enum: CATEGORICAL },
    op: { type: 'string', enum: ['in', 'not_in'] },
    values: { type: 'array', items: { type: 'string' }, minItems: 1 },
  },
  required: ['attribute', 'values'],
};

const sortSchema = {
  type: 'object',
  properties: {
    by: { type: 'string', description: 'a selected measure or attribute key' },
    dir: { type: 'string', enum: ['asc', 'desc'] },
  },
  required: ['by'],
};

const attributeSchema = {
  type: 'object',
  properties: {
    key: { type: 'string', enum: [...ATTRIBUTE_KEYS] },
    grain: { type: 'string', enum: [...GRAINS], description: 'only for order_date' },
  },
  required: ['key'],
};

export function toolDefinitions(): ToolDef[] {
  return [
    {
      name: 'propose_visualization',
      description:
        'Show the user a visualization preview in the chat (it is rendered with real data; the user can add it to their dashboard). Use only listed types, measures and attributes.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: [...WIDGET_TYPES] },
          measures: {
            type: 'array',
            items: { type: 'string', enum: [...MEASURE_KEYS] },
            description: 'not for tables',
          },
          attribute: { ...attributeSchema, description: 'group-by attribute; not for kpi or tables' },
          columns: {
            type: 'array',
            description: 'tables only: 1–6 ordered columns, at least one measure',
            items: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: ['measure', 'attribute'] },
                key: { type: 'string' },
                grain: { type: 'string', enum: [...GRAINS] },
              },
              required: ['kind', 'key'],
            },
          },
          dateRange: dateRangeSchema,
          filter: filterSchema,
          sort: sortSchema,
          limit: { type: 'integer', minimum: 1, maximum: 50, description: 'top-N for bar/hbar/donut/table' },
          compare: {
            type: 'boolean',
            description: 'kpi: compare with previous period; line: dashed previous period',
          },
          title: { type: 'string', description: 'only if the user asked for a specific title' },
          replacesPreview: {
            type: 'boolean',
            description: 'true when refining the open preview (updates it in place)',
          },
        },
        required: ['type'],
      },
    },
    {
      name: 'query_data',
      description:
        'Get exact numbers from the sales data. Returns formatted rows and totals. Use this before stating any number.',
      parameters: {
        type: 'object',
        properties: {
          measures: {
            type: 'array',
            items: { type: 'string', enum: [...MEASURE_KEYS] },
            minItems: 1,
            maxItems: 4,
          },
          attributes: { type: 'array', items: attributeSchema, maxItems: 2, description: 'group by (0–2)' },
          dateRange: dateRangeSchema,
          filter: filterSchema,
          sort: sortSchema,
          limit: { type: 'integer', minimum: 1, maximum: AI_QUERY_MAX_ROWS },
          compare: { type: 'boolean', description: 'also return the previous period and the change' },
        },
        required: ['measures'],
      },
    },
    {
      name: 'ask_clarification',
      description:
        'Ask the user to choose when guessing would change the result. At most 2 questions, 2–4 options each, exactly one recommended. Options must be catalog keys.',
      parameters: {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            maxItems: 2,
            items: {
              type: 'object',
              properties: {
                question: { type: 'string' },
                options: {
                  type: 'array',
                  minItems: 2,
                  maxItems: 4,
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string' },
                      value: {
                        type: 'string',
                        description:
                          'a measure key, attribute key ("none" = no breakdown), preset or visualization type',
                      },
                      kind: { type: 'string', enum: ['measure', 'attribute', 'preset', 'type'] },
                      recommended: { type: 'boolean' },
                    },
                    required: ['label', 'value', 'kind'],
                  },
                },
              },
              required: ['question', 'options'],
            },
          },
        },
        required: ['questions'],
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export interface ToolContext {
  runQuery: (body: unknown) => Promise<QueryResult>;
  dashboardFilter: DateFilter;
  now: Date;
  dataRange: { from: string; to: string } | null;
  attributeValues: Record<string, string[]>;
}

export interface ToolState {
  /** The preview that refinements replace (from the client, then the latest one shown). */
  openPreviewId: string | null;
}

export interface ToolOutcome {
  /** Sent back to the model as the tool result. */
  result: string;
  events: AiEvent[];
  /** Clarification shown: the turn ends here. */
  endTurn?: boolean;
  /** A proposal that failed validation (counts towards the retry limit). */
  invalidProposal?: boolean;
  /** query_data: what was queried, for the "Based on" line. */
  source?: AiSource;
}

const newPreviewId = () => `p_${randomBytes(5).toString('hex')}`;

function zodProblems(err: ZodError): string[] {
  return err.issues.map((i) => {
    const path = i.path.join('.');
    if (i.code === 'invalid_value') return `${path}: not a valid value — use a key from the catalog`;
    return `${path ? `${path}: ` : ''}${i.message}`;
  });
}

function parseArgs(call: ToolCall): unknown {
  try {
    return call.arguments.trim() ? JSON.parse(call.arguments) : {};
  } catch {
    return Symbol.for('invalid-json');
  }
}

const problemResult = (problems: string[], what: string) =>
  `ERROR: ${what} is not valid and was NOT shown to the user:\n- ${problems.join('\n- ')}\nFix these and call the tool again, or explain to the user.`;

/** Filter values must exist; custom ranges must touch the data. */
function dataProblems(
  ctx: ToolContext,
  filter: { attribute: string; values: string[] } | null | undefined,
  range: WidgetDateRange | undefined,
): string[] {
  const problems: string[] = [];
  if (filter) {
    const known = ctx.attributeValues[filter.attribute];
    const unknown = known ? filter.values.filter((v) => !known.includes(v)) : [];
    if (unknown.length)
      problems.push(
        `${getAttribute(filter.attribute).label} has no value ${unknown.map((v) => `"${v}"`).join(', ')}. Valid values: ${known!.slice(0, 40).join(', ')}`,
      );
  }
  if (
    range?.mode === 'custom' &&
    ctx.dataRange &&
    (range.to < ctx.dataRange.from || range.from > ctx.dataRange.to)
  ) {
    problems.push(
      `There is no data in that period. Data exists from ${ctx.dataRange.from} to ${ctx.dataRange.to}.`,
    );
  }
  return problems;
}

export function executePropose(call: ToolCall, ctx: ToolContext, state: ToolState): ToolOutcome {
  const raw = parseArgs(call);
  if (typeof raw === 'symbol')
    return {
      result: problemResult(['arguments are not valid JSON'], 'The proposal'),
      events: [],
      invalidProposal: true,
    };
  const parsed = ProposeArgsSchema.safeParse(raw);
  if (!parsed.success)
    return {
      result: problemResult(zodProblems(parsed.error), 'The proposal'),
      events: [],
      invalidProposal: true,
    };
  const args = parsed.data;
  const converted = proposalToConfig(args);
  const problems = converted.ok ? dataProblems(ctx, args.filter, args.dateRange) : converted.problems;
  if (!converted.ok || problems.length)
    return { result: problemResult(problems, 'The proposal'), events: [], invalidProposal: true };

  const replaces = args.replacesPreview && state.openPreviewId !== null;
  const previewId = replaces ? state.openPreviewId! : newPreviewId();
  state.openPreviewId = previewId;
  const config = converted.config;
  return {
    result: `OK: preview ${previewId} "${config.title}" (${config.type}) is ${replaces ? 'updated' : 'shown'} in the chat with live data. Settings used: ${JSON.stringify(queryPart(config))}. Do not list its numbers unless you queried them. The user has already seen any text you wrote before this call — do not repeat it; add at most one short new sentence.`,
    events: [{ type: 'preview', previewId, config, replaces }],
  };
}

// ---------- query_data

function formatCell(value: string | number | null, column: ResultColumn): string | null {
  if (column.role === 'attribute') return value === null ? null : String(value);
  return formatValue(typeof value === 'number' ? value : null, column.format ?? 'number', {
    style: 'full',
    decimals: column.decimals,
  });
}

const PRESET_NAMES = new Set<string>(Object.values(PRESET_LABELS));

/** "Last 30 days (16 Sep 2026 – 15 Oct 2026)", or just the dates for custom ranges. */
function rangeText(r: { from: string; to: string; label: string }) {
  const dates = `${formatDate(r.from)} – ${formatDate(r.to)}`;
  return PRESET_NAMES.has(r.label) ? `${r.label} (${dates})` : dates;
}

export async function executeQuery(call: ToolCall, ctx: ToolContext): Promise<ToolOutcome> {
  const raw = parseArgs(call);
  if (typeof raw === 'symbol')
    return { result: problemResult(['arguments are not valid JSON'], 'The query'), events: [] };
  const parsed = QueryDataArgsSchema.safeParse(raw);
  if (!parsed.success) return { result: problemResult(zodProblems(parsed.error), 'The query'), events: [] };
  const args: QueryDataArgs = parsed.data;
  const problems = dataProblems(ctx, args.filter, args.dateRange);
  if (problems.length) return { result: problemResult(problems, 'The query'), events: [] };

  const table = queryArgsToTableConfig({ ...args, limit: args.limit ?? 20 });
  const config: WidgetConfig = { ...table, options: normaliseOptions(table) };
  const run = (dateRange: WidgetDateRange) =>
    ctx.runQuery({
      config: queryPart({ ...config, options: { ...config.options, dateRange } }),
      dashboardDateFilter: ctx.dashboardFilter,
    });

  let current: QueryResult;
  let previous: QueryResult | null = null;
  try {
    current = await run(config.options.dateRange);
    if (args.compare) {
      const filter = effectiveDateFilter(config.options.dateRange, ctx.dashboardFilter);
      const prev = previousRange(filter, resolveDateFilter(filter, ctx.now));
      previous = await run({ mode: 'custom', ...prev });
    }
  } catch (err) {
    return { result: problemResult([(err as Error).message], 'The query'), events: [] };
  }

  const attrCols = current.columns.filter((c) => c.role === 'attribute');
  const measureCols = current.columns.filter((c) => c.role === 'measure');
  const keyOf = (row: Record<string, unknown>) => attrCols.map((c) => String(row[c.key])).join('|');
  const prevByKey = new Map((previous?.rows ?? []).map((r) => [keyOf(r), r]));

  const rows = current.rows.slice(0, AI_QUERY_MAX_ROWS).map((row) => {
    const out: Record<string, string | null> = {};
    for (const c of current.columns) out[c.label] = formatCell(row[c.key] ?? null, c);
    if (previous) {
      const prev = prevByKey.get(keyOf(row));
      for (const c of measureCols) {
        const p = prev ? (prev[c.key] as number | null) : null;
        out[`${c.label} (previous)`] = formatCell(p, c);
        out[`${c.label} change`] = formatChange(row[c.key] as number | null, p)?.text ?? null;
      }
    }
    return out;
  });
  const totals = Object.fromEntries(
    measureCols.map((c) => [c.label, formatCell(current.totals[c.key] ?? null, c)]),
  );

  const period = rangeText(current.meta.range);
  const source: AiSource = { label: `${describeQuery(args)} · ${period}`, query: args };
  // Without a breakdown the engine returns no rows, only totals.
  const payload: Record<string, unknown> = attrCols.length
    ? {
        period,
        rows,
        totals,
        rowCount: current.rows.length,
        truncated: current.meta.truncated || current.rows.length > AI_QUERY_MAX_ROWS,
      }
    : { period, totals };
  if (previous) {
    payload.previousPeriod = rangeText(previous.meta.range);
    payload.previousTotals = Object.fromEntries(
      measureCols.map((c) => [c.label, formatCell(previous!.totals[c.key] ?? null, c)]),
    );
    payload.totalChange = Object.fromEntries(
      measureCols.map((c) => [
        c.label,
        formatChange(current.totals[c.key] ?? null, previous!.totals[c.key] ?? null)?.text ?? null,
      ]),
    );
  }
  if (current.meta.empty) payload.note = 'No orders in this period.';
  return {
    result: JSON.stringify(payload),
    events: [],
    source,
  };
}

/** Progress text shown while a tool runs, e.g. "Checking return rate by payment method…". */
export function toolStatus(call: ToolCall): string | null {
  if (call.name === 'propose_visualization') return 'Building the chart…';
  if (call.name !== 'query_data') return null;
  const parsed = QueryDataArgsSchema.safeParse(parseArgs(call));
  if (!parsed.success) return 'Checking the data…';
  const [what, by] = describeQuery({ ...parsed.data, filter: null }).split(' · ');
  return `Checking ${what!.toLowerCase()}${by ? ` ${by.toLowerCase()}` : ''}…`;
}

// ---------- ask_clarification

const VALID: Record<string, readonly string[]> = {
  measure: MEASURES.map((m) => m.key),
  attribute: [...ATTRIBUTES.map((a) => a.key), 'none'],
  preset: PRESETS,
  type: WIDGET_TYPES,
};

/** Keeps only options that map to real catalog keys, presets or types (REQUIREMENTS §17.5). */
export function sanitiseClarification(raw: unknown): AiClarification[] {
  const parsed = ClarifyArgsSchema.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data.questions
    .map((q, i) => {
      const options = q.options.filter((o) => VALID[o.kind]?.includes(o.value)).slice(0, 4);
      const recommended = Math.max(
        0,
        options.findIndex((o) => o.recommended),
      );
      return {
        id: q.id ?? `q${i + 1}`,
        question: q.question,
        options: options.map(({ label, value, kind }) => ({ label, value, kind })),
        recommended,
      };
    })
    .filter((q) => q.options.length >= 2)
    .slice(0, 2);
}

export function executeClarify(call: ToolCall): ToolOutcome {
  const raw = parseArgs(call);
  const questions = typeof raw === 'symbol' ? [] : sanitiseClarification(raw);
  if (questions.length === 0)
    return {
      result:
        'ERROR: no valid options (options must be catalog keys, presets or visualization types). Choose sensible defaults and continue instead.',
      events: [],
    };
  return {
    result: 'The options are shown to the user. Stop now and wait for their answer.',
    events: [{ type: 'clarification', questions }],
    endTurn: true,
  };
}
