export type DeployValidationResult = {
  ready: boolean;
  prepared: boolean;
  missing: { binary: string; label: string; role: string }[];
  required: { binary: string; label: string; role: string }[];
  serverName: string;
  serverId: string | null;
  buildSource: string;
  // Set when DeploymentPreflightService (assertDeployable) rejects the
  // deploy — the exact reason POST /deployments would fail with (missing
  // Dockerfile, malformed secrets JSON, no registry credentials, port
  // conflict…). Independent of missing/required, which only report tool
  // installation status. Previously computed by the backend but never read
  // by the frontend (AUDIT_VERIFICATION_UI.md Point 10).
  reason?: string;
};
