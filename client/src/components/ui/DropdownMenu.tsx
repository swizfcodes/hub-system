import React, { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { cn } from '@lib/cn';

export interface DropdownItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface DropdownMenuProps {
  items: DropdownItem[];
  trigger?: React.ReactNode;
  align?: 'left' | 'right';
  surface?: 'dark' | 'light';
}

export function DropdownMenu({ items, trigger, align='right', surface='dark' }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center transition-colors',
          surface === 'dark' ? 'text-orika-smoke hover:text-orika-cream hover:bg-orika-graphite' : 'text-orika-smoke hover:text-orika-black hover:bg-white/60',
        )}
        aria-label="More actions"
      >
        {trigger ?? <MoreVertical className="w-4 h-4" />}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-50 mt-2 min-w-[200px] rounded-xl shadow-modal border overflow-hidden py-1.5 animate-scale-in origin-top-right',
            surface === 'dark' ? 'bg-orika-charcoal border-orika-graphite' : 'bg-white border-orika-cloud/40 surface-light',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { if (it.disabled) return; setOpen(false); it.onClick(); }}
              disabled={it.disabled}
              role="menuitem"
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-left transition-colors',
                surface === 'dark'
                  ? 'text-orika-cream hover:bg-orika-graphite'
                  : 'text-orika-black hover:bg-orika-cloud/30',
                it.destructive && 'text-state-danger',
                it.disabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              {it.icon && <span className="w-4 h-4 flex-shrink-0">{it.icon}</span>}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
