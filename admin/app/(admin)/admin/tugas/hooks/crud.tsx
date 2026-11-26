"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchData } from "@/lib/api_secure";
import { swallAlert } from "@/lib/show_swall";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import { toSkip } from "@/utilities/pagination";
import {
  isActiveTask,
  type ApprovalInterface,
  type ApprovalListInterface,
  type CreateInterface,
  type DecideInterface,
  type DetailInterface,
  type ResponseInterface,
  type ResponseListInterface,
} from "../types";

const BASE = "/api/v1/admin/tugas";
const QUERY_KEY = "tugas";
/** Selama ada tugas berjalan, data dimuat ulang tiap 1,5 detik agar linimasa terlihat hidup. */
const LIVE_MS = 1500;

export const useResponseListTask = (filters: { search?: string; status?: string; agent_id?: string }) => {
  const url = useUrlStore((state) => state.URL.APP);
  const params = new URLSearchParams({ skip: "0", limit: "100" });
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  const { data: List, isLoading, isError, error, refetch } = useQuery({
    queryFn: () => fetchData<ResponseListInterface>(`${url}${BASE}/read?${params.toString()}`),
    queryKey: [QUERY_KEY, "list", params.toString()],
    placeholderData: (previous) => previous,
    refetchInterval: (query) => {
      const s = query.state.data?.summary;
      return s && s.queued + s.running > 0 ? LIVE_MS : false;
    },
  });
  return { List, isLoading, isError, error, refetch };
};

export const useResponseDetailTask = (id: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading, isError, error } = useQuery({
    queryFn: () => fetchData<ApiResponse<DetailInterface>>(`${url}${BASE}/${id}`),
    queryKey: [QUERY_KEY, "detail", id],
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data && isActiveTask(query.state.data.data.status) ? LIVE_MS : false),
  });
  return { Task: data?.data, isLoading, isError, error };
};

const useInvalidateTasks = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: ["persetujuan"] });
    queryClient.invalidateQueries({ queryKey: ["role"] });
    queryClient.invalidateQueries({ queryKey: ["pengaturan", "batas-biaya"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
};

export const useCreateTask = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (body: CreateInterface) =>
      fetchData<ApiResponse<ResponseInterface>>(`${url}${BASE}/create`, { method: "POST", body: { ...body } }),
    onSuccess: () => {
      invalidate();
      swallAlert("tugas dibuat dan mulai dikerjakan", "success");
    },
    onError: (err: Error) => swallAlert(`gagal dibuat: ${err.message}`, "error"),
  });
};

export const useCancelTask = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (id: string) => fetchData(`${url}${BASE}/${id}/cancel`, { method: "POST" }),
    onSuccess: () => {
      invalidate();
      swallAlert("tugas dihentikan", "success");
    },
    onError: (err: Error) => swallAlert(`gagal dihentikan: ${err.message}`, "error"),
  });
};

export const useResponseApprovals = (status: "pending" | "decided", page = 1, limit = 200) => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryFn: () =>
      fetchData<ApprovalListInterface>(`${url}/api/v1/admin/persetujuan/read?status=${status}&skip=${toSkip(page, limit)}&limit=${limit}`),
    queryKey: ["persetujuan", status, page, limit],
    // Halaman lama tetap tampil saat berpindah halaman, tetapi tidak saat berpindah tab
    placeholderData: (previous, query) => (query?.queryKey[1] === status ? previous : undefined),
    refetchInterval: 5000,
  });
  return { List: data?.data ?? [], total: data?.total ?? 0, pendingCount: data?.pending_count ?? 0, isLoading, isError, error, refetch };
};

export const useDecideApproval = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DecideInterface }) =>
      fetchData<ApiResponse<ApprovalInterface>>(`${url}/api/v1/admin/persetujuan/${id}/decide`, { method: "POST", body: { ...body } }),
    onSuccess: () => {
      invalidate();
      swallAlert("keputusan tersimpan", "success");
    },
    onError: (err: Error) => swallAlert(`gagal disimpan: ${err.message}`, "error"),
  });
};
