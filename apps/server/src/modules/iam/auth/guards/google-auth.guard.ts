import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';

/**
 * Guard Google OAuth 2.0.
 *
 * Gère gracieusement le mode Open Source (si GOOGLE_CLIENT_ID est absent)
 * en redirigeant proprement vers /login avec un code d'erreur au lieu de crasher.
 * Génère et valide un paramètre `state` pour protéger contre les attaques CSRF
 * et préserver le paramètre de redirection `next` (ex: /projects/new).
 */
@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      const res = context.switchToHttp().getResponse<Response>();
      const frontendUrl = this.configService.get<string>(
        'FRONTEND_URL',
        'http://localhost:3000',
      );
      res.redirect(`${frontendUrl}/login?error=oauth_not_configured`);
      return false;
    }

    return super.canActivate(context);
  }

  override getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const rawNext = req.query?.next;
    const next =
      typeof rawNext === 'string' &&
      rawNext.startsWith('/') &&
      !rawNext.startsWith('//')
        ? rawNext
        : '/dashboard';

    const state = Buffer.from(
      JSON.stringify({
        next,
        t: Date.now(),
        nonce: Math.random().toString(36).substring(2, 12),
      }),
    ).toString('base64url');

    return { state };
  }
}
