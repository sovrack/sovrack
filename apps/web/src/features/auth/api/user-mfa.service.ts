import api from "@/shared/lib/api";

export type UserMfaStatus = {
  enabled: boolean;
  required: false;
  recoveryCodesRemaining: number;
};

export type UserMfaSetup = {
  secret: string;
  otpauthUri: string;
};

export const userMfaService = {
  async status(): Promise<UserMfaStatus> {
    const response = await api.get<UserMfaStatus>(
      "/auth/settings/security/mfa",
    );
    return response.data;
  },

  async beginSetup(): Promise<UserMfaSetup> {
    const response = await api.post<UserMfaSetup>(
      "/auth/settings/security/mfa/setup",
    );
    return response.data;
  },

  async enable(code: string): Promise<{ recoveryCodes: string[] }> {
    const response = await api.post<{ recoveryCodes: string[] }>(
      "/auth/settings/security/mfa/enable",
      { code },
    );
    return response.data;
  },

  async disable(password: string, code: string): Promise<void> {
    await api.post("/auth/settings/security/mfa/disable", { password, code });
  },
};
