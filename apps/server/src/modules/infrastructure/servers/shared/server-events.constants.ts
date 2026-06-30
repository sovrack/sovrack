export const SERVER_EVENTS = {
  SSH_VALIDATED: 'server.ssh.validated',
} as const;

export type ServerSshValidatedPayload = {
  serverId: string;
};
