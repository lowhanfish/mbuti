/**
 * Tema tampilan: "dark" (bawaan) atau "light". Disimpan di localStorage per peramban.
 * THEME_SCRIPT dijalankan di <head> sebelum halaman tampil agar tidak berkedip.
 */
export type Theme = "dark" | "light";

export const THEME_KEY = "mbuti-theme";
export const DEFAULT_THEME: Theme = "dark";

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");document.documentElement.dataset.theme=t==="light"?"light":"${DEFAULT_THEME}"}catch(e){document.documentElement.dataset.theme="${DEFAULT_THEME}"}})()`;

export const readTheme = (): Theme =>
  typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : DEFAULT_THEME;

export const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Penyimpanan bisa ditolak (mode privat); tema tetap berlaku sampai halaman ditutup
  }
  window.dispatchEvent(new Event("mbuti-theme"));
};

/** Berlangganan perubahan tema (tombol di tab mana pun pada halaman ini). */
export const subscribeTheme = (onChange: () => void) => {
  window.addEventListener("mbuti-theme", onChange);
  return () => window.removeEventListener("mbuti-theme", onChange);
};
