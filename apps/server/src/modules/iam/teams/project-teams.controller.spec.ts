import { TeamsService } from './teams.service';
import { ProjectTeamsController } from './project-teams.controller';

describe('ProjectTeamsController', () => {
  it('addTeamToProject delegates and returns a success message', async () => {
    const teamsService = {
      addTeamToProject: jest.fn().mockResolvedValue(undefined),
    } as unknown as TeamsService;
    const ctrl = new ProjectTeamsController(teamsService);
    const res = await ctrl.addTeamToProject('p1', 't1');
    expect(teamsService.addTeamToProject).toHaveBeenCalledWith('p1', 't1');
    expect(res).toEqual({
      message: "Les membres de l'équipe ont été ajoutés au projet",
    });
  });
});
