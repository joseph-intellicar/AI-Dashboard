/** Pure layout rules for the 12-column dashboard grid (ARCHITECTURE §4.6). */
import { MIN_SIZES, type Layout, type WidgetType } from '@insightflow/shared';
import { z } from 'zod';

export const GRID_COLUMNS = 12;

export const LayoutItemSchema = z.object({
  id: z.string(),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(GRID_COLUMNS),
  h: z.number().int().min(1).max(40),
});
export type LayoutItem = z.infer<typeof LayoutItemSchema>;

/** null when valid, otherwise the reason. */
export function layoutProblem(
  items: LayoutItem[],
  typeOf: (id: string) => WidgetType | undefined,
): string | null {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) return 'Each widget can appear only once in a layout';
    seen.add(item.id);
    if (item.x + item.w > GRID_COLUMNS) return 'Widget extends past the 12-column grid';
    const type = typeOf(item.id);
    if (!type) continue; // ownership is checked separately
    const min = MIN_SIZES[type];
    if (item.w < min.w || item.h < min.h) return `Widget is smaller than the minimum size for its type`;
  }
  return null;
}

/** Where a duplicate goes: directly below the original, same size. */
export function duplicatePlacement(original: Layout): Layout {
  return { x: original.x, y: original.y + original.h, w: original.w, h: original.h };
}
