// Re-export depuis la source canonique — shared/events/events.catalog.ts
// Les consommateurs EXTERNES doivent désormais importer depuis shared/events/.
export {
  AUTOMATION_RUN_COMPLETED,
  type AutomationRunCompletedEvent,
} from '../../../shared/events/events.catalog';
