export interface OptionSchema {
  id: string;
  value: string;
  sub_value?: string | null;
}

export type ListOptionSchema = OptionSchema[];

/** Bentuk respons tunggal dari backend (dan lapisan data contoh). */
export interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
}

/** Bentuk respons daftar dengan pagination skip/limit. */
export interface ApiListResponse<T> {
  success: boolean;
  statusCode: number;
  message?: string;
  total: number;
  skip: number;
  limit: number;
  data: T[];
}

export type AccessRole = "owner" | "admin" | "member" | "viewer";

/** `pending`: baru mendaftar, menunggu persetujuan pengelola platform. */
export type OrganizationStatus = "pending" | "active" | "suspended";

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_verified: boolean;
  access_role: AccessRole | null;
  organization: OrganizationSummary | null;
  /** Masuk memerlukan kode dari aplikasi authenticator (E4a) */
  two_factor_enabled: boolean;
  created_at: string;
}

export interface AuthDataResponse {
  user: UserProfile;
  csrf_token?: string;
}
