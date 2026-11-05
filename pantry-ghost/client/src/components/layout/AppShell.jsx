import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Button } from '../ui/button';
import { Sheet, SheetContent } from '../ui/dialog';
import { ThemeToggle } from '../../theme/ThemeToggle';
import { MetaProvider, useMeta } from '../../context/MetaContext';
import { useAuth } from '../../context/AuthContext';
import { Logo } from '../spooky';

function Topbar({ onMenu }) {
  const { logout } = useAuth();
  const { appName } = useMeta();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const signOut = () => {
    logout();
    qc.clear();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur md:px-6">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenu} aria-label="Open navigation menu">
        <Menu className="h-5 w-5" />
      </Button>
      <div className="flex items-center gap-2 md:hidden">
        <Logo className="h-6 w-6" />
        <span className="font-display font-semibold">{appName}</span>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}

function Shell() {
  const [open, setOpen] = useState(false);
  return (
    <div className="fog flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r bg-sidebar md:block">
        <Sidebar />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <Sidebar onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Authenticated layout: meta provider, persistent sidebar (sheet below md), top bar (Req 13.2, 13.8). */
export function AppShell() {
  return (
    <MetaProvider>
      <Shell />
    </MetaProvider>
  );
}

/** Page header used by every page. */
export function PageHeader({ title, description, actions, icon }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-semibold md:text-3xl">
          {icon}
          <span className="truncate">{title}</span>
        </h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
