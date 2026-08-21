import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { AcceptWorkspaceInvitationDto } from './dto/accept-workspace-invitation.dto';
import { InviteWorkspaceMemberDto } from './dto/invite-workspace-member.dto';
import { WorkspaceInvitationsService } from './workspace-invitations.service';

@ApiTags('Workspace invitations')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspaceInvitationsController {
  constructor(private readonly invitations: WorkspaceInvitationsService) {}

  @Get(':workspaceId/invitations')
  @ApiOperation({ summary: 'List workspace invitations' })
  list(@Param('workspaceId') workspaceId: string, @GetUser() user: JwtPayload) {
    return this.invitations.list(workspaceId, user.id);
  }

  @Post(':workspaceId/invitations')
  @ApiOperation({ summary: 'Invite a workspace member by email' })
  invite(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: InviteWorkspaceMemberDto,
    @GetUser() user: JwtPayload,
  ) {
    return this.invitations.invite(workspaceId, user.id, dto);
  }

  @Delete(':workspaceId/invitations/:invitationId')
  @ApiOperation({ summary: 'Revoke a pending workspace invitation' })
  async revoke(
    @Param('workspaceId') workspaceId: string,
    @Param('invitationId') invitationId: string,
    @GetUser() user: JwtPayload,
  ) {
    await this.invitations.revoke(workspaceId, invitationId, user.id);
    return { message: 'Invitation révoquée' };
  }

  @Post('invitations/accept')
  @ApiOperation({ summary: 'Accept a workspace invitation' })
  accept(
    @Body() dto: AcceptWorkspaceInvitationDto,
    @GetUser() user: JwtPayload,
  ) {
    return this.invitations.accept(dto.token, user.id);
  }
}
