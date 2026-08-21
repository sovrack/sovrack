import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { WorkspaceAccessService } from './workspace-access.service';
import { PROJECT_ACTION_METADATA } from './require-project-action.decorator';
import { type ProjectAction, ProjectActions } from './workspace-policy.types';

type ProjectRequest = Request & {
  user?: JwtPayload;
  workspaceId?: string;
};

/**
 * Binds project-scoped routes to the selected workspace. This prevents a
 * project from workspace A being addressed while the request carries the
 * context of workspace B. Legacy routes remain supported through the
 * x-workspace-id header; users with a single workspace need no header.
 */
@Injectable()
export class ProjectWorkspaceGuard implements CanActivate {
  constructor(
    private readonly workspaceAccess: WorkspaceAccessService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ProjectRequest>();
    const userId = request.user?.id ?? request.user?.sub;
    if (!userId) return false;

    const projectId =
      this.readValue(request.params.projectId) ??
      this.readValue(request.params.id);
    if (!projectId) {
      throw new BadRequestException({
        code: 'PROJECT_CONTEXT_REQUIRED',
        message: 'Cette route exige un projet explicite',
      });
    }

    const requestedWorkspaceId =
      this.readValue(request.params.workspaceId) ??
      this.readValue(request.headers['x-workspace-id']);
    const workspaceId = await this.workspaceAccess.resolveWorkspaceId(
      userId,
      requestedWorkspaceId,
    );
    const action =
      this.reflector.getAllAndOverride<ProjectAction>(PROJECT_ACTION_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? ProjectActions.READ;
    await this.workspaceAccess.assertProjectAction(
      projectId,
      userId,
      action,
      workspaceId,
    );
    request.workspaceId = workspaceId;
    return true;
  }

  private readValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }
}
