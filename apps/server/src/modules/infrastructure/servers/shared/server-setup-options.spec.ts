import { ServerPreparationProfile } from '@prisma/client';
import type { StartServerSetupDto } from '../dto/start-server-setup.dto';
import {
  SETUP_PROFILE_DEFAULTS,
  resolveSetupOptions,
} from './server-setup-options';

// Mission docker_tls (T1): the Docker TLS Connection option is selectable in
// the Setup Server flow, depends on Docker Engine, and maps to the docker_tls
// role that runs right after docker.
describe('resolveSetupOptions — dockerTls', () => {
  const dto = (over: Partial<StartServerSetupDto>) =>
    ({
      profile: ServerPreparationProfile.CUSTOM,
      ...over,
    }) as StartServerSetupDto;

  it('selecting dockerTls auto-enables its docker dependency', () => {
    const resolved = resolveSetupOptions(dto({ dockerTls: true }));
    expect(resolved.selectedOptions.dockerTls).toBe(true);
    expect(resolved.selectedOptions.docker).toBe(true);
    expect(resolved.roles).toContain('docker_tls');
    expect(resolved.roles).toContain('docker');
  });

  it('runs docker_tls AFTER docker in the role order', () => {
    const resolved = resolveSetupOptions(dto({ dockerTls: true }));
    expect(resolved.roles.indexOf('docker_tls')).toBeGreaterThan(
      resolved.roles.indexOf('docker'),
    );
  });

  it('docker alone does NOT drag docker_tls in (opt-in per selection)', () => {
    const resolved = resolveSetupOptions(dto({ docker: true }));
    expect(resolved.roles).not.toContain('docker_tls');
  });

  it('is enabled by default on every profile that installs Docker', () => {
    for (const profile of ['BASIC', 'WEB', 'RUNNER', 'FULL'] as const) {
      expect(SETUP_PROFILE_DEFAULTS[profile].dockerTls).toBe(true);
    }
    expect(SETUP_PROFILE_DEFAULTS.DATABASE.dockerTls).toBeUndefined();
  });

  it('an explicit dockerTls:false overrides the profile default', () => {
    const resolved = resolveSetupOptions({
      profile: ServerPreparationProfile.BASIC,
      dockerTls: false,
    } as StartServerSetupDto);
    expect(resolved.roles).not.toContain('docker_tls');
    expect(resolved.roles).toContain('docker');
  });
});
