import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileText, Mic, Users } from 'lucide-react';
import { useMeta } from '../../context/MetaContext';
import { useAuth } from '../../context/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import { Logo, ResourceIcon } from '../spooky';
import { Skeleton } from '../ui/display';
import { cn } from '../../lib/utils';
import appRoutes from '../../appRoutes';

function Item({ to, icon, children, end, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'relative flex min-h-[2.5rem] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-inset focus-visible:ring-offset-0',
          isActive
            ? 'bg-primary/15 tone-primary before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-full before:bg-primary'
            : 'text-sidebar-foreground/80 hover:bg-muted hover:text-sidebar-foreground'
        )
      }
    >
      {icon}
      <span className="truncate">{children}</span>
    </NavLink>
  );
}

function SectionLabel({ children }) {
  return <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>;
}

/**
 * Meta-driven navigation (Req 13.2): Dashboard, one link per readable resource, app links,
 * Reports, Voice Agent, Users (Superuser).
 */
export function Sidebar({ onNavigate }) {
  const meta = useMeta();
  const { user } = useAuth();
  const { isSuperuser } = usePermission();
  const appLinks = appRoutes.filter((r) => r.label && (!r.roles || isSuperuser || r.roles.includes(user?.role)));

  return (
    <div className="flex h-full flex-col gap-1 p-3">
      <div className="flex items-center gap-2.5 px-2 pb-3 pt-1">
        <Logo className="h-8 w-8" />
        <span className="truncate font-display text-lg font-semibold">{meta.appName || ' '}</span>
      </div>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain pr-0.5">
        <Item to="/" end icon={<LayoutDashboard className="h-4 w-4" aria-hidden />} onNavigate={onNavigate}>Dashboard</Item>

        <SectionLabel>Records</SectionLabel>
        {meta.loading
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="mx-3 my-1.5 h-5" />)
          : meta.resources.map((r) => (
              <Item key={r.key} to={`/r/${r.key}`} icon={<ResourceIcon name={r.icon} />} onNavigate={onNavigate}>
                {r.label}
              </Item>
            ))}

        {appLinks.length > 0 && <SectionLabel>Workflows</SectionLabel>}
        {appLinks.map((r) => (
          <Item key={r.path} to={`/${r.path}`} icon={<ResourceIcon name={r.icon} />} onNavigate={onNavigate}>
            {r.label}
          </Item>
        ))}

        <SectionLabel>Tools</SectionLabel>
        <Item to="/reports" icon={<FileText className="h-4 w-4" aria-hidden />} onNavigate={onNavigate}>Reports</Item>
        <Item to="/voice" icon={<Mic className="h-4 w-4" aria-hidden />} onNavigate={onNavigate}>Voice agent</Item>
        {isSuperuser && <Item to="/users" icon={<Users className="h-4 w-4" aria-hidden />} onNavigate={onNavigate}>Users</Item>}
      </nav>

      <div className="mt-2 flex items-center gap-2.5 rounded-md border bg-card/60 px-3 py-2 text-xs">
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold uppercase text-primary">
          {(user?.name ?? "?").trim().charAt(0) || "?"}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{user?.name}</p>
          <p className="truncate text-muted-foreground">{user?.role}</p>
        </div>
      </div>
    </div>
  );
}
