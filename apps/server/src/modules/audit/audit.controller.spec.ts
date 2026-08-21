import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

describe('AuditController', () => {
  it('findAll delegates to the audit service', async () => {
    const auditLogsService = {
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    } as unknown as AuditService;
    const ctrl = new AuditController(auditLogsService);
    await ctrl.findAll('workspace-1', { page: 1, pageSize: 20 } as never);
    expect(auditLogsService.findAll).toHaveBeenCalledWith('workspace-1', {
      page: 1,
      pageSize: 20,
    });
  });
});
