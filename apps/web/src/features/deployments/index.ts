// Barrel = SEULE porte publique de la feature deployments.
// Les autres features / l'app importent depuis '@/features/deployments',
// jamais depuis ses fichiers internes (frontière enforced en Phase 4).

// Composants
// NOTE: DeployDialog vit désormais dans features/projects/components/
// (résolution du cycle projects<->deployments, voir mission Sprints 4+5+6 B9)
// — il dépendait de projects/ (Environment, Service, hooks) mais aucun
// fichier de deployments/ ne dépend de projects/, donc c'est lui qui bouge.
export { DeploymentStatusBadge } from "./components/deployment-status-badge";
export { DeploymentContainerDialog } from "./components/deployment-container-dialog";
export { EnvVariablesPreview } from "./components/env-variables-preview";
// C4 (Sprints 4+5+6 clôture): shared by DeploymentContainerDialog (modal) and
// projects' ServiceContainersTab (embedded tab) — same stats/ops/logs UI,
// different chrome around it.
export { ContainerOpsPanel } from "./components/container-ops-panel";

// Data layer (service + hooks React Query)
export { deploymentsService } from "./api/deployments.service";
export { useDeploymentSocket } from "./api/use-deployment-socket";
export { useEnvPreview } from "./api/use-env-preview";

// Types + utils du domaine
export * from "./types";
export { splitImageRef } from "./utils";
