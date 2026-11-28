"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchData } from "@/lib/api_secure";
import { swallAlert } from "@/lib/show_swall";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import { isActiveRun, type FlowDetail, type FlowListResponse, type LearnRequest, type RunDetail } from "../types";

const QUERY_KEY = "alur";
const LIVE_MS = 2000;

const useApi = () => {
  const url = useUrlStore((state) => state.URL.APP);
  return `${url}/api/v1/admin`;
};

export const useResponseListFlow = (roleId: string) => {
  const api = useApi();
  const { data, isLoading, isError, error } = useQuery({
    queryFn: () => fetchData<ApiResponse<FlowListResponse>>(`${api}/role/${roleId}/alur`),
    queryKey: [QUERY_KEY, "list", roleId],
    enabled: Boolean(roleId),
    refetchInterval: (query) =>
      query.state.data?.data.flows.some((f) => f.status === "learning" || (f.last_run && isActiveRun(f.last_run.status))) ? LIVE_MS : false,
  });
  return { Flows: data?.data, isLoading, isError, error };
};

export const useResponseDetailFlow = (id: string) => {
  const api = useApi();
  const { data, isLoading, isError, error } = useQuery({
    queryFn: () => fetchData<ApiResponse<FlowDetail>>(`${api}/alur/${id}`),
    queryKey: [QUERY_KEY, "detail", id],
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.data.active_run_id ? LIVE_MS : false),
  });
  return { Flow: data?.data, isLoading, isError, error };
};

export const useResponseDetailRun = (id: string) => {
  const api = useApi();
  const { data, isLoading, isError, error } = useQuery({
    queryFn: () => fetchData<ApiResponse<RunDetail>>(`${api}/alur-jalan/${id}`),
    queryKey: [QUERY_KEY, "run", id],
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data && isActiveRun(query.state.data.data.status) ? LIVE_MS : false),
  });
  return { Run: data?.data, isLoading, isError, error };
};

const useAction = <TBody, TData = null>(request: (api: string, body: TBody) => [string, Record<string, unknown>?, string?], done: string) => {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => {
      const [url, payload, method] = request(api, body);
      return fetchData<ApiResponse<TData>>(url, { method: method ?? "POST", body: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      if (done) swallAlert(done, "success");
    },
    onError: (err: Error) => swallAlert(`gagal: ${err.message}`, "error"),
  });
};

export const useLearnFlow = (roleId: string) =>
  useAction<LearnRequest, FlowDetail>((api, body) => [`${api}/role/${roleId}/alur`, { ...body }], "");

export const useRelearnFlow = (id: string) =>
  useAction<Omit<LearnRequest, "account_id">, FlowDetail>((api, body) => [`${api}/alur/${id}/pelajari`, { ...body }], "");

export const useApproveFlow = (id: string) =>
  useAction<number, FlowDetail>((api, version) => [`${api}/alur/${id}/setujui`, { version }], "alur disetujui");

export const useRunFlow = (id: string) =>
  useAction<Record<string, string>, RunDetail>((api, inputs) => [`${api}/alur/${id}/jalankan`, { inputs }], "");

export const useTrustFlow = (id: string) =>
  useAction<{ enabled: boolean; code: string }, FlowDetail>((api, body) => [`${api}/alur/${id}/tanpa-persetujuan`, body], "pengaturan persetujuan tersimpan");

export const useDeleteFlow = (id: string) => useAction<void>((api) => [`${api}/alur/${id}/hapus`], "alur dihapus");

export const useDecideRun = (id: string) =>
  useAction<"approved" | "rejected", RunDetail>((api, decision) => [`${api}/alur-jalan/${id}/putuskan`, { decision }], "");

export const useSubmitOtp = (id: string) =>
  useAction<string, RunDetail>((api, code) => [`${api}/alur-jalan/${id}/otp`, { code }], "");

export const useStopRun = (id: string) => useAction<void, RunDetail>((api) => [`${api}/alur-jalan/${id}/hentikan`], "putaran dihentikan");
