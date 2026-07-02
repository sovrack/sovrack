import { BadRequestException, Logger } from '@nestjs/common';
import { execFile as execFileCb } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import type { SourceProvidersService } from '../../source-providers/source-providers.service';
import { buildSafeSpawnEnv } from '../../../shared/utils/safe-spawn-env.util';

const execFile = promisify(execFileCb);

/**
 * Vérifie que le dépôt Git est accessible (identifiants valides) ET que la
 * branche demandée y existe réellement — un dépôt peut répondre parfaitement
 * tout en n'ayant jamais eu la branche demandée (typo, branche supprimée) ;
 * l'ancienne version de cette vérification ne testait que l'accessibilité
 * générale du dépôt (voir AUDIT_VALIDATION_DEPLOIEMENT.md, Point 2).
 *
 * Extrait en fonction utilitaire (au lieu d'une méthode privée d'un seul
 * service) car appelée à la fois par DeploymentsValidationService (endpoint
 * informatif /validate) et DeploymentPreflightService (garde bloquante avant
 * création d'un Deployment) ; DeploymentsValidationService délègue désormais
 * à DeploymentPreflightService pour le reste de la validation, donc une
 * injection croisée entre les deux services créerait une dépendance
 * circulaire — un util partagé sans état l'évite proprement.
 */
export async function checkRepoCloneable(
  gitProvidersService: SourceProvidersService,
  logger: Logger,
  projectId: string,
  serviceId: string | undefined,
  branch: string,
): Promise<void> {
  let askpassPath: string | null = null;
  try {
    // Invariant : provider lié au SERVICE — résolution par service si dispo.
    const provider = serviceId
      ? await gitProvidersService.forService(serviceId)
      : await gitProvidersService.forProject(projectId);
    const creds = await provider.resolveGitCredentials(projectId, serviceId);

    let host = '';
    try {
      host = new URL(creds.repoUrl).host;
    } catch {
      host = '';
    }
    const authUser = host.includes('github') ? 'x-access-token' : 'oauth2';

    // Use GIT_ASKPASS with env-var-backed script to avoid leaking the token
    // on the CLI (visible via ps) or embedded in a temp file.
    askpassPath = join(
      tmpdir(),
      `git-askpass-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    await writeFile(
      askpassPath,
      [
        '#!/bin/sh',
        'case "$1" in',
        '  *Username*) echo "$GIT_ASKPASS_USER" ;;',
        '  *Password*) echo "$GIT_ASKPASS_PASS" ;;',
        'esac',
      ].join('\n'),
      { mode: 0o500 },
    );

    const { stdout, stderr } = await execFile(
      'git',
      ['ls-remote', '--heads', creds.repoUrl],
      {
        timeout: 15_000,
        env: buildSafeSpawnEnv({
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: askpassPath,
          GIT_ASKPASS_USER: authUser,
          GIT_ASKPASS_PASS: creds.token,
        }),
      },
    );

    if (stderr && stderr.includes('fatal')) {
      throw new Error(stderr);
    }

    // Chaque ligne : "<sha>\trefs/heads/<nom-branche>". Le dépôt peut être
    // parfaitement accessible sans jamais avoir eu la branche demandée.
    const branches = stdout
      .split('\n')
      .map((line) => line.split('refs/heads/')[1]?.trim())
      .filter((name): name is string => !!name);
    if (!branches.includes(branch)) {
      throw new BadRequestException(
        `La branche « ${branch} » n'existe pas sur ce dépôt.`,
      );
    }
  } catch (err) {
    // La non-existence de la branche est déjà un message précis et distinct
    // de "dépôt inaccessible" — ne pas l'écraser avec le message générique.
    if (err instanceof BadRequestException) throw err;
    const raw = err instanceof Error ? err.message : String(err);
    const safe = raw.split('\n')[0];
    logger.warn(
      `[checkRepoCloneable] Repo not cloneable for project ${projectId}: ${safe}`,
    );
    throw new BadRequestException(
      `Dépôt Git inaccessible. Vérifiez que le token est valide et que le chemin du dépôt est correct : ${safe}`,
    );
  } finally {
    if (askpassPath) {
      await unlink(askpassPath).catch(() => {});
    }
  }
}
