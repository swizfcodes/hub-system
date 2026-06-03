import { api } from "../api";
import type {
  Catalogue,
  Role,
  RoleWithPermissions,
  RolePermission,
  UserAccess,
  PermissionAction,
  RecordScope,
} from "@typedefs/permissions";

const BASE = "/settings/permissions";

export async function getCatalogue(): Promise<Catalogue> {
  const { data } = await api.get<Catalogue>(`${BASE}/catalogue`);
  return data;
}

export async function listRoles(business?: string): Promise<{ data: Role[] }> {
  const { data } = await api.get<{ data: Role[] }>(`${BASE}/roles`, {
    params: { business },
  });
  return data;
}

export async function getRole(roleId: string): Promise<RoleWithPermissions> {
  const { data } = await api.get<RoleWithPermissions>(
    `${BASE}/roles/${roleId}`,
  );
  return data;
}

export async function createRole(payload: {
  role_name: string;
  business?: string | null;
  description?: string;
  clone_from_role_id?: string;
}): Promise<RoleWithPermissions> {
  const { data } = await api.post<RoleWithPermissions>(
    `${BASE}/roles`,
    payload,
  );
  return data;
}

export async function updateRole(
  roleId: string,
  patch: { role_name?: string; description?: string },
): Promise<Role> {
  const { data } = await api.patch<Role>(`${BASE}/roles/${roleId}`, patch);
  return data;
}

export async function deleteRole(
  roleId: string,
): Promise<{ deleted: boolean }> {
  const { data } = await api.delete(`${BASE}/roles/${roleId}`);
  return data;
}

export async function grantPermission(
  roleId: string,
  payload: {
    module: string;
    action: PermissionAction;
    record_scope?: RecordScope;
    hidden_fields?: string[];
  },
): Promise<RolePermission> {
  const { data } = await api.put<RolePermission>(
    `${BASE}/roles/${roleId}/grant`,
    payload,
  );
  return data;
}

export async function revokePermission(
  roleId: string,
  payload: { module: string; action: PermissionAction },
): Promise<{ revoked: boolean }> {
  const { data } = await api.put<{ revoked: boolean }>(
    `${BASE}/roles/${roleId}/revoke`,
    payload,
  );
  return data;
}

export async function bulkReplacePermissions(
  roleId: string,
  permissions: Array<{
    module: string;
    action: PermissionAction;
    record_scope?: RecordScope;
    hidden_fields?: string[];
  }>,
): Promise<{ role_id: string; permissions: RolePermission[] }> {
  const { data } = await api.post(`${BASE}/roles/${roleId}/bulk`, {
    permissions,
  });
  return data;
}

// User access
export async function getUserAccess(userId: string): Promise<UserAccess> {
  const { data } = await api.get<UserAccess>(`${BASE}/users/${userId}/access`);
  return data;
}
export async function setPermittedBusinesses(
  userId: string,
  permitted_businesses: string[],
): Promise<UserAccess> {
  const { data } = await api.put<UserAccess>(
    `${BASE}/users/${userId}/permitted-businesses`,
    { permitted_businesses },
  );
  return data;
}
export async function setDefaultBusiness(
  userId: string,
  default_business: string | null,
): Promise<UserAccess> {
  const { data } = await api.put<UserAccess>(
    `${BASE}/users/${userId}/default-business`,
    { default_business },
  );
  return data;
}
export async function setRoleAtBusiness(
  userId: string,
  business: string,
  payload: { role_id: string; expires_at?: string },
): Promise<{
  user_id: string;
  business: string;
  role_id: string;
  role_name: string;
}> {
  const { data } = await api.put(
    `${BASE}/users/${userId}/roles/${business}`,
    payload,
  );
  return data;
}
export async function removeRoleAtBusiness(
  userId: string,
  business: string,
): Promise<{ removed: boolean }> {
  const { data } = await api.delete(
    `${BASE}/users/${userId}/roles/${business}`,
  );
  return data;
}
