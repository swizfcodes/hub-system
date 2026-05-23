import {
  Banknote, CreditCard, Smartphone, ArrowLeftRight,
  CheckCircle, Clock, XCircle, Lock,
} from 'lucide-react';
import type { POSPaymentMethod, SessionStatus, SyncStatus } from '@typedefs/pos';

// ── Payment method meta ───────────────────────────────────────────────────────

export const POS_PAYMENT_META: Record<
  POSPaymentMethod,
  { label: string; icon: typeof Banknote; description: string; requiresRef: boolean }
> = {
  cash:          { label: 'Cash',          icon: Banknote,        description: 'Physical cash',         requiresRef: false },
  pos_card:      { label: 'POS Card',      icon: CreditCard,      description: 'Card terminal',         requiresRef: true  },
  paystack:      { label: 'Paystack',      icon: Smartphone,      description: 'Online / QR payment',   requiresRef: false },
  bank_transfer: { label: 'Bank Transfer', icon: ArrowLeftRight,  description: 'Direct bank transfer',  requiresRef: true  },
};

// ── Session status meta ───────────────────────────────────────────────────────

export const SESSION_STATUS_META: Record<
  SessionStatus,
  { label: string; color: string; icon: typeof CheckCircle }
> = {
  open:         { label: 'Open',         color: '#8B9D77', icon: CheckCircle },
  closed:       { label: 'Closed',       color: '#6B7280', icon: Clock       },
  reconciled:   { label: 'Reconciled',   color: '#2D6A4F', icon: Lock        },
};

// ── Sync status meta ──────────────────────────────────────────────────────────

export const SYNC_STATUS_META: Record<
  SyncStatus,
  { label: string; color: string }
> = {
  pending:  { label: 'Pending',  color: '#C9A86C' },
  syncing:  { label: 'Syncing',  color: '#C9A86C' },
  synced:   { label: 'Synced',   color: '#2D6A4F' },
  conflict: { label: 'Conflict', color: '#C0392B' },
};

// ── Cash variance status ──────────────────────────────────────────────────────

export const VARIANCE_STATUS_META: Record<
  'balanced' | 'minor_short' | 'minor_over' | 'short' | 'over',
  { label: string; color: string; icon: typeof CheckCircle }
> = {
  balanced:    { label: 'Balanced',    color: '#2D6A4F', icon: CheckCircle },
  minor_short: { label: 'Minor Short', color: '#C9A86C', icon: Clock       },
  minor_over:  { label: 'Minor Over',  color: '#C9A86C', icon: Clock       },
  short:       { label: 'Short',       color: '#C0392B', icon: XCircle     },
  over:        { label: 'Over',        color: '#C0392B', icon: XCircle     },
};

// ── Product search ────────────────────────────────────────────────────────────

export const LOW_STOCK_THRESHOLD = 3;

// ── Sync ──────────────────────────────────────────────────────────────────────

/** How often the background sync worker fires (milliseconds). */
export const SYNC_INTERVAL_MS = 10_000;

/** Max transactions to send in a single sync batch. */
export const SYNC_BATCH_SIZE = 20;

/** Products fetched on session open for offline cache. */
export const PRODUCTS_CACHE_LIMIT = 500;

// ── Loyalty ───────────────────────────────────────────────────────────────────

/** Naira value of 1 loyalty point for the redemption display. */
export const NAIRA_PER_LOYALTY_POINT = 1;
