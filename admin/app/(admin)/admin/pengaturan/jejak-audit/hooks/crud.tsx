"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchData } from "@/lib/api_secure";
import { useUrlStore } from "@/store/useUrlStore";
import { toSkip } from "@/utilities/pagination";
import type { ResponseListInterface } from "../types";

const BASE = "/api/v1/admin/audit";

export const useResponseListAudit = (page: number, limit: number, filters: { search: string; group: string }, enabled: boolean) => {
  const url = useUrlStore((state) => state.URL.APP);
  const params = new URLSearchParams({ skip: String(toSkip(page, limit)), limit: String(limit), search: filters.search, group: filters.group });
  const { data: List, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryFn: () => fetchData<ResponseListInterface>(`${url}${BASE}/read?${params.toString()}`),
    queryKey: ["jejak-audit", page, limit, filters.search, filters.group],
    placeholderData: (previous) => previous,
    enabled,
    // Selalu terbaru saat halaman dibuka
    staleTime: 0,
  });
  return { List, isLoading, isError, error, refetch, isFetching };
};
