import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { SubscribeDto } from './dto/billing.dto';
import { GetUser } from '../../shared/decorators/get-user.decorator';
import type { JwtPayload } from '../../shared/jwt/dto/jwt-payload.dto';
import { RequiresProductCapability } from '../../shared/product-capabilities/requires-product-capability.decorator';
import { ProductCapabilities } from '../../shared/product-capabilities/product-capability';
import { WorkspaceAccessService } from '../iam/authorization/workspace-access.service';
import { WorkspaceActions } from '../iam/authorization/workspace-policy.types';

@ApiTags('billing')
@Controller('billing')
@RequiresProductCapability(ProductCapabilities.SELF_SERVICE_BILLING)
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  @Get()
  async getMyBilling(
    @GetUser() user: JwtPayload,
    @Headers('x-workspace-id') requestedWorkspaceId?: string,
  ) {
    const workspaceId = await this.workspaceAccess.resolveWorkspaceId(
      user.id,
      requestedWorkspaceId,
    );
    await this.workspaceAccess.assertWorkspaceAction(
      workspaceId,
      user.id,
      WorkspaceActions.READ_BILLING,
    );
    return this.billingService.getMyBilling(workspaceId);
  }

  @Post('subscribe')
  @HttpCode(200)
  async subscribe(
    @GetUser() user: JwtPayload,
    @Headers('x-workspace-id') requestedWorkspaceId: string | undefined,
    @Body() dto: SubscribeDto,
  ) {
    const workspaceId = await this.assertCanManageBilling(
      user.id,
      requestedWorkspaceId,
    );
    return this.billingService.subscribe(workspaceId, dto.plan, user.id);
  }

  @Post('cancel')
  @HttpCode(200)
  async cancel(
    @GetUser() user: JwtPayload,
    @Headers('x-workspace-id') requestedWorkspaceId?: string,
  ) {
    const workspaceId = await this.assertCanManageBilling(
      user.id,
      requestedWorkspaceId,
    );
    return this.billingService.cancel(workspaceId, user.id);
  }

  private async assertCanManageBilling(
    userId: string,
    requestedWorkspaceId?: string,
  ): Promise<string> {
    const workspaceId = await this.workspaceAccess.resolveWorkspaceId(
      userId,
      requestedWorkspaceId,
    );
    await this.workspaceAccess.assertWorkspaceAction(
      workspaceId,
      userId,
      WorkspaceActions.MANAGE_BILLING,
    );
    return workspaceId;
  }
}
