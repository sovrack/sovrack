import { ServerConnectionMode } from '@prisma/client';
import { ServersSshService } from './servers-ssh.service';
import { ServerConnectionModeDto } from '../dto/create-server.dto';

describe('ServersSshService', () => {
  const prismaMock = {};
  const cryptoMock = {};
  const verificationMock = {};
  const service = new ServersSshService(
    prismaMock as never,
    cryptoMock as never,
    verificationMock as never,
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
