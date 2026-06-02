import type { Server, CreateServerPayload, UpdateServerPayload } from '@/types/server';

export const HOST_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,253}$/;
export const USERNAME_PATTERN = /^[a-z_][a-z0-9_-]{0,31}$/i;

export type ServerFormValues = {
  name: string;
  description: string;
  host: string;
  port: string;
  username: string;
  sshKeyId: string;
  connectionMode: Server['connectionMode'];
};

export type ServerFormErrors = Partial<Record<keyof ServerFormValues, string>> & {
  form?: string;
};

export type ParsedServerFormValues = {
  name: string;
  description?: string;
  host: string;
  port: number;
  username: string;
  sshKeyId?: string;
  connectionMode: Server['connectionMode'];
};

export function createDefaultValues(): ServerFormValues {
  return {
    name: '',
    description: '',
    host: '',
    port: '22',
    username: 'ubuntu',
    sshKeyId: '',
    connectionMode: 'ssh',
  };
}

export function createValuesFromServer(server: Server): ServerFormValues {
  return {
    name: server.name,
    description: server.description ?? '',
    host: server.host,
    port: String(server.port),
    username: server.username,
    sshKeyId: '',
    connectionMode: 'ssh',
  };
}

export function validateServerForm(
  mode: 'create' | 'edit',
  values: ServerFormValues,
): { errors: ServerFormErrors; parsed?: ParsedServerFormValues } {
  const errors: ServerFormErrors = {};

  const name = values.name.trim();
  const description = values.description.trim();
  const host = values.host.trim();
  const port = Number(values.port);
  const username = values.username.trim();

  if (!name) {
    errors.name = 'Le nom est obligatoire';
  } else if (name.length > 80) {
    errors.name = 'Le nom ne peut pas dépasser 80 caractères';
  }

  if (description.length > 255) {
    errors.description = 'La description ne peut pas dépasser 255 caractères';
  }

  if (!host) {
    errors.host = "L'hôte est obligatoire";
  } else if (!HOST_PATTERN.test(host)) {
    errors.host = "L'hôte doit être une adresse IP ou un hostname valide (ex: 192.168.1.1 ou mon-serveur.com)";
  }

  if (!Number.isInteger(port)) {
    errors.port = 'Le port doit être un nombre entier';
  } else if (port < 1 || port > 65535) {
    errors.port = 'Le port doit être entre 1 et 65535';
  }

  if (!username) {
    errors.username = 'Le username est obligatoire';
  } else if (username.length > 32) {
    errors.username = 'Le username ne peut pas dépasser 32 caractères';
  } else if (!USERNAME_PATTERN.test(username)) {
    errors.username = 'Username invalide — lettres, chiffres, tirets et underscores uniquement';
  }

  if (mode === 'create' && !values.sshKeyId) {
    errors.sshKeyId = 'Veuillez sélectionner une clé SSH.';
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const parsed: ParsedServerFormValues = {
    name,
    ...(description && { description }),
    host,
    port,
    username,
    ...(values.sshKeyId && { sshKeyId: values.sshKeyId }),
    connectionMode: 'ssh',
  };

  return { errors, parsed };
}

export function buildCreatePayload(parsed: ParsedServerFormValues): CreateServerPayload {
  return {
    name: parsed.name,
    host: parsed.host,
    port: parsed.port,
    username: parsed.username,
    connectionMode: 'ssh',
    ...(parsed.description && { description: parsed.description }),
    ...(parsed.sshKeyId && { sshKeyId: parsed.sshKeyId }),
  };
}

export function buildUpdatePayload(
  parsed: ParsedServerFormValues,
  server: Server,
): UpdateServerPayload {
  const payload: UpdateServerPayload = {};

  if (parsed.name !== server.name) payload.name = parsed.name;
  if (parsed.host !== server.host) payload.host = parsed.host;
  if (parsed.port !== server.port) payload.port = parsed.port;
  if (parsed.username !== server.username) payload.username = parsed.username;
  if (parsed.description !== (server.description ?? '')) payload.description = parsed.description ?? '';

  return payload;
}
