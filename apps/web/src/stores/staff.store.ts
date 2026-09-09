import { create } from "zustand";
import api, { getApiErrorMessage } from "@/shared/lib/api";
import type {
  StaffUser,
  StaffLoginResponse,
} from "@/features/staff/types/staff";

export const STAFF_COOKIE_NAME = "deploy_staff_token";

export const clearStaffStorage = (): void => {
  if (typeof window === "undefined") return;
  document.cookie = `${STAFF_COOKIE_NAME}=; path=/; Max-Age=0; SameSite=Lax`;
};

type StaffAuthState = {
  staff: StaffUser | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
};

type StaffAuthActions = {
  setStaff: (staff: StaffUser | null) => void;
  clearStaff: () => void;
  clearError: () => void;
  login: (
    email: string,
    password: string,
    mfaCode?: string,
  ) => Promise<"AUTHENTICATED" | "MFA_REQUIRED" | "ENROLLMENT_REQUIRED">;
  fetchMe: () => Promise<void>;
  logout: () => Promise<void>;
};

export const useStaffStore = create<StaffAuthState & StaffAuthActions>(
  (set, get) => ({
    staff: null,
    loading: true,
    error: null,
    initialized: false,

    setStaff: (staff) =>
      set({ staff, loading: false, error: null, initialized: true }),

    clearStaff: () =>
      set({ staff: null, loading: false, error: null, initialized: true }),

    clearError: () => set({ error: null }),

    login: async (email: string, password: string, mfaCode?: string) => {
      set({ loading: true, error: null });
      try {
        const response = await api.post<StaffLoginResponse>("/staff/login", {
          email,
          password,
          ...(mfaCode ? { mfaCode } : {}),
        });
        set({
          staff: response.data.staff,
          loading: false,
          error: null,
          initialized: true,
        });
        return response.data.mfaEnrollmentRequired
          ? "ENROLLMENT_REQUIRED"
          : "AUTHENTICATED";
      } catch (error) {
        const apiError = error as {
          response?: { data?: { code?: string } };
        };
        if (apiError.response?.data?.code === "STAFF_MFA_REQUIRED") {
          set({ loading: false, error: null });
          return "MFA_REQUIRED";
        }
        set({ loading: false, error: getApiErrorMessage(error) });
        throw error;
      }
    },

    fetchMe: async () => {
      if (get().initialized) return;
      set({ loading: true });
      try {
        const response = await api.get<StaffUser>("/staff/me");
        set({
          staff: response.data,
          loading: false,
          error: null,
          initialized: true,
        });
      } catch {
        clearStaffStorage();
        set({ staff: null, loading: false, error: null, initialized: true });
      }
    },

    logout: async () => {
      try {
        await api.post("/staff/logout");
      } catch {
        // nettoyage local même si l'API échoue
      } finally {
        clearStaffStorage();
        set({
          staff: null,
          loading: false,
          error: null,
          initialized: true,
        });
      }
    },
  }),
);
