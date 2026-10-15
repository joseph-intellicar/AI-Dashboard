import { getAttribute, getMeasure, type QueryResult, type WidgetConfig } from '@insightflow/shared';
import { useMemo } from 'react';
import { Chart, type ChartOption } from './Chart';
import { colorForValue } from './colors';
import { FONT, INK, MUTED, baseOption, tooltipRow, tooltipTitle } from './echarts';
import { formatMeasure } from './format';
import type { WidgetPickHandler } from './types';

export function DonutWidget({
  config,
  result,
  onPick,
}: {
  config: WidgetConfig;
  result: QueryResult;
  onPick?: WidgetPickHandler;
}) {
  const model = useMemo(() => donutModel(config, result), [config, result]);
  const option = useMemo(() => donutOption(config, model), [config, model]);
  return (
    <Chart
      option={option}
      ariaLabel={`${config.title}: donut of ${getMeasure(model.measure).label} by ${getAttribute(model.attribute).label}. ${model.slices
        .map((s) => `${s.name} ${Math.round(s.share * 100)}%`)
        .join(', ')}`}
      onClick={
        onPick
          ? (e) => {
              const s = model.slices[e.dataIndex];
              if (s) onPick({ kind: 'value', key: s.name }, s.color, e);
            }
          : undefined
      }
    />
  );
}

export function donutModel(config: WidgetConfig, result: QueryResult) {
  const measure = config.fields.measures[0]!.key;
  const attribute = config.fields.attributes[0]!.key;
  const values = result.rows.map((r) => ({ name: String(r[attribute]), value: Number(r[measure] ?? 0) }));
  const total = values.reduce((s, v) => s + v.value, 0);
  const slices = values.map((v) => ({
    ...v,
    share: total ? v.value / total : 0,
    color: colorForValue(config.appearance.colors, attribute, v.name),
  }));
  return { measure, attribute, slices, total };
}

function donutOption(config: WidgetConfig, model: ReturnType<typeof donutModel>): ChartOption {
  const { measure, slices, total } = model;
  const legend = config.appearance.legend;
  const right = legend.show && legend.position === 'right';
  const center = right ? ['30%', '50%'] : ['50%', legend.show ? '44%' : '50%'];
  const byName = new Map(slices.map((s) => [s.name, s]));

  return {
    ...baseOption(),
    legend: legend.show
      ? {
          type: 'scroll',
          orient: right ? 'vertical' : 'horizontal',
          ...(right ? { right: 4, top: 'middle', width: '42%' } : { bottom: 0, left: 'center' }),
          icon: 'circle',
          itemWidth: 8,
          itemHeight: 8,
          itemGap: right ? 10 : 14,
          textStyle: {
            color: INK,
            fontSize: 12,
            rich: { pct: { color: MUTED, fontSize: 12, padding: [0, 0, 0, 4] } },
          },
          formatter: (name: string) => `${name} {pct|${Math.round((byName.get(name)?.share ?? 0) * 100)}%}`,
        }
      : undefined,
    graphic: [
      {
        type: 'group',
        left: right ? '30%' : 'center',
        top: right ? 'middle' : legend.show ? '44%' : 'middle',
        bounding: 'raw',
        children: [
          {
            type: 'text',
            style: {
              text: formatMeasure(total, measure, 'compact'),
              fill: INK,
              font: `600 18px ${FONT}`,
              textAlign: 'center',
              textVerticalAlign: 'bottom',
            },
          },
          {
            type: 'text',
            top: 4,
            style: {
              text: 'Total',
              fill: MUTED,
              font: `400 11px ${FONT}`,
              textAlign: 'center',
              textVerticalAlign: 'top',
            },
          },
        ],
      },
    ],
    series: [
      {
        type: 'pie',
        radius: ['58%', '82%'],
        center,
        padAngle: 1.5,
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
        label: config.appearance.dataLabels
          ? {
              show: true,
              position: 'outside',
              color: INK,
              fontSize: 11,
              formatter: (p: { percent: number }) => `${Math.round(p.percent)}%`,
            }
          : { show: false },
        labelLine: { show: config.appearance.dataLabels, length: 6, length2: 6 },
        emphasis: { scale: true, scaleSize: 4 },
        data: slices.map((s) => ({ name: s.name, value: s.value, itemStyle: { color: s.color } })),
      },
    ],
    tooltip: {
      ...baseOption().tooltip,
      trigger: 'item',
      formatter: (p: { name: string; value: number; percent: number; color: string }) =>
        tooltipTitle(p.name) +
        tooltipRow(p.color, getMeasure(measure).label, formatMeasure(p.value, measure, 'full')) +
        tooltipRow(p.color, 'Share', `${p.percent.toFixed(1)}%`),
    },
  };
}
