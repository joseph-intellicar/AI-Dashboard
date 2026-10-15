import { ChevronDown, LogOut } from 'lucide-react';
import { initials, useLogout, useMe } from '../../auth/useAuth';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../ui/Menu';

export function UserMenu() {
  const me = useMe();
  const logout = useLogout();
  if (!me.data) return null;
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg py-1 pr-1.5 pl-1 transition-colors hover:bg-slate-100"
          aria-label={`Account menu for ${me.data.name}`}
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary ring-1 ring-primary/15">
            {initials(me.data.name)}
          </span>
          <span className="hidden text-sm font-medium text-ink md:inline">{me.data.name}</span>
          <ChevronDown className="hidden size-4 text-slate-400 md:inline" />
        </button>
      </MenuTrigger>
      <MenuContent>
        <div className="px-2.5 pt-1.5 pb-2">
          <div className="text-sm font-medium text-ink">{me.data.name}</div>
          <div className="text-xs text-muted">{me.data.email}</div>
        </div>
        <div className="my-1 h-px bg-line" />
        <MenuItem icon={<LogOut />} onSelect={() => logout.mutate()}>
          Log out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
