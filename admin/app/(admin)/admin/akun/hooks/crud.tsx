"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchData } from "@/lib/api_secure";
import { swallAlert } from "@/lib/show_swall";
import { useAuthStore } from "@/store/useAuthStore";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import type { RecoveryCodes, TwoFactorSetup, TwoFactorStatus } from "../types";

const BASE = "/api/v1/auth/dua-langkah";
const QUERY_KEY = "dua-langkah";

export const useResponseTwoFactor = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading, isError, error } = useQuery({
    queryFn: () => fetchData<ApiResponse<TwoFactorStatus>>(`${url}${BASE}`),
    queryKey: [QUERY_KEY],
  });
  return { Status: data?.data, isLoading, isError, error };
};

const useTwoFactorChanged = () => {
  const queryClient = useQueryClient();
  const refreshUser = useAuthStore((state) => state.refreshUser);
  return () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    // Brankas role bergantung pada status verifikasi dua langkah
    queryClient.invalidateQueries({ queryKey: ["brankas"] });
    void refreshUser();
  };
};

/** Galat ditampilkan di dalam jendela, jadi tidak memakai peringatan terpisah. */
export const useStartTwoFactor = () => {
  const url = useUrlStore((state) => state.URL.APP);
  return useMutation({
    mutationFn: (password: string) =>
      fetchData<ApiResponse<TwoFactorSetup>>(`${url}${BASE}/mulai`, { method: "POST", body: { password } }),
  });
};

export const useEnableTwoFactor = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const changed = useTwoFactorChanged();
  return useMutation({
    mutationFn: (code: string) =>
      fetchData<ApiResponse<RecoveryCodes>>(`${url}${BASE}/aktifkan`, { method: "POST", body: { code } }),
    onSuccess: changed,
  });
};

export const useNewRecoveryCodes = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const changed = useTwoFactorChanged();
  return useMutation({
    mutationFn: (code: string) =>
      fetchData<ApiResponse<RecoveryCodes>>(`${url}${BASE}/kode-cadangan`, { method: "POST", body: { code } }),
    onSuccess: changed,
  });
};

export const useDisableTwoFactor = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const changed = useTwoFactorChanged();
  return useMutation({
    mutationFn: (body: { password: string; code: string }) =>
      fetchData<ApiResponse<null>>(`${url}${BASE}/matikan`, { method: "POST", body: { ...body } }),
    onSuccess: () => {
      changed();
      swallAlert("verifikasi dua langkah dimatikan", "success");
    },
  });
};
