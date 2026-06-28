import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

describe('NotificationsController', () => {
  function build() {
    const notif = {
      getSettings: jest.fn().mockResolvedValue({ notifyOnFailure: true }),
      saveSettings: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsService;
    const ctrl = new NotificationsController(notif);
    return { ctrl, notif };
  }

  it('getSettings delegates', async () => {
    const { ctrl, notif } = build();
    await ctrl.getSettings();
    expect(notif.getSettings).toHaveBeenCalled();
  });

  it('saveSettings persists then returns the fresh settings', async () => {
    const { ctrl, notif } = build();
    const res = await ctrl.saveSettings({ notifyOnSuccess: true } as never);
    expect(notif.saveSettings).toHaveBeenCalledWith({ notifyOnSuccess: true });
    expect(notif.getSettings).toHaveBeenCalled();
    expect(res).toEqual({ notifyOnFailure: true });
  });
});
