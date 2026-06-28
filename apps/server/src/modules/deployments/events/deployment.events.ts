// Re-export depuis la source canonique.
// Les consommateurs INTERNES (deployments/triggers/) peuvent continuer
// à importer depuis ici. Les consommateurs EXTERNES doivent désormais
// importer depuis 'src/shared/events/events.catalog'.
export {
  DEPLOYMENT_PIPELINE_UPDATED,
  DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
  type PipelineUpdatedEvent,
  type AutoDeployTriggerEvent,
} from '../../../shared/events/events.catalog';
