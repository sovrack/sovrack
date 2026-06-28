import { toDockerResourceConfig } from './resource-limits.util';

describe('toDockerResourceConfig', () => {
  it('maps CPU cores to NanoCpus and MB to bytes', () => {
    expect(toDockerResourceConfig({ cpuLimit: 0.5, memLimitMb: 512 })).toEqual({
      NanoCpus: 500_000_000,
      Memory: 536_870_912,
    });
  });

  it('rounds fractional NanoCpus', () => {
    // 0.1 cores * 1e9 = 100000000 exactly, but 0.3 introduces float drift.
    expect(toDockerResourceConfig({ cpuLimit: 0.3 }).NanoCpus).toBe(
      300_000_000,
    );
  });

  it('omits unlimited fields (null / undefined / zero / negative)', () => {
    expect(toDockerResourceConfig({})).toEqual({});
    expect(toDockerResourceConfig(null)).toEqual({});
    expect(toDockerResourceConfig(undefined)).toEqual({});
    expect(toDockerResourceConfig({ cpuLimit: 0, memLimitMb: 0 })).toEqual({});
    expect(toDockerResourceConfig({ cpuLimit: -1, memLimitMb: -5 })).toEqual(
      {},
    );
  });

  it('applies one limit independently of the other', () => {
    expect(toDockerResourceConfig({ cpuLimit: 2 })).toEqual({
      NanoCpus: 2_000_000_000,
    });
    expect(toDockerResourceConfig({ memLimitMb: 256 })).toEqual({
      Memory: 268_435_456,
    });
  });
});
