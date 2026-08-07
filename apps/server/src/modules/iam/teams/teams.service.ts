import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { UsageGuardService } from '../../billing/usage-guard.service';

const teamWithMembersInclude = {
  members: {
    orderBy: { joinedAt: 'asc' as const },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  },
} satisfies Prisma.TeamInclude;

type TeamWithMembers = Prisma.TeamGetPayload<{
  include: typeof teamWithMembersInclude;
}>;

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usageGuard: UsageGuardService,
  ) {}

  async findAll(actor?: {
    id: string;
    role: Role;
  }): Promise<TeamWithMembers[]> {
    const where = actor ? { members: { some: { userId: actor.id } } } : {};
    return this.prisma.team.findMany({
      where,
      include: teamWithMembersInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(
    id: string,
    actor?: { id: string; role: Role },
  ): Promise<TeamWithMembers> {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: teamWithMembersInclude,
    });
    if (!team) {
      throw new NotFoundException('Équipe introuvable');
    }
    if (actor) {
      await this.assertMember(id, actor);
    }
    return team;
  }

  /**
   * Multi-tenant : seuls les membres de l'équipe peuvent y accéder.
   */
  private async assertMember(
    teamId: string,
    actor: { id: string; role: Role },
  ): Promise<void> {
    const membership = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: actor.id } },
      select: { id: true },
    });
    if (!membership) {
      throw new NotFoundException('Équipe introuvable');
    }
  }

  async create(
    dto: CreateTeamDto,
    creatorUserId?: string,
  ): Promise<TeamWithMembers> {
    const existing = await this.prisma.team.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException('Une équipe avec ce nom existe déjà');
    }

    const team = await this.prisma.team.create({
      data: {
        name: dto.name,
        description: dto.description,
        ...(creatorUserId
          ? { members: { create: { userId: creatorUserId } } }
          : {}),
      },
      include: teamWithMembersInclude,
    });
    this.logger.log(`Team "${team.name}" (${team.id}) created`);
    return team;
  }

  async update(
    id: string,
    dto: UpdateTeamDto,
    actor?: { id: string; role: Role },
  ): Promise<TeamWithMembers> {
    await this.findOne(id, actor);
    const team = await this.prisma.team.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!team) {
      throw new NotFoundException('Équipe introuvable');
    }

    if (dto.name) {
      const nameConflict = await this.prisma.team.findFirst({
        where: { name: dto.name, id: { not: id } },
        select: { id: true },
      });
      if (nameConflict) {
        throw new ConflictException('Une équipe avec ce nom existe déjà');
      }
    }

    return this.prisma.team.update({
      where: { id },
      data: dto,
      include: teamWithMembersInclude,
    });
  }

  async remove(
    id: string,
    actor?: { id: string; role: Role },
  ): Promise<TeamWithMembers> {
    await this.findOne(id, actor);
    const team = await this.prisma.team.delete({
      where: { id },
      include: teamWithMembersInclude,
    });
    this.logger.warn(`Team "${team.name}" (${id}) deleted`);
    return team;
  }

  async addMember(
    id: string,
    dto: AddTeamMemberDto,
    actor?: { id: string; role: Role },
  ): Promise<TeamWithMembers> {
    await this.findOne(id, actor);
    await this.usageGuard.guardForTeam(id, 'ADD_TEAM_MEMBER');

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const existing = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: id, userId: dto.userId } },
    });
    if (existing) {
      throw new ConflictException(
        "L'utilisateur est déjà membre de cette équipe",
      );
    }

    await this.prisma.teamMember.create({
      data: { teamId: id, userId: dto.userId },
    });
    this.logger.log(`User ${dto.userId} added to team ${id}`);

    return this.findOne(id);
  }

  async removeMember(
    id: string,
    userId: string,
    actor?: { id: string; role: Role },
  ): Promise<TeamWithMembers> {
    await this.findOne(id, actor);

    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: id, userId } },
    });
    if (!member) {
      throw new NotFoundException(
        "L'utilisateur n'est pas membre de cette équipe",
      );
    }

    await this.prisma.teamMember.delete({
      where: { teamId_userId: { teamId: id, userId } },
    });
    this.logger.log(`User ${userId} removed from team ${id}`);

    return this.findOne(id);
  }

  async addTeamToProject(projectId: string, teamId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Projet introuvable');
    }

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { members: true },
    });
    if (!team) {
      throw new NotFoundException('Équipe introuvable');
    }

    // B-4 fix: bulk-insert all team members at once, skip existing rows atomically.
    await this.prisma.projectMember.createMany({
      data: team.members.map((m) => ({ projectId, userId: m.userId })),
      skipDuplicates: true,
    });
  }
}
