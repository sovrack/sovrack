import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule as NestJwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { JwtService } from './jwt.service';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ms = require('ms') as (value: string) => number;

/**
 * Centralized JWT Module — Used by ALL modules needing JWT authentication.
 * Replaces 6 copy-pasted instances across: auth, deployments, servers, terminal, automation.
 *
 * SINGLE SOURCE OF TRUTH for JWT configuration.
 */
@Module({
  imports: [
    NestJwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET not configured in environment variables');
        }
        const expiresInStr = configService.get<string>('JWT_EXPIRES_IN', '24h');
        const expiresIn = Math.floor(ms(expiresInStr) / 1000);
        return {
          secret,
          signOptions: { expiresIn },
        };
      },
    }),
  ],
  providers: [JwtStrategy, JwtService],
  exports: [NestJwtModule, JwtService, JwtStrategy],
})
export class AppJwtModule {}
