import { api } from '@services/api';
import type {
  Role, RoleWithPermissions, ModuleCatalogue, UserAccess,
  StaffUser, ActiveSession, AuditLogEntry, SecurityStats, InviteToken,
} from '@typedefs/security';

// ── Roles ─────────────────────────────────────────────────────────────────────

export async function listRoles(business?: string): Promise<Role[]> {
  try {
    const { data } = await api.get<{ data: Role[] }>('/settings/permissions/roles', {
      params: business ? { business } : undefined,
    });
    return data.data ?? [];
  } catch { return []; }
}

export async function getRoleWithPermissions(roleId: string): Promise<RoleWithPermissions | null> {
  try {
    const { data } = await api.get<RoleWithPermissions>(`/settings/permissions/roles/${roleId}`);
    return data;
  } catch { return null; }
}

export async function createRole(values: {
  role_name: string; business?: string | null; description?: string; clone_from_role_id?: string;
}): Promise<Role> {
  const { data } = await api.post<Role>('/settings/permissions/roles', values);
  return data;
}

export async function updateRole(roleId: string, values: { role_name?: string; description?: string }): Promise<Role> {
  const { data } = await api.patch<Role>(`/settings/permissions/roles/${roleId}`, values);
  return data;
}

export async function deleteRole(roleId: string): Promise<void> {
  await api.delete(`/settings/permissions/roles/${roleId}`);
}

// ── Permission matrix ─────────────────────────────────────────────────────────

export async function getModuleCatalogue(): Promise<ModuleCatalogue[]> {
  try {
    const { data } = await api.get<ModuleCatalogue[]>('/settings/permissions/catalogue');
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

export async function grantPermission(roleId: string, values: {
  module: string; action: string; record_scope?: string; hidden_fields?: string[];
}): Promise<void> {
  await api.put(`/settings/permissions/roles/${roleId}/grant`, values);
}

export async function revokePermission(roleId: string, module: string, action: string): Promise<void> {
  await api.put(`/settings/permissions/roles/${roleId}/revoke`, { module, action });
}

export async function bulkReplacePermissions(roleId: string, permissions: {
  module: string; action: string; record_scope?: string; hidden_fields?: string[];
}[]): Promise<void> {
  await api.post(`/settings/permissions/roles/${roleId}/bulk`, { permissions });
}

// ── User access ───────────────────────────────────────────────────────────────

export async function getUserAccess(userId: string): Promise<UserAccess | null> {
  try {
    const { data } = await api.get<UserAccess>(`/settings/permissions/users/${userId}/access`);
    return data;
  } catch { return null; }
}

export async function setRoleAtBusiness(userId: string, business: string, values: {
  role_id: string; expires_at?: string;
}): Promise<void> {
  await api.put(`/settings/permissions/users/${userId}/roles/${business}`, values);
}

export async function setPermittedBusinesses(userId: string, businesses: string[]): Promise<void> {
  await api.put(`/settings/permissions/users/${userId}/permitted-businesses`, {
    permitted_businesses: businesses,
  });
}

export async function removeRoleAtBusiness(userId: string, business: string): Promise<void> {
  await api.delete(`/settings/permissions/users/${userId}/roles/${business}`);
}

// ── Staff / users ─────────────────────────────────────────────────────────────

export async function listStaffUsers(params?: {
  business?: string; is_deleted?: boolean; search?: string;
}): Promise<{ data: StaffUser[]; total: number }> {
  try {
    const { data } = await api.get('/staff', { params });
    return data;
  } catch { return { data: [], total: 0 }; }
}

export async function provisionLogin(profileId: string, values: {
  email: string; default_business: string; permitted_businesses: string[];
}): Promise<{ user_id: string; temp_password: string }> {
  const { data } = await api.post(`/staff/${profileId}/provision-login`, values);
  return data;
}

export async function deactivateLogin(profileId: string): Promise<void> {
  await api.post(`/staff/${profileId}/deactivate-login`);
}

export async function resetPassword(profileId: string): Promise<{ temp_password: string }> {
  const { data } = await api.post(`/staff/${profileId}/reset-password`);
  return data;
}

// ── Invite tokens ─────────────────────────────────────────────────────────────

export async function sendInvite(values: {
  email: string; role_id: string; businesses: string[];
  display_name: string; job_title?: string;
}): Promise<{ message: string; expires_in: string }> {
  const { data } = await api.post('/auth/invite', values);
  return data;
}

export async function verifyInviteToken(token: string): Promise<InviteToken | null> {
  try {
    const { data } = await api.get<InviteToken>(`/auth/invite/${token}`);
    return data;
  } catch { return null; }
}

export async function acceptInvite(token: string, values: {
  password: string; display_name: string;
}): Promise<{ message: string; email: string }> {
  const { data } = await api.post(`/auth/invite/${token}/accept`, values);
  return data;
}

// ── Active sessions ───────────────────────────────────────────────────────────

export async function listActiveSessions(userId: string): Promise<ActiveSession[]> {
  try {
    const { data } = await api.get<{ data: ActiveSession[] }>(`/auth/sessions/${userId}`);
    return data.data ?? [];
  } catch { return []; }
}

export async function revokeSession(userId: string, tokenId: string): Promise<void> {
  await api.delete(`/auth/sessions/${userId}/${tokenId}`);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await api.delete(`/auth/sessions/${userId}`);
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export async function queryAuditLog(params?: {
  user_id?: string; module?: string; action?: string;
  start_date?: string; end_date?: string; page?: number; limit?: number;
}): Promise<{ data: AuditLogEntry[]; total: number; page: number; limit: number }> {
  try {
    const { data } = await api.get('/security/audit', { params });
    return data;
  } catch { return { data: [], total: 0, page: 1, limit: 50 }; }
}

export async function downloadAuditCsv(params: {
  start_date?: string; end_date?: string; module?: string; action?: string;
}): Promise<Blob> {
  const response = await api.get('/security/audit', {
    params: { ...params, format: 'csv' },
    responseType: 'blob',
  });
  return response.data as Blob;
}

export async function getSecurityStats(): Promise<SecurityStats | null> {
  try {
    const { data } = await api.get<SecurityStats>('/security/audit/stats');
    return data;
  } catch { return null; }
}
