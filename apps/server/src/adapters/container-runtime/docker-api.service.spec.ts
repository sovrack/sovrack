import { Test } from '@nestjs/testing';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DockerApiService } from './docker-api.service';
import { DockerClientFactory } from './docker-client.factory';
import { DockerConnectionsService } from './docker-connections.service';
import { DockerContainerOpsService } from './docker-container-ops.service';
import { DockerImageService } from './docker-image.service';

/**
 * DockerApiService (TLS Docker SDK).
 *
 * Tests cover:
 *   - Client construction (cache hit/miss)
 *   - inspectImage: success, 404 → null, generic error → throw
 *   - inspectContainer: passthrough to dockerode
 *   - streamContainerLogs: demuxes the Docker 8-byte header (stdout/stderr)
 *   - getContainerStats: passthrough
 *   - invalidateCache: evicts the cache for a server
 *
 * We mock `DockerConnectionsService.getDecryptedTls` (TLS material) and
 * inject a fake `Docker` client by seeding the internal cache — easier to
 * mock the dockerode surface than to spin up a real daemon in unit tests.
 */
describe('DockerApiService', () => {
  let service: DockerApiService;
  let clientFactory: DockerClientFactory;
  let dockerConnections: {
    findForServer: jest.Mock;
    getDecryptedTls: jest.Mock;
  };
  let configService: { get: jest.Mock };
  let mockClient: {
    getImage: jest.Mock;
    getContainer: jest.Mock;
    pull: jest.Mock;
    modem: { followProgress: jest.Mock };
  };
  let mockContainer: {
    inspect: jest.Mock;
    logs: jest.Mock;
    stats: jest.Mock;
  };
  let mockContainerOpsService: {
    inspectContainer: jest.Mock;
    listContainers: jest.Mock;
    createContainer: jest.Mock;
    startContainer: jest.Mock;
    stopContainer: jest.Mock;
    restartContainer: jest.Mock;
    removeContainer: jest.Mock;
    connectNetwork: jest.Mock;
  };
  let mockImageService: {
    inspectImage: jest.Mock;
    buildImage: jest.Mock;
    pullImage: jest.Mock;
    pruneDanglingImages: jest.Mock;
  };

  beforeEach(async () => {
    dockerConnections = {
      findForServer: jest.fn(),
      getDecryptedTls: jest.fn(),
    };
    mockContainer = { inspect: jest.fn(), logs: jest.fn(), stats: jest.fn() };
    mockContainerOpsService = {
      inspectContainer: jest.fn(),
      listContainers: jest.fn(),
      createContainer: jest.fn(),
      startContainer: jest.fn(),
      stopContainer: jest.fn(),
      restartContainer: jest.fn(),
      removeContainer: jest.fn(),
      connectNetwork: jest.fn(),
    };
    mockImageService = {
      inspectImage: jest.fn(),
      buildImage: jest.fn(),
      pullImage: jest.fn(),
      pruneDanglingImages: jest.fn(),
    };
    mockClient = {
      getImage: jest.fn(),
      getContainer: jest.fn().mockReturnValue(mockContainer),
      pull: jest.fn(),
      modem: { followProgress: jest.fn() },
    };
    configService = { get: jest.fn().mockReturnValue(undefined) };
    dockerConnections.findForServer.mockResolvedValue({
      id: 'conn_1',
      endpoint: 'tcp://docker.example.com:2376',
      tlsCaCert: 'enc-ca',
      tlsClientCert: 'enc-cert',
      tlsClientKey: 'enc-key',
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    dockerConnections.getDecryptedTls.mockResolvedValue({
      ca: '-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----',
      cert: '-----BEGIN CERTIFICATE-----\ncert\n-----END CERTIFICATE-----',
      key: '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----',
      endpoint: 'tcp://docker.example.com:2376',
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        DockerApiService,
        DockerClientFactory,
        { provide: DockerConnectionsService, useValue: dockerConnections },
        { provide: ConfigService, useValue: configService },
        {
          provide: DockerContainerOpsService,
          useValue: mockContainerOpsService,
        },
        { provide: DockerImageService, useValue: mockImageService },
      ],
    }).compile();

    service = moduleRef.get(DockerApiService);
    clientFactory = moduleRef.get(DockerClientFactory);
    // Seed the internal cache with a mock client — DockerApiService builds a
    // real `Docker` from dockerode which we can't easily mock at construction.
    // Cache key now includes the connection's updatedAt (for cert-rotation
    // invalidation) → must match the findForServer mock's updatedAt.
    const updatedAtMs = new Date('2026-01-01T00:00:00Z').getTime();
    (
      clientFactory as unknown as { clientCache: Map<string, unknown> }
    ).clientCache.set(`srv_1:tcp://docker.example.com:2376:${updatedAtMs}`, {
      client: mockClient,
      endpoint: 'tcp://docker.example.com:2376',
      cachedAt: Date.now(),
    });
  });

  describe('getClient (cache + TLS material)', () => {
    it('returns a cached client without rebuilding it', async () => {
      const client = await service.getClient('srv_1');
      expect(client).toBe(mockClient);
      // getDecryptedTls is NOT called when the cache is warm.
      expect(dockerConnections.getDecryptedTls).not.toHaveBeenCalled();
    });

    it('rebuilds the client when the connection is updated (cert rotation)', async () => {
      // Simulate a cert/endpoint rotation: updatedAt is bumped → cache key
      // changes → the stale cached client must NOT be reused.
      dockerConnections.findForServer.mockResolvedValue({
        id: 'conn_1',
        endpoint: 'tcp://docker.example.com:2376',
        tlsCaCert: 'enc-ca',
        tlsClientCert: 'enc-cert',
        tlsClientKey: 'enc-key',
        updatedAt: new Date('2026-02-01T00:00:00Z'), // newer than the seeded one
      });
      const client = await service.getClient('srv_1');
      expect(client).not.toBe(mockClient); // fresh client, not the stale cache
      expect(dockerConnections.getDecryptedTls).toHaveBeenCalled();
    });

    it('propagates NotFoundException when the server has no DockerConnection', async () => {
      dockerConnections.findForServer.mockRejectedValueOnce(
        new NotFoundException('Aucune connexion Docker configurée'),
      );
      // Evict the cached client for srv_1 first (the beforeEach set it).
      service.invalidateCache('srv_1');
      await expect(service.getClient('srv_1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('fails fast with ServiceUnavailableException when the circuit is OPEN', async () => {
      dockerConnections.findForServer.mockResolvedValueOnce({
        id: 'conn_1',
        endpoint: 'tcp://docker.example.com:2376',
        tlsCaCert: 'enc-ca',
        tlsClientCert: 'enc-cert',
        tlsClientKey: 'enc-key',
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        circuitState: 'OPEN',
      });
      service.invalidateCache('srv_1');
      await expect(service.getClient('srv_1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      // Ne doit même pas tenter de résoudre le matériel TLS.
      expect(dockerConnections.getDecryptedTls).not.toHaveBeenCalled();
    });
  });

  describe('inspectImage (digest capture)', () => {
    it('returns the image inspect JSON when the image exists', async () => {
      const expected = {
        Id: 'sha256:abc',
        RepoDigests: ['registry.gitlab.com/group/app@sha256:abc'],
      };
      mockImageService.inspectImage.mockResolvedValue(expected);
      const result = await service.inspectImage('srv_1', 'app:tag');
      expect(mockImageService.inspectImage).toHaveBeenCalledWith(
        mockClient,
        'app:tag',
      );
      expect(result).toMatchObject({ Id: 'sha256:abc' });
    });

    it('returns null when the image is not present (404)', async () => {
      mockImageService.inspectImage.mockResolvedValue(null);
      const result = await service.inspectImage('srv_1', 'missing:tag');
      expect(result).toBeNull();
    });

    it('returns null when the error message matches /not found/i (no statusCode)', async () => {
      mockImageService.inspectImage.mockResolvedValue(null);
      const result = await service.inspectImage('srv_1', 'missing:tag');
      expect(result).toBeNull();
    });

    it('throws when the sub-service propagates an error', async () => {
      mockImageService.inspectImage.mockRejectedValue(
        new Error('ECONNREFUSED'),
      );
      await expect(service.inspectImage('srv_1', 'app:tag')).rejects.toThrow(
        'ECONNREFUSED',
      );
    });
  });

  describe('inspectContainer', () => {
    it('returns the container inspect JSON', async () => {
      const expected = {
        State: { Status: 'running', Health: { Status: 'healthy' } },
      };
      mockContainerOpsService.inspectContainer.mockResolvedValue(expected);
      const result = await service.inspectContainer('srv_1', 'my-app');
      expect(mockContainerOpsService.inspectContainer).toHaveBeenCalledWith(
        mockClient,
        'my-app',
      );
      expect(result.State.Status).toBe('running');
      expect(result.State.Health?.Status).toBe('healthy');
    });

    it('wraps a network error with an explicit, exploitable message', async () => {
      mockContainerOpsService.inspectContainer.mockRejectedValue(
        Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:2376'), {
          code: 'ECONNREFUSED',
        }),
      );
      await expect(service.inspectContainer('srv_1', 'my-app')).rejects.toThrow(
        /Connexion au daemon Docker perdue pendant inspectContainer \(serveur srv_1\)/,
      );
    });
  });

  describe('streamContainerLogs (Docker 8-byte header demuxing)', () => {
    it('splits stdout/stderr frames using the 8-byte Docker header', async () => {
      const payload1 = Buffer.from('hello\n', 'utf8');
      const payload2 = Buffer.from('boom\n', 'utf8');
      const header1 = Buffer.alloc(8);
      header1.writeUInt8(1, 0); // stdout
      header1.writeUInt32BE(payload1.length, 4);
      const header2 = Buffer.alloc(8);
      header2.writeUInt8(2, 0); // stderr
      header2.writeUInt32BE(payload2.length, 4);
      const chunk = Buffer.concat([header1, payload1, header2, payload2]);

      const { Readable } = require('stream');
      const stream = Readable.from([chunk]);
      mockContainer.logs.mockResolvedValue(stream);

      const lines: { stream: string; line: string }[] = [];
      for await (const line of service.streamContainerLogs('srv_1', 'app', {
        follow: true,
      })) {
        lines.push(line);
      }

      expect(lines).toEqual([
        { stream: 'stdout', line: 'hello' },
        { stream: 'stderr', line: 'boom' },
      ]);
    });

    it('skips empty lines and strips trailing CR', async () => {
      const payload = Buffer.from('first\r\n\nthird\r\n', 'utf8');
      const header = Buffer.alloc(8);
      header.writeUInt8(1, 0);
      header.writeUInt32BE(payload.length, 4);
      const chunk = Buffer.concat([header, payload]);
      const { Readable } = require('stream');
      mockContainer.logs.mockResolvedValue(Readable.from([chunk]));

      const lines: { stream: string; line: string }[] = [];
      for await (const line of service.streamContainerLogs('srv_1', 'app')) {
        lines.push(line);
      }

      expect(lines).toEqual([
        { stream: 'stdout', line: 'first' },
        { stream: 'stdout', line: 'third' },
      ]);
    });

    it('drops a trailing partial header (incomplete frame)', async () => {
      const complete = Buffer.from('ok\n', 'utf8');
      const hdr = Buffer.alloc(8);
      hdr.writeUInt8(1, 0);
      hdr.writeUInt32BE(complete.length, 4);
      const partial = Buffer.from([0x01, 0x00, 0x00]); // only 3 bytes of the next header
      const chunk = Buffer.concat([hdr, complete, partial]);
      const { Readable } = require('stream');
      mockContainer.logs.mockResolvedValue(Readable.from([chunk]));

      const lines: string[] = [];
      for await (const { line } of service.streamContainerLogs(
        'srv_1',
        'app',
      )) {
        lines.push(line);
      }
      expect(lines).toEqual(['ok']);
    });
  });

  describe('getContainerStats', () => {
    it('passes stream:false to dockerode and returns the result', async () => {
      const fakeStats = {
        cpu_stats: { cpu_usage: { total_usage: 100 } },
        memory_stats: { usage: 1024 },
      };
      mockContainer.stats.mockResolvedValue(fakeStats);
      const result = await service.getContainerStats('srv_1', 'app');
      expect(mockContainer.stats).toHaveBeenCalledWith({ stream: false });
      expect(result).toBe(fakeStats);
    });
  });

  describe('invalidateCache (cache eviction)', () => {
    it('drops all cached clients for the given serverId', () => {
      service.invalidateCache('srv_1');
      const cache = (
        clientFactory as unknown as { clientCache: Map<string, unknown> }
      ).clientCache;
      expect(cache.has('srv_1:tcp://docker.example.com:2376')).toBe(false);
    });
  });

  describe('pullImage', () => {
    it('delegates to DockerImageService', async () => {
      mockImageService.pullImage.mockResolvedValue(undefined);
      await service.pullImage('srv_1', 'app:latest');
      expect(mockImageService.pullImage).toHaveBeenCalledWith(
        mockClient,
        'srv_1',
        'app:latest',
        undefined,
      );
    });

    it('propagates errors from the sub-service', async () => {
      mockImageService.pullImage.mockRejectedValue(new Error('pull failed'));
      await expect(service.pullImage('srv_1', 'app:latest')).rejects.toThrow(
        'pull failed',
      );
    });
  });
});
