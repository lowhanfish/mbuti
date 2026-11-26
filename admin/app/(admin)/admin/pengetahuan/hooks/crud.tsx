"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchData } from "@/lib/api_secure";
import { swallAlert } from "@/lib/show_swall";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import type {
  DetailInterface,
  ResponseInterface,
  ResponseListInterface,
  SearchHit,
  UpdateInterface,
  VersionDetailInterface,
} from "../types";

const BASE = "/api/v1/admin/pengetahuan";
const QUERY_KEY = "pengetahuan";

/** Selama ada dokumen yang antre/diolah, data dimuat ulang tiap 1,5 detik agar progres terlihat. */
const pollWhileProcessing = (busy: boolean) => (busy ? 1500 : false);

export interface DocumentFilters {
  search?: string;
  scope?: string;
  scope_id?: string;
  doc_type?: string;
  status?: string;
  agent_id?: string;
}

export const useResponseListDocument = (filters: DocumentFilters) => {
  const url = useUrlStore((state) => state.URL.APP);
  const params = new URLSearchParams({ skip: "0", limit: "200" });
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  const { data: List, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryFn: () => fetchData<ResponseListInterface>(`${url}${BASE}/read?${params.toString()}`),
    queryKey: [QUERY_KEY, "list", params.toString()],
    placeholderData: (previous) => previous,
    refetchInterval: (query) => {
      const s = query.state.data?.summary;
      return pollWhileProcessing(Boolean(s && s.queued + s.processing > 0));
    },
  });
  return { List, isLoading, isError, error, refetch, isFetching };
};

export const useResponseDetailDocument = (id: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading, isError, error } = useQuery({
    queryFn: () => fetchData<ApiResponse<DetailInterface>>(`${url}${BASE}/${id}`),
    queryKey: [QUERY_KEY, "detail", id],
    enabled: Boolean(id),
    refetchInterval: (query) =>
      pollWhileProcessing(Boolean(query.state.data?.data.versions.some((v) => v.status === "queued" || v.status === "processing"))),
  });
  return { Document: data?.data, isLoading, isError, error };
};

/** Isi satu versi tertentu; dipakai saat membuka rujukan ke versi lama. */
export const useResponseVersion = (id: string, versionId: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading, isError, error } = useQuery({
    queryFn: () => fetchData<ApiResponse<VersionDetailInterface>>(`${url}${BASE}/${id}/versions/${versionId}`),
    queryKey: [QUERY_KEY, "version", id, versionId],
    enabled: Boolean(id && versionId),
    refetchInterval: (query) => {
      const s = query.state.data?.data.status;
      return pollWhileProcessing(s === "queued" || s === "processing");
    },
  });
  return { Version: data?.data, isLoading, isError, error };
};

export const useSearchDocuments = (q: string, agentId: string = "") => {
  const url = useUrlStore((state) => state.URL.APP);
  const params = new URLSearchParams({ q, agent_id: agentId });
  const { data, isFetching } = useQuery({
    queryFn: () => fetchData<ApiResponse<SearchHit[]>>(`${url}${BASE}/search?${params.toString()}`),
    queryKey: [QUERY_KEY, "search", q, agentId],
    enabled: q.trim().length >= 3,
  });
  return { Hits: data?.data ?? [], isFetching };
};

const useInvalidateDocuments = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: ["role"] });
  };
};

export const useUploadDocument = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (body: FormData) =>
      fetchData<ApiResponse<ResponseInterface>>(`${url}${BASE}/create`, { method: "POST", body }),
    onSuccess: () => {
      invalidate();
      swallAlert("dokumen diterima dan sedang diolah", "success");
    },
    onError: (err: Error) => swallAlert(`gagal diunggah: ${err.message}`, "error"),
  });
};

export const useUploadVersion = (id: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (body: FormData) =>
      fetchData<ApiResponse<DetailInterface>>(`${url}${BASE}/${id}/versions`, { method: "POST", body }),
    onSuccess: () => {
      invalidate();
      swallAlert("versi baru diterima dan sedang diolah", "success");
    },
    onError: (err: Error) => swallAlert(`gagal diunggah: ${err.message}`, "error"),
  });
};

export const useActivateVersion = (id: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (versionId: string) =>
      fetchData<ApiResponse<DetailInterface>>(`${url}${BASE}/${id}/versions/${versionId}/activate`, { method: "PUT" }),
    onSuccess: () => {
      invalidate();
      swallAlert("versi aktif diganti", "success");
    },
    onError: (err: Error) => swallAlert(`gagal diganti: ${err.message}`, "error"),
  });
};

export const useUpdateDocument = (id: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (body: UpdateInterface) =>
      fetchData<ApiResponse<DetailInterface>>(`${url}${BASE}/update/${id}`, { method: "PUT", body: { ...body } }),
    onSuccess: () => {
      invalidate();
      swallAlert("dokumen diperbarui", "success");
    },
    onError: (err: Error) => swallAlert(`gagal disimpan: ${err.message}`, "error"),
  });
};

export const useDeleteDocument = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (id: string) => fetchData(`${url}${BASE}/delete/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      swallAlert("dokumen dihapus", "success");
    },
    onError: (err: Error) => swallAlert(`gagal dihapus: ${err.message}`, "error"),
  });
};
