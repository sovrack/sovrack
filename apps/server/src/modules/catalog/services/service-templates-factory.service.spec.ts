import { ConflictException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ServiceTemplatesFactoryService } from './service-templates-factory.service';
import { ProjectAccessService } from '../authorization/project-access.service';
import { ServicesService } from './services.service';

// Moved from services.service.spec.ts when listTemplates/createFromTemplate
// were extracted into ServiceTemplatesFactoryService — see
// EXPLORATION_BACKEND_DEPENDANCES.md section 2. createFromTemplate now calls
// the injected ServicesService.create() (mocked here) instead of `this.create`.
describe('ServiceTemplatesFactoryService', () => {
  const projectId = 'project-1';
  const userId = 'user-1';

  function harness() {
    const prisma = {
      // $transaction est mocké pour exécuter le callback avec ce même mock en
      // guise de `tx` — suffisant en test unitaire, l'atomicité réelle (tout
      // ou rien) est garantie par Prisma en production, pas testable ici.
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    const projectAccess = {
      assertCanManageProject: jest.fn().mockResolvedValue(undefined),
    };
    const servicesService = {
      create: jest.fn(),
    };
    const service = new ServiceTemplatesFactoryService(
      prisma,
      projectAccess as unknown as ProjectAccessService,
      servicesService as unknown as ServicesService,
    );
    return { service, prisma, projectAccess, servicesService };
  }

  it('listTemplates exposes every catalogue template with its components', () => {
    const { service } = harness();
    const templates = service.listTemplates();
    expect(templates.length).toBeGreaterThan(0);
    for (const t of templates) {
      expect(t.id).toBeTruthy();
      expect(Array.isArray(t.services)).toBe(true);
    }
  });

  it('createFromTemplate throws NotFoundException for an unknown template', async () => {
    const { service } = harness();
    await expect(
      service.createFromTemplate(projectId, 'nope', 'base', userId, Role.OWNER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // Depuis le passage à $transaction() (tout-ou-rien géré par Prisma), le
  // rollback manuel a été retiré — une transaction qui échoue annule
  // automatiquement toutes les écritures qu'elle contient. Ce test vérifie
  // donc : (1) l'erreur du 2e composant propage bien, (2) toute la boucle de
  // création passe par $transaction, (3) create() reçoit le même `tx` à
  // chaque appel (composition transactionnelle réelle, pas juste séquentielle).
  it('createFromTemplate wraps all component creations in a single transaction', async () => {
    const { service, prisma, servicesService } = harness();
    // 1st component created, 2nd rejects (e.g. unique violation surfaced by
    // the real ServicesService.create() as ConflictException).
    servicesService.create
      .mockResolvedValueOnce({ id: 'c1' })
      .mockRejectedValueOnce(new ConflictException('duplicate'));

    await expect(
      service.createFromTemplate(
        projectId,
        'postgres-pgadmin',
        'stack',
        userId,
        Role.OWNER,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(servicesService.create).toHaveBeenCalledTimes(2);
    // Same tx object propagated to every create() call in the loop.
    const txArgs = servicesService.create.mock.calls.map((c) => c[4]);
    expect(txArgs[0]).toBe(txArgs[1]);
  });

  it('propagates the access guard rejection without creating anything', async () => {
    const { service, projectAccess, servicesService } = harness();
    projectAccess.assertCanManageProject.mockRejectedValue(
      new Error('forbidden'),
    );

    await expect(
      service.createFromTemplate(
        projectId,
        'postgres-pgadmin',
        'stack',
        userId,
        Role.OWNER,
      ),
    ).rejects.toThrow('forbidden');
    expect(servicesService.create).not.toHaveBeenCalled();
  });
});
