import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { GetUser } from '../../../core/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import type { JwtPayload } from '../../../core/jwt/dto/jwt-payload.dto';
import { GithubService } from './github.service';
import { GithubWebhookService } from './github-webhook.service';

@ApiTags('GitHub')
@Controller()
export class GithubController {
  constructor(
    private readonly githubService: GithubService,
    private readonly webhookService: GithubWebhookService,
  ) {}

  /* ── Webhook (public — no auth) ──────────────────────────────────────── */

  @Post('github/webhook')
  @SkipThrottle()
  @ApiOperation({ summary: 'Receive GitHub Actions workflow events (webhook)' })
  @ApiResponse({ status: 200, description: 'Event processed' })
  @ApiResponse({ status: 403, description: 'Invalid HMAC signature' })
  async handleWebhook(
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Headers('x-github-event') event: string | undefined,
    @Body() payload: unknown,
    @Req() req: { rawBody?: Buffer },
  ) {
    const rawBody = req.rawBody?.toString('utf-8') ?? JSON.stringify(payload);
    await this.webhookService.verifyWebhookSignature(signature, rawBody);
    return await this.webhookService.handleWebhook(payload);
  }

  /* ── Authenticated project endpoints ────────────────────────────────── */

  @Get('projects/:id/github/repos')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List GitHub repositories for a project' })
  async listRepos(
    @Param('id') projectId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.githubService.listRepos(projectId, user.id, user.role);
  }

  @Get('projects/:id/github/repos/:repoId/branches')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List branches for a GitHub repository' })
  async listBranches(
    @Param('id') projectId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.githubService.listBranches(projectId, user.id, user.role);
  }

  @Get('projects/:id/github/pipelines')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List recent GitHub Actions workflow runs' })
  async listPipelines(
    @Param('id') projectId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.githubService.listPipelines(projectId, user.id, user.role);
  }
}
