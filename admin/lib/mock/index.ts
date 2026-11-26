import { auditTarget, recordAudit } from "./audit";
import { getDb, saveDb } from "./db";
import { advanceTasks } from "./engine";
import { promoteVersions } from "./knowledge";
import { fail, matchRoute, type MockRoute } from "./router";
import { auditRoutes } from "./routes/audit";
import { authRoutes } from "./routes/auth";
import { dashboardRoutes } from "./routes/dashboard";
import { kantorRoutes } from "./routes/kantor";
import { organisasiRoutes } from "./routes/organisasi";
import { pengaturanRoutes } from "./routes/pengaturan";
import { penggunaRoutes } from "./routes/pengguna";
import { pengetahuanRoutes } from "./routes/pengetahuan";
import { relasiRoutes } from "./routes/relasi";
import { roleRoutes } from "./routes/role";
import { tugasRoutes } from "./routes/tugas";
import { unitRoutes } from "./routes/unit";

/** Daftar seluruh route data contoh. Tiap tahap menambahkan berkas di lib/mock/routes/. */
const routes: MockRoute[] = [...authRoutes, ...organisasiRoutes, ...unitRoutes, ...penggunaRoutes, ...roleRoutes, ...pengetahuanRoutes, ...relasiRoutes, ...tugasRoutes, ...kantorRoutes, ...pengaturanRoutes, ...dashboardRoutes, ...auditRoutes];

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

  // Majukan simulasi eksekusi tugas sampai waktu sekarang sebelum menjawab
  const db = getDb();
  const promoted = promoteVersions(db);
  const advanced = advanceTasks(db, Date.now()) || promoted;

  const body = parseBody(init.body);
  // Pelaku dan sasaran dibaca sebelum tindakan: keluar menghapus sesi, hapus menghilangkan nama
  const actorBefore = db.session?.user_id ?? "";
  const target = method === "GET" ? "" : auditTarget(db, parsed.pathname, body);
  const response = found
    ? await found.route.handler({
        db,
        params: found.params,
        query: parsed.searchParams,
        body,
      })
    : fail(404, `Endpoint contoh belum tersedia: ${method} ${parsed.pathname}`);

  if (method !== "GET" && response.status < 300) {
    recordAudit(db, method, parsed.pathname, parsed.pathname.endsWith("/auth/login") ? "" : target, actorBefore || (db.session?.user_id ?? ""));
  }

  if (method !== "GET" || advanced) saveDb();

  return {
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    // Salinan agar komponen tidak mengubah data contoh secara langsung
    data: JSON.parse(JSON.stringify(response.body)) as unknown,
  };
};

export { resetDb } from "./db";
export { DEMO_ACCOUNT } from "./seed";
