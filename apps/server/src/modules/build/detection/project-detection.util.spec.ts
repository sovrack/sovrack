import {
  containsAny,
  detectPackageManager,
  isMultiStageDockerfile,
  mergeDependencies,
  parseJsonSafely,
  resolvePythonPackageManager,
  type ParsedProjectSignals,
} from './project-detection.util';

const signals = (
  over: Partial<ParsedProjectSignals> = {},
): ParsedProjectSignals => ({
  packageJson: null,
  requirementsTxt: null,
  pyprojectToml: null,
  composerJson: null,
  goMod: null,
  pomXml: null,
  buildGradle: null,
  dockerfile: null,
  dockerCompose: null,
  ...over,
});

describe('project-detection.util', () => {
  describe('detectPackageManager', () => {
    it('priority pnpm > yarn > bun > npm', () => {
      expect(detectPackageManager(new Set(['pnpm-lock.yaml']), signals())).toBe(
        'pnpm',
      );
      expect(detectPackageManager(new Set(['yarn.lock']), signals())).toBe(
        'yarn',
      );
      expect(detectPackageManager(new Set(['bun.lockb']), signals())).toBe(
        'bun',
      );
      expect(
        detectPackageManager(new Set(['package-lock.json']), signals()),
      ).toBe('npm');
    });
    it('npm si package.json sans lockfile, sinon unknown', () => {
      expect(
        detectPackageManager(new Set(), signals({ packageJson: {} })),
      ).toBe('npm');
      expect(detectPackageManager(new Set(), signals())).toBe('unknown');
    });
  });

  describe('resolvePythonPackageManager', () => {
    it('poetry / pipenv / pip / unknown', () => {
      expect(
        resolvePythonPackageManager(new Set(['poetry.lock']), signals()),
      ).toBe('poetry');
      expect(resolvePythonPackageManager(new Set(['pipfile']), signals())).toBe(
        'pipenv',
      );
      expect(
        resolvePythonPackageManager(
          new Set(),
          signals({ requirementsTxt: 'x' }),
        ),
      ).toBe('pip');
      expect(resolvePythonPackageManager(new Set(), signals())).toBe('unknown');
    });
  });

  describe('mergeDependencies', () => {
    it('fusionne deps + devDeps', () => {
      expect(
        [
          ...mergeDependencies({
            dependencies: { a: '1' },
            devDependencies: { b: '2' },
          }),
        ].sort(),
      ).toEqual(['a', 'b']);
    });
    it('null → Set vide', () => {
      expect(mergeDependencies(null).size).toBe(0);
    });
  });

  describe('parseJsonSafely', () => {
    it('parse / null sur invalide ou vide', () => {
      expect(parseJsonSafely<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
      expect(parseJsonSafely('nope')).toBeNull();
      expect(parseJsonSafely(null)).toBeNull();
    });
  });

  describe('containsAny', () => {
    it('case-insensitive + null', () => {
      expect(containsAny('Hello World', ['world'])).toBe(true);
      expect(containsAny('abc', ['xyz'])).toBe(false);
      expect(containsAny(null, ['x'])).toBe(false);
    });
  });

  describe('isMultiStageDockerfile', () => {
    it('true si ≥2 FROM', () => {
      expect(isMultiStageDockerfile('FROM node AS b\nFROM nginx')).toBe(true);
      expect(isMultiStageDockerfile('FROM node')).toBe(false);
      expect(isMultiStageDockerfile(null)).toBe(false);
    });
  });
});
