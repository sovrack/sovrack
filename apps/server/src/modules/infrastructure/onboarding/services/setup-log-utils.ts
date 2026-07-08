import { ServerLogLevel, ServerRunStepStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { parseRoleFromAnsibleLogLine } from './infra-setup.util';
import { SetupRoleKey } from '../../servers/shared/server-setup-options';
import { redactSecrets as redactSecretsUtil } from '../../../../shared/security/redact';

export type LogEntry = {
  level: ServerLogLevel;
  source: string;
  message: string;
};

export function appendLog(
  existingLogs: LogEntry[],
  newLogs: LogEntry[],
  logEmitter: (entry: LogEntry) => void,
): LogEntry[] {
  for (const entry of newLogs) {
    logEmitter(entry);
  }
  return [...existingLogs, ...newLogs];
}

export async function updateRoleStateFromLog(
  setupId: string,
  logLine: string,
  knownRoleKeys: Set<SetupRoleKey>,
  currentRoleBySetup: Map<string, SetupRoleKey>,
  prisma: PrismaService,
): Promise<void> {
  const roleKey = parseRoleFromAnsibleLogLine(logLine, knownRoleKeys);
  if (!roleKey) return;

  const previous = currentRoleBySetup.get(setupId);
  if (previous && previous !== roleKey) {
    await prisma.serverRunStep.updateMany({
      where: {
        runId: setupId,
        roleKey: previous,
        status: ServerRunStepStatus.RUNNING,
      },
      data: { status: ServerRunStepStatus.OK, finishedAt: new Date() },
    });
  }

  currentRoleBySetup.set(setupId, roleKey);
  await prisma.serverRunStep.updateMany({
    where: {
      runId: setupId,
      roleKey,
      status: ServerRunStepStatus.PENDING,
    },
    data: { status: ServerRunStepStatus.RUNNING, startedAt: new Date() },
  });
}

export function redactSecrets(value: string, _secrets?: string[]): string {
  return redactSecretsUtil(value);
}
