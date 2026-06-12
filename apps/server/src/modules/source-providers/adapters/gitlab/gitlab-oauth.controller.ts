import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { GitProviderOauthService } from '../../config/git-provider-oauth.service';

@ApiExcludeController()
@Controller('gitlab')
export class GitlabOAuthController {
  constructor(private readonly oauth: GitProviderOauthService) {}

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.oauth.completeGitlabOAuthCallback({
      code,
      state,
      error,
      errorDescription,
      callbackBaseUrl: this.resolvePublicBaseUrl(req),
    });

    return res.redirect(result.redirectTo);
  }

  private resolvePublicBaseUrl(req: Request): string {
    const forwardedProto = req.header('x-forwarded-proto');
    const forwardedHost = req.header('x-forwarded-host');
    const protocol = forwardedProto?.split(',')[0]?.trim() || req.protocol || 'http';
    const host = forwardedHost?.split(',')[0]?.trim() || req.get('host');
    if (!host) throw new BadRequestException('Host HTTP manquant pour construire callback');
    return `${protocol}://${host}`;
  }
}
