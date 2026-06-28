import { ContainerRegistriesService } from './container-registries.service';
import { ContainerRegistriesController } from './container-registries.controller';

describe('ContainerRegistriesController', () => {
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
    await ctrl.listContainerRegistries();
    await ctrl.createRegistry({ name: 'n', type: 'DOCKERHUB' } as never);
    await ctrl.updateRegistry('r1', { name: 'm' } as never);
    expect(registries.listRegistryConfigs).toHaveBeenCalled();
    expect(registries.createRegistryConfig).toHaveBeenCalledWith({
      name: 'n',
      type: 'DOCKERHUB',
    });
    expect(registries.updateRegistryConfig).toHaveBeenCalledWith('r1', {
      name: 'm',
    });
  });

  it('delete returns a success message', async () => {
    const { ctrl, registries } = build();
    const res = await ctrl.deleteRegistry('r1');
    expect(registries.deleteRegistryConfig).toHaveBeenCalledWith('r1');
    expect(res).toEqual({ message: 'Registre supprimé avec succès' });
  });

  it('test / set-default delegate', async () => {
    const { ctrl, registries } = build();
    await ctrl.testRegistry('r1');
    await ctrl.setDefaultRegistry('r1');
    expect(registries.testRegistryConnection).toHaveBeenCalledWith('r1');
    expect(registries.setDefaultRegistryConfig).toHaveBeenCalledWith('r1');
  });
});
