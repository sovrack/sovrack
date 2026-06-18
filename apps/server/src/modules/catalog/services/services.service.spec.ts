import { Role } from '@prisma/client';
import { ServicesService } from './services.service';
import { PrismaService } from '../../../core/database/prisma.service';

describe('ServicesService — soft-delete name collision', () => {
  const projectId = 'project-1';
  const serviceId = 'service-1';

  function buildService(updateSpy: jest.Mock) {
    const prisma = {
      project: {
        findUnique: jest.fn().mockResolvedValue({ id: projectId }),
      },
      service: {
        findFirst: jest.fn().mockResolvedValue({ id: serviceId }),
        findUnique: jest.fn().mockResolvedValue({ name: 'api' }),
        update: updateSpy,
      },
    } as unknown as PrismaService;

    return new ServicesService(prisma, {} as never, {} as never);
  }

  it('archiving a service suffixes its name so the original name is freed', async () => {
    const update = jest.fn().mockResolvedValue({});
    const service = buildService(update);

    await service.remove(projectId, serviceId, 'user-1', Role.ADMIN);

    expect(update).toHaveBeenCalledTimes(1);
    const data = update.mock.calls[0][0].data;
    expect(data.archivedAt).toBeInstanceOf(Date);
    expect(data.name).not.toBe('api');
    expect(data.name).toMatch(/^api_archived_\d+$/);
  });

  it('frees the (projectId, name) unique slot so the same name can be recreated', async () => {
    const update = jest.fn().mockResolvedValue({});
    const service = buildService(update);

    await service.remove(projectId, serviceId, 'user-1', Role.ADMIN);

    // After archiving, the stored name no longer equals "api", so a new
    // service named "api" in the same project would not hit @@unique.
    const archivedName = update.mock.calls[0][0].data.name as string;
    expect(archivedName.startsWith('api_archived_')).toBe(true);
    expect(archivedName).not.toBe('api');
  });
});
