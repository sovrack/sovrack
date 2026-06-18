import { of } from 'rxjs';
import { RegistryProviderType } from '@prisma/client';
import { ContainerRegistriesService } from './container-registries.service';

/**
 * Régression du bug "Request failed with status code 401" : le test d'un
 * registre GitLab/Docker v2 doit suivre le handshake Bearer au lieu de traiter
 * le 401 initial comme un échec.
 */
describe('ContainerRegistriesService.testRegistryConnection (Docker v2 Bearer)', () => {
  const gitlabReg = {
    id: 'r1',
    type: RegistryProviderType.GITLAB,
    registryUrl: 'https://registry.gitlab.com',
    username: 'user',
    password: 'enc(token)',
  };

  function make(httpGet: jest.Mock) {
    const prisma = {
      registryConfig: {
        findUnique: jest.fn().mockResolvedValue(gitlabReg),
        update: jest.fn().mockResolvedValue(gitlabReg),
      },
    };
    const http = { get: httpGet };
    const crypto = { decrypt: (v: string) => v };
    const svc = new ContainerRegistriesService(
      prisma as never,
      http as never,
      crypto as never,
    );
    return { svc, prisma };
  }

  const bearerChallenge = {
    status: 401,
    headers: {
      'www-authenticate':
        'Bearer realm="https://gitlab.com/jwt/auth",service="container_registry"',
    },
    data: {},
  };

  it('réussit quand le realm renvoie un token (identifiants valides)', async () => {
    const httpGet = jest
      .fn()
      // 1er appel : GET /v2/ → 401 Bearer
      .mockReturnValueOnce(of(bearerChallenge))
      // 2e appel : realm → 200 + token
      .mockReturnValueOnce(
        of({ status: 200, headers: {}, data: { token: 'jwt-xyz' } }),
      );
    const { svc, prisma } = make(httpGet);

    const res = await svc.testRegistryConnection('r1');
    expect(res.ok).toBe(true);
    expect(prisma.registryConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isConnected: true, connectionError: null },
      }),
    );
  });

  it('échoue proprement quand le realm refuse les identifiants (401)', async () => {
    const httpGet = jest
      .fn()
      .mockReturnValueOnce(of(bearerChallenge))
      .mockReturnValueOnce(of({ status: 401, headers: {}, data: {} }));
    const { svc } = make(httpGet);

    const res = await svc.testRegistryConnection('r1');
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/refusés|401/i);
  });

  it('réussit directement si /v2/ renvoie 200', async () => {
    const httpGet = jest
      .fn()
      .mockReturnValueOnce(of({ status: 200, headers: {}, data: {} }));
    const { svc } = make(httpGet);
    const res = await svc.testRegistryConnection('r1');
    expect(res.ok).toBe(true);
    expect(httpGet).toHaveBeenCalledTimes(1);
  });
});
