export type SshKey = {
  id: string;
  name: string;
  publicKey: string;
  keyType: string;
  createdAt: string;
};

export type CreateSshKeyPayload = {
  name: string;
  privateKey: string;
  publicKey: string;
  keyType: string;
};
