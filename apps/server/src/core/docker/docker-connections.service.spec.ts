import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DockerConnectionsService } from './docker-connections.service';
import { PrismaService } from '../database/prisma.service';
import { CryptoService } from '../crypto/crypto.service';

/**
 * DockerConnection. The service is responsible for:
 *   - CRUD over the connection row
 *   - Encrypting TLS material at rest (via CryptoService)
 *   - Rejecting malformed endpoints and warning on insecure port 2375
 *   - Synchronous reachability probe over TLS (skipped in unit tests —
 *     we mock the underlying `findForServer` to return a known config
 *     and let the probe fail fast on an unreachable host)
 */
describe('DockerConnectionsService', () => {
  let service: DockerConnectionsService;
  let prisma: { dockerConnection: { findUnique: jest.Mock; upsert: jest.Mock; findMany: jest.Mock; delete: jest.Mock; update: jest.Mock } };
  let crypto: { encrypt: jest.Mock; decrypt: jest.Mock };

  beforeEach(async () => {
    prisma = {
      dockerConnection: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
        update: jest.fn(),
      },
    };
    crypto = {
      encrypt: jest.fn((v: string) => `enc:${v}`),
      decrypt: jest.fn((v: string) => v.replace(/^enc:/, '')),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DockerConnectionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(DockerConnectionsService);
  });

  describe('parseEndpoint', () => {
    it('parses tcp://host:port', () => {
      expect(service.parseEndpoint('tcp://10.0.0.1:2376')).toEqual({
        host: '10.0.0.1',
        port: 2376,
      });
    });
    it('parses tcp://[ipv6]:port', () => {
      expect(service.parseEndpoint('tcp://[fe80::1]:2376')).toEqual({
        host: 'fe80::1',
        port: 2376,
      });
    });
    it('rejects http://', () => {
      expect(() => service.parseEndpoint('http://10.0.0.1:2375')).toThrow(
        BadRequestException,
      );
    });
    it('rejects a missing port', () => {
      expect(() => service.parseEndpoint('tcp://10.0.0.1')).toThrow(
        BadRequestException,
      );
    });
    it('rejects a non-numeric port', () => {
      expect(() => service.parseEndpoint('tcp://10.0.0.1:abc')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('upsert', () => {
    it('encrypts the 3 TLS blobs before persisting', async () => {
      prisma.dockerConnection.upsert.mockResolvedValue({ id: 'conn_1' });
      await service.upsert({
        serverId: 'srv_1',
        endpoint: 'tcp://10.0.0.1:2376',
        tlsCaCert: 'CA',
        tlsClientCert: 'CERT',
        tlsClientKey: 'KEY',
      });
      expect(crypto.encrypt).toHaveBeenCalledTimes(3);
      const data = prisma.dockerConnection.upsert.mock.calls[0][0].create;
      expect(data.tlsCaCert).toBe('enc:CA');
      expect(data.tlsClientCert).toBe('enc:CERT');
      expect(data.tlsClientKey).toBe('enc:KEY');
    });

    it('does not throw on port 2375 (warns only)', async () => {
      prisma.dockerConnection.upsert.mockResolvedValue({});
      await expect(
        service.upsert({
          serverId: 'srv_1',
          endpoint: 'tcp://10.0.0.1:2375',
          tlsCaCert: 'CA',
          tlsClientCert: 'CERT',
          tlsClientKey: 'KEY',
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('findForServer', () => {
    it('throws NotFoundException when no row exists', async () => {
      prisma.dockerConnection.findUnique.mockResolvedValue(null);
      await expect(service.findForServer('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getDecryptedTls', () => {
    it('returns decrypted material for internal callers only', async () => {
      prisma.dockerConnection.findUnique.mockResolvedValue({
        id: 'c1',
        serverId: 'srv_1',
        endpoint: 'tcp://10.0.0.1:2376',
        tlsCaCert: 'enc:CA',
        tlsClientCert: 'enc:CERT',
        tlsClientKey: 'enc:KEY',
        apiVersion: '1.45',
        lastCheckedAt: null,
        isReachable: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const tls = await service.getDecryptedTls('srv_1');
      expect(tls).toEqual({
        ca: 'CA',
        cert: 'CERT',
        key: 'KEY',
        endpoint: 'tcp://10.0.0.1:2376',
      });
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the row does not exist', async () => {
      const err = Object.assign(new Error('not found'), { code: 'P2025' });
      prisma.dockerConnection.delete.mockRejectedValue(err);
      await expect(service.remove('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
