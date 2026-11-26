import type { ApiListResponse } from "@/types/global";

export interface ResponseInterface {
  id: string;
  /** Kode tindakan, mis. "role.buat" */
  action: string;
  label: string;
  /** Nama benda yang dikenai; kosong bila tidak ada */
  target: string;
  actor_name: string;
  actor_email: string;
  ip: string;
  /** Kode permintaan, untuk dicocokkan dengan log server */
  request_id: string;
  created_at: string;
}

export type ResponseListInterface = ApiListResponse<ResponseInterface>;

/** Kelompok tindakan: bagian kode sebelum titik. */
export const GROUPS: Array<{ value: string; label: string }> = [
  { value: "auth", label: "Masuk dan keluar" },
  { value: "tugas", label: "Tugas" },
  { value: "persetujuan", label: "Persetujuan" },
  { value: "role", label: "Role" },
  { value: "relasi", label: "Relasi" },
  { value: "dokumen", label: "Dokumen" },
  { value: "anggota", label: "Anggota" },
  { value: "unit", label: "Unit" },
  { value: "organisasi", label: "Organisasi" },
  { value: "pengaturan", label: "Pengaturan" },
];

/** Warna penanda: yang menghapus atau gagal lebih menonjol. */
export const actionTone = (action: string): "danger" | "success" | "info" | "neutral" => {
  if (/\.(hapus|keluarkan|gagal|hentikan)$/.test(action)) return "danger";
  if (/\.(buat|undang|unggah)$/.test(action)) return "success";
  if (action.startsWith("auth.")) return "neutral";
  return "info";
};
