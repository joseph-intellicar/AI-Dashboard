import { formatValue, getMeasure, type NumberStyle, type ResultColumn } from '@insightflow/shared';

export function formatMeasure(
  value: number | string | null | undefined,
  key: string,
  style: NumberStyle = 'full',
) {
  const m = getMeasure(key);
  return formatValue(typeof value === 'number' ? value : value == null ? null : Number(value), m.format, {
    style,
    decimals: m.decimals,
  });
}

export function formatCell(
  value: number | string | null | undefined,
  column: ResultColumn,
  style: NumberStyle,
) {
  if (column.role === 'attribute') return value == null ? '—' : String(value);
  return formatMeasure(value, column.key, style);
}
