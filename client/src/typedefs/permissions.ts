export type PermissionAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "export";

export type RecordScope = "all" | "own" | "team";

export interface Role {
  role_id: string;
  role_name: string;
  business: string | null; // null = global / system
  is_system: boolean;
  description?: string | null;
  created_at: string;
}

export interface RolePermission {
  permission_id: string;
  module: string;
  action: PermissionAction;
  record_scope: RecordScope;
  hidden_fields: string[];
  created_at: string;
}

export interface RoleWithPermissions extends Role {
  permissions: RolePermission[];
}

export interface ModuleCatalogueEntry {
  module: string;
  actions: PermissionAction[];
}

export interface Catalogue {
  modules: ModuleCatalogueEntry[];
  valid_actions: PermissionAction[];
  valid_scopes: RecordScope[];
}

export interface UserRoleAtBusiness {
  role_id: string;
  role_name: string;
  is_system: boolean;
  role_business: string | null;
  business: string;
  granted_by: string;
  granted_at: string;
  expires_at?: string | null;
}

export interface UserAccess {
  user_id: string;
  email: string;
  is_active: boolean;
  default_business: string | null;
  permitted_businesses: string[];
  roles_by_business: UserRoleAtBusiness[];
}
