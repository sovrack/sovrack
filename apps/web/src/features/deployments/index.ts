// Barrel = SEULE porte publique de la feature deployments.
// Les autres features / l'app importent depuis '@/features/deployments',
// jamais depuis ses fichiers internes (frontière enforced en Phase 4).

// Composants
export { DeploymentStatusBadge } from './components/deployment-status-badge';
export { DeploymentContainerDialog } from './components/deployment-container-dialog';
export { DeployDialog } from './components/deploy-dialog';
export { EnvVariablesPreview } from './components/env-variables-preview';

// Data layer (service + hooks React Query)
export { deploymentsService } from './api/deployments.service';
export { useDeploymentSocket } from './api/use-deployment-socket';
export { useEnvPreview } from './api/use-env-preview';

// Types + utils du domaine
export * from './types';
export { splitImageRef } from './utils';
