import { DockerfileGenerator } from './dockerfile.generator';

describe('DockerfileGenerator (per-language dispatch)', () => {
  const gen = new DockerfileGenerator();

  it.each([
    ['go', /golang:/i],
    ['golang', /golang:/i],
    ['python', /python:/i],
    ['django', /python:/i],
    ['php', /php:/i],
    ['ruby', /ruby:/i],
    ['rust', /rust:/i],
    ['nextjs', /node:/i],
    ['nestjs', /node:/i],
    ['static', /nginx/i],
    ['compose', /nginx/i],
  ])(
    'generate(%s) → a Dockerfile with the expected base image',
    (type, marker) => {
      const df = gen.generate(type, { port: 3000 });
      expect(df).toContain('FROM');
      expect(df).toMatch(marker);
    },
  );

  it('is case-insensitive (NESTJS == nestjs)', () => {
    expect(gen.generate('NESTJS', {})).toBe(gen.generate('nestjs', {}));
  });

  it('falls back to the default Dockerfile for an unknown type (no throw)', () => {
    const df = gen.generate('brainfuck', { port: 8080 });
    expect(df).toContain('FROM');
  });
});
