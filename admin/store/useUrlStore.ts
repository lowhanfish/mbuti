import { create } from "zustand";

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface URLProps {
  APP: string;
  LOGIN: string;
  REFRESH: string;
  LOGOUT: string;
  ME: string;
}

export interface UseUrlStoreProps {
  URL: URLProps;
}

export const useUrlStore = create<UseUrlStoreProps>(() => ({
  URL: {
    APP: baseUrl,
    LOGIN: `${baseUrl}/api/v1/auth/login`,
    REFRESH: `${baseUrl}/api/v1/auth/refresh`,
    LOGOUT: `${baseUrl}/api/v1/auth/logout`,
    ME: `${baseUrl}/api/v1/auth/me`,
  },
}));
