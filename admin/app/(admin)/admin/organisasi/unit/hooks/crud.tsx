"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchData } from "@/lib/api_secure";
import { swallAlert } from "@/lib/show_swall";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse, ListOptionSchema } from "@/types/global";
import type { ResponseListInterface as MemberListInterface } from "../../pengguna/types";
import type { CreateInterface, ResponseInterface, ResponseListInterface } from "../types";

const BASE = "/api/v1/admin/unit";
const QUERY_KEY = "organisasi-unit";

/** Unit dipakai sebagai pohon, jadi semua unit diambil sekaligus (batas 200). */
export const useResponseListUnit = (search: string = "") => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data: List, isLoading, isError, error, refetch } = useQuery({
    queryFn: () =>
      fetchData<ResponseListInterface>(`${url}${BASE}/read?skip=0&limit=200&search=${encodeURIComponent(search)}`),
    queryKey: [QUERY_KEY, search],
  });
  return { List, isLoading, isError, error, refetch };
};

export const useResponseOptionUnit = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading } = useQuery({
    queryFn: () => fetchData<ApiResponse<ListOptionSchema>>(`${url}${BASE}/option`),
    queryKey: [QUERY_KEY, "option"],
  });
  return { List: data?.data ?? [], isLoading };
};

/** Anggota aktif untuk pilihan penanggung jawab unit. */
export const useResponseOptionLead = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading } = useQuery({
    queryFn: () => fetchData<MemberListInterface>(`${url}/api/v1/admin/pengguna/read?skip=0&limit=200&status=active`),
    queryKey: ["organisasi-pengguna", "lead-option"],
  });
  const List: ListOptionSchema = (data?.data ?? []).map((m) => ({ id: m.id, value: m.full_name, sub_value: m.email }));
  return { List, isLoading };
};

const useInvalidateUnits = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: ["organisasi-profil"] });
    queryClient.invalidateQueries({ queryKey: ["organisasi-pengguna"] });
  };
};

export const useCreateUnit = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateUnits();
  return useMutation({
    mutationFn: (body: CreateInterface) =>
      fetchData<ApiResponse<ResponseInterface>>(`${url}${BASE}/create`, { method: "POST", body: { ...body } }),
    onSuccess: () => {
      invalidate();
      swallAlert("unit ditambahkan", "success");
    },
    onError: (err: Error) => swallAlert(`gagal ditambahkan: ${err.message}`, "error"),
  });
};

export const useUpdateUnit = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateUnits();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CreateInterface }) =>
      fetchData<ApiResponse<ResponseInterface>>(`${url}${BASE}/update/${id}`, { method: "PUT", body: { ...body } }),
    onSuccess: () => {
      invalidate();
      swallAlert("unit diperbarui", "success");
    },
    onError: (err: Error) => swallAlert(`gagal diubah: ${err.message}`, "error"),
  });
};

export const useDeleteUnit = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateUnits();
  return useMutation({
    mutationFn: (id: string) => fetchData(`${url}${BASE}/delete/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      swallAlert("unit dihapus", "success");
    },
    onError: (err: Error) => swallAlert(`gagal dihapus: ${err.message}`, "error"),
  });
};
