export type DeployValidationResult = {
  ready: boolean;
  prepared: boolean;
  missing: { binary: string; label: string; role: string }[];
  required: { binary: string; label: string; role: string }[];
  serverName: string;
  serverId: string | null;
  buildSource: string;
};
