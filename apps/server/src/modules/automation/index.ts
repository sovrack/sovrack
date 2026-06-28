/** Automation — exécution de playbooks Ansible (porte publique unique du contexte). */
export { AutomationModule } from './automation.module';

// API publique consommée par d'autres contextes (ex. observability déclenche
// l'installation de la stack monitoring). Dépendance synchrone acyclique
// légitime : on a besoin du run en retour pour la réponse HTTP. Le retour
// asynchrone (fin de run) passe, lui, par shared/events (AUTOMATION_RUN_COMPLETED).
export { AutomationService } from './services/automation.service';
export { CreateAutomationRunDto } from './dto/create-automation-run.dto';
export { AUTOMATION_ACTIONS } from './shared/automation-options';
