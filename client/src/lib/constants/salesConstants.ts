import {
  FileText,
  Send,
  Eye,
  CheckCircle,
  Clock,
  XCircle,
  Package,
  PackageCheck,
  Truck,
  AlertCircle,
  CreditCard,
  Banknote,
  Smartphone,
  Globe,
  Wallet,
} from 'lucide-react';
import type {
  QuoteStatus,
  OrderStatus,
  InvoiceStatus,
  ReceiptStatus,
  PaymentMethod,
} from '@typedefs/sales';

// ── Quote status meta ─────────────────────────────────────────────────────────

export const QUOTE_STATUS_META: Record<
  QuoteStatus,
  { label: string; color: string; icon: typeof FileText; tone: string }
> = {
  draft:     { label: 'Draft',     color: '#6B7280', icon: FileText,    tone: 'stone'  },
  sent:      { label: 'Sent',      color: '#C9A86C', icon: Send,        tone: 'gold'   },
  viewed:    { label: 'Viewed',    color: '#C9A86C', icon: Eye,         tone: 'gold'   },
  confirmed: { label: 'Confirmed', color: '#2D6A4F', icon: CheckCircle, tone: 'sage'   },
  expired:   { label: 'Expired',   color: '#9E9891', icon: Clock,       tone: 'smoke'  },
  cancelled: { label: 'Cancelled', color: '#C0392B', icon: XCircle,     tone: 'danger' },
};

// ── Order status meta ─────────────────────────────────────────────────────────

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; color: string; icon: typeof Package; tone: string }
> = {
  confirmed:            { label: 'Confirmed',         color: '#C9A86C', icon: Package,    tone: 'gold'  },
  partially_fulfilled:  { label: 'Part. Fulfilled',   color: '#C9A86C', icon: Package,    tone: 'gold'  },
  fulfilled:            { label: 'Fulfilled',         color: '#2D6A4F', icon: PackageCheck,tone: 'sage' },
  awaiting_dispatch:    { label: 'Awaiting Dispatch', color: '#8B9D77', icon: Truck,       tone: 'sage' },
  cancelled:            { label: 'Cancelled',         color: '#C0392B', icon: XCircle,     tone: 'danger'},
};

// ── Invoice status meta ───────────────────────────────────────────────────────

export const INVOICE_STATUS_META: Record<
  InvoiceStatus,
  { label: string; color: string; icon: typeof FileText; tone: string }
> = {
  draft:           { label: 'Draft',           color: '#6B7280', icon: FileText,    tone: 'stone'  },
  sent:            { label: 'Sent',            color: '#C9A86C', icon: Send,        tone: 'gold'   },
  partially_paid:  { label: 'Part. Paid',      color: '#C9A86C', icon: CreditCard,  tone: 'gold'   },
  paid:            { label: 'Paid',            color: '#2D6A4F', icon: CheckCircle, tone: 'sage'   },
  overdue:         { label: 'Overdue',         color: '#C0392B', icon: AlertCircle, tone: 'danger' },
  voided:          { label: 'Voided',          color: '#9E9891', icon: XCircle,     tone: 'smoke'  },
};

// ── Receipt status meta ───────────────────────────────────────────────────────

export const RECEIPT_STATUS_META: Record<
  ReceiptStatus,
  { label: string; color: string; tone: string }
> = {
  issued: { label: 'Issued', color: '#2D6A4F', tone: 'sage'  },
  voided: { label: 'Voided', color: '#9E9891', tone: 'smoke' },
};

// ── Payment method meta ───────────────────────────────────────────────────────

export const PAYMENT_METHOD_META: Record<
  PaymentMethod,
  { label: string; icon: typeof Banknote; description: string }
> = {
  bank_transfer: { label: 'Bank Transfer', icon: Banknote,    description: 'Direct bank transfer' },
  pos_card:      { label: 'POS Card',      icon: CreditCard,  description: 'In-store card payment' },
  cash:          { label: 'Cash',          icon: Wallet,      description: 'Cash payment'          },
  paystack:      { label: 'Paystack',      icon: Smartphone,  description: 'Online (NGN)'          },
  stripe:        { label: 'Stripe',        icon: Globe,       description: 'Online (international)'},
};

// ── Fulfilment type labels ────────────────────────────────────────────────────

export const FULFILMENT_LABELS: Record<'walk_in' | 'delivery', string> = {
  walk_in:  'Walk-In',
  delivery: 'Delivery',
};

// ── Quick-filter options ──────────────────────────────────────────────────────

export const QUOTE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '',          label: 'All'       },
  { value: 'draft',     label: 'Draft'     },
  { value: 'sent',      label: 'Sent'      },
  { value: 'viewed',    label: 'Viewed'    },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'expired',   label: 'Expired'   },
];

export const ORDER_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '',                   label: 'All'               },
  { value: 'confirmed',          label: 'Confirmed'         },
  { value: 'partially_fulfilled',label: 'Part. Fulfilled'   },
  { value: 'awaiting_dispatch',  label: 'Awaiting Dispatch' },
  { value: 'fulfilled',          label: 'Fulfilled'         },
];

export const INVOICE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '',               label: 'All'          },
  { value: 'draft',          label: 'Draft'        },
  { value: 'sent',           label: 'Sent'         },
  { value: 'partially_paid', label: 'Part. Paid'   },
  { value: 'paid',           label: 'Paid'         },
  { value: 'overdue',        label: 'Overdue'      },
];

// ── Courier options for logistics hand-off ────────────────────────────────────

export const COURIER_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: 'chowdeck', label: 'Chowdeck', description: 'Lagos — same-day / next-day' },
  { value: 'gigl',     label: 'GIGL',     description: 'Nationwide courier'          },
  { value: 'manual',   label: 'Manual',   description: 'Enter tracking details manually' },
];
