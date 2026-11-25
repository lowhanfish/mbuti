import type { MockDatabase } from "./seed";

export interface MockContext {
  db: MockDatabase;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

export interface MockResponse {
  status: number;
  body: unknown;
}

/** Handler boleh asinkron (mis. membaca isi berkas unggahan). */
export type MockHandler = (ctx: MockContext) => MockResponse | Promise<MockResponse>;

export interface MockRoute {
  method: string;
  /** Pola path, mis. "/api/v1/admin/unit/update/:id" */
  path: string;
  handler: MockHandler;
}

const toRegExp = (path: string) =>
  new RegExp(`^${path.replace(/\//g, "\\/").replace(/:(\w+)/g, "(?<$1>[^/]+)")}$`);

export const matchRoute = (routes: MockRoute[], method: string, pathname: string) => {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = toRegExp(route.path).exec(pathname);
    if (match) return { route, params: { ...(match.groups ?? {}) } };
  }
  return null;
};

export const ok = <T>(data: T, message = "Berhasil.", status = 200): MockResponse => ({
  status,
  body: { success: true, statusCode: status, message, data },
});

export const list = <T>(items: T[], query: URLSearchParams): MockResponse => {
  const skip = Number(query.get("skip") ?? 0);
  const limit = Number(query.get("limit") ?? 10);
  return {
    status: 200,
    body: {
      success: true,
      statusCode: 200,
      total: items.length,
      skip,
      limit,
      data: items.slice(skip, skip + limit),
    },
  };
};

export const fail = (status: number, message: string): MockResponse => ({
  status,
  body: { success: false, statusCode: status, message },
});
