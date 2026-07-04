import { ServerPreparationProfile } from '@prisma/client';
import type { StartServerPreparationDto } from '../dto/start-server-preparation.dto';
import {
  PREPARATION_PROFILE_DEFAULTS,
  resolvePreparationOptions,
} from './server-preparation-options';

// Mission docker_tls (T1): the Docker TLS Connection option is selectable in
// the Setup Server flow, depends on Docker Engine, and maps to the docker_tls
// role that runs right after docker.
describe('resolvePreparationOptions — dockerTls', () => {
  const dto = (over: Partial<StartServerPreparationDto>) =>
    ({
      profile: ServerPreparationProfile.CUSTOM,
      ...over,
    }) as StartServerPreparationDto;

  it('selecting dockerTls auto-enables its docker dependency', () => {
    const resolved = resolvePreparationOptions(dto({ dockerTls: true }));
    expect(resolved.selectedOptions.dockerTls).toBe(true);
    expect(resolved.selectedOptions.docker).toBe(true);
    expect(resolved.roles).toContain('docker_tls');
    expect(resolved.roles).toContain('docker');
  });

  it('runs docker_tls AFTER docker in the role order', () => {
    const resolved = resolvePreparationOptions(dto({ dockerTls: true }));
    expect(resolved.roles.indexOf('docker_tls')).toBeGreaterThan(
      resolved.roles.indexOf('docker'),
    );
  });

  it('docker alone does NOT drag docker_tls in (opt-in per selection)', () => {
    const resolved = resolvePreparationOptions(dto({ docker: true }));
    expect(resolved.roles).not.toContain('docker_tls');
  });

  it('is enabled by default on every profile that installs Docker', () => {
    for (const profile of ['BASIC', 'WEB', 'RUNNER', 'FULL'] as const) {
      expect(PREPARATION_PROFILE_DEFAULTS[profile].dockerTls).toBe(true);
    }
    expect(PREPARATION_PROFILE_DEFAULTS.DATABASE.dockerTls).toBeUndefined();
  });

  it('an explicit dockerTls:false overrides the profile default', () => {
    const resolved = resolvePreparationOptions({
      profile: ServerPreparationProfile.BASIC,
      dockerTls: false,
    } as StartServerPreparationDto);
    expect(resolved.roles).not.toContain('docker_tls');
    expect(resolved.roles).toContain('docker');
  });
});
