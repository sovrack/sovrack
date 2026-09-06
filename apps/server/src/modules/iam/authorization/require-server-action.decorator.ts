import { SetMetadata } from '@nestjs/common';
import type { WorkspaceAction } from './workspace-policy.types';

export const SERVER_ACTION_METADATA = 'server-action';

export const RequireServerAction = (action: WorkspaceAction) =>
  SetMetadata(SERVER_ACTION_METADATA, action);
