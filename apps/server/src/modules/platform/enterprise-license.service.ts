import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';

export interface LicenseStatus {
  isEnterprise: boolean;
  tier: string;
  customer?: string;
  expiresAt?: string;
  maxServers?: number;
  valid: boolean;
  message?: string;
}

/**
 * EnterpriseLicenseService
 *
 * Open-core loader: in Community Edition, defaults to open-source tier.
 * In Enterprise Edition (when ee/ is present), delegates to the commercial verifier.
 */
@Injectable()
export class EnterpriseLicenseService {
  private readonly logger = new Logger(EnterpriseLicenseService.name);
  private eeVerifier: any = null;

  constructor() {
    if (process.env.ENABLE_ENTERPRISE !== 'false') {
      try {
        const eePath = path.resolve(__dirname, '../../../../../ee/server/enterprise-license.service');
        const eeModule = require(eePath);
        if (eeModule && eeModule.EnterpriseLicenseService) {
          this.eeVerifier = new eeModule.EnterpriseLicenseService();
          this.logger.log('Enterprise Edition module loaded successfully');
        }
      } catch {
        // ee/ module is optional in open-source Community edition
      }
    }
  }

  getLicenseStatus(): LicenseStatus {
    if (this.eeVerifier && typeof this.eeVerifier.getLicenseStatus === 'function') {
      return this.eeVerifier.getLicenseStatus();
    }
    return {
      isEnterprise: false,
      tier: 'COMMUNITY',
      valid: true,
      message: 'Running in Community Open Source Edition',
    };
  }
}
