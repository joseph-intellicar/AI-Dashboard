/**
 * Insight AI (REQUIREMENTS §17): tool argument schemas, their conversion to WidgetConfig, and the
 * chat stream events. Shared so the API (tools) and the web app ("Show as chart") use the same rules.
 */
import { z } from 'zod';
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTES,
  getAttribute,
  getMeasure,
  MEASURE_KEYS,
  type AttributeKey,
  type MeasureKey,
} from './catalog';
import { IsoDateSchema, PRESET_LABELS, PRESETS, type DateFilter } from './dateRanges';
import { formatDate } from './format';
import {
  AppearanceSchema,
  autoTitle,
  GRAINS,
  normaliseOptions,
  suggestType,
  WIDGET_TYPES,
  WidgetConfigSchema,
  type ColumnRef,
  type WidgetConfig,
  type WidgetDateRange,
} from './widgetConfig';

export const AI_MAX_MESSAGE_CHARS = 1000;
export const AI_MAX_HISTORY = 20;
export const AI_QUERY_MAX_ROWS = 50;

const CATEGORICAL_KEYS = ATTRIBUTES.filter((a) => a.kind !== 'date').map((a) => a.key) as [
  AttributeKey,
  ...AttributeKey[],
];

// ---------------------------------------------------------------------------
// Tool arguments (lenient where the model often varies, strict on catalog keys)
// ---------------------------------------------------------------------------

export const AiDateRangeSchema = z
  .object({
    mode: z.enum(['dashboard', 'preset', 'custom']),
    preset: z.enum(PRESETS).optional(),
    from: IsoDateSchema.optional(),
    to: IsoDateSchema.optional(),
  })
  .transform((r, ctx): WidgetDateRange => {
    if (r.mode === 'preset') {
      if (!r.preset)
        ctx.addIssue({ code: 'custom', message: 'dateRange.preset is required for mode "preset"' });
      return { mode: 'preset', preset: r.preset ?? 'last_30_days' };
    }
    if (r.mode === 'custom') {
      if (!r.from || !r.to)
        ctx.addIssue({
          code: 'custom',
          message: 'dateRange.from and dateRange.to are required for mode "custom"',
        });
      return { mode: 'custom', from: r.from ?? '', to: r.to ?? '' };
    }
    return { mode: 'dashboard' };
  });

const AiFilterSchema = z.object({
  attribute: z.enum(CATEGORICAL_KEYS),
  op: z.enum(['in', 'not_in']).default('in'),
  values: z.array(z.string().min(1).max(200)).min(1).max(50),
});

const AiSortSchema = z.object({ by: z.string(), dir: z.enum(['asc', 'desc']).default('desc') });

const AiAttributeSchema = z.object({ key: z.enum(ATTRIBUTE_KEYS), grain: z.enum(GRAINS).optional() });

export const ProposeArgsSchema = z.object({
  type: z.enum(WIDGET_TYPES),
  measures: z.array(z.enum(MEASURE_KEYS)).max(2).default([]),
  attribute: AiAttributeSchema.nullable().optional(),
  /** Tables only: ordered columns. */
  columns: z
    .array(
      z.object({
        kind: z.enum(['measure', 'attribute']),
        key: z.string(),
        grain: z.enum(GRAINS).optional(),
      }),
    )
    .max(6)
    .nullable()
    .optional(),
  dateRange: AiDateRangeSchema.optional(),
  filter: AiFilterSchema.nullable().optional(),
  sort: AiSortSchema.nullable().optional(),
  limit: z.number().int().min(1).max(50).nullable().optional(),
  compare: z.boolean().optional(),
  title: z.string().max(80).nullable().optional(),
  replacesPreview: z.boolean().default(false),
});
export type ProposeArgs = z.infer<typeof ProposeArgsSchema>;
export type ProposeArgsInput = z.input<typeof ProposeArgsSchema>;

export const QueryDataArgsSchema = z.object({
  measures: z.array(z.enum(MEASURE_KEYS)).min(1).max(4),
  attributes: z.array(AiAttributeSchema).max(2).default([]),
  dateRange: AiDateRangeSchema.default({ mode: 'preset', preset: 'last_30_days' }),
  filter: AiFilterSchema.nullable().optional(),
  sort: AiSortSchema.nullable().optional(),
  limit: z.number().int().min(1).max(AI_QUERY_MAX_ROWS).nullable().optional(),
  compare: z.boolean().default(false),
});
export type QueryDataArgs = z.infer<typeof QueryDataArgsSchema>;

export const CLARIFICATION_KINDS = ['measure', 'attribute', 'preset', 'type'] as const;
export const ClarifyArgsSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string().max(40).optional(),
        question: z.string().min(1).max(200),
        options: z
          .array(
            z.object({
              label: z.string().min(1).max(60),
              value: z.string(),
              kind: z.enum(CLARIFICATION_KINDS),
              recommended: z.boolean().optional(),
            }),
          )
          .max(6),
      }),
    )
    .min(1)
    .max(4),
});
export type ClarifyArgs = z.infer<typeof ClarifyArgsSchema>;

// ---------------------------------------------------------------------------
// Conversion to WidgetConfig
// ---------------------------------------------------------------------------

export type Conversion = { ok: true; config: WidgetConfig } | { ok: false; problems: string[] };

function columnsFrom(cols: NonNullable<ProposeArgs['columns']>): {
  columns: ColumnRef[];
  problems: string[];
} {
  const problems: string[] = [];
  const columns: ColumnRef[] = [];
  for (const c of cols) {
    if (c.kind === 'measure' && (MEASURE_KEYS as readonly string[]).includes(c.key))
      columns.push({ kind: 'measure', key: c.key as MeasureKey });
    else if (c.kind === 'attribute' && (ATTRIBUTE_KEYS as readonly string[]).includes(c.key))
      columns.push({ kind: 'attribute', key: c.key as AttributeKey, ...(c.grain ? { grain: c.grain } : {}) });
    else problems.push(`Unknown ${c.kind} "${c.key}" — use a key from the catalog`);
  }
  return { columns, problems };
}

/**
 * Builds and validates a widget config from propose_visualization arguments, exactly as the builder
 * would: slot rules, options normalised, auto title unless a title is given.
 */
export function proposalToConfig(args: ProposeArgs): Conversion {
  const problems: string[] = [];
  let fields: WidgetConfig['fields'];
  if (args.type === 'table') {
    const fromCols = columnsFrom(args.columns ?? []);
    problems.push(...fromCols.problems);
    // Accept measures/attribute for tables too, as columns.
    const columns = fromCols.columns.length
      ? fromCols.columns
      : [
          ...(args.attribute ? [{ kind: 'attribute' as const, ...args.attribute }] : []),
          ...args.measures.map((key) => ({ kind: 'measure' as const, key })),
        ];
    fields = { measures: [], attributes: [], columns };
  } else {
    if (args.columns?.length) problems.push('Only tables use columns — use measures and attribute');
    fields = {
      measures: args.measures.map((key) => ({ key })),
      attributes: args.attribute ? [args.attribute] : [],
      columns: null,
    };
  }

  const draft = {
    version: 1 as const,
    type: args.type,
    title: 'Untitled',
    titleIsCustom: false,
    fields,
    options: {
      dateRange: args.dateRange ?? { mode: 'dashboard' as const },
      compare: args.compare ?? args.type === 'kpi',
      secondaryMeasure: null,
      sort: args.sort ? { by: args.sort.by, dir: args.sort.dir } : null,
      limit: args.limit ?? null,
      filter: args.filter ?? null,
    },
    appearance: AppearanceSchema.parse({}),
  };
  if (problems.length) return { ok: false, problems };
  return finishConfig(draft, args.title);
}

/** Normalises options, re-validates and sets the title. */
function finishConfig(draft: WidgetConfig, title?: string | null): Conversion {
  // A sort on a field that isn't selected is dropped (normaliseOptions picks a default) rather than rejected.
  const first = WidgetConfigSchema.safeParse({ ...draft, options: { ...draft.options, sort: null } });
  if (!first.success) return { ok: false, problems: unique(first.error.issues.map((i) => i.message)) };
  const config = { ...first.data, options: normaliseOptions({ ...first.data, options: draft.options }) };
  const second = WidgetConfigSchema.safeParse(config);
  if (!second.success) return { ok: false, problems: unique(second.error.issues.map((i) => i.message)) };
  const custom = title?.trim();
  return {
    ok: true,
    config: custom
      ? { ...second.data, title: custom, titleIsCustom: true }
      : { ...second.data, title: autoTitle(second.data), titleIsCustom: false },
  };
}

const unique = (xs: string[]) => [...new Set(xs)];

/** query_data arguments as a table-shaped widget config (used to run the query and for "Show as chart"). */
export function queryArgsToTableConfig(args: QueryDataArgs): WidgetConfig {
  const columns: ColumnRef[] = [
    ...args.attributes.map((a) => ({ kind: 'attribute' as const, ...a })),
    ...args.measures.map((key) => ({ kind: 'measure' as const, key })),
  ];
  return {
    version: 1,
    type: 'table',
    title: 'Query',
    titleIsCustom: false,
    fields: { measures: [], attributes: [], columns },
    options: {
      dateRange: args.dateRange,
      compare: false,
      secondaryMeasure: null,
      sort: args.sort ?? null,
      limit: args.limit ?? null,
      filter: args.filter ?? null,
    },
    appearance: AppearanceSchema.parse({}),
  };
}

/** "Show as chart": the widget the builder would suggest for the same fields (REQUIREMENTS §17.8). */
export function queryArgsToChart(args: QueryDataArgs): Conversion {
  const attribute = args.attributes[0];
  const pool = [
    ...args.measures.slice(0, 1).map((key) => ({ kind: 'measure' as const, key })),
    ...(attribute ? [{ kind: 'attribute' as const, ...attribute }] : []),
  ];
  const suggested = args.attributes.length > 1 ? 'table' : (suggestType(pool) ?? 'table');
  if (suggested === 'table') {
    return finishConfig({ ...queryArgsToTableConfig(args), title: 'Untitled' });
  }
  return proposalToConfig(
    ProposeArgsSchema.parse({
      type: suggested,
      measures: args.measures.slice(0, suggested === 'line' ? 2 : 1),
      attribute: attribute ?? null,
      dateRange: args.dateRange,
      filter: args.filter ?? null,
      sort: args.sort ?? null,
      limit: args.limit ?? null,
      compare: args.compare,
    }),
  );
}

// ---------------------------------------------------------------------------
// Descriptions ("Based on" line)
// ---------------------------------------------------------------------------

export function describeDateRange(range: WidgetDateRange, dashboard: DateFilter): string {
  if (range.mode === 'preset') return PRESET_LABELS[range.preset];
  if (range.mode === 'custom') return `${formatDate(range.from)} – ${formatDate(range.to)}`;
  return dashboard.preset === 'custom'
    ? `${formatDate(dashboard.from)} – ${formatDate(dashboard.to)}`
    : PRESET_LABELS[dashboard.preset];
}

/** "Return Rate · by Payment Method · South". The period is appended by the caller. */
export function describeQuery(args: Pick<QueryDataArgs, 'measures' | 'attributes' | 'filter'>): string {
  const parts = [args.measures.map((m) => getMeasure(m).label).join(', ')];
  if (args.attributes.length)
    parts.push(`by ${args.attributes.map((a) => getAttribute(a.key).label).join(' & ')}`);
  if (args.filter) {
    const label = getAttribute(args.filter.attribute).label;
    parts.push(`${args.filter.op === 'in' ? '' : 'excl. '}${label}: ${args.filter.values.join(', ')}`);
  }
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Chat stream events (server → browser, as Server-Sent Events)
// ---------------------------------------------------------------------------

export interface AiSource {
  /** e.g. "Return Rate · by Payment Method · Last 12 months (16 Oct 2025 – 15 Oct 2026)" */
  label: string;
  query: QueryDataArgs;
}

export interface AiClarification {
  id: string;
  question: string;
  options: { label: string; value: string; kind: (typeof CLARIFICATION_KINDS)[number] }[];
  recommended: number;
}

export type AiEvent =
  | { type: 'text'; delta: string }
  | { type: 'status'; text: string }
  | { type: 'preview'; previewId: string; config: WidgetConfig; replaces: boolean }
  | { type: 'clarification'; questions: AiClarification[] }
  | { type: 'sources'; sources: AiSource[] }
  | { type: 'done'; usage?: { model: string; inputTokens: number; outputTokens: number } }
  | { type: 'error'; code: string; message: string; retry: boolean };

// ---------------------------------------------------------------------------
// Chat request (browser → server)
// ---------------------------------------------------------------------------

const PreviewRefSchema = z.object({ previewId: z.string().max(40), config: z.unknown() });

export const AiChatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(8000),
        /** Previews shown in an assistant message, as "Showed preview p1: Revenue by City (bar)". */
        previews: z
          .array(
            z.object({ previewId: z.string().max(40), title: z.string().max(120), type: z.string().max(10) }),
          )
          .max(5)
          .optional(),
      }),
    )
    .min(1)
    .max(AI_MAX_HISTORY),
  context: z
    .object({
      dateFilter: z.unknown().optional(),
      widgetTitles: z.array(z.string().max(120)).max(100).default([]),
      openPreview: PreviewRefSchema.nullable().optional(),
      widget: z
        .object({ title: z.string().max(120), config: z.unknown() })
        .nullable()
        .optional(),
    })
    .default({ widgetTitles: [] }),
});
export type AiChatRequest = z.input<typeof AiChatRequestSchema>;
