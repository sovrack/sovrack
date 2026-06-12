import { ServerConnectionMode } from '@prisma/client';
import { ServersConnectionService } from './servers-connection.service';
import { ServerConnectionModeDto } from '../dto/create-server.dto';

describe('ServersConnectionService', () => {
  const prismaMock = {};
  const cryptoMock = {};
  const verificationMock = {};
  const hostKeyMock = {};
  const configMock = { get: jest.fn() };
  const sshExecutorMock = {};
  const service = new ServersConnectionService(
    prismaMock as never,
    cryptoMock as never,
    hostKeyMock as never,
    verificationMock as never,
    configMock as never,
    sshExecutorMock as never,
  );

  describe('mapConnectionMode', () => {
    it('defaults to SSH when mode is not provided', () => {
      expect(service.mapConnectionMode(undefined)).toBe(
        ServerConnectionMode.SSH,
      );
    });

    it('always returns SSH mode', () => {
      expect(service.mapConnectionMode(ServerConnectionModeDto.SSH)).toBe(
        ServerConnectionMode.SSH,
      );
      expect(service.mapConnectionMode(undefined)).toBe(
        ServerConnectionMode.SSH,
      );
    });
  });
});
