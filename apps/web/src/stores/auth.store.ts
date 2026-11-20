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
  initialized: boolean;
  pendingDevCode: string | null;
};

type AuthActions = {
  setUser: (user: AuthUser | null) => void;
  clearAuth: () => void;
  clearError: () => void;
  login: (email: string, password: string, mfaCode?: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    fullName?: string;
    workspaceType: "PERSONAL" | "ORGANIZATION";
    workspaceName?: string;
  }) => Promise<string>;
  verifyEmail: (
    email: string,
    code: string,
    registrationId: string,
  ) => Promise<void>;
  resendCode: (email: string, registrationId: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  initialize: () => Promise<void>;
  requestAccountDeletion: () => Promise<void>;
  confirmAccountDeletion: (code: string) => Promise<void>;
};

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      user: null,
      loading: true,
      error: null,
      isAuthenticated: false,
      initialized: false,
      pendingDevCode: null,

      setUser: (user) =>
        set({
          user,
          loading: false,
          error: null,
          isAuthenticated: !!user,
          initialized: true,
        }),

      clearAuth: () =>
        set({
          user: null,
          loading: false,
          error: null,
          isAuthenticated: false,
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
            initialized: true,
          });
        } catch (error) {
          clearAuthStorage();
          set({
            user: null,
            loading: false,
            error: getApiErrorMessage(error),
            isAuthenticated: false,
            initialized: true,
          });
        }
      },

      login: async (email: string, password: string, mfaCode?: string) => {
        set({ loading: true, error: null });

        try {
          const response = await api.post<LoginResponse>("/auth/login", {
            email,
            password,
            ...(mfaCode ? { mfaCode } : {}),
          });

          set({
            user: response.data.user,
            loading: false,
            error: null,
            isAuthenticated: true,
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
        fullName?: string;
        workspaceType: "PERSONAL" | "ORGANIZATION";
        workspaceName?: string;
      }) => {
        set({ loading: true, error: null });

        try {
          const response = await api.post<{
            email: string;
            registrationId: string;
            devCode?: string;
          }>("/auth/register", {
            email: input.email,
            password: input.password,
            fullName: input.fullName || input.email.split("@")[0] || "User",
            workspaceType: input.workspaceType,
            ...(input.workspaceType === "ORGANIZATION"
              ? { workspaceName: input.workspaceName }
              : {}),
          });

          set({
            loading: false,
            error: null,
            pendingDevCode: response.data.devCode ?? null,
          });
          return response.data.registrationId;
        } catch (error) {
          set({
            loading: false,
            error: getApiErrorMessage(error),
          });
          throw error;
        }
      },

      verifyEmail: async (
        email: string,
        code: string,
        registrationId: string,
      ) => {
        set({ loading: true, error: null });

        try {
          const response = await api.post<LoginResponse>("/auth/verify-email", {
            email,
            code,
            registrationId,
          });

          set({
            user: response.data.user,
            loading: false,
            error: null,
            isAuthenticated: true,
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

      resendCode: async (email: string, registrationId: string) => {
        set({ loading: true, error: null });

        try {
          await api.post<{ email: string }>("/auth/resend-code", {
            email,
            registrationId,
          });
          set({ loading: false, error: null });
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

      requestAccountDeletion: async () => {
        set({ loading: true, error: null });
        try {
          await api.post<{ sent: boolean }>("/auth/delete-account-request");
          set({ loading: false, error: null });
        } catch (error) {
          set({ loading: false, error: getApiErrorMessage(error) });
          throw error;
        }
      },

      confirmAccountDeletion: async (code: string) => {
        set({ loading: true, error: null });
        try {
          await api.delete("/auth/me", { data: { code } });
          clearAuthStorage();
          set({
            user: null,
            loading: false,
            error: null,
            isAuthenticated: false,
            initialized: true,
          });
        } catch (error) {
          set({ loading: false, error: getApiErrorMessage(error) });
          throw error;
        }
      },
    }),
    {
      name: "sovrack-auth",
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
