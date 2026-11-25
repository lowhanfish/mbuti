"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchData } from "@/lib/api_secure";
import { swallAlert } from "@/lib/show_swall";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import { toSkip } from "@/utilities/pagination";
import type { InviteInterface, ResponseInterface, ResponseListInterface, UpdateInterface } from "../types";

const BASE = "/api/v1/admin/pengguna";
const QUERY_KEY = "organisasi-pengguna";

export const useResponseListMember = (
  page: number,
  limit: number,
  filters: { search: string; access_role: string; status: string }
) => {
  const url = useUrlStore((state) => state.URL.APP);
  const params = new URLSearchParams({
    skip: String(toSkip(page, limit)),
    limit: String(limit),
    search: filters.search,
    access_role: filters.access_role,
    status: filters.status,
  });
  const { data: List, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryFn: () => fetchData<ResponseListInterface>(`${url}${BASE}/read?${params.toString()}`),
    queryKey: [QUERY_KEY, page, limit, filters.search, filters.access_role, filters.status],
    placeholderData: (previous) => previous,
  });
  return { List, isLoading, isError, error, refetch, isFetching };
};

const useInvalidateMembers = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: ["organisasi-unit"] });
    queryClient.invalidateQueries({ queryKey: ["organisasi-profil"] });
  };
};

export const useInviteMember = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: (body: InviteInterface) =>
      fetchData<ApiResponse<ResponseInterface>>(`${url}${BASE}/invite`, { method: "POST", body: { ...body } }),
    onSuccess: () => {
      invalidate();
      swallAlert("undangan dibuat", "success");
    },
    onError: (err: Error) => swallAlert(`gagal diundang: ${err.message}`, "error"),
  });
};

export const useUpdateMember = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateInterface }) =>
      fetchData<ApiResponse<ResponseInterface>>(`${url}${BASE}/update/${id}`, { method: "PUT", body: { ...body } }),
    onSuccess: () => {
      invalidate();
      swallAlert("pengguna diperbarui", "success");
    },
    onError: (err: Error) => swallAlert(`gagal diubah: ${err.message}`, "error"),
  });
};

export const useDeleteMember = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: (id: string) => fetchData(`${url}${BASE}/delete/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      swallAlert("pengguna dikeluarkan", "success");
    },
    onError: (err: Error) => swallAlert(`gagal dikeluarkan: ${err.message}`, "error"),
  });
};
