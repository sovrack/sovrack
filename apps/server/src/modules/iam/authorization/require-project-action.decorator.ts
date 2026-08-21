import { SetMetadata } from '@nestjs/common';
import type { ProjectAction } from './workspace-policy.types';

export const PROJECT_ACTION_METADATA = 'project-action';

export const RequireProjectAction = (action: ProjectAction) =>
  SetMetadata(PROJECT_ACTION_METADATA, action);
