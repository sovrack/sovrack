import { StartServerPreparationDto } from './start-server-preparation.dto';

/**
 * Backward-compatible DTO name for the legacy /servers/:id/prepare route.
 * The implementation now uses the production ServerPreparation workflow.
 */
export class PrepareServerDto extends StartServerPreparationDto {}
