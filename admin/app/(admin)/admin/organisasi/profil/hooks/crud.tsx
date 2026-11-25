"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchData } from "@/lib/api_secure";
import { swallAlert } from "@/lib/show_swall";
import { useAuthStore } from "@/store/useAuthStore";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import type { ResponseInterface, UpdateInterface } from "../types";

const QUERY_KEY = ["organisasi-profil"];

export const useResponseProfile = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryFn: () => fetchData<ApiResponse<ResponseInterface>>(`${url}/api/v1/admin/organisasi/profil`),
    queryKey: QUERY_KEY,
  });
  return { Profile: data?.data, isLoading, isError, error, refetch };
};

export const useUpdateProfile = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const queryClient = useQueryClient();
  const refreshUser = useAuthStore((state) => state.refreshUser);

  return useMutation({
    mutationFn: (body: UpdateInterface) =>
      fetchData<ApiResponse<ResponseInterface>>(`${url}/api/v1/admin/organisasi/profil/update`, {
        method: "PUT",
        body: { ...body },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      // Nama organisasi juga tampil di sidebar, jadi data sesi dimuat ulang
      refreshUser();
      swallAlert("profil organisasi tersimpan", "success");
    },
    onError: (err: Error) => {
      swallAlert(`gagal disimpan: ${err.message}`, "error");
    },
  });
};
