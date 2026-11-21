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
    const user = { id: 'u1', role: 'OWNER' };
    await ctrl.findAll(user as never);
    await ctrl.findOne('t1', user as never);
    await ctrl.create({ name: 'team' }, {
      id: 'u1',
    } as never);
    await ctrl.update('t1', { name: 'team2' }, user as never);
    await ctrl.remove('t1', user as never);
    expect(teamsService.findAll).toHaveBeenCalledWith(user);
    expect(teamsService.findOne).toHaveBeenCalledWith('t1', user);
    expect(teamsService.create).toHaveBeenCalledWith({ name: 'team' }, 'u1');
    expect(teamsService.update).toHaveBeenCalledWith(
      't1',
      { name: 'team2' },
      user,
    );
    expect(teamsService.remove).toHaveBeenCalledWith('t1', user);
  });

  it('member endpoints delegate', async () => {
    const { ctrl, teamsService } = build();
    const user = { id: 'u1', role: 'OWNER' };
    await ctrl.addMember('t1', { userId: 'u1' }, user as never);
    await ctrl.removeMember('t1', 'u1', user as never);
    expect(teamsService.addMember).toHaveBeenCalledWith(
      't1',
      { userId: 'u1' },
      user,
    );
    expect(teamsService.removeMember).toHaveBeenCalledWith('t1', 'u1', user);
  });
});
