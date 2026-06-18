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

  /**
   * Provider-aware webhook endpoint: /github/webhook/:providerId
   * The providerId in the URL allows O(1) lookup of the webhook secret.
   * If a hook is sent to /github/webhook (legacy) we fall back to repo lookup.
   */
  @Post('github/webhook/:providerId')
  @SkipThrottle()
  @ApiOperation({ summary: 'Receive GitHub webhook events (provider-aware URL)' })
  @ApiResponse({ status: 200, description: 'Event processed' })
  @ApiResponse({ status: 403, description: 'Invalid HMAC signature' })
  async handleWebhook(
    @Param('providerId') providerId: string,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Headers('x-github-event') event: string | undefined,
    @Req() req: { rawBody?: Buffer },
  ) {
    // Use rawBody (set by NestFactory rawBody: true). NEVER re-serialize the parsed body
    // because JSON.stringify is not canonical and will break HMAC verification.
    const rawBody = req.rawBody
      ? req.rawBody.toString('utf-8')
      : '';

    if (!rawBody) {
      throw new Error('rawBody manquant — vérifiez NestFactory.create({ rawBody: true })');
    }

    // Parse just enough to extract repo full name for fallback lookup
    let repoFullName: string | undefined;
    try {
      const parsed = JSON.parse(rawBody) as { repository?: { full_name?: string } };
      repoFullName = parsed.repository?.full_name;
    } catch {
      // ignore parse error — verification will fail with no repo
    }

    const { providerId: resolvedProviderId } =
      await this.webhookService.verifyWebhookSignature(signature, rawBody, {
        providerId,
        repoFullName,
      });

    return await this.webhookService.handleWebhook(
      JSON.parse(rawBody),
      event,
    );
  }

  /**
   * Legacy global webhook URL (no providerId in path).
   * Looks up the provider via the repo full name.
   */
  @Post('github/webhook')
  @SkipThrottle()
  @ApiOperation({ summary: 'Receive GitHub webhook events (legacy — repo lookup)' })
  @ApiResponse({ status: 200, description: 'Event processed' })
  @ApiResponse({ status: 403, description: 'Invalid HMAC signature' })
  async handleLegacyWebhook(
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Headers('x-github-event') event: string | undefined,
    @Req() req: { rawBody?: Buffer },
  ) {
    const rawBody = req.rawBody ? req.rawBody.toString('utf-8') : '';
    if (!rawBody) {
      throw new Error('rawBody manquant');
    }

    let repoFullName: string | undefined;
    try {
      const parsed = JSON.parse(rawBody) as { repository?: { full_name?: string } };
      repoFullName = parsed.repository?.full_name;
    } catch {
      // ignore
    }

    await this.webhookService.verifyWebhookSignature(signature, rawBody, {
      repoFullName,
    });

    return await this.webhookService.handleWebhook(
      JSON.parse(rawBody),
      event,
    );
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
    @Param('repoId') repoId: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.githubService.listBranches(
      projectId,
      user.id,
      user.role,
      repoId,
    );
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
