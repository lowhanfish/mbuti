export type DayKind = "holiday" | "workday";

export type WorkShift = {
  id: string;
  name: string;
  /** "HH:MM"; jam selesai lebih kecil dari jam mulai berarti melewati tengah malam */
  start_time: string;
  end_time: string;
  /** 1 = Senin … 7 = Minggu */
  weekdays: number[];
};

export type ShiftRequest = Omit<WorkShift, "id">;

export type CalendarSettings = {
  timezone: string;
  workdays: number[];
  shifts: WorkShift[];
  can_edit: boolean;
};

export type CalendarDay = {
  id: string;
  date: string;
  /** holiday = libur; workday = hari kerja pengganti */
  kind: DayKind;
  name: string;
  /** Label bebas milik organisasi, mis. "Libur nasional" */
  label: string;
};

export type CalendarDayRequest = Omit<CalendarDay, "id">;

export type ImportResult = { added: number; updated: number; errors: string[] };

export const DAY_KIND_LABEL: Record<DayKind, string> = { holiday: "Libur", workday: "Hari kerja pengganti" };
