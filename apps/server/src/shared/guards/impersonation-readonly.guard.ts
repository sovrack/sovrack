import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  IMPERSONATION_FORBIDDEN_KEY,
  IMPERSONATION_WRITE_ALLOWED_KEY,
} from '../decorators/impersonation-policy.decorator';
import type { JwtPayloadDto } from '../jwt/dto/jwt-payload.dto';

/**
 * A support impersonation is a diagnostic session, never an authorization to
 * mutate customer data. The policy is enforced globally and defaults to
 * read-only. Exceptional writes must be explicitly annotated and reviewed.
 */
@Injectable()
export class ImpersonationReadonlyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayloadDto | undefined;
    if (user?.authType !== 'staff-impersonation') return true;

    const targets = [context.getHandler(), context.getClass()];
    const forbidden = this.reflector.getAllAndOverride<boolean>(
      IMPERSONATION_FORBIDDEN_KEY,
      targets,
    );
    if (forbidden) {
      throw new ForbiddenException(
        "Cette fonctionnalité est indisponible dans une session d'assistance",
      );
    }

    const method = request.method.toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;

    const writeAllowed = this.reflector.getAllAndOverride<boolean>(
      IMPERSONATION_WRITE_ALLOWED_KEY,
      targets,
    );
    if (writeAllowed) return true;

    throw new ForbiddenException(
      "La session d'assistance est limitée à la lecture seule",
    );
  }
}
