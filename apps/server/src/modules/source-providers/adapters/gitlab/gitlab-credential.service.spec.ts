import { SourceType } from '@prisma/client';
import { CryptoService } from '../../../../shared/crypto/crypto.service';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { GitlabCredentialService } from './gitlab-credential.service';
import type { GitlabResolvedConfig } from './gitlab.types';

function makeSvc() {
  const crypto = {
    decrypt: jest.fn((v: string) => `dec:${v}`),
  } as unknown as CryptoService;
  const prisma = {} as unknown as PrismaService;
  return { svc: new GitlabCredentialService(prisma, crypto), crypto };
}

const baseConfig: GitlabResolvedConfig = {
  providerUrl: 'https://gitlab.example.com',
  providerToken: 'enc-token',
  registryUrl: null,
  deployTokenUsername: null,
  deployTokenValue: null,
};

describe('GitlabCredentialService', () => {
  describe('resolveRegistryCredentialsFromConfig', () => {
    it('uses deploy token when it has a valid gldt- prefix and username', () => {
      const config: GitlabResolvedConfig = {
        ...baseConfig,
        deployTokenUsername: 'mydeployuser',
        deployTokenValue: 'enc-gldt-token',
        providerToken: 'enc-oauth',
      };
      // dec:enc-gldt-token starts with gldt- prefix → valid
      const { svc: svcLocal, crypto } = makeSvc();
      crypto.decrypt.mockImplementation((v: string) => {
        if (v === 'enc-gldt-token') return 'gldt-validtoken12345';
        return `dec:${v}`;
      });
      const creds = svcLocal.resolveRegistryCredentialsFromConfig(config);
      expect(creds.username).toBe('mydeployuser');
      expect(creds.password).toBe('gldt-validtoken12345');
    });

    it('falls back to oauth2 when deploy token is too short', () => {
      const { svc, crypto } = makeSvc();
      crypto.decrypt.mockImplementation((v: string) => {
        if (v === 'enc-short') return 'short'; // < 10 chars
        return `dec:${v}`;
      });
      const config: GitlabResolvedConfig = {
        ...baseConfig,
        deployTokenUsername: 'user',
        deployTokenValue: 'enc-short',
      };
      const creds = svc.resolveRegistryCredentialsFromConfig(config);
      expect(creds.username).toBe('oauth2');
    });

    it('uses oauth2 / gitlabToken when no deployTokenValue', () => {
      const { svc } = makeSvc();
      const creds = svc.resolveRegistryCredentialsFromConfig(baseConfig);
      expect(creds.username).toBe('oauth2');
      expect(creds.password).toBe('dec:enc-token');
    });

    it('derives registryUrl from providerUrl when registryUrl is null', () => {
      const { svc } = makeSvc();
      const creds = svc.resolveRegistryCredentialsFromConfig(baseConfig);
      expect(creds.registryUrl).toBeTruthy();
    });

    it('uses explicit registryUrl when set', () => {
      const { svc } = makeSvc();
      const config: GitlabResolvedConfig = {
        ...baseConfig,
        registryUrl: 'registry.example.com',
      };
      const creds = svc.resolveRegistryCredentialsFromConfig(config);
      expect(creds.registryUrl).toBe('registry.example.com');
    });
  });

  describe('resolveRegistryHost', () => {
    it('returns trimmed registryUrl when provided', () => {
      const { svc } = makeSvc();
      const host = svc.resolveRegistryHost(
        'https://registry.example.com/',
        'https://gitlab.example.com',
      );
      expect(host).toBe('registry.example.com');
    });

    it('returns registry.gitlab.com for gitlab.com SaaS', () => {
      const { svc } = makeSvc();
      const host = svc.resolveRegistryHost(null, 'https://gitlab.com');
      expect(host).toBe('registry.gitlab.com');
    });

    it('returns <hostname>:5050 for self-hosted GitLab with no port', () => {
      const { svc } = makeSvc();
      const host = svc.resolveRegistryHost(null, 'https://git.company.io');
      expect(host).toBe('git.company.io:5050');
    });

    it('returns <hostname>:<port> for self-hosted GitLab with a port', () => {
      const { svc } = makeSvc();
      const host = svc.resolveRegistryHost(null, 'https://git.company.io:8080');
      expect(host).toBe('git.company.io:8080');
    });

    it('handles invalid URL gracefully', () => {
      const { svc } = makeSvc();
      const host = svc.resolveRegistryHost(null, 'not-a-url');
      expect(typeof host).toBe('string');
    });
  });

  describe('cleanHost', () => {
    it('strips https:// prefix', () => {
      const { svc } = makeSvc();
      expect(svc.cleanHost('https://registry.example.com/')).toBe(
        'registry.example.com',
      );
    });

    it('strips http:// prefix', () => {
      const { svc } = makeSvc();
      expect(svc.cleanHost('http://registry.example.com')).toBe(
        'registry.example.com',
      );
    });

    it('strips trailing slashes', () => {
      const { svc } = makeSvc();
      expect(svc.cleanHost('registry.example.com/')).toBe(
        'registry.example.com',
      );
    });
  });

  describe('extractRegistryUrl', () => {
    it('extracts host from a valid URL', () => {
      const { svc } = makeSvc();
      expect(svc.extractRegistryUrl('https://gitlab.example.com')).toBe(
        'gitlab.example.com',
      );
    });

    it('returns the raw value for an invalid URL', () => {
      const { svc } = makeSvc();
      expect(svc.extractRegistryUrl('not-a-url')).toBe('not-a-url');
    });
  });

  describe('extractPathFromUrl', () => {
    it('extracts the path from a valid GitLab URL', () => {
      const { svc } = makeSvc();
      expect(svc.extractPathFromUrl('https://gitlab.com/group/repo.git')).toBe(
        'group/repo',
      );
    });

    it('strips .git suffix', () => {
      const { svc } = makeSvc();
      expect(svc.extractPathFromUrl('https://gitlab.com/a/b.git')).toBe('a/b');
    });

    it('returns null for root path', () => {
      const { svc } = makeSvc();
      expect(svc.extractPathFromUrl('https://gitlab.com/')).toBeNull();
    });

    it('returns null for an invalid URL', () => {
      const { svc } = makeSvc();
      expect(svc.extractPathFromUrl('not-a-url')).toBeNull();
    });
  });

  describe('isPlaceholderPath', () => {
    it('returns true for a project placeholder path', () => {
      const { svc } = makeSvc();
      expect(svc.isPlaceholderPath({ externalId: 42 }, 'project-42/repo')).toBe(
        true,
      );
    });

    it('returns true for a group placeholder path', () => {
      const { svc } = makeSvc();
      expect(
        svc.isPlaceholderPath({ externalGroupId: 7 }, 'group-7/project'),
      ).toBe(true);
    });

    it('returns false for a real path', () => {
      const { svc } = makeSvc();
      expect(
        svc.isPlaceholderPath(
          { externalId: 42, sourceType: SourceType.GIT_PROVIDER },
          'group/real-repo',
        ),
      ).toBe(false);
    });
  });
});
