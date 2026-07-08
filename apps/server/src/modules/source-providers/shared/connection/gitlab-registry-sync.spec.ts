import { of } from 'rxjs';
import { GitProviderLegacySyncService } from './git-provider-legacy-sync.service';

/**
 * Vérifie l'auto-provision « pro » du registre GitLab lié à un provider :
 * réutilisation du token + username récupéré via l'API + lien providerId.
 * (Logique extraite de GitProviderConfigService vers GitProviderLegacySyncService.)
 */
describe('GitProviderLegacySyncService.syncRegistry', () => {
  function make(opts: {
    userStatus?: number;
    username?: string;
    existing?: { id: string } | null;
  }) {
    const created: Record<string, unknown>[] = [];
    const updated: Record<string, unknown>[] = [];
    const prisma = {
      registryConfig: {
        findFirst: jest.fn().mockResolvedValue(opts.existing ?? null),
        create: jest.fn((args: { data: Record<string, unknown> }) => {
          created.push(args.data);
          return Promise.resolve(args.data);
        }),
        update: jest.fn((args: { data: Record<string, unknown> }) => {
          updated.push(args.data);
          return Promise.resolve(args.data);
        }),
      },
    };
    const http = {
      get: jest.fn().mockReturnValue(
        of({
          status: opts.userStatus ?? 200,
          data: { username: opts.username ?? 'alice' },
        }),
      ),
    };
    const crypto = { decrypt: (v: string) => `raw(${v})` };
    const svc = new GitProviderLegacySyncService(
      prisma as never,
      http as never,
      crypto as never,
    );
    return { svc, prisma, http, created, updated };
  }

  it('creates a linked registry (providerId) with reused token + username via API', async () => {
    const { svc, http, created } = make({ username: 'alice' });
    await svc.syncRegistry({
      id: 'p1',
      name: 'perso',
      providerUrl: 'https://gitlab.com',
      adminToken: 'ENC_TOKEN',
    });

    expect(http.get).toHaveBeenCalledWith(
      'https://gitlab.com/api/v4/user',
      expect.objectContaining({
        headers: { 'PRIVATE-TOKEN': 'raw(ENC_TOKEN)' },
      }),
    );
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      providerId: 'p1',
      username: 'alice',
      password: 'ENC_TOKEN',
      registryUrl: 'https://registry.gitlab.com',
    });
  });

  it('updates the existing registry instead of creating a duplicate', async () => {
    const { svc, prisma, updated } = make({ existing: { id: 'r1' } });
    await svc.syncRegistry({
      id: 'p1',
      name: 'perso',
      providerUrl: 'https://gitlab.com',
      adminToken: 'ENC_TOKEN',
    });
    expect(prisma.registryConfig.create).not.toHaveBeenCalled();
    expect(updated[0]).toMatchObject({ providerId: 'p1', username: 'alice' });
  });

  it('without token → registry created without creds (to be completed), still linked', async () => {
    const { svc, created } = make({});
    await svc.syncRegistry({
      id: 'p1',
      name: 'perso',
      providerUrl: 'https://gitlab.com',
      adminToken: null,
    });
    expect(created[0]).toMatchObject({ providerId: 'p1' });
    expect(created[0].password).toBeUndefined();
    expect(created[0].username).toBeUndefined();
  });
});
