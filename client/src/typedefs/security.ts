// ── typedefs/security.ts ─────────────────────────────────────────────────────

export interface Role {
  role_id: string;
  role_name: string;
  business: string | null;
  is_system: boolean;
  description: string | null;
  /** Ordered top-10 navigation default for users on this role (or null). */
  default_nav?: string[] | null;
  created_at: string;
}

export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

export interface Permission {
  permission_id: string;
  module: string;
  action: string;
  record_scope: "all" | "own" | "team";
  hidden_fields: string[];
  created_at: string;
}

export interface ModuleCatalogue {
  module: string;
  actions: string[];
}

export interface UserAccess {
  user_id: string;
  email: string;
  is_active: boolean;
  permitted_businesses: string[];
  default_business: string | null;
  staff_profile_id: string | null;
  roles: UserRoleAssignment[];
}

export interface UserRoleAssignment {
  role_id: string;
  role_name: string;
  is_system: boolean;
  business: string;
  granted_at: string;
  expires_at: string | null;
}

export interface StaffUser {
  profile_id: string;
  display_name: string;
  email: string | null;
  job_title: string | null;
  department: string | null;
  business: string;
  is_deleted: boolean;
  // from joined users table
  user_id?: string | null;
  // Backend (/staff → staff.repository listProfiles) aliases the login
  // flag as `user_is_active` — must match or every account reads as
  // "Deactivated" (undefined → !undefined === true).
  user_is_active?: boolean;
  last_login_at?: string | null;
  failed_login_attempts?: number;
  totp_enabled?: boolean;
  role_name?: string;
}

export interface ActiveSession {
  token_id: string;
  created_at: string;
  expires_at: string;
}

export interface AuditLogEntry {
  log_id: string;
  occurred_at: string;
  user_id: string | null;
  user_name: string;
  user_email: string | null;
  business: string;
  module: string;
  action: string;
  table_name: string | null;
  record_id: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  ip_address: string | null;
  session_id: string | null;
  metadata: Record<string, unknown>;
}

export interface SecurityStats {
  failed_logins_24h: { count: number; user_name: string; user_email: string }[];
  recent_events: {
    log_id: string;
    occurred_at: string;
    user_name: string;
    module: string;
    action: string;
    ip_address: string | null;
  }[];
  active_users_30d: number;
  inactive_accounts: number;
}

export interface InviteToken {
  email: string;
  role_name: string;
  businesses: string[];
  display_name: string;
  expires_at: string;
}

// ── lib/constants/securityConstants.ts ───────────────────────────────────────

export const ALL_ACTIONS = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
  "export",
] as const;
export type ActionKey = (typeof ALL_ACTIONS)[number];

export const ACTION_META: Record<
  ActionKey,
  { label: string; color: string; description: string }
> = {
  view: { label: "View", color: "#4E9AF1", description: "Read records" },
  create: { label: "Create", color: "#2D9CDB", description: "Add new records" },
  edit: {
    label: "Edit",
    color: "#C9A86C",
    description: "Modify existing records",
  },
  delete: { label: "Delete", color: "#EF4444", description: "Remove records" },
  approve: {
    label: "Approve",
    color: "#7B68EE",
    description: "Approve/reject workflows",
  },
  export: {
    label: "Export",
    color: "#9E9891",
    description: "Download/export data",
  },
};

export const RECORD_SCOPE_META = {
  all: {
    label: "All records",
    description: "Can access every record in this module",
  },
  own: {
    label: "Own records",
    description: "Can only access records they created",
  },
  team: {
    label: "Team records",
    description: "Can access records from their direct reports",
  },
};

// Curated list of sensitive fields (Q7: D — dropdown, not free text)
export const SENSITIVE_FIELDS = [
  { value: "cost_price", label: "Cost Price" },
  { value: "unit_cost", label: "Unit Cost" },
  { value: "gross_pay", label: "Gross Pay" },
  { value: "net_pay", label: "Net Pay" },
  { value: "salary", label: "Salary" },
  { value: "net_profit", label: "Net Profit" },
  { value: "margin_pct", label: "Profit Margin %" },
  { value: "commission_rate", label: "Commission Rate" },
  { value: "bank_account_no", label: "Bank Account Number" },
  { value: "running_balance", label: "Bank Balance" },
  { value: "credit_limit", label: "Credit Limit" },
  { value: "tax_identification", label: "Tax ID" },
];

// Security health checks shown on the dashboard
export const HEALTH_CHECKS = [
  {
    id: "inactive_accounts",
    label: "Inactive accounts (90+ days)",
    severity: "warn",
    href: "/security/users",
  },
  {
    id: "no_2fa",
    label: "Users without 2FA enabled",
    severity: "info",
    href: "/security/users",
  },
  {
    id: "failed_logins",
    label: "Failed login attempts today",
    severity: "error",
    href: "/security/audit",
  },
  {
    id: "pending_invites",
    label: "Pending unaccepted invites",
    severity: "info",
    href: "/security/users",
  },
] as const;

// Module display names — keys MUST match the backend module names
// used in can() guards / shared.permissions (see MODULE_CATALOGUE in
// shared/permissions/permissions.service.js). The old list used keys
// like "invoices"/"contacts"/"retail-partners" that don't exist in
// the backend, which broke the audit-log module filter.
export const MODULE_LABELS: Record<string, string> = {
  accounting: "Accounting",
  audit: "Audit Log",
  calendar: "Calendar",
  campaigns: "Campaigns",
  catalogue: "Product Catalogue",
  crm: "Contacts & CRM",
  dashboards: "Dashboards",
  discounts: "Discounts",
  documents: "Documents",
  expenses: "Expenses",
  help: "Help Center",
  invoicing: "Invoicing",
  logistics: "Logistics",
  loyalty: "Loyalty",
  messaging: "Messaging",
  payroll: "Payroll",
  pos: "Point of Sale",
  purchasing: "Purchasing",
  reports: "Reports",
  retail_partners: "Retail Partners",
  sales: "Sales",
  sales_campaigns: "Sales Campaigns",
  security: "Security",
  settings: "Settings",
  social: "Social Media",
  staff: "HR & Staff",
  stock: "Stock",
  tasks: "Tasks",
  tax: "Tax",
};

// Business display names now come from GET /api/branding
// (useBranding().businessLabel) — never hardcode them.
