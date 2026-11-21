import { ContainerRegistriesService } from './container-registries.service';
import { ContainerRegistriesController } from './container-registries.controller';

describe('ContainerRegistriesController', () => {
  const workspaceId = 'workspace-1';
  function build() {
    const registries = {
      listRegistryConfigs: jest.fn().mockResolvedValue([]),
      createRegistryConfig: jest.fn().mockResolvedValue({ id: 'r1' }),
      updateRegistryConfig: jest.fn().mockResolvedValue({ id: 'r1' }),
      deleteRegistryConfig: jest.fn().mockResolvedValue(undefined),
      testRegistryConnection: jest.fn().mockResolvedValue({ ok: true }),
      setDefaultRegistryConfig: jest.fn().mockResolvedValue({ id: 'r1' }),
    } as unknown as ContainerRegistriesService;
    const ctrl = new ContainerRegistriesController(registries);
    return { ctrl, registries };
  }

  it('list / create / update delegate', async () => {
    const { ctrl, registries } = build();
    await ctrl.listContainerRegistries(workspaceId);
    await ctrl.createRegistry(
      { name: 'n', type: 'DOCKERHUB' } as never,
      workspaceId,
    );
    await ctrl.updateRegistry('r1', { name: 'm' }, workspaceId);
    expect(registries.listRegistryConfigs).toHaveBeenCalledWith(workspaceId);
    expect(registries.createRegistryConfig).toHaveBeenCalledWith(
      { name: 'n', type: 'DOCKERHUB' },
      workspaceId,
    );
    expect(registries.updateRegistryConfig).toHaveBeenCalledWith(
      'r1',
      { name: 'm' },
      workspaceId,
    );
  });

  it('delete returns a success message', async () => {
    const { ctrl, registries } = build();
    const res = await ctrl.deleteRegistry('r1', workspaceId);
    expect(registries.deleteRegistryConfig).toHaveBeenCalledWith(
      'r1',
      workspaceId,
    );
    expect(res).toEqual({ message: 'Registre supprimé avec succès' });
  });

  it('test / set-default delegate', async () => {
    const { ctrl, registries } = build();
    await ctrl.testRegistry('r1', workspaceId);
    await ctrl.setDefaultRegistry('r1', workspaceId);
    expect(registries.testRegistryConnection).toHaveBeenCalledWith(
      'r1',
      workspaceId,
    );
    expect(registries.setDefaultRegistryConfig).toHaveBeenCalledWith(
      'r1',
      workspaceId,
    );
  });
});
