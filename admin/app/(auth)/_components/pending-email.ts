/**
 * Email yang baru didaftarkan, untuk halaman "Periksa email Anda".
 * Disimpan di sessionStorage, bukan di alamat halaman, agar email tidak ikut tercatat di riwayat atau log.
 */
const KEY = "mbuti-registered-email";

export const rememberEmail = (email: string) => {
  try {
    window.sessionStorage.setItem(KEY, email);
  } catch {
    // Penyimpanan bisa ditolak (mode privat); halaman berikutnya meminta email bila perlu
  }
};

export const recallEmail = () => {
  try {
    return window.sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};
