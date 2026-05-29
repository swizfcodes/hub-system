import type { SelectOption } from '@components/ui/Select';
import type { BadgeProps } from '@components/ui/Badge';
import type { ExpenseStatus, ExpenseType, ExpenseCategory, AdvanceStatus } from '@typedefs/expenses';

// ── Expense status ────────────────────────────────────────────────────────────

export const EXPENSE_STATUS_META: Record<
  ExpenseStatus,
  { label: string; tone: BadgeProps['tone']; dot?: boolean }
> = {
  pending:  { label: 'Pending',  tone: 'warn',    dot: true  },
  approved: { label: 'Approved', tone: 'info',    dot: false },
  rejected: { label: 'Rejected', tone: 'danger',  dot: false },
  paid:     { label: 'Paid',     tone: 'sage',    dot: false },
};

// ── Advance status ────────────────────────────────────────────────────────────

export const ADVANCE_STATUS_META: Record<
  AdvanceStatus,
  { label: string; tone: BadgeProps['tone'] }
> = {
  pending:   { label: 'Pending',   tone: 'warn'    },
  approved:  { label: 'Approved',  tone: 'info'    },
  disbursed: { label: 'Disbursed', tone: 'gold'    },
  settled:   { label: 'Settled',   tone: 'sage'    },
  rejected:  { label: 'Rejected',  tone: 'danger'  },
};

// ── Expense type ──────────────────────────────────────────────────────────────

export const EXPENSE_TYPE_OPTIONS: SelectOption[] = [
  { value: 'reimbursement',  label: 'Reimbursement — I paid out of pocket'   },
  { value: 'petty_cash',     label: 'Petty Cash — from the cash float'        },
  { value: 'direct_payment', label: 'Direct Payment — paid from company account' },
];

export const EXPENSE_TYPE_LABEL: Record<ExpenseType, string> = {
  reimbursement:  'Reimbursement',
  petty_cash:     'Petty Cash',
  direct_payment: 'Direct Payment',
};

// ── Category options ──────────────────────────────────────────────────────────

export const CATEGORY_OPTIONS: SelectOption[] = [
  { value: 'transport',            label: 'Transport & Travel'      },
  { value: 'meals',                label: 'Meals'                   },
  { value: 'client_entertainment', label: 'Client Entertainment'    },
  { value: 'office_supplies',      label: 'Office Supplies'         },
  { value: 'utilities',            label: 'Utilities'               },
  { value: 'rent',                 label: 'Rent & Rates'            },
  { value: 'maintenance',          label: 'Repairs & Maintenance'   },
  { value: 'marketing',            label: 'Marketing & Advertising' },
  { value: 'insurance',            label: 'Insurance'               },
  { value: 'professional_fees',    label: 'Professional Fees'       },
  { value: 'other',                label: 'Other'                   },
];

// Map each category to its COA code (for display, actual posting is backend)
export const CATEGORY_COA: Record<ExpenseCategory, string> = {
  rent:                '6100',
  transport:           '6200',
  office_supplies:     '6300',
  meals:               '6400',
  client_entertainment:'6400',
  utilities:           '6500',
  maintenance:         '6600',
  marketing:           '6700',
  insurance:           '6800',
  professional_fees:   '6800',
  other:               '6800',
};

// Credit account per expense type (for display — actual posting is backend)
export const EXPENSE_TYPE_CR_ACCOUNT: Record<ExpenseType, string> = {
  reimbursement:  'Staff Payables (2300)',
  petty_cash:     'Petty Cash (1150)',
  direct_payment: 'Bank / Card (1210)',
};

// ── Status filter tabs ────────────────────────────────────────────────────────

export const EXPENSE_STATUS_TABS = [
  { key: 'all',      label: 'All'      },
  { key: 'pending',  label: 'Pending'  },
  { key: 'approved', label: 'Approved' },
  { key: 'paid',     label: 'Paid'     },
  { key: 'rejected', label: 'Rejected' },
] as const;

// Auto-approve threshold — must match backend env var
export const AUTO_APPROVE_THRESHOLD_NGN = 5_000;
