"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchData } from "@/lib/api_secure";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import type { ResponseInterface } from "../types";

export const useResponseDashboard = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryFn: () => fetchData<ApiResponse<ResponseInterface>>(`${url}/api/v1/admin/dashboard/summary`),
    queryKey: ["dashboard"],
    refetchOnMount: "always",
    // Cepat selama ada tugas berjalan, santai bila tenang
    refetchInterval: (query) => {
      const tasks = query.state.data?.data.tasks;
      return tasks && tasks.queued + tasks.running > 0 ? 1500 : 10_000;
    },
  });
  return { Summary: data?.data, isLoading, isError, error, refetch };
};
