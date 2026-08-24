import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '@/context/useAuth'
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Breadcrumbs, type BreadcrumbItem } from '@/components/shared/Breadcrumbs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface ShellNavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  badge?: number;
}

export interface ShellNavGroup {
  label: string;
  items: ShellNavItem[];
}

interface AppShellProps {
  navGroups: ShellNavGroup[];
  logoUrl?: string;
  title: string;
  subtitle?: string;
  resolveBreadcrumbs: (pathname: string) => BreadcrumbItem[];
  onLogout: () => void;
}

const COLLAPSE_KEY = 'portal-sidebar-collapsed';

function NavItemLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: ShellNavItem;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group/nav-item relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium outline-none transition-colors',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-primary/15 text-primary'
            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:bg-sidebar-accent focus-visible:text-foreground'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              aria-hidden
              className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary"
            />
          )}
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
          {!collapsed && !!item.badge && item.badge > 0 && (
            <Badge variant="default" className="h-5 min-w-5 justify-center px-1.5 py-0 text-[10px]">
              {item.badge > 99 ? '99+' : item.badge}
            </Badge>
          )}
          {/* Tooltip when the rail is collapsed */}
          {collapsed && (
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full z-50 ml-3 hidden whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-md group-hover/nav-item:block lg:group-focus-within/nav-item:block"
            >
              {item.label}
              {!!item.badge && item.badge > 0 && (
                <span className="ml-1.5 font-semibold text-primary">{item.badge}</span>
              )}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

interface SidebarProps {
  groups: ShellNavGroup[];
  collapsed: boolean;
  logoUrl?: string;
  title: string;
  subtitle?: string;
  onLogoClick?: () => void;
  onNavigate?: () => void;
}

function SidebarBody({
  groups,
  collapsed,
  logoUrl,
  title,
  subtitle,
  onLogoClick,
  onNavigate,
}: SidebarProps) {
  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div
        className={cn(
          'flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-3',
          collapsed && 'justify-center px-0'
        )}
      >
        <button
          type="button"
          onClick={onLogoClick}
          aria-label="Go to home"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md p-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
        >
          {logoUrl && (
            <img
              src={logoUrl}
              alt=""
              className="h-7 w-auto shrink-0 rounded-sm"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-tight text-foreground">
                {title}
              </span>
              {subtitle && (
                <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                  {subtitle}
                </span>
              )}
            </span>
          )}
        </button>
      </div>

      <nav
        aria-label="Primary"
        className="custom-scrollbar flex-1 space-y-4 overflow-y-auto px-2.5 py-3"
      >
        {groups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
            )}
            {collapsed && group.label !== 'General' && (
              <div className="mx-auto mb-1 mt-3 h-px w-6 bg-sidebar-border first:mt-0" aria-hidden />
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItemLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}

export function AppShell({
  navGroups,
  logoUrl,
  title,
  subtitle,
  resolveBreadcrumbs,
  onLogout,
}: AppShellProps) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.localStorage.getItem(COLLAPSE_KEY) === 'true' : false
  );
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Close mobile sheet whenever the route changes (during-render adjustment).
  const [prevPathname, setPrevPathname] = useState(location.pathname);
  if (prevPathname !== location.pathname) {
    setPrevPathname(location.pathname);
    setIsMobileOpen(false);
  }

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, String(isCollapsed));
  }, [isCollapsed]);

  const breadcrumbs = resolveBreadcrumbs(location.pathname);
  const initials = user?.username?.substring(0, 2).toUpperCase() || 'US';

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden shrink-0 border-r border-sidebar-border transition-[width] duration-200 lg:block',
          isCollapsed ? 'w-14' : 'w-60'
        )}
      >
        <SidebarBody
          groups={navGroups}
          collapsed={isCollapsed}
          logoUrl={logoUrl}
          title={title}
          subtitle={subtitle}
          onLogoClick={() => navigate('/')}
        />

      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-5">
          {/* Mobile navigation trigger */}
          <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open navigation">
                <Menu className="h-4.5 w-4.5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="border-sidebar-border bg-sidebar p-0 sm:max-w-72 [&>button]:text-sidebar-foreground"
            >
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarBody
                groups={navGroups}
                collapsed={false}
                logoUrl={logoUrl}
                title={title}
                subtitle={subtitle}
                onNavigate={() => setIsMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>

          {/* Desktop collapse toggle */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden lg:inline-flex"
            onClick={() => setIsCollapsed((v) => !v)}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>

          <Breadcrumbs items={breadcrumbs} />

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="User menu"
                  className="ml-1 flex items-center gap-2 rounded-md p-1 pr-2 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Avatar className="h-7 w-7 border border-border">
                    <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden min-w-0 md:block">
                    <span className="block max-w-[140px] truncate text-xs font-medium leading-tight text-foreground">
                      {user?.username || 'User'}
                    </span>
                    <span className="block text-left text-[10px] capitalize leading-tight text-muted-foreground">
                      {user?.role || 'user'}
                    </span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="flex flex-col">
                  <span className="truncate">{user?.username || 'User'}</span>
                  <span className="truncate text-xs font-normal text-muted-foreground">
                    Signed in as {user?.role || 'user'}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  onSelect={onLogout}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="main-content" className="custom-scrollbar flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1600px] p-4 sm:p-5 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
