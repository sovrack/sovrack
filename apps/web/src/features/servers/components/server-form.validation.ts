import type { Server, CreateServerPayload, UpdateServerPayload } from '@/features/servers/types/server';

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
    errors.name = 'Name cannot exceed 80 characters';
  }

  if (description.length > 255) {
    errors.description = 'Description cannot exceed 255 characters';
  }

  if (!host) {
    errors.host = 'Host is required';
  } else if (!HOST_PATTERN.test(host)) {
    errors.host = 'Host must be a valid IP address or hostname (e.g. 192.168.1.1 or my-server.com)';
  }

  if (!Number.isInteger(port)) {
    errors.port = 'Port must be an integer';
  } else if (port < 1 || port > 65535) {
    errors.port = 'Port must be between 1 and 65535';
  }

  if (!username) {
    errors.username = 'Le username est obligatoire';
  } else if (username.length > 32) {
    errors.username = 'Username cannot exceed 32 characters';
  } else if (!USERNAME_PATTERN.test(username)) {
    errors.username = 'Username invalide — lettres, chiffres, tirets et underscores uniquement';
  }

  if (mode === 'create' && !values.sshKeyId) {
    errors.sshKeyId = 'Please select an SSH key.';
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
