import { errorMessageFrom, sendRequest } from "@/lib/transport";
import { useUrlStore } from "@/store/useUrlStore";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^|;\\s*)(${name})=([^;]*)`));
  return match ? decodeURIComponent(match[3]) : null;
}

let refreshPromise: Promise<void> | null = null;

export interface FetchOption extends Omit<RequestInit, "body"> {
  body?: BodyInit | Record<string, unknown> | unknown[] | null;
}

const PUBLIC_PATHS = ["/", "/login"];

/** Permintaan ber-sesi: cookie HttpOnly, token CSRF, dan refresh otomatis sekali saat 401. */
export const fetchData = async <T>(
  url: string,
  option: FetchOption = {},
  shouldRetry = true
): Promise<T> => {
  const { method, headers, body: rawBody, ...otherOption } = option;
  const httpMethod = (method ?? "GET").toUpperCase();
  const isFormData = typeof FormData !== "undefined" && rawBody instanceof FormData;

  const headerObj: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...((headers as Record<string, string>) ?? {}),
  };

  if (typeof window !== "undefined" && ["POST", "PUT", "PATCH", "DELETE"].includes(httpMethod)) {
    const csrfToken = getCookie("csrf_token");
    if (csrfToken && !headerObj["X-CSRF-Token"]) {
      headerObj["X-CSRF-Token"] = csrfToken;
    }
  }

  const body =
    isFormData || typeof rawBody === "string" || rawBody == null
      ? (rawBody as BodyInit | null | undefined)
      : JSON.stringify(rawBody);

  const result = await sendRequest(url, {
    ...otherOption,
    body,
    method: httpMethod,
    headers: headerObj,
  });

  if (result.status === 401 && shouldRetry) {
    if (typeof window !== "undefined" && PUBLIC_PATHS.includes(window.location.pathname)) {
      throw new Error("Sesi belum terautentikasi.");
    }
    await refreshSession();
    return fetchData<T>(url, option, false);
  }

  if (!result.ok) {
    throw new Error(errorMessageFrom(result.data, result.status));
  }
  return result.data as T;
};

const refreshSession = async (): Promise<void> => {
  // Satu permintaan refresh dipakai bersama oleh banyak 401 yang datang bersamaan
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const refreshUrl = useUrlStore.getState().URL.REFRESH;
      const result = await sendRequest(refreshUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!result.ok) {
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.location.replace("/login");
        }
        throw new Error("Sesi login telah berakhir. Silakan masuk kembali.");
      }
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};
