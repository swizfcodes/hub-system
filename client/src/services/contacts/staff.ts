import { api } from "../api";
import type {
  StaffProfile,
  StaffContract,
  StaffAsset,
  StaffListResponse,
  StaffOnboardResult,
  OrgChartNode,
} from "@typedefs/staff";

export interface StaffListParams {
  search?: string;
  business?: string;
  department?: string;
  contact_id?: string;
  is_active?: boolean;
  page?: number;
  limit?: number;
}

export async function listStaff(
  params: StaffListParams = {},
): Promise<StaffListResponse> {
  const { data } = await api.get<StaffListResponse>("/staff", { params });
  return data;
}

export async function getOrgChart(
  params: { business?: string; root?: string } = {},
): Promise<OrgChartNode[]> {
  const { data } = await api.get<{ data: OrgChartNode[] }>("/staff/org-chart", {
    params,
  });
  return data.data;
}

export async function getStaff(id: string): Promise<StaffProfile> {
  const { data } = await api.get<StaffProfile>(`/staff/${id}`);
  return data;
}

export async function getDirectReports(id: string): Promise<StaffProfile[]> {
  const { data } = await api.get<{ data: StaffProfile[] }>(
    `/staff/${id}/direct-reports`,
  );
  return data.data;
}

export async function createStaff(
  payload: Record<string, unknown>,
): Promise<StaffOnboardResult> {
  const { data } = await api.post<StaffOnboardResult>("/staff", payload);
  return data;
}

export async function updateStaff(
  id: string,
  patch: Record<string, unknown>,
): Promise<StaffProfile> {
  const { data } = await api.patch<StaffProfile>(`/staff/${id}`, patch);
  return data;
}

export async function offboardStaff(
  id: string,
  payload: { reason: string; last_day: string },
): Promise<{ profile_id: string; offboarded: boolean }> {
  const { data } = await api.post<{ profile_id: string; offboarded: boolean }>(
    `/staff/${id}/offboard`,
    payload,
  );
  return data;
}

// ── Contracts ──
export async function listContracts(id: string): Promise<StaffContract[]> {
  const { data } = await api.get<{ data: StaffContract[] }>(
    `/staff/${id}/contracts`,
  );
  return data.data;
}
export async function addContract(
  id: string,
  payload: Partial<StaffContract>,
): Promise<StaffContract> {
  const { data } = await api.post<StaffContract>(
    `/staff/${id}/contracts`,
    payload,
  );
  return data;
}

export async function openContractPdf(
  id: string,
  contractId: string,
): Promise<void> {
  const { openPdf } = await import("@lib/openPdf");
  return openPdf(
    `/staff/${id}/contracts/${contractId}/pdf`,
    `contract-${contractId}.pdf`,
  );
}

// ── Assets ──
export async function listAssets(
  id: string,
  includeReturned = false,
): Promise<StaffAsset[]> {
  const { data } = await api.get<{ data: StaffAsset[] }>(
    `/staff/${id}/assets`,
    { params: { include_returned: includeReturned } },
  );
  return data.data;
}
export async function issueAsset(
  id: string,
  payload: Partial<StaffAsset>,
): Promise<StaffAsset> {
  const { data } = await api.post<StaffAsset>(`/staff/${id}/assets`, payload);
  return data;
}
export async function returnAsset(
  assetId: string,
  payload: { returned_date?: string; condition_on_return?: string },
): Promise<StaffAsset> {
  const { data } = await api.post<StaffAsset>(
    `/staff/assets/${assetId}/return`,
    payload,
  );
  return data;
}

// ── Login provisioning ──
export interface CredentialsResponse {
  user_id: string;
  email: string;
  temp_password: string;
  force_password_reset: boolean;
}
export async function provisionLogin(
  id: string,
  payload: {
    email?: string;
    default_business?: string;
    permitted_businesses?: string[];
  },
): Promise<CredentialsResponse> {
  const { data } = await api.post<CredentialsResponse>(
    `/staff/${id}/provision-login`,
    payload,
  );
  return data;
}
export async function deactivateLogin(
  id: string,
): Promise<{ user_id: string; is_active: boolean }> {
  const { data } = await api.post<{ user_id: string; is_active: boolean }>(
    `/staff/${id}/deactivate-login`,
  );
  return data;
}
export async function activateLogin(
  id: string,
): Promise<{ user_id: string; is_active: boolean }> {
  const { data } = await api.post<{ user_id: string; is_active: boolean }>(
    `/staff/${id}/activate-login`,
  );
  return data;
}
export async function resetPassword(id: string): Promise<CredentialsResponse> {
  const { data } = await api.post<CredentialsResponse>(
    `/staff/${id}/reset-password`,
  );
  return data;
}

// ── Roles ──
export interface StaffRoleAssignment {
  role_id: string;
  role_name: string;
  business: string;
  granted_by?: string;
  granted_by_name?: string;
  granted_at: string;
  expires_at?: string | null;
}
export async function listUserRoles(
  id: string,
): Promise<StaffRoleAssignment[]> {
  const { data } = await api.get<{ data: StaffRoleAssignment[] }>(
    `/staff/${id}/roles`,
  );
  return data.data;
}
export async function grantStaffRole(
  id: string,
  payload: { role_name: string; business: string; expires_at?: string },
): Promise<{ granted: boolean; role_name: string; business: string }> {
  const { data } = await api.post(`/staff/${id}/roles`, payload);
  return data;
}
export async function revokeStaffRole(
  id: string,
  payload: { role_name: string; business: string },
): Promise<{ revoked: boolean }> {
  const { data } = await api.delete(`/staff/${id}/roles`, { data: payload });
  return data;
}
