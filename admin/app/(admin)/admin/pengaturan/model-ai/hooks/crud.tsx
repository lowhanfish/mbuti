"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchData } from "@/lib/api_secure";
import { swallAlert } from "@/lib/show_swall";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import type { ResponseInterface, UpdateInterface } from "../types";

const BASE = "/api/v1/admin/pengaturan/model-ai";
const QUERY_KEY = ["pengaturan", "model-ai"];

export const useResponseModelSettings = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryFn: () => fetchData<ApiResponse<ResponseInterface>>(`${url}${BASE}`),
    queryKey: QUERY_KEY,
  });
  return { Settings: data?.data, isLoading, isError, error, refetch };
};

export const useUpdateModelSettings = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateInterface) =>
      fetchData<ApiResponse<ResponseInterface>>(`${url}${BASE}/update`, { method: "PUT", body: { ...body } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      swallAlert("model AI tersimpan", "success");
    },
    onError: (err: Error) => swallAlert(`gagal disimpan: ${err.message}`, "error"),
  });
};
