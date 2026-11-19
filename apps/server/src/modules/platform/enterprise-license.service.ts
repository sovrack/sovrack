import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

export interface LicensePayload {
  customer: string;
  tier: 'ENTERPRISE' | 'PRO';
  maxServers: number;
  issuedAt: string;
  expiresAt: string;
}

export interface LicenseStatus {
  isEnterprise: boolean;
  tier: string;
  customer?: string;
  expiresAt?: string;
  maxServers?: number;
  valid: boolean;
  message?: string;
}

@Injectable()
export class EnterpriseLicenseService {
  private readonly logger = new Logger(EnterpriseLicenseService.name);
  private cachedStatus: LicenseStatus | null = null;

  /**
   * Secret partagé de signature hors-ligne pour la validation cryptographique
   * sans dépendre d'un serveur d'activation distant.
   */
  private readonly signingSecret =
    process.env.LICENSE_VERIFICATION_SECRET ||
    'sovrack-enterprise-offline-signing-secret-2026';

  getLicenseStatus(): LicenseStatus {
    if (this.cachedStatus) return this.cachedStatus;

    const licenseKey = process.env.SOVRACK_LICENSE_KEY;
    if (!licenseKey) {
      this.cachedStatus = {
        isEnterprise: false,
        tier: 'COMMUNITY',
        valid: true,
        message: 'Running in Community Open Source Edition',
      };
      return this.cachedStatus;
    }

    const verification = this.verifyKey(licenseKey);
    this.cachedStatus = verification;
    return this.cachedStatus;
  }

  verifyKey(licenseKey: string): LicenseStatus {
    try {
      const [payloadB64, signatureHex] = licenseKey.trim().split('.');
      if (!payloadB64 || !signatureHex) {
        return {
          isEnterprise: false,
          tier: 'COMMUNITY',
          valid: false,
          message: 'Format de clé de licence invalide',
        };
      }

      // Vérification HMAC-SHA256 hors-ligne
      const expectedSig = createHmac('sha256', this.signingSecret)
        .update(payloadB64)
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSig, 'hex');
      const receivedBuf = Buffer.from(signatureHex, 'hex');

      if (
        expectedBuf.length === 0 ||
        expectedBuf.length !== receivedBuf.length ||
        !timingSafeEqual(expectedBuf, receivedBuf)
      ) {
        return {
          isEnterprise: false,
          tier: 'COMMUNITY',
          valid: false,
          message: 'Signature de licence invalide',
        };
      }

      const payload: LicensePayload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      );

      const now = new Date();
      const expiresAt = new Date(payload.expiresAt);

      if (now > expiresAt) {
        this.logger.warn(`License for ${payload.customer} has expired`);
        return {
          isEnterprise: false,
          tier: 'COMMUNITY',
          valid: false,
          customer: payload.customer,
          expiresAt: payload.expiresAt,
          message: 'La licence Entreprise a expiré',
        };
      }

      this.logger.log(`Active Enterprise License detected for: ${payload.customer}`);
      return {
        isEnterprise: true,
        tier: payload.tier || 'ENTERPRISE',
        customer: payload.customer,
        expiresAt: payload.expiresAt,
        maxServers: payload.maxServers,
        valid: true,
        message: `Licence Entreprise valide — ${payload.customer}`,
      };
    } catch (err) {
      this.logger.error('Failed to parse license key', err);
      return {
        isEnterprise: false,
        tier: 'COMMUNITY',
        valid: false,
        message: 'Erreur lors du décodage de la licence',
      };
    }
  }
}
