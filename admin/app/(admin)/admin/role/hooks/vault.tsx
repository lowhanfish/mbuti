"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchData } from "@/lib/api_secure";
import { swallAlert } from "@/lib/show_swall";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import type { VaultAccount, VaultCode, VaultInput, VaultResponse } from "../vault-types";

const QUERY_KEY = "brankas";

const useBase = (roleId: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  return `${url}/api/v1/admin/role/${roleId}/brankas`;
};

export const useResponseVault = (roleId: string) => {
  const base = useBase(roleId);
  const { data, isLoading, isError, error } = useQuery({
    queryFn: () => fetchData<ApiResponse<VaultResponse>>(base),
    queryKey: [QUERY_KEY, roleId],
  });
  return { Vault: data?.data, isLoading, isError, error };
};

const useChanged = (roleId: string) => {
  const queryClient = useQueryClient();
  return (message: string) => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY, roleId] });
    queryClient.invalidateQueries({ queryKey: ["dua-langkah"] });
    swallAlert(message, "success");
  };
};

/**
 * Galat ditampilkan di dalam jendela. `gcTime: 0` agar password dan kode yang dikirim
 * tidak tertinggal di tembolok React Query.
 */
export const useSaveVaultAccount = (roleId: string, accountId: string | null) => {
  const base = useBase(roleId);
  const changed = useChanged(roleId);
  return useMutation({
    gcTime: 0,
    mutationFn: (body: VaultInput) =>
      fetchData<ApiResponse<VaultAccount>>(accountId ? `${base}/${accountId}` : base, {
        method: accountId ? "PUT" : "POST",
        body: { ...body },
      }),
    onSuccess: () => changed(accountId ? "akun diperbarui" : "akun disimpan di brankas"),
  });
};

export const useDeleteVaultAccount = (roleId: string) => {
  const base = useBase(roleId);
  const changed = useChanged(roleId);
  return useMutation({
    gcTime: 0,
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      fetchData<ApiResponse<null>>(`${base}/${id}/hapus`, { method: "POST", body: { code } }),
    onSuccess: () => changed("akun dihapus dari brankas"),
  });
};

export const useConfirmVaultAccount = (roleId: string) => {
  const base = useBase(roleId);
  const changed = useChanged(roleId);
  return useMutation({
    gcTime: 0,
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      fetchData<ApiResponse<VaultAccount>>(`${base}/${id}/konfirmasi`, { method: "POST", body: { code } }),
    onSuccess: () => changed("akun dikonfirmasi"),
  });
};

export const useVaultCode = (roleId: string) => {
  const base = useBase(roleId);
  return useMutation({
    gcTime: 0,
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      fetchData<ApiResponse<VaultCode>>(`${base}/${id}/kode`, { method: "POST", body: { code } }),
  });
};
