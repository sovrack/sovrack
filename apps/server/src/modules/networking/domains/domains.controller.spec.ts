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
    await ctrl.listProviders();
    await ctrl.createProvider({ name: 'n' } as never);
    await ctrl.testProvider('pr1');
    expect(domainsService.listProviders).toHaveBeenCalled();
    expect(domainsService.createProvider).toHaveBeenCalledWith({ name: 'n' });
    expect(domainsService.testProvider).toHaveBeenCalledWith('pr1');
  });

  it('domain endpoints delegate', async () => {
    const { ctrl, domainsService } = build();
    await ctrl.listDomains('p1', 'se1');
    await ctrl.createDomain({ name: 'd.com' } as never);
    expect(await ctrl.removeDomain('d1')).toEqual({ deleted: true });
    await ctrl.verifyDomain('d1');
    expect(domainsService.listDomains).toHaveBeenCalledWith('p1', 'se1');
    expect(domainsService.createDomain).toHaveBeenCalledWith({ name: 'd.com' });
    expect(domainsService.removeDomain).toHaveBeenCalledWith('d1');
    expect(domainsService.verifyDomain).toHaveBeenCalledWith('d1');
  });

  it('record endpoints delegate', async () => {
    const { ctrl, domainsService } = build();
    await ctrl.listRecords('d1');
    await ctrl.createRecord('d1', { type: 'A' } as never);
    await ctrl.updateRecord('rec1', { type: 'A' } as never);
    const res = await ctrl.removeRecord('rec1');
    expect(domainsService.listRecords).toHaveBeenCalledWith('d1');
    expect(domainsService.createRecord).toHaveBeenCalledWith('d1', {
      type: 'A',
    });
    expect(domainsService.updateRecord).toHaveBeenCalledWith('rec1', {
      type: 'A',
    });
    expect(res).toEqual({ message: 'Record DNS supprimé avec succès' });
  });
});
