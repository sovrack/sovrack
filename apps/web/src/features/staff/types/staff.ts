export type PlatformRole = "ROOT" | "ADMIN" | "OPERATOR";

export type StaffStatus = "INVITED" | "ACTIVE" | "DISABLED" | "BLOCKED";

export type StaffUser = {
  id: string;
  email: string;
  fullName: string;
  role: PlatformRole;
  status: StaffStatus;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StaffLoginResponse = {
  staff: StaffUser;
  mfaEnrollmentRequired: boolean;
};
