import { runsBackgroundWork } from './process-role.util';

describe('process-role.util — runsBackgroundWork', () => {
  const original = process.env.PROCESS_ROLE;
  afterEach(() => {
    if (original === undefined) delete process.env.PROCESS_ROLE;
    else process.env.PROCESS_ROLE = original;
  });

  it('defaults to true when PROCESS_ROLE is unset (single-process "all")', () => {
    delete process.env.PROCESS_ROLE;
    expect(runsBackgroundWork()).toBe(true);
  });

  it('is true for the explicit "all" role', () => {
    process.env.PROCESS_ROLE = 'all';
    expect(runsBackgroundWork()).toBe(true);
  });

  it('is true for the "worker" role', () => {
    process.env.PROCESS_ROLE = 'worker';
    expect(runsBackgroundWork()).toBe(true);
  });

  it('is false for the "api" role (no crons, no queue consumers)', () => {
    process.env.PROCESS_ROLE = 'api';
    expect(runsBackgroundWork()).toBe(false);
  });

  it('is case-insensitive and trims whitespace', () => {
    process.env.PROCESS_ROLE = '  API  ';
    expect(runsBackgroundWork()).toBe(false);
  });

  it('falls back to background work for an unrecognized value', () => {
    process.env.PROCESS_ROLE = 'nonsense';
    expect(runsBackgroundWork()).toBe(true);
  });
});
