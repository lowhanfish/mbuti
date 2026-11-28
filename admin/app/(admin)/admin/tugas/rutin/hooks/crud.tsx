"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchData } from "@/lib/api_secure";
import { swallAlert } from "@/lib/show_swall";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import type { CreateScheduleRequest, ParseResponse, PreviewResponse, ScheduleDetail, ScheduleItem, ScheduleRule } from "../types";

const BASE = "/api/v1/admin/tugas-rutin";
const QUERY_KEY = "tugas-rutin";

export const useResponseListSchedule = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryFn: () => fetchData<ApiResponse<ScheduleItem[]>>(`${url}${BASE}`),
    queryKey: [QUERY_KEY, "list"],
    refetchInterval: 30_000,
  });
  return { List: data?.data ?? [], isLoading, isError, error, refetch };
};

export const useResponseDetailSchedule = (id: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading, isError, error } = useQuery({
    queryFn: () => fetchData<ApiResponse<ScheduleDetail>>(`${url}${BASE}/${id}`),
    queryKey: [QUERY_KEY, "detail", id],
    enabled: Boolean(id),
    refetchInterval: 5000,
  });
  return { Schedule: data?.data, isLoading, isError, error };
};

/** Pratinjau putaran berikutnya; dihitung ulang setiap aturan berubah. */
export const useResponsePreview = (rule: ScheduleRule, agentId: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, error, isFetching } = useQuery({
    queryFn: () => fetchData<ApiResponse<PreviewResponse>>(`${url}${BASE}/pratinjau`, { method: "POST", body: { rule, entry_agent_id: agentId } }),
    queryKey: [QUERY_KEY, "preview", rule, agentId],
    placeholderData: (previous) => previous,
    retry: false,
  });
  return { Preview: data?.data, error: error instanceof Error ? error.message : null, isFetching };
};

const useInvalidate = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: ["tugas"] });
  };
};

export const useParseSchedule = () => {
  const url = useUrlStore((state) => state.URL.APP);
  return useMutation({
    mutationFn: (text: string) => fetchData<ApiResponse<ParseResponse>>(`${url}${BASE}/pahami`, { method: "POST", body: { text } }),
    onError: (err: Error) => swallAlert(`jadwal belum dipahami: ${err.message}`, "error"),
  });
};

export const useSaveSchedule = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: CreateScheduleRequest }) =>
      fetchData<ApiResponse<ScheduleItem>>(id ? `${url}${BASE}/${id}` : `${url}${BASE}`, { method: id ? "PUT" : "POST", body: { ...body } }),
    onSuccess: () => {
      invalidate();
      swallAlert("tugas rutin tersimpan", "success");
    },
    onError: (err: Error) => swallAlert(`gagal disimpan: ${err.message}`, "error"),
  });
};

export const useScheduleAction = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "jeda" | "lanjutkan" | "jalankan" | `susulan/${string}` }) =>
      fetchData<ApiResponse<ScheduleDetail> & { message: string }>(`${url}${BASE}/${id}/${action}`, { method: "POST" }),
    onSuccess: (res) => {
      invalidate();
      swallAlert(res.message.toLowerCase().replace(/\.$/, ""), "success");
    },
    onError: (err: Error) => swallAlert(`gagal: ${err.message}`, "error"),
  });
};

export const useDeleteSchedule = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => fetchData(`${url}${BASE}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      swallAlert("tugas rutin dihapus", "success");
    },
    onError: (err: Error) => swallAlert(`gagal dihapus: ${err.message}`, "error"),
  });
};
