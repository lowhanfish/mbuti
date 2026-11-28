import type { AccessRole } from "@/types/global";
import type { OrganizationSector } from "@/app/(admin)/admin/organisasi/profil/types";

/** `approval`: organisasi baru menunggu persetujuan pengelola setelah email diverifikasi. */
export type RegistrationMode = "closed" | "approval" | "open";

export interface AuthOptionsResponse {
  registration: RegistrationMode;
  password_min_length: number;
}

export interface RegisterInterface {
  full_name: string;
  email: string;
  password: string;
  organization_name: string;
  sector: OrganizationSector;
  accept_terms: boolean;
}

export interface TokenInterface {
  token: string;
}

export interface EmailInterface {
  email: string;
}

export interface ResetPasswordInterface {
  token: string;
  password: string;
}

export interface InvitePreviewResponse {
  email: string;
  full_name: string;
  organization_name: string;
  inviter_name: string;
  access_role: AccessRole;
  expires_at: string;
}

export interface AcceptInviteInterface {
  token: string;
  full_name: string;
  password: string;
  /** Hanya bila akun sudah memakai verifikasi dua langkah (E4a) */
  code?: string;
}

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
