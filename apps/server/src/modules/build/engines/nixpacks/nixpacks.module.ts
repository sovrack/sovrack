import { Module } from '@nestjs/common';
import { NixpacksService } from './nixpacks.service';

@Module({
  providers: [NixpacksService],
  exports: [NixpacksService],
})
export class NixpacksModule {}
