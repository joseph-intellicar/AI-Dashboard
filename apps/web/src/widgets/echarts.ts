/** Tree-shaken ECharts setup and the shared visual theme. */
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  AxisPointerComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AxisPointerComponent,
  GraphicComponent,
  SVGRenderer,
]);

export { echarts };

export const INK = '#0F172A';
export const MUTED = '#64748B';
export const GRID_LINE = '#EEF2F6';
export const AXIS_LINE = '#E2E8F0';
export const FONT = "'Inter Variable', ui-sans-serif, system-ui, sans-serif";

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Base options merged into every chart. */
export function baseOption() {
  return {
    animation: !reducedMotion(),
    animationDuration: 380,
    animationDurationUpdate: 300,
    textStyle: { fontFamily: FONT, color: MUTED, fontSize: 11 },
    tooltip: {
      confine: true,
      backgroundColor: '#FFFFFF',
      borderColor: '#E2E8F0',
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: INK, fontFamily: FONT, fontSize: 12 },
      extraCssText:
        'border-radius:10px;box-shadow:0 10px 30px -10px rgba(15,23,42,.25),0 2px 6px rgba(15,23,42,.08);',
    },
  };
}

export const valueAxisStyle = {
  axisLine: { show: false },
  axisTick: { show: false },
  splitLine: { lineStyle: { color: GRID_LINE } },
  axisLabel: { color: MUTED, fontSize: 11, margin: 10 },
};

export const categoryAxisStyle = {
  axisLine: { lineStyle: { color: AXIS_LINE } },
  axisTick: { show: false },
  axisLabel: { color: MUTED, fontSize: 11, margin: 10 },
};

/** Tooltip row: colour dot · label · value (text stays in ink; the dot carries identity). */
export function tooltipRow(color: string, label: string, value: string, dashed = false) {
  const dot = dashed
    ? `<span style="display:inline-block;width:12px;border-top:2px dashed ${color};margin-right:8px;vertical-align:middle"></span>`
    : `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px"></span>`;
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;line-height:20px">
    <span style="display:flex;align-items:center;color:${MUTED}">${dot}${escapeHtml(label)}</span>
    <span style="font-weight:600;font-variant-numeric:tabular-nums;color:${INK}">${escapeHtml(value)}</span></div>`;
}

export function tooltipTitle(text: string) {
  return `<div style="font-weight:600;color:${INK};margin-bottom:4px">${escapeHtml(text)}</div>`;
}

export function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
