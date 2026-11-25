"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchData } from "@/lib/api_secure";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import type { OfficeState } from "../types";

/** Keadaan kantor dimuat ulang tiap 1,5 detik agar karakter mengikuti tugas yang berjalan. */
export const useResponseOffice = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryFn: () => fetchData<ApiResponse<OfficeState>>(`${url}/api/v1/admin/kantor/state`),
    queryKey: ["kantor", "state"],
    refetchInterval: 1500,
    placeholderData: (previous) => previous,
  });
  return { Office: data?.data, isLoading, isError, error, refetch };
};
