import {
  VALUE_COLORS,
  formatBucket,
  formatBucketLong,
  getAttribute,
  getMeasure,
  type DateGrain,
  type QueryResult,
  type WidgetConfig,
} from '@insightflow/shared';
import { useMemo } from 'react';
import { Chart, type ChartOption } from './Chart';
import { barsColorByValue, colorForSeries, colorForValue } from './colors';
import { baseOption, categoryAxisStyle, tooltipRow, tooltipTitle, valueAxisStyle } from './echarts';
import { formatMeasure } from './format';
import type { WidgetPickHandler } from './types';

const FIXED_DOMAINS = new Set(Object.keys(VALUE_COLORS));

export function BarWidget({
  config,
  result,
  onPick,
}: {
  config: WidgetConfig;
  result: QueryResult;
  onPick?: WidgetPickHandler;
}) {
  const model = useMemo(() => barModel(config, result), [config, result]);
  const option = useMemo(() => barOption(config, model), [config, model]);
  return (
    <Chart
      option={option}
      ariaLabel={`${config.title}: ${config.type === 'hbar' ? 'horizontal ' : ''}bar chart of ${getMeasure(model.measure).label} by ${getAttribute(model.attribute).label}`}
      onClick={
        onPick
          ? (e) => {
              const bar = model.bars[e.dataIndex];
              if (!bar) return;
              if (model.byValue) onPick({ kind: 'value', key: bar.raw }, bar.color, e);
              else onPick({ kind: 'series', key: model.measure }, bar.color, e);
            }
          : undefined
      }
    />
  );
}

export function barModel(config: WidgetConfig, result: QueryResult) {
  const measure = config.fields.measures[0]!.key;
  const attribute = config.fields.attributes[0]!.key;
  const isDate = getAttribute(attribute).kind === 'date';
  const grain = (result.meta.grain ?? 'day') as DateGrain;
  const colors = config.appearance.colors;
  const byValue = !isDate && barsColorByValue(colors, attribute, FIXED_DOMAINS);
  const single = colorForSeries(colors, measure, 0);
  const bars = result.rows.map((r) => {
    const raw = String(r[attribute]);
    return {
      raw,
      label: isDate ? formatBucket(raw, grain) : raw,
      long: isDate ? formatBucketLong(raw, grain) : raw,
      value: typeof r[measure] === 'number' ? (r[measure] as number) : null,
      color: byValue ? colorForValue(colors, attribute, raw) : single,
    };
  });
  return { measure, attribute, bars, byValue };
}

function barOption(config: WidgetConfig, model: ReturnType<typeof barModel>): ChartOption {
  const horizontal = config.type === 'hbar';
  const { measure, bars } = model;
  const style = config.appearance.numberFormat;
  const labels = config.appearance.dataLabels;
  const categories = bars.map((b) => b.label);

  const categoryAxis = {
    type: 'category',
    data: categories,
    inverse: horizontal,
    ...categoryAxisStyle,
    axisLine: horizontal ? { show: false } : categoryAxisStyle.axisLine,
    axisLabel: {
      ...categoryAxisStyle.axisLabel,
      color: '#334155',
      hideOverlap: !horizontal,
      width: horizontal ? 110 : 80,
      overflow: 'truncate',
      interval: horizontal ? 0 : 'auto',
    },
  };
  const valueAxis = {
    type: 'value',
    ...valueAxisStyle,
    splitNumber: 4,
    splitLine: horizontal ? { lineStyle: { color: '#EEF2F6' } } : valueAxisStyle.splitLine,
    axisLabel: {
      ...valueAxisStyle.axisLabel,
      formatter: (v: number) => formatMeasure(v, measure, 'compact'),
    },
  };

  return {
    ...baseOption(),
    grid: {
      top: labels && !horizontal ? 24 : 12,
      right: labels && horizontal ? 56 : 16,
      bottom: 8,
      left: 8,
      containLabel: true,
    },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series: [
      {
        id: measure,
        type: 'bar',
        name: getMeasure(measure).label,
        barMaxWidth: horizontal ? 22 : 40,
        barCategoryGap: '32%',
        data: bars.map((b) => ({
          value: b.value,
          itemStyle: { color: b.color, borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
        })),
        label: labels
          ? {
              show: true,
              position: horizontal ? 'right' : 'top',
              distance: 6,
              color: '#0F172A',
              fontSize: 11,
              fontWeight: 500,
              formatter: (p: { value: number }) => formatMeasure(p.value, measure, style),
            }
          : undefined,
        emphasis: { itemStyle: { opacity: 0.85 } },
      },
    ],
    tooltip: {
      ...baseOption().tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(15,23,42,0.04)' } },
      formatter: (params: { dataIndex: number }[]) => {
        const b = bars[params[0]?.dataIndex ?? 0];
        if (!b) return '';
        return (
          tooltipTitle(b.long) +
          tooltipRow(b.color, getMeasure(measure).label, formatMeasure(b.value, measure, 'full'))
        );
      },
    },
  };
}
