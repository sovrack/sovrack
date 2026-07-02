import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { ProjectAccessService } from '../authorization/project-access.service';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import {
  findServiceTemplate,
  resolveServiceTemplateComponents,
  SERVICE_TEMPLATES,
} from './templates/service-templates.catalogue';

/**
 * Factory des templates de service one-click ("Postgres + pgAdmin", etc.),
 * extraite de ServicesService — voir EXPLORATION_BACKEND_DEPENDANCES.md
 * section 2. Dépend de `ServicesService` (pas l'inverse) et appelle
 * `create(..., tx)` en conservant le paramètre de transaction optionnel déjà
 * présent — c'est ce qui permet à `createFromTemplate` de rester all-or-nothing.
 */
@Injectable()
export class ServiceTemplatesFactoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
    private readonly servicesService: ServicesService,
  ) {}

  listTemplates() {
    return SERVICE_TEMPLATES.map(({ id, name, description, components }) => ({
      id,
      name,
      description,
      services: components.map((c) => ({
        nameSuffix: c.nameSuffix,
        type: c.type,
        databaseType: c.databaseType,
      })),
    }));
  }

  /**
   * Creates every component of a one-click template as its own Service.
   * Components needing each other (e.g. pgAdmin reaching Postgres) rely on
   * the existing project-network auto-wiring, not on anything done here. If
   * a component fails to create, the previously created ones are rolled
   * back (hard-deleted — they have no deployment/build history yet) so the
   * template creation is all-or-nothing.
   */
  async createFromTemplate(
    projectId: string,
    templateId: string,
    baseName: string,
    userId: string,
    userRole: Role,
  ) {
    await this.projectAccess.assertCanManageProject(
      projectId,
      userId,
      userRole,
    );

    const template = findServiceTemplate(templateId);
    if (!template) {
      throw new NotFoundException(`Template "${templateId}" introuvable`);
    }

    const components = resolveServiceTemplateComponents(template, baseName);

    // Tout ou rien : si un composant échoue, la transaction annule
    // automatiquement les créations précédentes (plus besoin de rollback
    // manuel par .delete() — supprimé, il devenait redondant et pouvait
    // silencieusement échouer à nettoyer en cas d'erreur de cleanup).
    return this.prisma.$transaction(async (tx) => {
      const created: Awaited<ReturnType<typeof this.servicesService.create>>[] =
        [];
      for (const component of components) {
        const service = await this.servicesService.create(
          projectId,
          {
            name: component.name,
            type: component.type,
            sourceType: component.sourceType,
            repoPath: component.repoPath,
            buildPack: component.buildPack,
            port: component.port,
            databaseType: component.databaseType,
            databaseVersion: component.databaseVersion,
            env: component.env,
          } as CreateServiceDto,
          userId,
          userRole,
          tx,
        );
        created.push(service);
      }
      return created;
    });
  }
}
