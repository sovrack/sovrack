import { Test } from '@nestjs/testing';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';

describe('SuperAdminController', () => {
  let controller: SuperAdminController;
  const service = {
    getOverview: jest.fn(),
    listUsers: jest.fn(),
    listTeams: jest.fn(),
    listSubscriptions: jest.fn(),
    listUsersForTeam: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [SuperAdminController],
      providers: [{ provide: SuperAdminService, useValue: service }],
    }).compile();

    controller = moduleRef.get(SuperAdminController);
  });

  it('expose getOverview', () => {
    service.getOverview.mockResolvedValue({ users: { total: 1 } });
    void controller.getOverview();
    expect(service.getOverview).toHaveBeenCalled();
  });

  it('expose listUsers', () => {
    service.listUsers.mockResolvedValue({ items: [] });
    void controller.listUsers('2', '10');
    expect(service.listUsers).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
    });
  });

  it('expose listTeams', () => {
    service.listTeams.mockResolvedValue({ items: [] });
    void controller.listTeams(undefined, undefined);
    expect(service.listTeams).toHaveBeenCalledWith({
      page: NaN,
      limit: NaN,
    });
  });

  it('expose listSubscriptions', () => {
    service.listSubscriptions.mockResolvedValue([]);
    void controller.listSubscriptions();
    expect(service.listSubscriptions).toHaveBeenCalled();
  });

  it('expose listUsersForTeam', () => {
    service.listUsersForTeam.mockResolvedValue([]);
    void controller.listUsersForTeam('team-1');
    expect(service.listUsersForTeam).toHaveBeenCalledWith('team-1');
  });
});
