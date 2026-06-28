import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { ServersSharedModule } from '../infrastructure';
import { TerminalGateway } from './terminal.gateway';
import { SshSessionService } from './ssh-session.service';
import { TerminalAuditService } from './terminal-audit.service';
import { TerminalService } from './terminal.service';
import { AppJwtModule } from '../../shared/jwt/jwt.module';

@Module({
  imports: [PrismaModule, ServersSharedModule, AppJwtModule],
  providers: [
    TerminalService,
    TerminalGateway,
    TerminalAuditService,
    SshSessionService,
  ],
  exports: [TerminalService],
})
export class TerminalModule {}
