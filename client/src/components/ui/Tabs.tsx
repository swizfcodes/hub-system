import React from 'react';
import { cn } from '@lib/cn';

export interface Tab {
  key: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number | string;
}

export interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
  surface?: 'dark' | 'light';
  variant?: 'underline' | 'pill';
  className?: string;
}

export function Tabs({ tabs, active, onChange, surface='dark', variant='underline', className }: TabsProps) {
  const isDark = surface === 'dark';
  if (variant === 'pill') {
    return (
      <div className={cn('inline-flex p-1 rounded-xl border', isDark ? 'bg-orika-charcoal border-orika-graphite' : 'bg-orika-cloud/30 border-orika-cloud/40', className)}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => onChange(t.key)}
            className={cn(
              'px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all whitespace-nowrap',
              active === t.key
                ? (isDark ? 'bg-orika-gold text-orika-black shadow-glow-sm' : 'bg-orika-black text-orika-cream')
                : (isDark ? 'text-orika-smoke hover:text-orika-cream' : 'text-text-on-light-muted hover:text-orika-black'),
            )}>
            <span className="inline-flex items-center gap-2">{t.icon}{t.label}{t.badge !== undefined && <span className="ml-1 text-[0.6rem] opacity-70">{t.badge}</span>}</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className={cn('flex border-b overflow-x-auto hide-scrollbar', isDark ? 'border-orika-graphite' : 'border-orika-cloud/40', className)}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={cn(
            'px-4 sm:px-6 py-3 text-xs sm:text-sm font-semibold uppercase tracking-wide transition-all whitespace-nowrap border-b-2 -mb-px',
            active === t.key
              ? 'border-orika-gold text-orika-gold'
              : (isDark ? 'border-transparent text-orika-smoke hover:text-orika-cream' : 'border-transparent text-text-on-light-muted hover:text-orika-black'),
          )}>
          <span className="inline-flex items-center gap-2">{t.icon}{t.label}{t.badge !== undefined && <span className="ml-1 text-[0.6rem] opacity-70">{t.badge}</span>}</span>
        </button>
      ))}
    </div>
  );
}
