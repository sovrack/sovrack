import { Plan, Role } from '@prisma/client';
import type { JwtPayload } from '../../shared/jwt/dto/jwt-payload.dto';
import { WorkspaceAccessService } from '../iam/authorization/workspace-access.service';
import { WorkspaceActions } from '../iam/authorization/workspace-policy.types';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

describe('BillingController workspace authorization', () => {
  const billing = {
    getMyBilling: jest.fn(),
    subscribe: jest.fn(),
    cancel: jest.fn(),
  };
  const workspaceAccess = {
    resolveWorkspaceId: jest.fn().mockResolvedValue('workspace-1'),
    assertWorkspaceAction: jest.fn().mockResolvedValue({}),
  };
  const user = {
    id: 'user-1',
    email: 'person@example.com',
    role: Role.MEMBER,
    sessionVersion: 0,
  } as JwtPayload;
  let controller: BillingController;

  beforeEach(() => {
    jest.clearAllMocks();
    workspaceAccess.resolveWorkspaceId.mockResolvedValue('workspace-1');
    workspaceAccess.assertWorkspaceAction.mockResolvedValue({});
    controller = new BillingController(
      billing as unknown as BillingService,
      workspaceAccess as unknown as WorkspaceAccessService,
    );
  });

  it('requires billing read permission in the selected workspace', async () => {
    await controller.getMyBilling(user, 'workspace-1');

    expect(workspaceAccess.assertWorkspaceAction).toHaveBeenCalledWith(
      'workspace-1',
      'user-1',
      WorkspaceActions.READ_BILLING,
    );
    expect(billing.getMyBilling).toHaveBeenCalledWith('workspace-1');
  });

  it('requires independent billing management permission to subscribe', async () => {
    await controller.subscribe(user, 'workspace-1', { plan: Plan.PRO });

    expect(workspaceAccess.assertWorkspaceAction).toHaveBeenCalledWith(
      'workspace-1',
      'user-1',
      WorkspaceActions.MANAGE_BILLING,
    );
    expect(billing.subscribe).toHaveBeenCalledWith(
      'workspace-1',
      Plan.PRO,
      'user-1',
    );
  });
});
