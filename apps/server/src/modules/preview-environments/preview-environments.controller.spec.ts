import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { JwtPayload } from '../../shared/jwt/dto/jwt-payload.dto';
import { PrismaService } from '../../shared/database/prisma.service';
import { PreviewEnvironmentService } from './preview-environment.service';
import { PreviewEnvironmentsController } from './preview-environments.controller';

describe('PreviewEnvironmentsController', () => {
  function build(opts?: { project?: unknown; member?: unknown }) {
    const prisma = {
      project: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            'project' in (opts ?? {}) ? opts!.project : { id: 'p1' },
          ),
      },
      projectMember: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            'member' in (opts ?? {}) ? opts!.member : { role: 'DEVELOPER' },
          ),
      },
    } as unknown as PrismaService;
    const previews = {
      listForProject: jest.fn().mockResolvedValue([]),
      openPreview: jest.fn().mockResolvedValue({ id: 'pv1' }),
      closePreview: jest.fn().mockResolvedValue({ ok: true }),
    } as unknown as PreviewEnvironmentService;
    const ctrl = new PreviewEnvironmentsController(previews, prisma);
    return { ctrl, previews, prisma };
  }

  const admin = { id: 'admin', role: Role.ADMIN } as JwtPayload;
  const dev = { id: 'dev', role: Role.DEVELOPER } as JwtPayload;

  it('list / open / close delegate after the access check', async () => {
    const { ctrl, previews } = build();
    await ctrl.list('p1', admin);
    await ctrl.open(
      'p1',
      { mergeRequestId: 'mr1', branch: 'b' } as never,
      admin,
    );
    await ctrl.close('p1', 'mr1', admin);
    expect(previews.listForProject).toHaveBeenCalledWith('p1');
    expect(previews.openPreview).toHaveBeenCalledWith('p1', 'mr1', 'b');
    expect(previews.closePreview).toHaveBeenCalledWith('p1', 'mr1');
  });

  it('throws NotFound when the project does not exist', async () => {
    const { ctrl } = build({ project: null });
    await expect(ctrl.list('ghost', admin)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('allows non-admin members and forbids non-members', async () => {
    const ok = build({ member: { role: 'DEVELOPER' } });
    await expect(ok.ctrl.list('p1', dev)).resolves.toBeDefined();

    const ko = build({ member: null });
    await expect(ko.ctrl.list('p1', dev)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
