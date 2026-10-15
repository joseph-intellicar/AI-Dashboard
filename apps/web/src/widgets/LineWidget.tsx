import {
  formatBucket,
  formatBucketLong,
  getMeasure,
  type DateGrain,
  type QueryResult,
  type WidgetConfig,
} from '@insightflow/shared';
import { useMemo } from 'react';
import { Chart, type ChartOption } from './Chart';
import { colorForSeries } from './colors';
import { baseOption, categoryAxisStyle, tooltipRow, tooltipTitle, valueAxisStyle } from './echarts';
import { formatMeasure } from './format';
import type { WidgetPickHandler } from './types';

const DATE_KEY = 'order_date';

export function LineWidget({
  config,
  result,
  onPick,
}: {
  config: WidgetConfig;
  result: QueryResult;
  onPick?: WidgetPickHandler;
}) {
  const option = useMemo(() => lineOption(config, result), [config, result]);
  const measures = config.fields.measures.map((m) => m.key);
  return (
    <Chart
      option={option}
      ariaLabel={`${config.title}: line chart of ${measures.map((m) => getMeasure(m).label).join(' and ')} over ${result.meta.range.label}`}
      onClick={
        onPick
          ? (e) => {
              const key = e.seriesId?.replace(/^(prev:)?/, '');
              const index = measures.indexOf(key as never);
              if (index >= 0)
                onPick(
                  { kind: 'series', key: key! },
                  colorForSeries(config.appearance.colors, key!, index),
                  e,
                );
            }
          : undefined
      }
    />
  );
}

export function lineOption(config: WidgetConfig, result: QueryResult): ChartOption {
  const grain = (result.meta.grain ?? 'day') as DateGrain;
  const measures = config.fields.measures.map((m) => m.key);
  const dates = result.rows.map((r) => String(r[DATE_KEY]));
  const prevRows = result.previous?.rows;
  const showPrev = Boolean(config.options.compare && prevRows?.length);
  const formats = new Set(measures.map((m) => getMeasure(m).format));
  // Two measures with different units: two stacked panels sharing the time axis (never a dual y-axis).
  const panels = measures.length > 1 && formats.size > 1 ? measures.length : 1;
  const legendShown = measures.length > 1 || showPrev;
  const top = legendShown ? 36 : 12;
  // Line charts allow at most 2 measures, so there are at most 2 panels.
  const grid =
    panels === 1
      ? [{ top, right: 16, bottom: 28, left: 8, containLabel: true }]
      : [
          { top, height: '34%', right: 16, left: 8, containLabel: true },
          { top: '58%', bottom: 28, right: 16, left: 8, containLabel: true },
        ];

  const xAxis = grid.map((_, i) => ({
    type: 'category',
    gridIndex: i,
    data: dates,
    boundaryGap: false,
    ...categoryAxisStyle,
    axisLabel: {
      ...categoryAxisStyle.axisLabel,
      show: i === panels - 1,
      hideOverlap: true,
      formatter: (v: string) => formatBucket(v, grain),
    },
  }));
  const yAxis = grid.map((_, i) => {
    const m = panels === 1 ? measures[0]! : measures[i]!;
    return {
      type: 'value',
      gridIndex: i,
      ...valueAxisStyle,
      splitNumber: panels > 1 ? 2 : 4,
      axisLabel: { ...valueAxisStyle.axisLabel, formatter: (v: number) => formatMeasure(v, m, 'compact') },
    };
  });

  const series: object[] = [];
  measures.forEach((m, i) => {
    const color = colorForSeries(config.appearance.colors, m, i);
    const panel = panels === 1 ? 0 : i;
    series.push({
      id: m,
      name: getMeasure(m).label,
      type: 'line',
      xAxisIndex: panel,
      yAxisIndex: panel,
      data: result.rows.map((r) => r[m]),
      smooth: config.appearance.line.smooth ? 0.25 : false,
      showSymbol: false,
      symbol: 'circle',
      symbolSize: 8,
      connectNulls: true,
      lineStyle: { width: 2, color },
      itemStyle: { color, borderColor: '#fff', borderWidth: 2 },
      emphasis: { focus: 'none', scale: 1 },
      areaStyle: config.appearance.line.area
        ? {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${color}33` },
                { offset: 1, color: `${color}00` },
              ],
            },
          }
        : undefined,
    });
    if (showPrev) {
      series.push({
        id: `prev:${m}`,
        name: measures.length > 1 ? `${getMeasure(m).label} (previous)` : 'Previous period',
        type: 'line',
        xAxisIndex: panel,
        yAxisIndex: panel,
        data: dates.map((_, j) => prevRows![j]?.[m] ?? null),
        smooth: config.appearance.line.smooth ? 0.25 : false,
        showSymbol: false,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 1.5, type: [4, 4], color, opacity: 0.55 },
        itemStyle: { color, opacity: 0.55 },
        z: 1,
      });
    }
  });

  return {
    ...baseOption(),
    grid,
    xAxis,
    yAxis,
    series,
    legend: legendShown
      ? {
          top: 0,
          left: 0,
          icon: 'roundRect',
          itemWidth: 12,
          itemHeight: 3,
          itemGap: 16,
          textStyle: { color: '#0F172A', fontSize: 12 },
        }
      : undefined,
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    tooltip: {
      ...baseOption().tooltip,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: '#94A3B8', width: 1, type: 'dashed' } },
      formatter: (
        params: {
          dataIndex: number;
          seriesId: string;
          color: string;
          seriesName: string;
          value: number | null;
        }[],
      ) => {
        const i = params[0]?.dataIndex ?? 0;
        let html = tooltipTitle(formatBucketLong(dates[i]!, grain));
        for (const p of params) {
          const isPrev = p.seriesId.startsWith('prev:');
          const key = p.seriesId.replace(/^prev:/, '');
          const label = isPrev
            ? `${p.seriesName} · ${formatBucketLong(String(prevRows?.[i]?.[DATE_KEY] ?? ''), grain)}`
            : p.seriesName;
          html += tooltipRow(p.color, label, formatMeasure(p.value, key, 'full'), isPrev);
        }
        return html;
      },
    },
  };
}
