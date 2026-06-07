export interface AuthUser {
  user_id: string;
  role_id: string;
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
