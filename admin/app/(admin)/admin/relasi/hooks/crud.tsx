"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchData } from "@/lib/api_secure";
import { swallAlert } from "@/lib/show_swall";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import type { CreateInterface, GraphInterface, RelationFields, RelationInterface } from "../types";

const BASE = "/api/v1/admin/relasi";
const QUERY_KEY = "relasi";

export const useResponseGraph = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryFn: () => fetchData<ApiResponse<GraphInterface>>(`${url}${BASE}/graph`),
    queryKey: [QUERY_KEY, "graph"],
  });
  return { Graph: data?.data, isLoading, isError, error, refetch };
};

const useInvalidateGraph = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: ["role"] });
  };
};

export const useCreateRelation = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateGraph();
  return useMutation({
    mutationFn: (body: CreateInterface) =>
      fetchData<ApiResponse<RelationInterface>>(`${url}${BASE}/create`, { method: "POST", body: { ...body } }),
    onSuccess: () => {
      invalidate();
      swallAlert("relasi dibuat", "success");
    },
    onError: (err: Error) => swallAlert(`gagal dibuat: ${err.message}`, "error"),
  });
};

export const useUpdateRelation = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateGraph();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RelationFields }) =>
      fetchData<ApiResponse<RelationInterface>>(`${url}${BASE}/update/${id}`, { method: "PUT", body: { ...body } }),
    onSuccess: () => {
      invalidate();
      swallAlert("relasi diperbarui", "success");
    },
    onError: (err: Error) => swallAlert(`gagal diubah: ${err.message}`, "error"),
  });
};

export const useDeleteRelation = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateGraph();
  return useMutation({
    mutationFn: (id: string) => fetchData(`${url}${BASE}/delete/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      swallAlert("relasi dihapus", "success");
    },
    onError: (err: Error) => swallAlert(`gagal dihapus: ${err.message}`, "error"),
  });
};

/** Simpan posisi node tanpa notifikasi (dipanggil setiap selesai menyeret). */
export const useSavePositions = () => {
  const url = useUrlStore((state) => state.URL.APP);
  return useMutation({
    mutationFn: (positions: Record<string, { x: number; y: number }>) =>
      fetchData(`${url}${BASE}/positions`, { method: "PUT", body: { positions } }),
  });
};

export const useResetPositions = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateGraph();
  return useMutation({
    mutationFn: () => fetchData(`${url}${BASE}/positions`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
};

export const useAddHuman = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateGraph();
  return useMutation({
    mutationFn: (member_id: string) => fetchData(`${url}${BASE}/humans`, { method: "POST", body: { member_id } }),
    onSuccess: invalidate,
    onError: (err: Error) => swallAlert(`gagal ditambahkan: ${err.message}`, "error"),
  });
};

export const useRemoveHuman = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidateGraph();
  return useMutation({
    mutationFn: (member_id: string) => fetchData(`${url}${BASE}/humans/${member_id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err: Error) => swallAlert(`gagal dikeluarkan: ${err.message}`, "error"),
  });
};
