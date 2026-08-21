import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

type WorkspaceRequest = Request & { workspaceId?: string };

export const GetWorkspaceId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => {
    const request = context.switchToHttp().getRequest<WorkspaceRequest>();
    const pathValue = request.params?.workspaceId;
    const headerValue = request.headers?.['x-workspace-id'];
    return (
      request.workspaceId ||
      (Array.isArray(pathValue) ? pathValue[0] : pathValue) ||
      (Array.isArray(headerValue) ? headerValue[0] : headerValue)
    );
  },
);
