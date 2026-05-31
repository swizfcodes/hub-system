import { Link, NavLink, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LogOut, X } from 'lucide-react';
import { useUiStore } from '@stores/useUiStore';
import { useAuthStore } from '@stores/useAuthStore';
import { useIsDesktop } from '@hooks/useMediaQuery';
import { HUB_MODULES } from '@lib/constants/modules';
import { BusinessSwitcher } from './BusinessSwitcher';
import { initialsOf } from '@lib/format';
import { cn } from '@lib/cn';

const NAV_GROUPS: { label: string; modules: string[] }[] = [
  { label: 'Run',     modules: ['dashboard', 'crm', 'sales', 'pos'] },
  { label: 'Operate', modules: ['logistics', 'stock', 'purchasing', 'catalogue', 'retail-partners'] },
  { label: 'Finance', modules: ['invoicing', 'accounting', 'tax', 'expenses', 'reports'] },
  { label: 'People',  modules: ['staff', 'payroll', 'contacts', 'messaging', 'loyalty'] },
  { label: 'Grow',    modules: ['campaigns', 'social', 'calendar', 'tasks'] },
  { label: 'System',  modules: ['settings', 'security', 'documents'] },
];

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, mobileSidebarOpen, setMobileSidebarOpen } = useUiStore();
  const isDesktop = useIsDesktop();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  const isOnSettings = location.pathname.startsWith('/settings');
  const collapsed = isDesktop ? sidebarCollapsed : false;

  // Mobile = drawer; desktop = always-visible rail.
  const visible = isDesktop ? true : mobileSidebarOpen;

  return (
    <>
      {/* Mobile backdrop */}
      {!isDesktop && mobileSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-orika-black/70 backdrop-blur-sm animate-fade-in"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed top-0 left-0 bottom-0 z-50 flex flex-col bg-orika-black border-r border-orika-graphite transition-all duration-300',
          collapsed ? 'w-[72px]' : 'w-[260px]',
          !isDesktop && (visible ? 'translate-x-0' : '-translate-x-full'),
        )}
        aria-label="Primary navigation"
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-orika-graphite/70 shrink-0">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-full border border-orika-gold/40 flex items-center justify-center group-hover:shadow-glow-sm transition-shadow shrink-0">
              <span className="font-display text-orika-gold text-lg leading-none">O</span>
            </div>
            {!collapsed && (
              <div className="flex flex-col leading-tight">
                <span className="font-display text-orika-cream text-lg tracking-wide">Orika <span className="text-orika-gold">Hub</span></span>
                <span className="text-[0.55rem] tracking-[0.18em] uppercase text-orika-smoke">Luxury · Intelligence</span>
              </div>
            )}
          </Link>
          {!isDesktop && (
            <button onClick={() => setMobileSidebarOpen(false)} className="p-2 text-orika-smoke hover:text-orika-cream" aria-label="Close menu">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Business switcher */}
        {!collapsed && (
          <div className="px-4 pt-4 pb-2">
            <div className="text-[0.55rem] tracking-[0.18em] uppercase text-orika-smoke mb-2 ml-1">Business Line</div>
            <BusinessSwitcher variant="sidebar" />
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {NAV_GROUPS.map((g) => {
            const items = g.modules
              .map((k) => HUB_MODULES.find((m) => m.key === k))
              .filter((m): m is NonNullable<typeof m> => !!m);
            if (!items.length) return null;
            return (
              <div key={g.label} className="mb-3">
                {!collapsed && (
                  <div className="px-3 py-2 text-[0.55rem] tracking-[0.18em] uppercase text-orika-smoke font-bold">
                    {g.label}
                  </div>
                )}
                {items.map((m) => {
                  const Icon = m.icon;
                  const matches = m.key === 'settings'
                    ? isOnSettings
                    : location.pathname.startsWith(m.route);
                  return (
                    <NavLink
                      key={m.key}
                      to={m.route}
                      onClick={() => !isDesktop && setMobileSidebarOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 mx-1 rounded-lg text-sm font-medium transition-all group relative',
                        matches
                          ? 'bg-orika-charcoal text-orika-gold border-l-2 border-orika-gold pl-[10px]'
                          : 'text-orika-cloud hover:text-orika-cream hover:bg-orika-charcoal/60',
                        collapsed && 'justify-center px-0 mx-0',
                      )}
                      title={collapsed ? m.label : undefined}
                    >
                      <Icon className="w-[18px] h-[18px] shrink-0" />
                      {!collapsed && <span className="truncate">{m.label}</span>}
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-orika-graphite/70 shrink-0">
          <div className={cn('flex items-center gap-3 px-2 py-2 rounded-lg', collapsed && 'justify-center')}>
            <div className="w-9 h-9 rounded-full bg-orika-gold text-orika-black font-bold flex items-center justify-center text-xs shrink-0">
              {initialsOf(user?.display_name || user?.email || 'User')}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0 leading-tight">
                <div className="text-sm font-medium text-orika-cream truncate">{user?.display_name || user?.email || 'Account'}</div>
                <div className="text-[0.65rem] text-orika-smoke">Signed in</div>
              </div>
            )}
            {!collapsed && (
              <button onClick={signOut} className="p-2 text-orika-smoke hover:text-state-danger transition-colors" aria-label="Sign out" title="Sign out">
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Collapse handle (desktop only) */}
        {isDesktop && (
          <button
            onClick={toggleSidebar}
            className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-orika-graphite border border-orika-graphite text-orika-gold flex items-center justify-center hover:bg-orika-charcoal transition-colors shadow-card"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
          </button>
        )}
      </aside>
    </>
  );
}
