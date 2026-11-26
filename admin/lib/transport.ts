import { mockRequest } from "@/lib/mock";

/** Hasil mentah satu permintaan HTTP, sama untuk backend sungguhan dan data contoh. */
export interface TransportResult {
  status: number;
  ok: boolean;
  data: unknown;
}

/** Data contoh hanya bila diminta; tanpa pengaturan, frontend memakai backend sungguhan. */
export const isMockMode = () => process.env.NEXT_PUBLIC_DATA_SOURCE === "mock";

/**
 * Satu-satunya titik keluar permintaan HTTP.
 * Mode `mock` dialihkan ke lib/mock sehingga halaman dan hooks tidak tahu datanya contoh.
 */
export const sendRequest = async (url: string, init: RequestInit): Promise<TransportResult> => {
  if (isMockMode()) {
    return mockRequest(url, init);
  }

  const res = await requestServer(url, init);
  const data: unknown = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
};

/** `fetch` ke backend beserta cookie sesi; kegagalan jaringan dijelaskan dalam bahasa pengguna. */
export const requestServer = async (url: string, init: RequestInit): Promise<Response> => {
  try {
    return await fetch(url, { ...init, credentials: "include" });
  } catch (error) {
    // Pembatalan permintaan bukan gangguan jaringan
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Tidak dapat menghubungi server. Periksa koneksi dan pastikan backend menyala.");
  }
};

/** Ambil pesan galat yang bisa dibaca manusia dari body respons. */
export const errorMessageFrom = (data: unknown, status: number): string => {
  if (data && typeof data === "object") {
    const body = data as { message?: unknown; detail?: unknown; errors?: unknown };
    if (typeof body.message === "string" && body.message) return body.message;
    if (typeof body.detail === "string" && body.detail) return body.detail;
    if (Array.isArray(body.errors) && body.errors.length > 0) {
      const first = body.errors[0] as { message?: unknown };
      if (typeof first?.message === "string") return first.message;
    }
  }
  return `Terjadi kesalahan HTTP dengan status: ${status}`;
};
