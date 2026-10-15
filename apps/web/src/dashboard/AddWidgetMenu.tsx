import { ChevronDown, Plus, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../components/ui/Button';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../components/ui/Menu';

/** The two ways to make a widget: the builder, or describing it to Insight AI. */
export const ADD_OPTIONS = {
  manual: { label: 'Build it yourself', hint: 'Pick the fields and chart type' },
  ai: { label: 'Create with AI', hint: 'Describe it and Insight AI builds it' },
};

function Option({ label, hint }: { label: string; hint: ReactNode }) {
  return (
    <span className="flex flex-col">
      <span className="font-medium">{label}</span>
      <span className="text-xs text-muted">{hint}</span>
    </span>
  );
}

/** Header "Add widget" button: opens a menu with manual and AI creation. */
export function AddWidgetMenu({
  variant,
  aiDisabledReason,
  onManual,
  onAi,
}: {
  variant: 'primary' | 'secondary';
  /** Why "Create with AI" is unavailable (e.g. in edit mode), or null. */
  aiDisabledReason: string | null;
  onManual: () => void;
  onAi: () => void;
}) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant={variant} icon={<Plus className="size-4" />} aria-label="Add widget">
          <span className="hidden sm:inline">Add widget</span>
          <ChevronDown className="-mr-1 hidden size-3.5 opacity-80 sm:block" />
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem icon={<SlidersHorizontal />} onSelect={onManual}>
          <Option {...ADD_OPTIONS.manual} />
        </MenuItem>
        <MenuItem icon={<Sparkles />} onSelect={onAi} disabled={aiDisabledReason !== null}>
          <Option label={ADD_OPTIONS.ai.label} hint={aiDisabledReason ?? ADD_OPTIONS.ai.hint} />
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
