import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateServiceEnvironmentDto } from './update-service-environment.dto';

// C6: confirms IsOptional's actual behavior (read from the installed
// class-validator source: skips validation when the value is null OR
// undefined, not just undefined) — the frontend relies on sending an
// explicit `null` to clear an override back to "inherit from the Service".
// A plain unit test of the service alone can't catch a regression here since
// it bypasses NestJS's ValidationPipe entirely.
describe('UpdateServiceEnvironmentDto — explicit null clears an override (C6)', () => {
  it.each(['branch', 'port', 'startCommand', 'healthcheckPath', 'buildPack'])(
    'passes validation when %s is explicitly null',
    async (field) => {
      const instance = plainToInstance(UpdateServiceEnvironmentDto, {
        [field]: null,
      });
      const errors = await validate(instance);
      expect(errors).toHaveLength(0);
      expect((instance as unknown as Record<string, unknown>)[field]).toBeNull();
    },
  );

  it('still rejects an invalid non-null value (buildPack must be a real enum member)', async () => {
    const instance = plainToInstance(UpdateServiceEnvironmentDto, {
      buildPack: 'NOT_A_REAL_BUILDPACK',
    });
    const errors = await validate(instance);
    expect(errors.length).toBeGreaterThan(0);
  });
});
