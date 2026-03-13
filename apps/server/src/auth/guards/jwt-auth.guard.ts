import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard JWT pour protéger les routes nécessitant une authentification
 * Utilise la stratégie JWT définie dans jwt.strategy.ts
 *
 * Utilisation :
 * @UseGuards(JwtAuthGuard)
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
