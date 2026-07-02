import { Module } from '@nestjs/common';
import { ProjectAccessModule } from '../../catalog/authorization/project-access.module';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';

@Module({
  imports: [ProjectAccessModule],
  controllers: [ProxyController],
  providers: [ProxyService],
  exports: [ProxyService],
})
export class ProxyModule {}
