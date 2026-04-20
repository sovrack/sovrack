import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../../modules/auth/strategies/jwt.strategy';

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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const request = ctx.switchToHttp().getRequest();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return request.user as JwtPayload;
  },
);
