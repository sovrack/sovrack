import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard JWT pour protéger les routes nécessitant une authentification.
 * Utilise la stratégie JWT définie dans jwt.strategy.ts.
 *
 * Enregistré GLOBALEMENT (APP_GUARD) → toutes les routes exigent un JWT valide
 * par défaut (fail-secure). Les rares routes publiques (login, health, webhooks
 * signés, callback OAuth) sont marquées avec @Public().
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}
