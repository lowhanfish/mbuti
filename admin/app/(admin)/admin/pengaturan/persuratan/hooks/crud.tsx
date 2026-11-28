"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchData } from "@/lib/api_secure";
import { swallAlert } from "@/lib/show_swall";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import type { LetterSettings, RegisterRequest } from "../types";

const BASE = "/api/v1/admin/pengaturan/persuratan";
const QUERY_KEY = ["pengaturan", "persuratan"];

export const useResponseLetterSettings = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryFn: () => fetchData<ApiResponse<LetterSettings>>(`${url}${BASE}`),
    queryKey: QUERY_KEY,
  });
  return { Settings: data?.data, isLoading, isError, error, refetch };
};

const useLetterMutation = <V,>(request: (url: string, value: V) => Promise<unknown>, success: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: V) => request(`${url}${BASE}`, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["tugas", "berkas"] });
      swallAlert(success, "success");
    },
    onError: (err: Error) => swallAlert(`gagal: ${err.message}`, "error"),
  });
};

const upload = (url: string, file: File) => {
  const body = new FormData();
  body.set("file", file);
  return fetchData(url, { method: "POST", body });
};

export const useCheckFormat = () => useLetterMutation((url, id: string) => fetchData(`${url}/format/${id}`, { method: "PUT", body: { checked: true } }), "format ditandai sudah diperiksa");
export const useResetFormat = () => useLetterMutation((url, id: string) => fetchData(`${url}/format/${id}`, { method: "DELETE" }), "catatan format dihapus");
export const useDeleteCorrection = () =>
  useLetterMutation((url, v: { formatId: string; id: string }) => fetchData(`${url}/format/${v.formatId}/koreksi/${v.id}`, { method: "DELETE" }), "koreksi dihapus");
export const useUploadLetterhead = () => useLetterMutation((url, file: File) => upload(`${url}/kop`, file), "kop tersimpan");
export const useDeleteLetterhead = () => useLetterMutation((url, id: string) => fetchData(`${url}/kop/${id}`, { method: "DELETE" }), "kop dihapus");
export const useSaveRegister = () =>
  useLetterMutation((url, v: { id: string; body: RegisterRequest }) => fetchData(`${url}/register/${v.id}`, { method: "PUT", body: { ...v.body } }), "register tersimpan");
export const useUploadSample = () => useLetterMutation((url, file: File) => upload(`${url}/contoh`, file), "contoh surat tersimpan");
export const useDeleteSample = () => useLetterMutation((url, id: string) => fetchData(`${url}/contoh/${id}`, { method: "DELETE" }), "contoh dihapus");
