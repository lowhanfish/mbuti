import type { AccessRole } from "@/types/global";

export type MemberStatus = "active" | "invited" | "disabled";

export interface InviteInterface {
  full_name: string;
  email: string;
  access_role: AccessRole;
  unit_id: string | null;
}

export interface UpdateInterface {
  access_role: AccessRole;
  unit_id: string | null;
  status: Exclude<MemberStatus, "invited">;
}

export interface ResponseInterface {
  /** ID keanggotaan (bukan ID akun) */
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  access_role: AccessRole;
  unit_id: string | null;
  unit_name: string | null;
  status: MemberStatus;
  joined_at: string;
  last_active_at: string | null;
  is_self: boolean;
}

export interface ResponseListInterface {
  success: boolean;
  statusCode: number;
  total: number;
  skip: number;
  limit: number;
  data: ResponseInterface[];
  summary: Record<MemberStatus, number>;
}

export const STATUS_LABEL: Record<MemberStatus, string> = {
  active: "Aktif",
  invited: "Diundang",
  disabled: "Nonaktif",
};
