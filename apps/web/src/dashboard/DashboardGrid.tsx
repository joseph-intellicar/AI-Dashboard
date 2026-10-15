import { MIN_SIZES, type DateFilter } from '@insightflow/shared';
import { useMemo, useState } from 'react';
import { Responsive, WidthProvider, type Layout as GridItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import type { VersionBadge } from '../history/historyView';
import { cn } from '../lib/cn';
import type { LayoutItem, Widget } from './useDashboard';
import { WidgetCard } from './WidgetCard';
import './grid.css';

const ResponsiveGrid = WidthProvider(Responsive);

export const ROW_HEIGHT = 80;
export const BREAKPOINTS = { lg: 768, sm: 0 };
export const COLS = { lg: 12, sm: 1 };

/** Phone layout: one column, saved order (top-to-bottom, then left-to-right). Never saved. */
export function stackedLayout(widgets: Widget[]): GridItem[] {
  let y = 0;
  return [...widgets]
    .sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x)
    .map((w) => {
      const item = { i: w.id, x: 0, y, w: 1, h: w.layout.h, static: true };
      y += w.layout.h;
      return item;
    });
}

export function DashboardGrid({
  widgets,
  dashboardFilter,
  editMode,
  highlightId,
  onLayoutCommit,
  onEdit,
  onDuplicate,
  onRemove,
  readOnly = false,
  badges,
  onAskAi,
}: {
  widgets: Widget[];
  dashboardFilter: DateFilter;
  editMode: boolean;
  highlightId: string | null;
  onLayoutCommit: (items: LayoutItem[]) => void;
  onEdit: (w: Widget) => void;
  onDuplicate: (w: Widget) => void;
  onRemove: (w: Widget) => void;
  /** Version preview: no menus, no dragging. */
  readOnly?: boolean;
  badges?: Map<string, VersionBadge>;
  onAskAi?: (w: Widget) => void;
}) {
  const [breakpoint, setBreakpoint] = useState<keyof typeof COLS>('lg');
  const layouts = useMemo(
    () => ({
      lg: widgets.map((w) => ({
        i: w.id,
        ...w.layout,
        minW: MIN_SIZES[w.config.type].w,
        minH: MIN_SIZES[w.config.type].h,
      })),
      sm: stackedLayout(widgets),
    }),
    [widgets],
  );
  const desktop = breakpoint === 'lg';
  const commit = (layout: GridItem[]) => {
    if (!desktop) return;
    onLayoutCommit(layout.map(({ i, x, y, w, h }) => ({ id: i, x, y, w, h })));
  };

  return (
    <div className={cn('rounded-2xl transition-colors', editMode && desktop && 'edit-grid -m-2 p-2')}>
      <ResponsiveGrid
        layouts={layouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={ROW_HEIGHT}
        margin={[16, 16]}
        containerPadding={[0, 0]}
        compactType="vertical"
        isDraggable={editMode && desktop && !readOnly}
        isResizable={editMode && desktop && !readOnly}
        draggableCancel=".no-drag"
        resizeHandles={['se']}
        onBreakpointChange={(bp) => setBreakpoint(bp as keyof typeof COLS)}
        onDragStop={commit}
        onResizeStop={commit}
        useCSSTransforms
      >
        {widgets.map((w) => (
          <div key={w.id} data-widget-id={w.id}>
            <WidgetCard
              widget={w}
              dashboardFilter={dashboardFilter}
              editMode={editMode && desktop && !readOnly}
              readOnly={readOnly}
              badge={badges?.get(w.id)}
              highlight={highlightId === w.id}
              onEdit={() => onEdit(w)}
              onDuplicate={() => onDuplicate(w)}
              onRemove={() => onRemove(w)}
              onAskAi={onAskAi && !editMode ? () => onAskAi(w) : undefined}
            />
          </div>
        ))}
      </ResponsiveGrid>
    </div>
  );
}
