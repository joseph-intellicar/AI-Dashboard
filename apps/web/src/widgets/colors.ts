/** Colour resolution for a widget: widget override → global value colour → palette. */
import { OTHER_COLOR, OTHER_LABEL, seriesColor, valueColor, type Appearance } from '@insightflow/shared';

export type Colors = Appearance['colors'];

/** Colour of one attribute value (bar, slice). */
export function colorForValue(colors: Colors, attributeKey: string, value: string): string {
  if (value === OTHER_LABEL) return colors.values?.[OTHER_LABEL] ?? OTHER_COLOR;
  return colors.values?.[value] ?? valueColor(attributeKey, value);
}

/** Colour of a measure series (line, single-colour bars). */
export function colorForSeries(colors: Colors, measureKey: string, index: number): string {
  return colors.series?.[measureKey] ?? seriesColor(index);
}

/** KPI accent (sparkline). */
export function accentColor(colors: Colors): string {
  return colors.accent ?? seriesColor(0);
}

/** Bars colour by value by default only for small fixed-domain attributes. */
export function barsColorByValue(
  colors: Colors,
  attributeKey: string,
  fixedDomains: ReadonlySet<string>,
): boolean {
  return colors.colorByValue ?? fixedDomains.has(attributeKey);
}

/** Returns new colours with one override set (or removed when `color` is null). */
export function withOverride(colors: Colors, target: ColorTarget, color: string | null): Colors {
  const next: Colors = { ...colors };
  switch (target.kind) {
    case 'accent':
    case 'dataBar':
      if (color) next[target.kind] = color;
      else delete next[target.kind];
      return next;
    case 'value':
    case 'series': {
      const bucket = target.kind === 'value' ? 'values' : 'series';
      const map = { ...(colors[bucket] ?? {}) };
      if (color) map[target.key] = color;
      else delete map[target.key];
      if (Object.keys(map).length) next[bucket] = map;
      else delete next[bucket];
      return next;
    }
  }
}

export type ColorTarget =
  { kind: 'value'; key: string } | { kind: 'series'; key: string } | { kind: 'accent' } | { kind: 'dataBar' };
