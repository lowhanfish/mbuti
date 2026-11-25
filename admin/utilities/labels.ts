import type { AccessRole } from "@/types/global";

export const ACCESS_ROLE_LABEL: Record<AccessRole, string> = {
  owner: "Pemilik",
  admin: "Admin",
  member: "Anggota",
  viewer: "Pemantau",
};

export const ACCESS_ROLE_DESCRIPTION: Record<AccessRole, string> = {
  owner: "Semua akses, termasuk menghapus organisasi dan mengatur pemilik lain.",
  admin: "Mengatur organisasi, unit, pengguna, role, relasi, dan pengaturan.",
  member: "Membuat tugas dan memberi persetujuan yang ditujukan kepadanya.",
  viewer: "Hanya melihat; tidak dapat mengubah apa pun.",
};

/** Format tanggal Indonesia singkat, mis. 25 Nov 2026. */
export const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
};

/** Inisial nama untuk avatar, mis. "Rina Lestari" → "RL". */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
