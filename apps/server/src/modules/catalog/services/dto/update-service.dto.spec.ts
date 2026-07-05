import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateServiceDto } from './update-service.dto';

// Task 4 ("Sécurité database + UI" mission): the frontend clears external
// exposure by sending `externalPort: null`. This confirms (a) IsOptional lets
// an explicit null through validation, and (b) @Type(() => Number) does NOT
// coerce that null into 0 — otherwise "disable external access" would silently
// publish the DB on host port 0. A service-layer unit test can't catch this
// since it bypasses NestJS's ValidationPipe / class-transformer entirely.
describe('UpdateServiceDto — externalPort (Task 4)', () => {
  it('lets an explicit null through and keeps it null (clears external exposure)', async () => {
    const instance = plainToInstance(UpdateServiceDto, { externalPort: null });
    const errors = await validate(instance);
    expect(errors).toHaveLength(0);
    expect(instance.externalPort).toBeNull();
  });

  it('accepts and coerces a numeric string to a number', async () => {
    const instance = plainToInstance(UpdateServiceDto, {
      externalPort: '5433',
    });
    const errors = await validate(instance);
    expect(errors).toHaveLength(0);
    expect(instance.externalPort).toBe(5433);
  });

  it('rejects an out-of-range port', async () => {
    const instance = plainToInstance(UpdateServiceDto, { externalPort: 70000 });
    const errors = await validate(instance);
    expect(errors.length).toBeGreaterThan(0);
  });
});
