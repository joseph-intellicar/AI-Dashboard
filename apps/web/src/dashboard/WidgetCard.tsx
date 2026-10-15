import type { DateFilter } from '@insightflow/shared';
import { Copy, MoreHorizontal, Pencil, Sparkles, Trash2, X } from 'lucide-react';
import { IconButton } from '../components/ui/Button';
import type { VersionBadge } from '../history/historyView';
import { cn } from '../lib/cn';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../components/ui/Menu';
import { WidgetView } from '../widgets/WidgetView';
import { isTempId, type Widget } from './useDashboard';
import { WidgetFrame } from './WidgetFrame';

export function WidgetCard({
  widget,
  dashboardFilter,
  editMode,
  readOnly = false,
  badge,
  highlight,
  onEdit,
  onDuplicate,
  onRemove,
  onAskAi,
}: {
  widget: Widget;
  dashboardFilter: DateFilter;
  editMode: boolean;
  readOnly?: boolean;
  badge?: VersionBadge;
  highlight: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** "Ask Insight AI about this"; omitted (hidden) in edit mode. */
  onAskAi?: () => void;
}) {
  const saving = isTempId(widget.id);
  return (
    <WidgetFrame
      config={widget.config}
      dashboardFilter={dashboardFilter}
      highlight={highlight}
      className={
        editMode
          ? 'cursor-grab ring-1 ring-transparent transition-shadow hover:ring-primary/30 active:cursor-grabbing'
          : undefined
      }
      actions={
        readOnly ? (
          badge ? (
            <ChangeBadge badge={badge} />
          ) : null
        ) : (
          <div className="no-drag flex items-center">
            <Menu>
              <MenuTrigger asChild>
                <IconButton label={`Widget options for ${widget.config.title}`} size="sm" disabled={saving}>
                  <MoreHorizontal className="size-4" />
                </IconButton>
              </MenuTrigger>
              <MenuContent>
                <MenuItem icon={<Pencil />} onSelect={onEdit}>
                  Edit
                </MenuItem>
                <MenuItem icon={<Copy />} onSelect={onDuplicate}>
                  Duplicate
                </MenuItem>
                {onAskAi && !editMode ? (
                  <MenuItem icon={<Sparkles />} onSelect={onAskAi}>
                    Ask Insight AI about this
                  </MenuItem>
                ) : null}
                <MenuSeparator />
                <MenuItem icon={<Trash2 />} tone="danger" onSelect={onRemove}>
                  Remove
                </MenuItem>
              </MenuContent>
            </Menu>
            {editMode ? (
              <IconButton
                label={`Remove ${widget.config.title}`}
                size="sm"
                disabled={saving}
                onClick={onRemove}
                className="text-slate-400 hover:bg-red-50 hover:text-danger"
              >
                <X className="size-4" />
              </IconButton>
            ) : null}
          </div>
        )
      }
    >
      <WidgetView config={widget.config} dashboardFilter={dashboardFilter} />
    </WidgetFrame>
  );
}

const BADGE_STYLES: Record<VersionBadge, { className: string; title: string }> = {
  Added: { className: 'bg-primary/10 text-primary-hover', title: 'Not in your current dashboard' },
  Edited: { className: 'bg-indigo-50 text-indigo-700', title: 'Settings differ from your current dashboard' },
  Moved: {
    className: 'bg-slate-100 text-slate-600',
    title: 'Position or size differs from your current dashboard',
  },
};

function ChangeBadge({ badge }: { badge: VersionBadge }) {
  const style = BADGE_STYLES[badge];
  return (
    <span
      title={style.title}
      className={cn('mt-1 mr-2 rounded-full px-2 py-0.5 text-[11px] font-medium', style.className)}
    >
      {badge}
    </span>
  );
}
