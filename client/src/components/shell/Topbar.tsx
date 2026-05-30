import { useState, useEffect } from 'react';
import { Menu, Search, Bell } from 'lucide-react';
import { useUiStore } from '@stores/useUiStore';
import { useIsDesktop } from '@hooks/useMediaQuery';
import { BusinessSwitcher } from './BusinessSwitcher';
import { NotificationsPanel, useUnreadCount } from '@components/notifications/NotificationsPanel';
import { CommandPalette } from '@components/search/CommandPalette';
import { cn } from '@lib/cn';

export interface TopbarProps {
  title?: string;
  subtitle?: string;
}

export function Topbar({ title, subtitle }: TopbarProps) {
  const { setMobileSidebarOpen } = useUiStore();
  const isDesktop   = useIsDesktop();
  const unreadCount = useUnreadCount();

  const [notifOpen,  setNotifOpen]  = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
        setNotifOpen(false);
      }
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, []);

  function toggleNotif() {
    setNotifOpen((prev) => !prev);
    setSearchOpen(false);
  }

  function openSearch() {
    setSearchOpen(true);
    setNotifOpen(false);
  }

  return (
    <>
      <header className={cn(
        'sticky top-0 z-30 bg-orika-charcoal/80 backdrop-blur-md border-b border-orika-graphite',
        'px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3',
      )}>
        {!isDesktop && (
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2 -ml-2 text-orika-cream hover:bg-orika-graphite rounded-lg transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div className="flex-1 min-w-0">
          {title    && <h1 className="font-display text-lg sm:text-xl text-orika-cream truncate leading-tight">{title}</h1>}
          {subtitle && <p className="text-[0.7rem] sm:text-xs text-orika-smoke truncate">{subtitle}</p>}
        </div>

        {!isDesktop && <BusinessSwitcher variant="compact" />}

        {/* Search bar — hidden on mobile */}
        <button
          onClick={openSearch}
          className="hidden md:inline-flex items-center gap-2 bg-orika-graphite/60 hover:bg-orika-graphite border border-orika-graphite px-3 py-2 rounded-lg text-xs text-orika-smoke transition-colors w-[260px]"
          aria-label="Search"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search Hub...</span>
          <kbd className="ml-auto text-[0.6rem] px-1.5 py-0.5 bg-orika-charcoal border border-orika-graphite rounded font-mono">Cmd+K</kbd>
        </button>

        {/* Bell — relative so the dropdown positions correctly */}
        <div className="relative">
          <button
            onClick={toggleNotif}
            className={cn(
              'relative w-9 h-9 rounded-full flex items-center justify-center transition-colors',
              notifOpen
                ? 'bg-orika-graphite text-orika-gold'
                : 'bg-orika-graphite/60 hover:bg-orika-graphite text-orika-cream',
            )}
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-orika-gold border border-orika-charcoal px-1 text-[9px] font-bold text-orika-black leading-none">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
        </div>
      </header>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
