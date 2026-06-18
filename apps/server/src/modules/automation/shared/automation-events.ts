import { ServerOperationStatus } from '@prisma/client';

/** Émis par le runner quand une exécution d'automation se termine. */
export const AUTOMATION_RUN_COMPLETED = 'automation.run.completed';

export interface AutomationRunCompletedEvent {
  runId: string;
  actionKey: string;
  status: ServerOperationStatus;
  /** Hôtes (IP/nom) des serveurs cibles ayant réussi. */
  succeededHosts: string[];
}
