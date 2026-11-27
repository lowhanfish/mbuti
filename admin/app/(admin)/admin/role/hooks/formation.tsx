"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchData } from "@/lib/api_secure";
import { swallAlert } from "@/lib/show_swall";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import type {
  AnswerRequest,
  CardUpdateRequest,
  FinalRequest,
  FormationInterface,
  MaterialsRequest,
  ToolCatalogItem,
  ToolRequestInterface,
  VersionDetailInterface,
  VersionInterface,
} from "../formation-types";

const BASE = "/api/v1/admin/role";

/** Dimuat ulang selama analisis atau putaran tanya jawab berjalan, atau uraian jabatan masih diolah. */
const isBusy = (f: FormationInterface | undefined) =>
  Boolean(
    f && (f.processing || f.material_documents.some((d) => d.status === "queued" || d.status === "processing"))
  );

export const useFormation = (id: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading, isError, error } = useQuery({
    queryFn: () => fetchData<ApiResponse<FormationInterface>>(`${url}${BASE}/${id}/pembentukan`),
    queryKey: ["role", "pembentukan", id],
    enabled: Boolean(id),
    refetchInterval: (query) => (isBusy(query.state.data?.data) ? 1500 : false),
  });
  return { Formation: data?.data, busy: isBusy(data?.data), isLoading, isError, error };
};

export const useVersions = (id: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading } = useQuery({
    queryFn: () => fetchData<ApiResponse<VersionInterface[]>>(`${url}${BASE}/${id}/versi`),
    queryKey: ["role", "versi", id],
    enabled: Boolean(id),
  });
  return { Versions: data?.data ?? [], isLoading };
};

export const useVersionDetail = (id: string, versionId: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading } = useQuery({
    queryFn: () => fetchData<ApiResponse<VersionDetailInterface>>(`${url}${BASE}/${id}/versi/${versionId}`),
    queryKey: ["role", "versi", id, versionId],
    enabled: Boolean(id && versionId),
  });
  return { Version: data?.data, isLoading };
};

export const useToolCatalog = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data } = useQuery({
    queryFn: () => fetchData<ApiResponse<ToolCatalogItem[]>>(`${url}/api/v1/admin/alat/katalog`),
    queryKey: ["alat", "katalog"],
    staleTime: 10 * 60 * 1000,
  });
  return { Catalog: data?.data ?? [] };
};

export const useToolRequests = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data } = useQuery({
    queryFn: () => fetchData<ApiResponse<ToolRequestInterface[]>>(`${url}/api/v1/admin/alat/permintaan`),
    queryKey: ["alat", "permintaan"],
  });
  return { Requests: data?.data ?? [] };
};

const useInvalidate = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["role"] });
    queryClient.invalidateQueries({ queryKey: ["pengetahuan"] });
    queryClient.invalidateQueries({ queryKey: ["alat"] });
  };
};

/** Mutasi pembentukan dengan pesan berhasil dan gagal yang seragam. */
const useFormationMutation = <B,>(id: string, path: string, method: "POST" | "PUT", success: string | null, failure: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: B) =>
      fetchData<ApiResponse<FormationInterface>>(`${url}${BASE}/${id}/${path}`, { method, body: { ...(body as object) } }),
    onSuccess: () => {
      invalidate();
      if (success) swallAlert(success, "success");
    },
    onError: (err: Error) => swallAlert(`${failure}: ${err.message}`, "error"),
  });
};

export const useStartRevision = (id: string) => useFormationMutation<{ from_version_id?: string }>(id, "pembentukan/mulai", "POST", "revisi baru dibuat", "revisi gagal dibuat");
export const useSaveMaterials = (id: string) => useFormationMutation<MaterialsRequest>(id, "pembentukan/bahan", "PUT", "bahan tersimpan", "bahan gagal disimpan");
export const useRunAnalysis = (id: string) => useFormationMutation<Record<string, never>>(id, "pembentukan/analisis", "POST", null, "analisis gagal dimulai");
export const useSaveCard = (id: string) => useFormationMutation<CardUpdateRequest>(id, "pembentukan/kartu", "PUT", "kartu tersimpan", "kartu gagal disimpan");
export const useSendAnswers = (id: string) => useFormationMutation<AnswerRequest>(id, "pembentukan/jawab", "POST", null, "jawaban gagal dikirim");
export const useFinalize = (id: string) => useFormationMutation<FinalRequest>(id, "pembentukan/final", "POST", "role Final", "gagal Final");
export const useDiscardRevision = (id: string) => useFormationMutation<Record<string, never>>(id, "pembentukan/batal", "POST", "revisi dibuang", "revisi gagal dibuang");

export const useRestoreVersion = (id: string) => {
  const url = useUrlStore((state) => state.URL.APP);
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (versionId: string) =>
      fetchData<ApiResponse<FormationInterface>>(`${url}${BASE}/${id}/versi/${versionId}/pulihkan`, { method: "POST", body: {} }),
    onSuccess: () => {
      invalidate();
      swallAlert("revisi dari versi lama dibuat", "success");
    },
    onError: (err: Error) => swallAlert(`gagal dipulihkan: ${err.message}`, "error"),
  });
};
