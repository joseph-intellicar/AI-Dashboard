import { ATTRIBUTES, DEFAULT_DASHBOARD, MEASURES, type MeasureDef } from '@insightflow/shared';
import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, OFF_TOPIC_REPLY, type PromptContext } from './context';

const ctx: PromptContext = {
  now: new Date('2026-10-15T06:30:00Z'),
  dataRange: { from: '2024-10-16', to: '2026-10-15' },
  attributeValues: { payment_method: ['UPI', 'Card', 'COD'], region: ['North', 'South', 'West', 'East'] },
  dashboard: {
    dateFilter: { preset: 'last_30_days' },
    widgetTitles: ['Total Revenue', 'Revenue by Category'],
  },
  openPreview: null,
  widget: null,
};

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt(ctx);

  it('lists every catalog measure and attribute by key', () => {
    for (const m of MEASURES) expect(prompt).toContain(`- ${m.key}: ${m.label}`);
    for (const a of ATTRIBUTES) expect(prompt).toContain(`- ${a.key}: ${a.label}`);
    expect(prompt).toContain('ONLY works with: returned_orders');
  });

  it('includes the rules, dates and dashboard context', () => {
    expect(prompt).toContain(OFF_TOPIC_REPLY);
    expect(prompt).toContain('Today: 2026-10-15');
    expect(prompt).toContain('Asia/Kolkata');
    expect(prompt).toContain('from 2024-10-16 to 2026-10-15');
    expect(prompt).toContain('Last 30 days (2026-09-16 to 2026-10-15)');
    expect(prompt).toContain('Total Revenue; Revenue by Category');
    expect(prompt).toContain('Values: UPI | Card | COD');
    expect(prompt).toContain('Open preview: none');
  });

  it('picks up new catalog entries automatically', () => {
    const extra: MeasureDef = {
      key: 'gift_wrap_orders',
      label: 'Gift-wrapped Orders',
      description: 'Orders with gift wrapping.',
      synonyms: ['gifts'],
      format: 'number',
      aggregation: 'additive',
      positiveIsGood: true,
      statusScope: 'valid',
    };
    const withExtra = buildSystemPrompt({
      ...ctx,
      catalog: { measures: [...MEASURES, extra], attributes: ATTRIBUTES },
    });
    expect(withExtra).toContain('- gift_wrap_orders: Gift-wrapped Orders');
  });

  it('describes the open preview and the widget being asked about', () => {
    const config = DEFAULT_DASHBOARD.widgets[4]!.config;
    const p = buildSystemPrompt({
      ...ctx,
      openPreview: { previewId: 'p1', config },
      widget: { title: config.title, config },
    });
    expect(p).toContain(`Open preview (what "it"/"this" refers to): {"title":"${config.title}"`);
    expect(p).toContain(`asking about their dashboard widget "${config.title}"`);
  });

  it('stays a reasonable size', () => {
    // ~4 characters per token → well under 8k tokens even with all attribute values.
    expect(prompt.length).toBeLessThan(20_000);
  });
});
