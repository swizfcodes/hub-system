// Types mirror shared.staff_profiles / staff_contracts / staff_assets / leave_requests
// + auth.users (the embed via LEFT JOIN in staff.repository.js).

export type Department =
  | "sales"
  | "operations"
  | "finance"
  | "logistics"
  | "management"
  | string;
export type EmploymentType = "full_time" | "part_time" | "contract";
export type ContractType = "full_time" | "part_time" | "contract" | "amendment";
export type LeaveType =
  | "annual"
  | "sick"
  | "maternity"
  | "paternity"
  | "compassionate"
  | "unpaid";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface StaffProfile {
  profile_id: string;
  contact_id: string;
  employee_number: string;
  business: string;
  department?: Department | null;
  job_title: string;
  employment_type: EmploymentType;
  start_date: string;
  end_date?: string | null;
  reports_to?: string | null;
  // Sensitive fields — backend masks them with "****1234" pattern for non-privileged readers.
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_sort_code?: string | null;
  nin?: string | null;
  bvn?: string | null;
  base_salary?: number | null;
  pension_pin?: string | null;
  nhf_number?: string | null;
  tax_id?: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  // Joined from contacts
  display_name?: string;
  first_name?: string | null;
  last_name?: string | null;
  primary_phone?: string;
  whatsapp_number?: string | null;
  email?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  addresses?: unknown[];
  // Joined from users
  user_id?: string | null;
  user_is_active?: boolean | null;
  last_login_at?: string | null;
  permitted_businesses?: string[];
  default_business?: string;
  reports_to_name?: string | null;
}

export interface StaffContract {
  contract_id: string;
  profile_id: string;
  contract_type: ContractType;
  effective_from: string;
  effective_to?: string | null;
  gross_salary: number;
  document_id?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface StaffAsset {
  asset_id: string;
  profile_id: string;
  asset_type: string;
  description: string;
  serial_number?: string | null;
  issued_date: string;
  returned_date?: string | null;
  condition_on_issue?: string | null;
  condition_on_return?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface LeaveRequest {
  leave_id: string;
  profile_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: LeaveStatus;
  approved_by?: string | null;
  approved_at?: string | null;
  reason?: string | null;
  rejection_reason?: string | null;
}

export interface StaffOnboardResult {
  profile: StaffProfile;
  credentials: null | {
    user_id: string;
    email: string;
    temp_password: string; // shown ONCE
    force_password_reset: boolean;
  };
}

export interface StaffListResponse {
  data: StaffProfile[];
  pagination: { page: number; limit: number; total: number };
}

export interface OrgChartNode {
  profile_id: string;
  reports_to?: string | null;
  job_title: string;
  department?: string | null;
  display_name: string;
  depth: number;
}
