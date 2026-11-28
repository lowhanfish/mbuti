"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchData } from "@/lib/api_secure";
import { swallAlert } from "@/lib/show_swall";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import type { MemberLeave, MemberLeaveRequest } from "../types";

const base = (url: string, memberId: string) => `${url}/api/v1/admin/organisasi/pengguna/${memberId}/cuti`;

export const useResponseLeaves = (memberId: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading } = useQuery({
    queryFn: () => fetchData<ApiResponse<MemberLeave[]>>(base(url, memberId)),
    queryKey: ["cuti", memberId],
  });
  return { Leaves: data?.data ?? [], isLoading };
};

export const useLeaveMutations = (memberId: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  const queryClient = useQueryClient();
  const done = (message: string) => () => {
    queryClient.invalidateQueries({ queryKey: ["cuti", memberId] });
    queryClient.invalidateQueries({ queryKey: ["tugas-rutin"] });
    swallAlert(message, "success");
  };
  const onError = (err: Error) => swallAlert(`gagal: ${err.message}`, "error");
  const add = useMutation({
    mutationFn: (body: MemberLeaveRequest) => fetchData(base(url, memberId), { method: "POST", body: { ...body } }),
    onSuccess: done("cuti tersimpan"),
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => fetchData(`${base(url, memberId)}/${id}`, { method: "DELETE" }),
    onSuccess: done("cuti dihapus"),
    onError,
  });
  return { add, remove };
};
