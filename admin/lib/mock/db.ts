import { createSeed, MOCK_DB_VERSION, type MockDatabase } from "./seed";

const STORAGE_KEY = "mbuti-mock-db";

let memory: MockDatabase | null = null;

const readStorage = (): MockDatabase | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MockDatabase;
    return parsed?.version === MOCK_DB_VERSION ? parsed : null;
  } catch {
    return null;
  }
};

/** Data contoh di memori, disalin ke localStorage agar bertahan setelah halaman dimuat ulang. */
export const getDb = (): MockDatabase => {
  if (memory) return memory;
  memory = (typeof window !== "undefined" ? readStorage() : null) ?? createSeed();
  return memory;
};

export const saveDb = () => {
  if (!memory || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Penyimpanan peramban bisa ditolak (mode privat); data tetap ada di memori
  }
};

/** Kembalikan data contoh ke keadaan awal. */
export const resetDb = () => {
  memory = createSeed();
  saveDb();
};
