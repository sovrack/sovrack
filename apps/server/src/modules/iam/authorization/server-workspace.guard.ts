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
export class ServerWorkspaceGuard implements CanActivate {
  constructor(private readonly workspaceAccess: WorkspaceAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WorkspaceRequest>();
    const userId = request.user?.id ?? request.user?.sub;
    if (!userId) return false;

    const requestedWorkspaceId =
      this.readParam(request.params.workspaceId) ||
      this.readHeader(request.headers['x-workspace-id']);
    const serverId =
      this.readParam(request.params.serverId) ||
      this.readParam(request.params.id);

    if (serverId) {
      const actor = await this.workspaceAccess.assertServerAction(
        serverId,
        userId,
        WorkspaceActions.READ_SERVER,
        requestedWorkspaceId,
      );
      request.workspaceId = actor.workspaceId;
      return true;
    }

    const workspaceId = await this.workspaceAccess.resolveWorkspaceId(
      userId,
      requestedWorkspaceId,
    );
    await this.workspaceAccess.assertWorkspaceAction(
      workspaceId,
      userId,
      WorkspaceActions.READ_SERVER,
    );
    request.workspaceId = workspaceId;
    return true;
  }

  private readHeader(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }

  private readParam(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }
}
