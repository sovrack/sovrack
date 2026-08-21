import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { WorkspaceAccessService } from './workspace-access.service';
import { WorkspaceActions } from './workspace-policy.types';

type WorkspaceRequest = Request & {
  user?: JwtPayload;
  workspaceId?: string;
};

@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(private readonly workspaceAccess: WorkspaceAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WorkspaceRequest>();
    const userId = request.user?.id ?? request.user?.sub;
    if (!userId) return false;
    const pathValue = request.params.workspaceId;
    const headerValue = request.headers['x-workspace-id'];
    const requestedWorkspaceId =
      (Array.isArray(pathValue) ? pathValue[0] : pathValue) ||
      (Array.isArray(headerValue) ? headerValue[0] : headerValue);
    const workspaceId = await this.workspaceAccess.resolveWorkspaceId(
      userId,
      requestedWorkspaceId,
    );
    await this.workspaceAccess.assertWorkspaceAction(
      workspaceId,
      userId,
      WorkspaceActions.MANAGE_INTEGRATION,
    );
    request.workspaceId = workspaceId;
    return true;
  }
}
