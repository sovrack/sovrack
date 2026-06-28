import {
  DOCKER_CAPABILITY_KEY,
  RUNNER_CAPABILITY_KEY,
  hasServerCapability,
  serverHasDocker,
  serverHasRunner,
} from './server-capabilities.util';

describe('hasServerCapability', () => {
  it("returns true only when the key is the string 'true'", () => {
    expect(
      hasServerCapability(
        { 'docker.installed': 'true' },
        DOCKER_CAPABILITY_KEY,
      ),
    ).toBe(true);
    expect(
      hasServerCapability(
        { 'docker.installed': 'false' },
        DOCKER_CAPABILITY_KEY,
      ),
    ).toBe(false);
    expect(
      hasServerCapability({ 'docker.installed': true }, DOCKER_CAPABILITY_KEY),
    ).toBe(false);
  });

  it('returns false for missing key, null, array or non-object', () => {
    expect(hasServerCapability({}, DOCKER_CAPABILITY_KEY)).toBe(false);
    expect(hasServerCapability(null, DOCKER_CAPABILITY_KEY)).toBe(false);
    expect(hasServerCapability(undefined, DOCKER_CAPABILITY_KEY)).toBe(false);
    expect(hasServerCapability([], DOCKER_CAPABILITY_KEY)).toBe(false);
    expect(hasServerCapability('nope', DOCKER_CAPABILITY_KEY)).toBe(false);
  });
});

describe('serverHasDocker / serverHasRunner', () => {
  it('reads the right capability keys', () => {
    const server = {
      capabilities: {
        [DOCKER_CAPABILITY_KEY]: 'true',
        [RUNNER_CAPABILITY_KEY]: 'false',
      },
    };
    expect(serverHasDocker(server)).toBe(true);
    expect(serverHasRunner(server)).toBe(false);
  });

  it('defaults to false when capabilities is null (server not yet detected)', () => {
    expect(serverHasDocker({ capabilities: null })).toBe(false);
    expect(serverHasRunner({ capabilities: null })).toBe(false);
  });
});
