import { PlatformService } from './platform.service';
import { PlatformController } from './platform.controller';

describe('PlatformController', () => {
  function build() {
    const platform = {
      getAll: jest.fn().mockResolvedValue([]),
      set: jest.fn().mockResolvedValue({ key: 'k', value: 'v' }),
    } as unknown as PlatformService;
    const ctrl = new PlatformController(platform);
    return { ctrl, platform };
  }

  it('getAll delegates', async () => {
    const { ctrl, platform } = build();
    await ctrl.getAll();
    expect(platform.getAll).toHaveBeenCalled();
  });

  it('setConfig forwards value and isSecret', async () => {
    const { ctrl, platform } = build();
    await ctrl.setConfig('k', { value: 'v', isSecret: true } as never);
    expect(platform.set).toHaveBeenCalledWith('k', 'v', true);
  });
});
