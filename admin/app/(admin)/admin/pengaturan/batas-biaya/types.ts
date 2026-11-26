export interface UpdateInterface {
  /** Batas biaya seluruh organisasi per bulan kalender, dalam rupiah */
  monthly_budget: number;
  /** Batas biaya yang terisi otomatis di form Buat tugas */
  default_task_budget: number;
  max_steps_per_task: number;
  /** Batas atas putaran revisi; relasi Periksa tidak bisa melewatinya. 0 = langsung ke manusia */
  max_revisions: number;
}

export interface MonthUsage {
  /** Bulan berjalan, format YYYY-MM */
  month: string;
  used: number;
  /** Bagian dari `used` yang berasal dari uji coba role */
  trial_cost: number;
  /** Sisa anggaran bulan ini, tidak pernah negatif */
  remaining: number;
  task_count: number;
}

export interface ResponseInterface extends UpdateInterface {
  usage: MonthUsage;
  updated_at: string;
}

/** Rentang nilai yang diterima; backend memakai angka yang sama. */
export const LIMITS = {
  monthly_budget: { min: 1_000, max: 100_000_000 },
  task_budget: { min: 500, max: 1_000_000 },
  max_steps_per_task: { min: 1, max: 50 },
  max_revisions: { min: 0, max: 5 },
} as const;

const MONTH_FORMAT = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" });

/** "2026-11" → "November 2026" */
export const monthLabel = (month: string) => {
  const [year, m] = month.split("-").map(Number);
  return MONTH_FORMAT.format(new Date(year, m - 1, 1));
};
