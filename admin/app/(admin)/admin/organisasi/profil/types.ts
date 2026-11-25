export type OrganizationSector = "pemerintahan" | "pendidikan" | "kesehatan" | "usaha" | "nirlaba" | "lainnya";

export interface UpdateInterface {
  name: string;
  description: string;
  sector: OrganizationSector;
  timezone: string;
  email: string;
  phone: string;
  address: string;
  website: string;
}

export interface ResponseInterface extends UpdateInterface {
  id: string;
  slug: string;
  created_at: string;
  updated_at: string;
  stats: {
    unit_count: number;
    member_count: number;
    agent_count: number;
  };
}

export const SECTOR_OPTIONS: Array<{ value: OrganizationSector; label: string }> = [
  { value: "pemerintahan", label: "Pemerintahan" },
  { value: "pendidikan", label: "Pendidikan" },
  { value: "kesehatan", label: "Kesehatan" },
  { value: "usaha", label: "Usaha / Perusahaan" },
  { value: "nirlaba", label: "Organisasi nirlaba" },
  { value: "lainnya", label: "Lainnya" },
];

export const TIMEZONE_OPTIONS = [
  { value: "Asia/Jakarta", label: "WIB — Asia/Jakarta" },
  { value: "Asia/Makassar", label: "WITA — Asia/Makassar" },
  { value: "Asia/Jayapura", label: "WIT — Asia/Jayapura" },
];
