import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { ServerHostKeyService } from '../servers/services/server-host-key.service';
import { ServersCryptoService } from '../servers/services/servers-crypto.service';
import { TerminalGateway } from './terminal.gateway';
import { SshSessionService } from './ssh-session.service';
import { TerminalAuditService } from './terminal-audit.service';
import { TerminalService } from './terminal.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService): JwtModuleOptions => ({
        secret: cfg.get<string>('JWT_SECRET') ?? '',
      }),
    }),
  ],
  providers: [
    TerminalService,
    TerminalGateway,
    TerminalAuditService,
    SshSessionService,
    ServersCryptoService,
    ServerHostKeyService,
  ],
  exports: [TerminalService],
})
export class TerminalModule {}
