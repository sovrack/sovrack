import { serializeBigInts } from './bigint.interceptor';

describe('serializeBigInts', () => {
  it('converts nested bigints to string', () => {
    const input = {
      projectId: 'p1',
      gitlabId: BigInt('1234567890123456789'),
      nested: {
        values: [1, BigInt(42), { pipelineId: 9007199254740993n }],
      },
    };

    const result = serializeBigInts(input) as {
      gitlabId: string;
      nested: { values: Array<number | string | { pipelineId: string }> };
    };

    expect(result.gitlabId).toBe('1234567890123456789');
    expect(result.nested.values[1]).toBe('42');
    expect(result.nested.values[2]).toEqual({
      pipelineId: '9007199254740993',
    });
  });

  it('leaves non-plain objects unchanged (e.g. Date)', () => {
    const date = new Date('2026-05-07T12:00:00.000Z');
    const output = serializeBigInts({ createdAt: date }) as { createdAt: Date };

    expect(output.createdAt).toBe(date);
  });
});
