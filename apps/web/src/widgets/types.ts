import type { ColorTarget } from './colors';

/** Called when the user clicks a mark to recolour it (builder preview only). */
export type WidgetPickHandler = (
  target: ColorTarget,
  currentColor: string,
  anchor: DOMRect | { x: number; y: number },
) => void;
