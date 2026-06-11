export interface AuthUser {
  user_id: string;
  role_id: string;
  /** Role name from the login response (e.g. "owner", "manager", "sales"). */
  role?: string | null;
  /** Primary role name from /auth/me (e.g. "owner", "manager", "sales"). */
  role_name?: string | null;
  email?: string;
  display_name?: string;
  avatar_url?: string;
  current_business: string;
  permitted_businesses: string[];
  default_business: string;
}

export interface ApiError {
  status?: number;
  message: string;
  details?: unknown;
}
