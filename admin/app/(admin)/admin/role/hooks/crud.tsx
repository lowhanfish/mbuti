"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchData } from "@/lib/api_secure";
import { swallAlert } from "@/lib/show_swall";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import type {
  CreateInterface,
  ResponseInterface,
  ResponseListInterface,
  TrialRequest,
  TrialResult,
  UpdateInterface,
} from "../types";

const BASE = "/api/v1/admin/role";
const QUERY_KEY = "role";

export const useResponseListRole = (filters: { search: string; unit_id: string; status: string }) => {
  const url = useUrlStore((state) => state.URL.APP);
  const params = new URLSearchParams({ skip: "0", limit: "200", ...filters });
  const { data: List, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryFn: () => fetchData<ResponseListInterface>(`${url}${BASE}/read?${params.toString()}`),
    queryKey: [QUERY_KEY, "list", filters.search, filters.unit_id, filters.status],
    placeholderData: (previous) => previous,
  });
  return { List, isLoading, isError, error, refetch, isFetching };
};

export const useResponseDetailRole = (id: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryFn: () => fetchData<ApiResponse<ResponseInterface>>(`${url}${BASE}/${id}`),
    queryKey: [QUERY_KEY, "detail", id],
    enabled: Boolean(id),
  });
  return { Role: data?.data, isLoading, isError, error, refetch };
};

const useInvalidateRoles = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: ["organisasi-unit"] });
    queryClient.invalidateQueries({ queryKey: ["organisasi-profil"] });
  };
};

export const useCreateRole = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: (body: CreateInterface) =>
      fetchData<ApiResponse<ResponseInterface>>(`${url}${BASE}/create`, { method: "POST", body: { ...body } }),
    onSuccess: () => {
      invalidate();
      swallAlert("role dibuat", "success");
    },
    onError: (err: Error) => swallAlert(`gagal dibuat: ${err.message}`, "error"),
  });
};

/** Simpan sebagian kolom role (tiap tab menyimpan bagiannya sendiri). */
export const useUpdateRole = (id: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: (body: Partial<UpdateInterface>) =>
      fetchData<ApiResponse<ResponseInterface>>(`${url}${BASE}/update/${id}`, { method: "PUT", body: { ...body } }),
    onSuccess: () => {
      invalidate();
      swallAlert("role tersimpan", "success");
    },
    onError: (err: Error) => swallAlert(`gagal disimpan: ${err.message}`, "error"),
  });
};

export const useDeleteRole = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: (id: string) => fetchData(`${url}${BASE}/delete/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      swallAlert("role dihapus", "success");
    },
    onError: (err: Error) => swallAlert(`gagal dihapus: ${err.message}`, "error"),
  });
};

export const useTrialRole = (id: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TrialRequest) =>
      fetchData<ApiResponse<TrialResult>>(`${url}${BASE}/${id}/trial`, { method: "POST", body: { ...body } }),
    // Uji coba memakai anggaran bulanan
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pengaturan", "batas-biaya"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => swallAlert(`uji coba gagal: ${err.message}`, "error"),
  });
};
