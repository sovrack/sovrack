import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../strategies/jwt.strategy';

/**
 * Décorateur personnalisé pour extraire l'utilisateur depuis la requête
 * Utilisé dans les controllers protégés par JwtAuthGuard
 *
 * Utilisation :
 * @Get('me')
 * @UseGuards(JwtAuthGuard)
 * getMe(@GetUser() user: JwtPayload) {
 *   return user;
 * }
 */
export const GetUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
