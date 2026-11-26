import { ApiError, sendRequest } from "@/lib/transport";

/** Permintaan tanpa penanganan sesi (login, halaman publik). */
export const callAPI = async <T>(url: string, option: RequestInit = {}): Promise<T> => {
  const { method, headers, body, ...otherOption } = option;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  const result = await sendRequest(url, {
    ...otherOption,
    body,
    method: method ?? "GET",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...((headers as Record<string, string>) ?? {}),
    },
  });

  if (!result.ok) {
    throw new ApiError(result.data, result.status);
  }
  return result.data as T;
};
