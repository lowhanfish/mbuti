import { getDb, saveDb } from "./db";
import { fail, matchRoute, type MockRoute } from "./router";
import { authRoutes } from "./routes/auth";
import { organisasiRoutes } from "./routes/organisasi";
import { penggunaRoutes } from "./routes/pengguna";
import { pengetahuanRoutes } from "./routes/pengetahuan";
import { roleRoutes } from "./routes/role";
import { unitRoutes } from "./routes/unit";

/** Daftar seluruh route data contoh. Tiap tahap menambahkan berkas di lib/mock/routes/. */
const routes: MockRoute[] = [...authRoutes, ...organisasiRoutes, ...unitRoutes, ...penggunaRoutes, ...roleRoutes, ...pengetahuanRoutes];

const LATENCY_MS = { min: 200, max: 550 };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseBody = (body: BodyInit | null | undefined): unknown => {
  if (body == null) return null;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
};

/**
 * Pengganti fetch untuk mode data contoh. Meniru URL, method, status, dan bentuk respons backend.
 */
export const mockRequest = async (url: string, init: RequestInit) => {
  await wait(LATENCY_MS.min + Math.random() * (LATENCY_MS.max - LATENCY_MS.min));

  const parsed = new URL(url, "http://mock.local");
  const method = (init.method ?? "GET").toUpperCase();
  const found = matchRoute(routes, method, parsed.pathname);

  const response = found
    ? await found.route.handler({
        db: getDb(),
        params: found.params,
        query: parsed.searchParams,
        body: parseBody(init.body),
      })
    : fail(404, `Endpoint contoh belum tersedia: ${method} ${parsed.pathname}`);

  if (method !== "GET") saveDb();

  return {
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    // Salinan agar komponen tidak mengubah data contoh secara langsung
    data: JSON.parse(JSON.stringify(response.body)) as unknown,
  };
};

export { resetDb } from "./db";
export { DEMO_ACCOUNT } from "./seed";
