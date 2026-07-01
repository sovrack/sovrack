import { Module } from '@nestjs/common';
import { ProjectAccessModule } from '../../catalog/access/project-access.module';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';

@Module({
  imports: [ProjectAccessModule],
  controllers: [ProxyController],
  providers: [ProxyService],
  exports: [ProxyService],
})
export class ProxyModule {}
