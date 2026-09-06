import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { WorkspaceAccessService } from './workspace-access.service';
import { WorkspaceActions } from './workspace-policy.types';
import type { WorkspaceAction } from './workspace-policy.types';
import { SERVER_ACTION_METADATA } from './require-server-action.decorator';

type WorkspaceRequest = Request & {
  user?: JwtPayload;
  workspaceId?: string;
};

@Injectable()
export class ServerWorkspaceGuard implements CanActivate {
  constructor(
    private readonly workspaceAccess: WorkspaceAccessService,
    private readonly reflector: Reflector,
  ) {}

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
    const action =
      this.reflector.getAllAndOverride<WorkspaceAction>(
        SERVER_ACTION_METADATA,
        [context.getHandler(), context.getClass()],
      ) ?? WorkspaceActions.READ_SERVER;

    if (serverId) {
      const actor = await this.workspaceAccess.assertServerAction(
        serverId,
        userId,
        action,
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
      action,
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
