"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchData } from "@/lib/api_secure";
import { swallAlert } from "@/lib/show_swall";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import type { ResultDocument, TaskStatus } from "../types";

const base = (url: string, taskId: string) => `${url}/api/v1/admin/tugas/${taskId}/berkas`;

/** Status tugas ikut menjadi kunci: berkas muncul dan nomornya terisi saat status berubah */
export const useResponseDocuments = (taskId: string, status: TaskStatus) => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data } = useQuery({
    queryFn: () => fetchData<ApiResponse<ResultDocument[]>>(base(url, taskId)),
    queryKey: ["tugas", "berkas", taskId, status],
  });
  return { Documents: data?.data ?? [] };
};

export const useCorrectDocument = (taskId: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => fetchData(`${base(url, taskId)}/${id}/koreksi`, { method: "POST", body: { text } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tugas", "berkas", taskId] });
      queryClient.invalidateQueries({ queryKey: ["pengaturan", "persuratan"] });
      swallAlert("format diperbaiki dan diingat", "success");
    },
    onError: (err: Error) => swallAlert(`gagal: ${err.message}`, "error"),
  });
};

export const useNumberDocument = (taskId: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchData(`${base(url, taskId)}/${id}/nomor`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tugas", "berkas", taskId] });
      queryClient.invalidateQueries({ queryKey: ["pengaturan", "persuratan"] });
      swallAlert("nomor surat diberikan", "success");
    },
    onError: (err: Error) => swallAlert(`gagal: ${err.message}`, "error"),
  });
};
