/** Urutan rujukan format surat (E3a): aturan, contoh Word, internet, lalu bentuk umum */
export type LetterSourceKind = "rule" | "sample" | "internet" | "general";

export type LetterSource = {
  kind: LetterSourceKind;
  title: string;
  /** Letak di rujukan, mis. "hlm. 14"; boleh kosong */
  detail: string;
  url: string | null;
  document_id: string | null;
};

export type FormatCorrection = { id: string; text: string; author_name: string; created_at: string };

/** Catatan format satu jenis naskah, disusun saat pertama kali diminta */
export type LetterFormat = {
  id: string;
  name: string;
  paper: string;
  /** Sentimeter */
  margins: { top: number; right: number; bottom: number; left: number };
  font: string;
  sections: string[];
  sources: LetterSource[];
  checked: boolean;
  corrections: FormatCorrection[];
  updated_at: string;
};

export type Letterhead = { id: string; unit_id: string | null; unit_name: string | null; image_url: string; created_at: string };

/** task_id null bila tugasnya sudah dihapus */
export type IssuedNumber = { number: string; title: string; task_id: string | null; issued_at: string };

export type NumberRegister = {
  id: string;
  name: string;
  /** Boleh memuat [urut], [bulan], dan [tahun]; [urut] wajib */
  pattern: string;
  next_number: number;
  /** Contoh nomor berikutnya menurut pola */
  preview: string;
  issued: IssuedNumber[];
};

export type RegisterRequest = { pattern: string; next_number: number };

export type LetterSample = { id: string; file_name: string; size_bytes: number; uploaded_by_name: string | null; created_at: string };

export type LetterSettings = {
  formats: LetterFormat[];
  letterheads: Letterhead[];
  registers: NumberRegister[];
  samples: LetterSample[];
  can_edit: boolean;
};

export const SOURCE_KIND: Record<LetterSourceKind, { label: string; variant: "success" | "info" | "warning" | "neutral" }> = {
  rule: { label: "Aturan", variant: "success" },
  sample: { label: "Contoh Word", variant: "info" },
  internet: { label: "Internet", variant: "warning" },
  general: { label: "Bentuk umum", variant: "neutral" },
};
