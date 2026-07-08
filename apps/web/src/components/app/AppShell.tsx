import { CalendarDays, CircleUser, House, Users } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { cn } from '@/lib/utils';
import { ResumeBanner } from './ResumeBanner';
import { Wordmark } from './Wordmark';

const TABS = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/log', label: 'Log', icon: CalendarDays },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/profile', label: 'Profile', icon: CircleUser },
] as const;

/**
 * Tabbed shell (FRONTEND.md §2): bottom tab bar <1024px, sidebar ≥1024px,
 * same four destinations. Full-screen flows (builder, live logging, auth)
 * render outside this shell.
 */
export function AppShell() {
  return (
    <div className="min-h-dvh">
      {/* Sidebar (≥1024px) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col gap-6 border-r border-sidebar-border bg-sidebar px-4 py-6 lg:flex">
        <div className="px-3">
          <Wordmark />
        </div>
        <nav aria-label="Primary" className="flex flex-col gap-1">
          {TABS.map(({ to, label, icon: Icon, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              end={'end' in rest && rest.end}
              className={({ isActive }) =>
                cn(
                  'flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-primary'
                    : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                )
              }
            >
              <Icon aria-hidden className="size-6" strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="lg:pl-60">
        <div className="mx-auto w-full max-w-2xl px-4 pb-32 pt-6 lg:pb-20">
          <Outlet />
        </div>
      </main>

      <ResumeBanner />

      {/* Bottom tab bar (<1024px) */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <div className="grid h-16 grid-cols-4">
          {TABS.map(({ to, label, icon: Icon, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              end={'end' in rest && rest.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              <Icon aria-hidden className="size-6" strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
