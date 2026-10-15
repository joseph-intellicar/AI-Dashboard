/**
 * WidgetConfig — the one widget format shared by the builder, dashboard, API, database
 * and (in Phase 2) the AI. See ARCHITECTURE §4.2–4.3.
 */
import { z } from 'zod';
import {
  ATTRIBUTE_KEYS,
  MEASURE_KEYS,
  getAttribute,
  getMeasure,
  incompatibility,
  type MeasureKey,
} from './catalog';
import { isHexColor } from './colors';
import {
  IsoDateSchema,
  PRESETS,
  resolveDateFilter,
  validateCustomRange,
  type DateFilter,
} from './dateRanges';

export const WIDGET_TYPES = ['kpi', 'line', 'bar', 'hbar', 'donut', 'table'] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const WIDGET_TYPE_LABELS: Record<WidgetType, string> = {
  kpi: 'KPI card',
  line: 'Line chart',
  bar: 'Bar chart',
  hbar: 'Horizontal bar',
  donut: 'Donut',
  table: 'Table',
};

export const GRAINS = ['auto', 'day', 'week', 'month', 'quarter'] as const;
export type GrainOption = (typeof GRAINS)[number];

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;
export const DONUT_MAX_SLICES = 6;
export const MAX_TABLE_COLUMNS = 6;
export const MAX_LINE_MEASURES = 2;

/** Grid sizes (12-column grid, 80 px rows). */
export const DEFAULT_SIZES: Record<WidgetType, { w: number; h: number }> = {
  kpi: { w: 2, h: 2 },
  line: { w: 6, h: 4 },
  bar: { w: 6, h: 4 },
  hbar: { w: 6, h: 4 },
  donut: { w: 4, h: 4 },
  table: { w: 6, h: 4 },
};
export const MIN_SIZES: Record<WidgetType, { w: number; h: number }> = {
  kpi: { w: 2, h: 2 },
  line: { w: 3, h: 3 },
  bar: { w: 3, h: 3 },
  hbar: { w: 3, h: 3 },
  donut: { w: 3, h: 3 },
  table: { w: 4, h: 3 },
};

const MeasureKeySchema = z.enum(MEASURE_KEYS);
const AttributeKeySchema = z.enum(ATTRIBUTE_KEYS);
const HexColor = z.string().refine(isHexColor, { message: 'Colour must be a hex value like #0F766E' });

export const MeasureRefSchema = z.object({ key: MeasureKeySchema });
export const AttributeRefSchema = z.object({ key: AttributeKeySchema, grain: z.enum(GRAINS).optional() });
export const ColumnRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('measure'), key: MeasureKeySchema }),
  z.object({ kind: z.literal('attribute'), key: AttributeKeySchema, grain: z.enum(GRAINS).optional() }),
]);
export type MeasureRef = z.infer<typeof MeasureRefSchema>;
export type AttributeRef = z.infer<typeof AttributeRefSchema>;
export type ColumnRef = z.infer<typeof ColumnRefSchema>;

export const FieldsSchema = z.object({
  measures: z.array(MeasureRefSchema).max(MAX_LINE_MEASURES).default([]),
  attributes: z.array(AttributeRefSchema).max(1).default([]),
  columns: z.array(ColumnRefSchema).max(MAX_TABLE_COLUMNS).nullable().optional(),
});
export type Fields = z.infer<typeof FieldsSchema>;

export const WidgetDateRangeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('dashboard') }),
  z.object({ mode: z.literal('preset'), preset: z.enum(PRESETS) }),
  z.object({ mode: z.literal('custom'), from: IsoDateSchema, to: IsoDateSchema }),
]);
export type WidgetDateRange = z.infer<typeof WidgetDateRangeSchema>;

export const FilterSchema = z.object({
  attribute: AttributeKeySchema,
  op: z.enum(['in', 'not_in']),
  values: z.array(z.string().min(1).max(200)).max(50),
});
export type WidgetFilter = z.infer<typeof FilterSchema>;

export const OptionsSchema = z.object({
  dateRange: WidgetDateRangeSchema.default({ mode: 'dashboard' }),
  /** KPI: compare to previous period. Line: show the previous period as a dashed line. */
  compare: z.boolean().default(false),
  secondaryMeasure: MeasureKeySchema.nullable().optional(),
  sort: z
    .object({ by: z.string(), dir: z.enum(['asc', 'desc']) })
    .nullable()
    .optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).nullable().optional(),
  filter: FilterSchema.nullable().optional(),
});
export type WidgetOptions = z.infer<typeof OptionsSchema>;

export const AppearanceSchema = z.object({
  numberFormat: z.enum(['compact', 'full']).default('compact'),
  dataLabels: z.boolean().default(false),
  legend: z
    .object({ show: z.boolean(), position: z.enum(['bottom', 'right']).default('bottom') })
    .default({ show: true, position: 'bottom' }),
  line: z.object({ smooth: z.boolean(), area: z.boolean() }).default({ smooth: true, area: false }),
  colors: z
    .object({
      accent: HexColor.optional(),
      series: z.record(z.string(), HexColor).optional(),
      values: z.record(z.string(), HexColor).optional(),
      colorByValue: z.boolean().optional(),
      dataBar: HexColor.optional(),
    })
    .default({}),
});
export type Appearance = z.infer<typeof AppearanceSchema>;

const BaseConfigSchema = z.object({
  version: z.literal(1),
  type: z.enum(WIDGET_TYPES),
  title: z.string().trim().min(1, 'Give the widget a title').max(80, 'Title can be at most 80 characters'),
  titleIsCustom: z.boolean().default(false),
  fields: FieldsSchema,
  options: OptionsSchema,
  appearance: AppearanceSchema.default(AppearanceSchema.parse({})),
});

export const WidgetConfigSchema = BaseConfigSchema.superRefine((config, ctx) => {
  for (const issue of slotIssues(config)) {
    ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path });
  }
});
export type WidgetConfig = z.infer<typeof BaseConfigSchema>;
/** Input shape (defaults optional) — what the builder and AI may send. */
export type WidgetConfigInput = z.input<typeof BaseConfigSchema>;

/** The part of a config that affects the query (title and appearance excluded). */
export const QueryConfigSchema = z
  .object({ type: z.enum(WIDGET_TYPES), fields: FieldsSchema, options: OptionsSchema })
  .superRefine((q, ctx) => {
    for (const issue of slotIssues(q))
      ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path });
  });
export type QueryConfig = z.infer<typeof QueryConfigSchema>;

export function queryPart(config: Pick<WidgetConfig, 'type' | 'fields' | 'options'>): QueryConfig {
  return { type: config.type, fields: config.fields, options: config.options };
}

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

/** Measures and attributes used by a config, regardless of type. */
export function usedFields(config: Pick<WidgetConfig, 'type' | 'fields'>): {
  measures: MeasureKey[];
  attributes: AttributeRef[];
} {
  if (config.type === 'table') {
    const cols = config.fields.columns ?? [];
    return {
      measures: cols.filter((c) => c.kind === 'measure').map((c) => c.key as MeasureKey),
      attributes: cols
        .filter((c): c is Extract<ColumnRef, { kind: 'attribute' }> => c.kind === 'attribute')
        .map(({ key, grain }) => (grain ? { key, grain } : { key })),
    };
  }
  return { measures: config.fields.measures.map((m) => m.key), attributes: config.fields.attributes };
}

const isDate = (key: string) => getAttribute(key).kind === 'date';
const isRatio = (key: string) => getMeasure(key).aggregation === 'ratio';

interface Issue {
  path: (string | number)[];
  message: string;
}

/** Per-type slot rules (REQUIREMENTS §7.3). Messages are shown in the builder footer. */
export function slotIssues(config: Pick<WidgetConfig, 'type' | 'fields' | 'options'>): Issue[] {
  const issues: Issue[] = [];
  const add = (message: string, ...path: (string | number)[]) => issues.push({ message, path });
  const { type, fields, options } = config;
  const { measures, attributes } = usedFields(config);

  if (type === 'table') {
    const columns = fields.columns ?? [];
    if (columns.length === 0) add('Add at least one column', 'fields', 'columns');
    else if (measures.length === 0) add('Add at least one measure column', 'fields', 'columns');
    if (columns.length > MAX_TABLE_COLUMNS)
      add(`Tables support up to ${MAX_TABLE_COLUMNS} columns`, 'fields', 'columns');
    const keys = columns.map((c) => c.key);
    if (new Set(keys).size !== keys.length) add('Each column can only be added once', 'fields', 'columns');
  } else {
    if (fields.columns?.length) add('Only tables use columns', 'fields', 'columns');
    if (measures.length === 0) add('Pick a measure to continue', 'fields', 'measures');
  }

  switch (type) {
    case 'kpi':
      if (measures.length > 1) add('KPI shows a single measure', 'fields', 'measures');
      if (attributes.length > 0)
        add('KPI shows a single measure — remove the attribute', 'fields', 'attributes');
      break;
    case 'line':
      if (measures.length > MAX_LINE_MEASURES)
        add('Line chart supports up to 2 measures', 'fields', 'measures');
      if (attributes.length === 0 || !isDate(attributes[0]!.key))
        add('Line chart needs a date attribute', 'fields', 'attributes');
      break;
    case 'bar':
    case 'hbar':
    case 'donut': {
      const name = type === 'donut' ? 'Donut' : type === 'bar' ? 'Bar chart' : 'Horizontal bar';
      if (measures.length > 1) add(`${name} supports one measure`, 'fields', 'measures');
      if (attributes.length === 0) add('Pick an attribute to group by', 'fields', 'attributes');
      if (type === 'donut') {
        if (measures[0] && isRatio(measures[0]))
          add('Donut needs a measure that adds up (e.g. Revenue)', 'fields', 'measures');
        if (attributes[0] && isDate(attributes[0].key))
          add('Donut can’t group by date — use a line chart', 'fields');
        if (options.limit && options.limit > DONUT_MAX_SLICES)
          add(`Donut shows at most ${DONUT_MAX_SLICES} slices`, 'options', 'limit');
      }
      break;
    }
    case 'table':
      break;
  }

  for (const m of measures) {
    for (const a of attributes) {
      const reason = incompatibility(m, a.key);
      if (reason) add(reason, 'fields');
    }
  }
  for (const a of attributes) {
    if (a.grain && !isDate(a.key)) add(`${getAttribute(a.key).label} has no date grain`, 'fields');
  }

  if (options.secondaryMeasure && type !== 'kpi') add('Only KPI cards have a secondary measure', 'options');

  const range = options.dateRange;
  if (range.mode === 'custom') {
    const reason = validateCustomRange(range.from, range.to);
    if (reason) add(reason, 'options', 'dateRange');
  }

  if (options.sort) {
    const sortable = [...measures, ...attributes.map((a) => a.key)];
    if (!sortable.includes(options.sort.by as MeasureKey))
      add('Sort by one of the selected fields', 'options', 'sort');
  }

  const filter = options.filter;
  if (filter) {
    if (isDate(filter.attribute)) add('Use the date range to filter by date', 'options', 'filter');
    if (filter.values.length === 0) add('Pick at least one filter value', 'options', 'filter');
  }
  return issues;
}

export interface BuilderValidation {
  valid: boolean;
  /** One-line reason shown next to the disabled save button. */
  reason: string | null;
}

export function validateForBuilder(config: WidgetConfigInput): BuilderValidation {
  const result = WidgetConfigSchema.safeParse(config);
  if (result.success) return { valid: true, reason: null };
  return { valid: false, reason: result.error.issues[0]?.message ?? 'Widget settings are not valid' };
}

// ---------------------------------------------------------------------------
// Builder logic: field pool, type suggestion, availability, conversion
// ---------------------------------------------------------------------------

/** Fields the user has picked, in the order picked. */
export type PoolItem = ColumnRef;

export function poolFromConfig(config: Pick<WidgetConfig, 'type' | 'fields'>): PoolItem[] {
  if (config.type === 'table') return [...(config.fields.columns ?? [])];
  return [
    ...config.fields.measures.map((m) => ({ kind: 'measure' as const, key: m.key })),
    ...config.fields.attributes.map((a) => ({ kind: 'attribute' as const, ...a })),
  ];
}

function split(pool: PoolItem[]) {
  return {
    measures: pool.filter((p) => p.kind === 'measure').map((p) => p.key as MeasureKey),
    attributes: pool.filter((p) => p.kind === 'attribute') as Extract<PoolItem, { kind: 'attribute' }>[],
  };
}

/** measure only → KPI; measure + date → Line; 2+ attributes or 3+ fields → Table; else Bar. */
export function suggestType(pool: PoolItem[]): WidgetType | null {
  const { measures, attributes } = split(pool);
  if (pool.length === 0) return null;
  if (attributes.length >= 2 || pool.length >= 3) return 'table';
  if (measures.length === 0) return 'table';
  if (attributes.length === 0) return measures.length === 1 ? 'kpi' : 'table';
  if (isDate(attributes[0]!.key)) return 'line';
  return 'bar';
}

export interface Availability {
  /** false = the picked fields conflict with this type (tile greyed out). */
  enabled: boolean;
  /** Why it's disabled, or what is still missing when enabled. */
  hint: string | null;
}

/** Whether each visualization fits the picked fields (REQUIREMENTS §7.2). */
export function visualizationAvailability(pool: PoolItem[]): Record<WidgetType, Availability> {
  const { measures, attributes } = split(pool);
  const ok = (hint: string | null = null): Availability => ({ enabled: true, hint });
  const no = (hint: string): Availability => ({ enabled: false, hint });
  const dates = attributes.filter((a) => isDate(a.key));
  const others = attributes.filter((a) => !isDate(a.key));

  const kpi = (): Availability => {
    if (attributes.length > 0) return no('KPI shows a single measure — remove the attribute');
    if (measures.length > 1) return no('KPI shows a single measure');
    return ok(measures.length === 0 && pool.length > 0 ? 'Pick a measure' : null);
  };

  const line = (): Availability => {
    if (measures.length > MAX_LINE_MEASURES) return no('Line chart supports up to 2 measures');
    if (others.length > 0) return no('Line chart needs a date attribute');
    return ok(pool.length > 0 && dates.length === 0 ? 'Line chart needs a date attribute' : null);
  };

  const grouped = (name: string, opts: { donut?: boolean } = {}): Availability => {
    if (measures.length > 1) return no(`${name} supports one measure`);
    if (attributes.length > 1) return no(`${name} groups by one attribute`);
    if (opts.donut) {
      if (measures[0] && isRatio(measures[0])) return no('Donut needs a measure that adds up (e.g. Revenue)');
      if (dates.length > 0) return no('Donut can’t group by date — use a line chart');
    }
    return ok(pool.length > 0 && attributes.length === 0 ? 'Add an attribute to group by' : null);
  };

  return {
    kpi: kpi(),
    line: line(),
    bar: grouped('Bar chart'),
    hbar: grouped('Horizontal bar'),
    donut: grouped('Donut', { donut: true }),
    table: pool.length > MAX_TABLE_COLUMNS ? no(`Tables support up to ${MAX_TABLE_COLUMNS} columns`) : ok(),
  };
}

/** Puts pooled fields into a type's slots; returns the labels of fields that didn't fit. */
export function fieldsForType(type: WidgetType, pool: PoolItem[]): { fields: Fields; dropped: string[] } {
  const dropped: string[] = [];
  const label = (p: PoolItem) => (p.kind === 'measure' ? getMeasure(p.key).label : getAttribute(p.key).label);

  if (type === 'table') {
    const unique = pool.filter((p, i) => pool.findIndex((q) => q.key === p.key) === i);
    unique.slice(MAX_TABLE_COLUMNS).forEach((p) => dropped.push(label(p)));
    return { fields: { measures: [], attributes: [], columns: unique.slice(0, MAX_TABLE_COLUMNS) }, dropped };
  }

  const maxMeasures = type === 'line' ? MAX_LINE_MEASURES : 1;
  const measures: MeasureRef[] = [];
  const attributes: AttributeRef[] = [];
  for (const p of pool) {
    if (p.kind === 'measure') {
      if (measures.length < maxMeasures && !measures.some((m) => m.key === p.key))
        measures.push({ key: p.key });
      else dropped.push(label(p));
    } else {
      const fits =
        type !== 'kpi' &&
        attributes.length === 0 &&
        (type === 'line' ? isDate(p.key) : type === 'donut' ? !isDate(p.key) : true);
      if (fits) {
        const grain = isDate(p.key) ? (p.grain ?? 'auto') : undefined;
        attributes.push(grain ? { key: p.key, grain } : { key: p.key });
      } else dropped.push(label(p));
    }
  }
  return { fields: { measures, attributes, columns: null }, dropped };
}

/** Switches a config to another type, keeping every field that fits. */
export function convertType(
  config: WidgetConfig,
  type: WidgetType,
): { config: WidgetConfig; dropped: string[] } {
  const { fields, dropped } = fieldsForType(type, poolFromConfig(config));
  const next: WidgetConfig = { ...config, type, fields, options: { ...config.options } };
  next.options = normaliseOptions(next);
  if (!next.titleIsCustom) next.title = autoTitle(next);
  return { config: next, dropped };
}

/** Keeps options consistent with the current type and fields (sort target, limits, compare). */
export function normaliseOptions(config: WidgetConfig): WidgetOptions {
  const options = { ...config.options };
  const { measures, attributes } = usedFields(config);
  const sortable = [...measures, ...attributes.map((a) => a.key)] as string[];
  const dateChart = config.type === 'line' || (attributes[0] && isDate(attributes[0].key));

  if (config.type === 'kpi' || dateChart) {
    options.sort = null;
    options.limit = null;
  } else {
    if (!options.sort || !sortable.includes(options.sort.by)) {
      options.sort = measures[0] ? { by: measures[0], dir: 'desc' } : null;
    }
    const max = config.type === 'donut' ? DONUT_MAX_SLICES : MAX_LIMIT;
    options.limit = Math.min(
      options.limit ?? (config.type === 'donut' ? DONUT_MAX_SLICES : DEFAULT_LIMIT),
      max,
    );
  }
  if (config.type !== 'kpi') options.secondaryMeasure = null;
  if (config.type !== 'kpi' && config.type !== 'line') options.compare = false;
  return options;
}

// ---------------------------------------------------------------------------
// Titles and subtitles
// ---------------------------------------------------------------------------

function plural(label: string): string {
  if (/y$/.test(label)) return label.replace(/y$/, 'ies');
  if (/s$/.test(label)) return label;
  return `${label}s`;
}

function filterSuffix(filter: WidgetFilter | null | undefined): string {
  if (!filter || filter.values.length === 0) return '';
  const values =
    filter.values.length <= 2
      ? filter.values.join(', ')
      : `${filter.values.length} ${plural(getAttribute(filter.attribute).label).toLowerCase()}`;
  return filter.op === 'in' ? ` · ${values}` : ` · excl. ${values}`;
}

export function autoTitle(config: Pick<WidgetConfig, 'type' | 'fields' | 'options'>): string {
  const { measures, attributes } = usedFields(config);
  const m = measures.map((k) => getMeasure(k));
  const a = attributes.map((r) => getAttribute(r.key));
  let title: string;

  if (m.length === 0 && a.length === 0) return 'New widget';
  switch (config.type) {
    case 'kpi': {
      const def = m[0];
      title = !def ? 'KPI' : def.aggregation === 'ratio' ? def.label : `Total ${def.label}`;
      break;
    }
    case 'line':
      title = m.length ? `${m.map((d) => d.label).join(' & ')} Trend` : 'Trend';
      break;
    case 'table': {
      const firstAttr = config.fields.columns?.find((c) => c.kind === 'attribute');
      const limit = config.options.limit;
      if (firstAttr && limit && config.options.sort?.dir === 'desc' && !isDate(firstAttr.key)) {
        title = `Top ${limit} ${plural(getAttribute(firstAttr.key).label)}`;
      } else {
        title = [m.map((d) => d.label).join(', '), a.length ? `by ${a.map((d) => d.label).join(', ')}` : '']
          .filter(Boolean)
          .join(' ');
      }
      break;
    }
    default:
      title = a[0] && m[0] ? `${m[0].label} by ${a[0].label}` : (m[0]?.label ?? a[0]?.label ?? 'New widget');
  }
  return `${title}${filterSuffix(config.options.filter)}`.slice(0, 80);
}

/** The date filter a widget actually uses. */
export function effectiveDateFilter(range: WidgetDateRange, dashboardFilter: DateFilter): DateFilter {
  if (range.mode === 'dashboard') return dashboardFilter;
  if (range.mode === 'preset') return { preset: range.preset };
  return { preset: 'custom', from: range.from, to: range.to };
}

function unitLabel(measureKey: MeasureKey | undefined): string {
  if (!measureKey) return '';
  const m = getMeasure(measureKey);
  switch (m.format) {
    case 'currency':
      return '₹';
    case 'percent':
      return '%';
    case 'days':
      return 'Days';
    case 'number':
      return m.label;
  }
}

/** "Last 30 days · ₹" */
export function autoSubtitle(
  config: Pick<WidgetConfig, 'type' | 'fields' | 'options'>,
  dashboardFilter: DateFilter,
  now: Date = new Date(),
): string {
  const range = resolveDateFilter(effectiveDateFilter(config.options.dateRange, dashboardFilter), now);
  // Tables mix several measures, so their subtitle is just the date range.
  const unit = config.type === 'table' ? '' : unitLabel(usedFields(config).measures[0]);
  return unit ? `${range.label} · ${unit}` : range.label;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function emptyConfig(type: WidgetType = 'bar'): WidgetConfig {
  return {
    version: 1,
    type,
    title: 'New widget',
    titleIsCustom: false,
    fields: { measures: [], attributes: [], columns: type === 'table' ? [] : null },
    options: {
      dateRange: { mode: 'dashboard' },
      compare: type === 'kpi',
      secondaryMeasure: null,
      sort: null,
      limit: null,
      filter: null,
    },
    appearance: AppearanceSchema.parse({}),
  };
}

/** Parses and fills defaults; throws a ZodError when invalid. */
export function parseWidgetConfig(input: unknown): WidgetConfig {
  return WidgetConfigSchema.parse(input);
}

/** JSON Schema of the widget config, for Phase 2 AI tool definitions. */
export function widgetConfigJsonSchema(): unknown {
  return z.toJSONSchema(BaseConfigSchema, { io: 'input' });
}
