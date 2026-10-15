import { DEFAULT_DASHBOARD, validateForBuilder, type PoolItem } from '@insightflow/shared';
import { describe, expect, it } from 'vitest';
import { builderReducer, initBuilder, isDirty, type BuilderAction, type BuilderState } from './builderState';

const m = (key: string) => ({ kind: 'measure', key }) as PoolItem;
const a = (key: string) => ({ kind: 'attribute', key }) as PoolItem;
const run = (state: BuilderState, ...actions: BuilderAction[]) => actions.reduce(builderReducer, state);
const add = (item: PoolItem): BuilderAction => ({ type: 'addField', item });

describe('builder reducer', () => {
  it('suggests KPI → Bar as fields are picked before a type', () => {
    const s1 = run(initBuilder(null), add(m('revenue')));
    expect(s1.config.type).toBe('kpi');
    expect(s1.config.title).toBe('Total Revenue');
    const s2 = run(s1, add(a('category')));
    expect(s2.config.type).toBe('bar');
    expect(s2.config.title).toBe('Revenue by Category');
    expect(validateForBuilder(s2.config).valid).toBe(true);
    expect(s2.config.options.sort).toEqual({ by: 'revenue', dir: 'desc' });
    expect(s2.config.options.limit).toBe(10);
  });

  it('suggests a line chart for a measure + date', () => {
    const s = run(initBuilder(null), add(m('orders')), add(a('order_date')));
    expect(s.config.type).toBe('line');
    expect(s.config.fields.attributes).toEqual([{ key: 'order_date', grain: 'auto' }]);
  });

  it('keeps the chosen type and replaces a full slot', () => {
    const s = run(
      initBuilder(null),
      { type: 'setType', widgetType: 'bar' },
      add(m('revenue')),
      add(a('category')),
      add(a('region')),
    );
    expect(s.config.type).toBe('bar');
    expect(s.config.fields.attributes).toEqual([{ key: 'region' }]);
    expect(s.note).toBe('Replaced Category');
  });

  it('explains fields that cannot fit the chosen type', () => {
    const s = run(
      initBuilder(null),
      { type: 'setType', widgetType: 'line' },
      add(m('revenue')),
      add(a('category')),
    );
    expect(s.config.fields.attributes).toEqual([]);
    expect(s.note).toMatch(/Category doesn’t fit/);
  });

  it('reports dropped fields when switching type', () => {
    const s = run(
      initBuilder(null),
      { type: 'setType', widgetType: 'table' },
      add(a('product')),
      add(a('region')),
      add(m('revenue')),
      {
        type: 'setType',
        widgetType: 'bar',
      },
    );
    expect(s.note).toBe('Removed: Region');
    expect(s.config.title).toBe('Revenue by Product');
  });

  it('keeps a custom title until reset to auto', () => {
    let s = run(
      initBuilder(null),
      { type: 'setType', widgetType: 'bar' },
      add(m('revenue')),
      add(a('category')),
      {
        type: 'setTitle',
        title: 'My sales',
      },
    );
    expect(s.config.titleIsCustom).toBe(true);
    s = run(s, add(a('city')));
    expect(s.config.title).toBe('My sales');
    s = run(s, { type: 'resetTitle' });
    expect(s.config).toMatchObject({ title: 'Revenue by City', titleIsCustom: false });
  });

  it('updates the auto title when a filter is added', () => {
    const s = run(initBuilder(null), add(m('revenue')), add(a('category')), {
      type: 'setOptions',
      patch: { filter: { attribute: 'region', op: 'in', values: ['South'] } },
    });
    expect(s.config.title).toBe('Revenue by Category · South');
  });

  it('reorders table columns', () => {
    const s = run(
      initBuilder(null),
      { type: 'setType', widgetType: 'table' },
      add(a('product')),
      add(m('revenue')),
      { type: 'moveColumn', from: 1, to: 0 },
    );
    expect(s.config.fields.columns?.map((c) => c.key)).toEqual(['revenue', 'product']);
  });

  it('removes fields and recomputes the suggestion', () => {
    const s = run(initBuilder(null), add(m('revenue')), add(a('category')), {
      type: 'removeField',
      key: 'category',
    });
    expect(s.config.type).toBe('kpi');
  });

  it('tracks whether anything changed', () => {
    const initial = DEFAULT_DASHBOARD.widgets[7]!.config;
    const s = initBuilder(initial);
    expect(isDirty(s)).toBe(false);
    expect(s.typeChosen).toBe(true);
    expect(isDirty(run(s, { type: 'setAppearance', patch: { dataLabels: true } }))).toBe(true);
  });
});

describe('chipBlockReason', () => {
  it('marks added fields and blocks fields that conflict with the chosen type', async () => {
    const { chipBlockReason } = await import('./builderState');
    const line = run(initBuilder(null), { type: 'setType', widgetType: 'line' }, add(m('revenue')));
    expect(chipBlockReason(line, m('revenue'))).toBe('Already added');
    expect(chipBlockReason(line, a('category'))).toMatch(/group by Date/);
    expect(chipBlockReason(line, a('order_date'))).toBeNull();
    const donut = run(initBuilder(null), { type: 'setType', widgetType: 'donut' });
    expect(chipBlockReason(donut, m('aov'))).toMatch(/adds up/);
    const rev = run(initBuilder(null), add(m('revenue')));
    expect(chipBlockReason(rev, a('return_reason'))).toMatch(/Returned Orders/);
  });
});
