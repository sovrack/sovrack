import { create } from "zustand";
import { persist } from "zustand/middleware";
import api, { getApiErrorMessage } from "@/shared/lib/api";
import { clearAuthStorage } from "@/shared/lib/auth";
import type { AuthUser } from "@/features/auth/types/auth";
import type { LoginResponse } from "@/features/auth/types/auth";

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  initialized: boolean;
};

type AuthActions = {
  setUser: (user: AuthUser | null) => void;
  clearAuth: () => void;
  clearError: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    fullName: string;
    teamName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  initialize: () => Promise<void>;
};

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      user: null,
      loading: true,
      error: null,
      isAuthenticated: false,
      isAdmin: false,
      initialized: false,

      setUser: (user) =>
        set({
          user,
          loading: false,
          error: null,
          isAuthenticated: !!user,
          isAdmin: user?.role === "ADMIN",
          initialized: true,
        }),

      clearAuth: () =>
        set({
          user: null,
          loading: false,
          error: null,
          isAuthenticated: false,
          isAdmin: false,
          initialized: true,
        }),

      clearError: () => set({ error: null }),

      refreshUser: async () => {
        set({ loading: true });
        try {
          const response = await api.get<AuthUser>("/auth/me");
          set({
            user: response.data,
            loading: false,
            error: null,
            isAuthenticated: true,
            isAdmin: response.data.role === "ADMIN",
            initialized: true,
          });
        } catch (error) {
          clearAuthStorage();
          set({
            user: null,
            loading: false,
            error: getApiErrorMessage(error),
            isAuthenticated: false,
            isAdmin: false,
            initialized: true,
          });
        }
      },

      login: async (email: string, password: string) => {
        set({ loading: true, error: null });

        try {
          const response = await api.post<LoginResponse>("/auth/login", {
            email,
            password,
          });

          set({
            user: response.data.user,
            loading: false,
            error: null,
            isAuthenticated: true,
            isAdmin: response.data.user.role === "ADMIN",
            initialized: true,
          });
        } catch (error) {
          set({
            loading: false,
            error: getApiErrorMessage(error),
          });
          throw error;
        }
      },

      register: async (input: {
        email: string;
        password: string;
        fullName: string;
        teamName: string;
      }) => {
        set({ loading: true, error: null });

        try {
          const response = await api.post<LoginResponse>("/auth/register", {
            email: input.email,
            password: input.password,
            fullName: input.fullName,
            teamName: input.teamName,
          });

          set({
            user: response.data.user,
            loading: false,
            error: null,
            isAuthenticated: true,
            isAdmin: response.data.user.role === "ADMIN",
            initialized: true,
          });
        } catch (error) {
          set({
            loading: false,
            error: getApiErrorMessage(error),
          });
          throw error;
        }
      },

      logout: async () => {
        try {
          await api.post("/auth/logout");
        } catch {
          // Clear local auth state even if backend logout fails.
        } finally {
          clearAuthStorage();
          set({
            user: null,
            loading: false,
            error: null,
            isAuthenticated: false,
            isAdmin: false,
            initialized: true,
          });
        }
      },

      initialize: async () => {
        if (get().initialized) {
          return;
        }

        await get().refreshUser();
      },
    }),
    {
      name: "deploy-automation-auth",
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
