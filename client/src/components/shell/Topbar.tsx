import { Menu, Search, Bell } from 'lucide-react';
import { useUiStore } from '@stores/useUiStore';
import { useIsDesktop } from '@hooks/useMediaQuery';
import { BusinessSwitcher } from './BusinessSwitcher';
import { cn } from '@lib/cn';

export interface TopbarProps {
  title?: string;
  subtitle?: string;
}

export function Topbar({ title, subtitle }: TopbarProps) {
  const { setMobileSidebarOpen } = useUiStore();
  const isDesktop = useIsDesktop();

  return (
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
        {title && <h1 className="font-display text-lg sm:text-xl text-orika-cream truncate leading-tight">{title}</h1>}
        {subtitle && <p className="text-[0.7rem] sm:text-xs text-orika-smoke truncate">{subtitle}</p>}
      </div>

      {/* Compact business switcher on small screens */}
      {!isDesktop && (
        <BusinessSwitcher variant="compact" />
      )}

      {/* Search — hidden on mobile to save space */}
      <button
        className="hidden md:inline-flex items-center gap-2 bg-orika-graphite/60 hover:bg-orika-graphite border border-orika-graphite px-3 py-2 rounded-lg text-xs text-orika-smoke transition-colors w-[260px]"
        aria-label="Search"
      >
        <Search className="w-3.5 h-3.5" />
        <span>Search Hub…</span>
        <kbd className="ml-auto text-[0.6rem] px-1.5 py-0.5 bg-orika-charcoal border border-orika-graphite rounded font-mono">⌘K</kbd>
      </button>

      <button
        className="relative w-9 h-9 rounded-full bg-orika-graphite/60 hover:bg-orika-graphite text-orika-cream flex items-center justify-center transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orika-gold rounded-full border border-orika-charcoal" />
      </button>
    </header>
  );
}
