import api from '@/shared/lib/api';
import type { CreateSshKeyPayload, SshKey } from '@/features/ssh-keys/types/ssh-key';

export const sshKeysService = {
  async getAll(): Promise<SshKey[]> {
    const res = await api.get<SshKey[]>('/ssh-keys');
    return res.data;
  },

  async create(payload: CreateSshKeyPayload): Promise<SshKey> {
    const res = await api.post<SshKey>('/ssh-keys', payload);
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/ssh-keys/${id}`);
  },
};
