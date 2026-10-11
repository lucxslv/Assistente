export interface User {
  id: string;
  name: string;
  email: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  website?: string;
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
  avatarUrl?: string;
  is_admin?: boolean;
  role?: string;
}

export interface ProfileUpdatePayload {
  name?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  website?: string;
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  name: string;
  email: string;
  password: string;
}

export interface ForgotPasswordResponse {
  status: string;
  message: string;
  reset_token_dev?: string;
  expires_in_minutes?: number;
}

export interface AuthResponse {
  user: User;
  token: string;
}
