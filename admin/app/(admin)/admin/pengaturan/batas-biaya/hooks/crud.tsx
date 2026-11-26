"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchData } from "@/lib/api_secure";
import { swallAlert } from "@/lib/show_swall";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import type { ResponseInterface, UpdateInterface } from "../types";

const BASE = "/api/v1/admin/pengaturan/batas-biaya";
const QUERY_KEY = ["pengaturan", "batas-biaya"];

export const useResponseBudgetSettings = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryFn: () => fetchData<ApiResponse<ResponseInterface>>(`${url}${BASE}`),
    queryKey: QUERY_KEY,
    // Pemakaian bulan ini berubah selama tugas berjalan
    refetchOnMount: "always",
  });
  return { Budget: data?.data, isLoading, isError, error, refetch };
};

export const useUpdateBudgetSettings = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateInterface) =>
      fetchData<ApiResponse<ResponseInterface>>(`${url}${BASE}/update`, { method: "PUT", body: { ...body } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      // Batas revisi tampil di peta relasi, pemakaian tampil di dashboard
      queryClient.invalidateQueries({ queryKey: ["relasi"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      swallAlert("batas biaya tersimpan", "success");
    },
    onError: (err: Error) => swallAlert(`gagal disimpan: ${err.message}`, "error"),
  });
};
