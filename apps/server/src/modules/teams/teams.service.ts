import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { AddTeamMemberDto } from './dto/add-team-member.dto';

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
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<TeamWithMembers[]> {
    return this.prisma.team.findMany({
      include: teamWithMembersInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<TeamWithMembers> {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: teamWithMembersInclude,
    });
    if (!team) {
      throw new NotFoundException('Équipe introuvable');
    }
    return team;
  }

  async create(dto: CreateTeamDto): Promise<TeamWithMembers> {
    const existing = await this.prisma.team.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException('Une équipe avec ce nom existe déjà');
    }

    return this.prisma.team.create({
      data: { name: dto.name, description: dto.description },
      include: teamWithMembersInclude,
    });
  }

  async update(id: string, dto: UpdateTeamDto): Promise<TeamWithMembers> {
    await this.findOne(id);

    if (dto.name) {
      const existing = await this.prisma.team.findUnique({
        where: { name: dto.name },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Une équipe avec ce nom existe déjà');
      }
    }

    return this.prisma.team.update({
      where: { id },
      data: dto,
      include: teamWithMembersInclude,
    });
  }

  async remove(id: string): Promise<TeamWithMembers> {
    await this.findOne(id);
    return this.prisma.team.delete({
      where: { id },
      include: teamWithMembersInclude,
    });
  }

  async addMember(id: string, dto: AddTeamMemberDto): Promise<TeamWithMembers> {
    await this.findOne(id);

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

    return this.findOne(id);
  }

  async removeMember(id: string, userId: string): Promise<TeamWithMembers> {
    await this.findOne(id);

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

    // Add all team members to the project (as DEVELOPER by default, skip if already present)
    for (const member of team.members) {
      const existing = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: member.userId } },
      });
      if (!existing) {
        await this.prisma.projectMember.create({
          data: { projectId, userId: member.userId },
        });
      }
    }
  }
}
