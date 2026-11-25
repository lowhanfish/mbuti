import { create } from "zustand";
import { fetchData } from "@/lib/api_secure";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse, AuthDataResponse, UserProfile } from "@/types/global";

interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: UserProfile | null) => void;
  checkAuth: () => Promise<UserProfile | null>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const meUrl = useUrlStore.getState().URL.ME;
      const res = await fetchData<ApiResponse<AuthDataResponse>>(meUrl, {}, false);
      if (res.success && res.data?.user) {
        set({ user: res.data.user, isAuthenticated: true, isLoading: false });
        return res.data.user;
      }
    } catch {
      // Sesi tidak ada atau berakhir; ditangani di bawah
    }
    set({ user: null, isAuthenticated: false, isLoading: false });
    return null;
  },

  logout: async () => {
    try {
      const logoutUrl = useUrlStore.getState().URL.LOGOUT;
      await fetchData(logoutUrl, { method: "POST" }, false);
    } catch {
      // Tetap bersihkan sesi lokal walau server mengembalikan galat
    } finally {
      set({ user: null, isAuthenticated: false, isLoading: false });
      if (typeof window !== "undefined") {
        window.location.replace("/login");
      }
    }
  },
}));
