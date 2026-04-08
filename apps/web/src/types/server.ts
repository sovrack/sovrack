export type Server = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  isVerified: boolean;
  hasDocker: boolean;
  hasAnsible: boolean;
  hasRunner: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateServerPayload = {
  name: string;
  host: string;
  port?: number;
  username?: string;
  sshKey: string;
};

export type UpdateServerPayload = Partial<Omit<CreateServerPayload, 'sshKey'>>;

export type VerifyServerResult = {
  isVerified: boolean;
  hasDocker: boolean;
  hasAnsible: boolean;
  hasRunner: boolean;
};
