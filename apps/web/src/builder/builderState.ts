/**
 * Widget builder draft state (pure reducer). The draft is always a full WidgetConfig, so the
 * live preview, validation and save all use exactly what will be stored.
 */
import {
  autoTitle,
  convertType,
  emptyConfig,
  fieldsForType,
  getAttribute,
  getMeasure,
  normaliseOptions,
  poolFromConfig,
  suggestType,
  type Appearance,
  type GrainOption,
  type PoolItem,
  type WidgetConfig,
  type WidgetOptions,
  type WidgetType,
} from '@insightflow/shared';

export interface BuilderState {
  config: WidgetConfig;
  /** false until the user picks a visualization (or when editing); the type then follows the suggestion. */
  typeChosen: boolean;
  /** Short note after a change, e.g. "Removed: Region". */
  note: string | null;
  initial: string;
}

export type BuilderAction =
  | { type: 'addField'; item: PoolItem }
  | { type: 'removeField'; key: string }
  | { type: 'setType'; widgetType: WidgetType }
  | { type: 'setGrain'; key: string; grain: GrainOption }
  | { type: 'moveColumn'; from: number; to: number }
  | { type: 'setOptions'; patch: Partial<WidgetOptions> }
  | { type: 'setAppearance'; patch: Partial<Appearance> }
  | { type: 'setColors'; colors: Appearance['colors'] }
  | { type: 'setTitle'; title: string }
  | { type: 'resetTitle' }
  | { type: 'reset'; initial: WidgetConfig | null };

export function initBuilder(initial: WidgetConfig | null): BuilderState {
  const config = initial ? structuredClone(initial) : { ...emptyConfig('kpi'), title: 'New widget' };
  return { config, typeChosen: Boolean(initial), note: null, initial: JSON.stringify(config) };
}

export function isDirty(state: BuilderState): boolean {
  return JSON.stringify(state.config) !== state.initial;
}

const labelOf = (p: PoolItem) => (p.kind === 'measure' ? getMeasure(p.key).label : getAttribute(p.key).label);

/** Re-derives options and the auto title after any field/option change. */
function settle(config: WidgetConfig): WidgetConfig {
  const next = { ...config, options: normaliseOptions(config) };
  if (!next.titleIsCustom) next.title = autoTitle(next);
  return next;
}

function withFields(
  state: BuilderState,
  pool: PoolItem[],
  type: WidgetType,
  note: string | null,
): BuilderState {
  const { fields } = fieldsForType(type, pool);
  return { ...state, note, config: settle({ ...state.config, type, fields }) };
}

function addField(state: BuilderState, item: PoolItem): BuilderState {
  const pool = poolFromConfig(state.config);
  if (pool.some((p) => p.key === item.key)) return state;
  const added = [...pool, item];

  if (!state.typeChosen) {
    const type = suggestType(added) ?? state.config.type;
    return withFields(state, added, type, null);
  }

  const type = state.config.type;
  const fits = (p: PoolItem[]) => fieldsForType(type, p).dropped.length === 0;
  if (fits(added)) return withFields(state, added, type, null);

  // The slot is full: replace the existing field of the same kind (click-to-fill behaviour).
  const sameKind = pool.filter((p) => p.kind === item.kind);
  const last = sameKind[sameKind.length - 1];
  if (last) {
    const replaced = [...pool.filter((p) => p !== last), item];
    if (fits(replaced)) return withFields(state, replaced, type, `Replaced ${labelOf(last)}`);
  }
  return {
    ...state,
    note: `${labelOf(item)} doesn’t fit a ${type === 'hbar' ? 'horizontal bar' : type} — try another visualization`,
  };
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  const c = state.config;
  switch (action.type) {
    case 'addField':
      return addField(state, action.item);
    case 'removeField': {
      const pool = poolFromConfig(c).filter((p) => p.key !== action.key);
      const type = state.typeChosen ? c.type : (suggestType(pool) ?? c.type);
      return withFields(state, pool, type, null);
    }
    case 'setType': {
      const { config, dropped } = convertType(c, action.widgetType);
      return {
        ...state,
        typeChosen: true,
        config: settle(config),
        note: dropped.length ? `Removed: ${dropped.join(', ')}` : null,
      };
    }
    case 'setGrain': {
      const grain = action.grain;
      if (c.type === 'table') {
        const columns = (c.fields.columns ?? []).map((col) =>
          col.key === action.key && col.kind === 'attribute' ? { ...col, grain } : col,
        );
        return { ...state, config: settle({ ...c, fields: { ...c.fields, columns } }) };
      }
      const attributes = c.fields.attributes.map((a) => (a.key === action.key ? { ...a, grain } : a));
      return { ...state, config: settle({ ...c, fields: { ...c.fields, attributes } }) };
    }
    case 'moveColumn': {
      const columns = [...(c.fields.columns ?? [])];
      const [moved] = columns.splice(action.from, 1);
      if (!moved) return state;
      columns.splice(action.to, 0, moved);
      return { ...state, config: settle({ ...c, fields: { ...c.fields, columns } }) };
    }
    case 'setOptions':
      return { ...state, note: null, config: settle({ ...c, options: { ...c.options, ...action.patch } }) };
    case 'setAppearance':
      return { ...state, config: { ...c, appearance: { ...c.appearance, ...action.patch } } };
    case 'setColors':
      return { ...state, config: { ...c, appearance: { ...c.appearance, colors: action.colors } } };
    case 'setTitle': {
      const title = action.title.slice(0, 80);
      const auto = autoTitle(c);
      return { ...state, config: { ...c, title, titleIsCustom: title.trim() !== auto } };
    }
    case 'resetTitle':
      return { ...state, config: { ...c, title: autoTitle(c), titleIsCustom: false } };
    case 'reset':
      return initBuilder(action.initial);
  }
}

/** Why a chip can't be added right now (shown dimmed with this tooltip), or null. */
export function chipBlockReason(state: BuilderState, item: PoolItem): string | null {
  const c = state.config;
  const pool = poolFromConfig(c);
  if (pool.some((p) => p.key === item.key)) return 'Already added';
  const measures = pool.filter((p) => p.kind === 'measure').map((p) => p.key);
  const attributes = pool.filter((p) => p.kind === 'attribute').map((p) => p.key);
  if (item.kind === 'attribute') {
    const def = getAttribute(item.key);
    if (def.compatibleMeasures && measures.some((mk) => !def.compatibleMeasures!.includes(mk))) {
      return `${def.label} only works with ${def.compatibleMeasures.map((k) => getMeasure(k).label).join(', ')}`;
    }
    if (!state.typeChosen) return null;
    if (c.type === 'kpi') return 'KPI cards show a single measure';
    if (c.type === 'line' && def.kind !== 'date') return 'Line charts group by Date';
    if (c.type === 'donut' && def.kind === 'date') return 'Donut can’t group by date';
  } else {
    const def = getMeasure(item.key);
    for (const ak of attributes) {
      const a = getAttribute(ak);
      if (a.compatibleMeasures && !a.compatibleMeasures.includes(item.key))
        return `${a.label} only works with ${a.compatibleMeasures.map((k) => getMeasure(k).label).join(', ')}`;
    }
    if (state.typeChosen && c.type === 'donut' && def.aggregation === 'ratio')
      return 'Donut needs a measure that adds up';
  }
  if (state.typeChosen && c.type === 'table' && pool.length >= 6) return 'Tables have up to 6 columns';
  return null;
}
