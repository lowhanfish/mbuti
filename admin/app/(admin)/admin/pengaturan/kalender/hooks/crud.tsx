"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchData } from "@/lib/api_secure";
import { swallAlert } from "@/lib/show_swall";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import type { CalendarDay, CalendarDayRequest, CalendarSettings, ImportResult, ShiftRequest } from "../types";

const BASE = "/api/v1/admin/pengaturan/kalender";
const QUERY_KEY = ["pengaturan", "kalender"];

export const useResponseCalendar = () => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryFn: () => fetchData<ApiResponse<CalendarSettings>>(`${url}${BASE}`),
    queryKey: [...QUERY_KEY, "settings"],
  });
  return { Calendar: data?.data, isLoading, isError, error, refetch };
};

export const useResponseCalendarDays = (year: number) => {
  const url = useUrlStore((state) => state.URL.APP);
  const { data, isLoading } = useQuery({
    queryFn: () => fetchData<ApiResponse<CalendarDay[]>>(`${url}${BASE}/hari?year=${year}`),
    queryKey: [...QUERY_KEY, "days", year],
  });
  return { Days: data?.data ?? [], isLoading };
};

const useCalendarMutation = <V, R = unknown>(request: (url: string, value: V) => Promise<R>, success: string | ((res: R) => string)) => {
  const url = useUrlStore((state) => state.URL.APP);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: V) => request(`${url}${BASE}`, value),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      // Putaran berikutnya tugas rutin mengikuti kalender
      queryClient.invalidateQueries({ queryKey: ["tugas-rutin"] });
      swallAlert(typeof success === "string" ? success : success(res), "success");
    },
    onError: (err: Error) => swallAlert(`gagal: ${err.message}`, "error"),
  });
};

export const useSaveWorkdays = () =>
  useCalendarMutation((url, workdays: number[]) => fetchData(url, { method: "PUT", body: { workdays } }), "hari kerja tersimpan");

export const useSaveShift = () =>
  useCalendarMutation(
    (url, { id, body }: { id?: string; body: ShiftRequest }) => fetchData(id ? `${url}/shift/${id}` : `${url}/shift`, { method: id ? "PUT" : "POST", body: { ...body } }),
    "shift tersimpan"
  );

export const useDeleteShift = () => useCalendarMutation((url, id: string) => fetchData(`${url}/shift/${id}`, { method: "DELETE" }), "shift dihapus");

export const useSaveDay = () =>
  useCalendarMutation((url, body: CalendarDayRequest) => fetchData(`${url}/hari`, { method: "POST", body: { ...body } }), "tanggal tersimpan");

export const useDeleteDay = () => useCalendarMutation((url, id: string) => fetchData(`${url}/hari/${id}`, { method: "DELETE" }), "tanggal dihapus");

export const useImportDays = () =>
  useCalendarMutation(
    (url, file: File) => {
      const body = new FormData();
      body.set("file", file);
      return fetchData<ApiResponse<ImportResult>>(`${url}/hari/impor`, { method: "POST", body });
    },
    (res) => `${res.data.added} ditambahkan, ${res.data.updated} diperbarui${res.data.errors.length ? `, ${res.data.errors.length} baris dilewati` : ""}`
  );
