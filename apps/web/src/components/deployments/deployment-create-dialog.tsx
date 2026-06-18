'use client';

import { DeployDialog } from './deploy-dialog';

type Props = {
  open: boolean;
  initialProjectId?: string;
  initialEnvironmentId?: string;
  initialBranch?: string;
  onClose: () => void;
  onCreated: () => Promise<void>;
};

export function DeploymentCreateDialog({
  open,
  initialProjectId,
  initialEnvironmentId,
  onClose,
  onCreated,
}: Props) {
  if (!initialProjectId) return null;

  return (
    <DeployDialog
      projectId={initialProjectId}
      open={open}
      initialEnvironmentId={initialEnvironmentId}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}
