import { Role } from '@prisma/client';
import type { JwtPayload } from '../../../../shared/jwt/dto/jwt-payload.dto';
import { ServersCoreService } from '../services';
import { DockerConnectionsService } from '../../../../adapters/container-runtime/docker-connections.service';
import { ServerDetectionController } from './server-detection.controller';
import { ServerAuditController } from './server-audit.controller';
import { DockerConnectionController } from './docker-connection.controller';

describe('Server detection / audit / docker-connection controllers', () => {
  const user = { id: 'user-1', role: Role.OWNER } as JwtPayload;

  describe('ServerDetectionController', () => {
    function build() {
      const core = {
        detectServer: jest.fn().mockResolvedValue({ id: 'srv-1' }),
        listCapabilities: jest.fn().mockResolvedValue([]),
        listInstalledTools: jest.fn().mockResolvedValue([]),
      } as unknown as ServersCoreService;
      return { ctrl: new ServerDetectionController(core), core };
    }

    it('detect / capabilities / installed-tools delegate', async () => {
      const { ctrl, core } = build();
      await ctrl.detect('srv-1', {} as never, user);
      await ctrl.getCapabilities('srv-1');
      await ctrl.getInstalledTools('srv-1');
      expect(core.detectServer).toHaveBeenCalledWith('srv-1', 'user-1');
      expect(core.listCapabilities).toHaveBeenCalledWith('srv-1');
      expect(core.listInstalledTools).toHaveBeenCalledWith('srv-1');
    });
  });

  describe('ServerAuditController', () => {
    it('getAuditEvents delegates', async () => {
      const core = {
        listAuditEvents: jest.fn().mockResolvedValue([]),
      } as unknown as ServersCoreService;
      const ctrl = new ServerAuditController(core);
      await ctrl.getAuditEvents('srv-1');
      expect(core.listAuditEvents).toHaveBeenCalledWith('srv-1');
    });
  });

  describe('DockerConnectionController', () => {
    function build() {
      const dockerConnections = {
        findForServer: jest.fn().mockResolvedValue({
          id: 'dc1',
          serverId: 'srv-1',
          endpoint: 'tcp://host:2376',
          apiVersion: '1.45',
          lastCheckedAt: null,
          isReachable: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          tlsCaCert: 'secret',
        }),
        upsert: jest.fn().mockResolvedValue({ id: 'dc1' }),
        probeReachability: jest.fn().mockResolvedValue({ reachable: true }),
        remove: jest.fn().mockResolvedValue({ ok: true }),
      } as unknown as DockerConnectionsService;
      return {
        ctrl: new DockerConnectionController(dockerConnections),
        dockerConnections,
      };
    }

    it('get returns metadata only (no secrets)', async () => {
      const { ctrl } = build();
      const res = await ctrl.get('srv-1');
      expect(res).not.toHaveProperty('tlsCaCert');
      expect(res).toMatchObject({ id: 'dc1', endpoint: 'tcp://host:2376' });
    });

    it('upsert / probe / remove delegate', async () => {
      const { ctrl, dockerConnections } = build();
      await ctrl.upsert('srv-1', {
        endpoint: 'e',
        tlsCaCert: 'a',
        tlsClientCert: 'b',
        tlsClientKey: 'c',
      } as never);
      await ctrl.probe('srv-1');
      await ctrl.remove('srv-1');
      expect(dockerConnections.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ serverId: 'srv-1', endpoint: 'e' }),
      );
      expect(dockerConnections.probeReachability).toHaveBeenCalledWith('srv-1');
      expect(dockerConnections.remove).toHaveBeenCalledWith('srv-1');
    });
  });
});
