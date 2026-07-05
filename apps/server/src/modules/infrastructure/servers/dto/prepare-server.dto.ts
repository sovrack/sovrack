import { StartServerSetupDto } from './start-server-setup.dto';

/**
 * Backward-compatible DTO name for the legacy /servers/:id/prepare route.
 * The implementation now uses the production ServerSetup workflow.
 */
export class PrepareServerDto extends StartServerSetupDto {}
