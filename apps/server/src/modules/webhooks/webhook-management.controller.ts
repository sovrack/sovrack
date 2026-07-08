import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { WebhookManagementService } from './webhook-management.service';

/**
 * REST API for managing a service's webhook (1 service = 1 repo = 1 webhook).
 *
 *   POST /projects/:projectId/webhook/configure?serviceId=…  → register on provider
 *   GET  /projects/:projectId/webhook/status?serviceId=…     → current status
 *   POST /projects/:projectId/webhook/pause?serviceId=…      → disable incoming events
 *   POST /projects/:projectId/webhook/resume?serviceId=…     → re-enable incoming events
 *
 * `serviceId` is REQUIRED. The old project/serviceEnv-level fallback was
 * removed: the UI always passes serviceId, and a single identity key is what
 * keeps webhook endpoints unambiguous (no duplicate endpoints/tokens).
 */
@ApiTags('Webhooks')
@ApiBearerAuth()
@Controller('projects/:projectId/webhook')
@UseGuards(JwtAuthGuard)
export class WebhookManagementController {
  constructor(private readonly webhookService: WebhookManagementService) {}

  private requireServiceId(serviceId?: string): string {
    if (!serviceId) {
      throw new BadRequestException('serviceId query parameter is required.');
    }
    return serviceId;
  }

  @Post('configure')
  async configure(
    @Param('projectId') projectId: string,
    @Query('serviceId') serviceId?: string,
  ) {
    return this.webhookService.configureForService(
      projectId,
      this.requireServiceId(serviceId),
    );
  }

  @Get('status')
  async status(@Query('serviceId') serviceId?: string) {
    return this.webhookService.getStatusForService(
      this.requireServiceId(serviceId),
    );
  }

  @Post('pause')
  async pause(@Query('serviceId') serviceId?: string) {
    await this.webhookService.setActiveForService(
      this.requireServiceId(serviceId),
      false,
    );
    return { status: 'paused' };
  }

  @Post('resume')
  async resume(@Query('serviceId') serviceId?: string) {
    await this.webhookService.setActiveForService(
      this.requireServiceId(serviceId),
      true,
    );
    return { status: 'resumed' };
  }
}
