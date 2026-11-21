import { DomainsService } from './domains.service';
import { DomainsController } from './domains.controller';

describe('DomainsController', () => {
  function build() {
    const domainsService = {
      listProviders: jest.fn().mockResolvedValue([]),
      createProvider: jest.fn().mockResolvedValue({ id: 'pr1' }),
      testProvider: jest.fn().mockResolvedValue({ ok: true }),
      listDomains: jest.fn().mockResolvedValue([]),
      createDomain: jest.fn().mockResolvedValue({ id: 'd1' }),
      removeDomain: jest.fn().mockResolvedValue(undefined),
      verifyDomain: jest.fn().mockResolvedValue({ verified: true }),
      listRecords: jest.fn().mockResolvedValue([]),
      createRecord: jest.fn().mockResolvedValue({ id: 'rec1' }),
      updateRecord: jest.fn().mockResolvedValue({ id: 'rec1' }),
      removeRecord: jest.fn().mockResolvedValue(undefined),
    } as unknown as DomainsService;
    const ctrl = new DomainsController(domainsService);
    return { ctrl, domainsService };
  }

  it('provider endpoints delegate', async () => {
    const { ctrl, domainsService } = build();
    await ctrl.listProviders('workspace-1');
    await ctrl.createProvider({ name: 'n' } as never, 'workspace-1');
    await ctrl.testProvider('pr1', 'workspace-1');
    expect(domainsService.listProviders).toHaveBeenCalledWith('workspace-1');
    expect(domainsService.createProvider).toHaveBeenCalledWith(
      { name: 'n' },
      'workspace-1',
    );
    expect(domainsService.testProvider).toHaveBeenCalledWith(
      'pr1',
      'workspace-1',
    );
  });

  it('domain endpoints delegate', async () => {
    const { ctrl, domainsService } = build();
    await ctrl.listDomains('workspace-1', 'p1', 'se1');
    await ctrl.createDomain({ name: 'd.com' }, 'workspace-1');
    expect(await ctrl.removeDomain('d1', 'workspace-1')).toEqual({
      deleted: true,
    });
    await ctrl.verifyDomain('d1', 'workspace-1');
    expect(domainsService.listDomains).toHaveBeenCalledWith(
      'workspace-1',
      'p1',
      'se1',
    );
    expect(domainsService.createDomain).toHaveBeenCalledWith(
      { name: 'd.com' },
      'workspace-1',
    );
    expect(domainsService.removeDomain).toHaveBeenCalledWith(
      'd1',
      'workspace-1',
    );
    expect(domainsService.verifyDomain).toHaveBeenCalledWith(
      'd1',
      'workspace-1',
    );
  });

  it('record endpoints delegate', async () => {
    const { ctrl, domainsService } = build();
    await ctrl.listRecords('d1', 'workspace-1');
    await ctrl.createRecord('d1', { type: 'A' } as never, 'workspace-1');
    await ctrl.updateRecord('rec1', { type: 'A' } as never, 'workspace-1');
    const res = await ctrl.removeRecord('rec1', 'workspace-1');
    expect(domainsService.listRecords).toHaveBeenCalledWith(
      'd1',
      'workspace-1',
    );
    expect(domainsService.createRecord).toHaveBeenCalledWith(
      'd1',
      {
        type: 'A',
      },
      'workspace-1',
    );
    expect(domainsService.updateRecord).toHaveBeenCalledWith(
      'rec1',
      {
        type: 'A',
      },
      'workspace-1',
    );
    expect(domainsService.removeRecord).toHaveBeenCalledWith(
      'rec1',
      'workspace-1',
    );
    expect(res).toEqual({ message: 'Record DNS supprimé avec succès' });
  });
});
