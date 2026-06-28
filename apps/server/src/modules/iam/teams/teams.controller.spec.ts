import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';

describe('TeamsController', () => {
  function build() {
    const teamsService = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 't1' }),
      create: jest.fn().mockResolvedValue({ id: 't1' }),
      update: jest.fn().mockResolvedValue({ id: 't1' }),
      remove: jest.fn().mockResolvedValue({ id: 't1' }),
      addMember: jest.fn().mockResolvedValue({ id: 'm1' }),
      removeMember: jest.fn().mockResolvedValue({ id: 'm1' }),
    } as unknown as TeamsService;
    const ctrl = new TeamsController(teamsService);
    return { ctrl, teamsService };
  }

  it('CRUD endpoints delegate', async () => {
    const { ctrl, teamsService } = build();
    await ctrl.findAll();
    await ctrl.findOne('t1');
    await ctrl.create({ name: 'team' } as never);
    await ctrl.update('t1', { name: 'team2' } as never);
    await ctrl.remove('t1');
    expect(teamsService.findAll).toHaveBeenCalled();
    expect(teamsService.findOne).toHaveBeenCalledWith('t1');
    expect(teamsService.create).toHaveBeenCalledWith({ name: 'team' });
    expect(teamsService.update).toHaveBeenCalledWith('t1', { name: 'team2' });
    expect(teamsService.remove).toHaveBeenCalledWith('t1');
  });

  it('member endpoints delegate', async () => {
    const { ctrl, teamsService } = build();
    await ctrl.addMember('t1', { userId: 'u1' } as never);
    await ctrl.removeMember('t1', 'u1');
    expect(teamsService.addMember).toHaveBeenCalledWith('t1', { userId: 'u1' });
    expect(teamsService.removeMember).toHaveBeenCalledWith('t1', 'u1');
  });
});
