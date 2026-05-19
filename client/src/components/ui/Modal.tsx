import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@lib/cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  surface?: 'dark' | 'light';
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnBackdrop?: boolean;
}

const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export function Modal({ open, onClose, title, description, size='md', surface='light', children, footer, closeOnBackdrop=true }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const isDark = surface === 'dark';

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[8000] flex items-center justify-center p-4 sm:p-6 animate-fade-in" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-orika-black/70 backdrop-blur-md" onClick={closeOnBackdrop ? onClose : undefined} />
      <div className={cn(
        'relative w-full rounded-3xl shadow-modal animate-scale-in',
        sizes[size],
        isDark ? 'bg-orika-charcoal border border-orika-graphite' : 'bg-surface-light border border-orika-cloud/30 surface-light',
        'max-h-[90vh] flex flex-col',
      )}>
        {(title || description) && (
          <div className={cn('px-6 sm:px-8 py-5 sm:py-6 border-b', isDark ? 'border-orika-graphite' : 'border-orika-cloud/30')}>
            {title && <h2 className={cn('font-display font-light text-2xl sm:text-3xl', isDark ? 'text-orika-cream' : 'text-orika-black')}>{title}</h2>}
            {description && <p className={cn('mt-1.5 text-xs sm:text-sm', isDark ? 'text-orika-smoke' : 'text-text-on-light-muted')}>{description}</p>}
          </div>
        )}
        <button
          type="button" onClick={onClose}
          className={cn('absolute top-4 right-4 sm:top-5 sm:right-5 p-2 rounded-full transition-colors',
            isDark ? 'text-orika-smoke hover:text-orika-cream hover:bg-orika-graphite' : 'text-orika-smoke hover:text-orika-black hover:bg-white/60')}
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="overflow-y-auto px-6 sm:px-8 py-6">{children}</div>
        {footer && (
          <div className={cn('px-6 sm:px-8 py-4 border-t flex items-center justify-end gap-3', isDark ? 'border-orika-graphite bg-orika-charcoal' : 'border-orika-cloud/30 bg-surface-light')}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
