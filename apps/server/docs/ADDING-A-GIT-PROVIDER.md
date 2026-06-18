# Ajouter un fournisseur Git (Bitbucket, Gitea, self-hosted…)

L'architecture est **multi-provider par registre** (principe Open/Closed) :
ajouter un fournisseur = écrire **un adapter** + **l'enregistrer**. Le moteur
(webhook → build → deploy) et la résolution (`forType`/`listAvailable`) ne
changent **jamais**.

## Le contrat unique : `IGitProvider`

Fichier : `src/modules/source-providers/interfaces/source-provider.interface.ts`.

```ts
export interface IGitProvider {
  readonly type: GitProviderType;            // discriminant du registre

  // Dépôts
  listRepos(projectId, userId, userRole): Promise<RepoItem[]>;
  listBranches(projectId, userId, userRole): Promise<BranchItem[]>;
  resolveRepositoryPath(projectId, repoId?): Promise<string>;

  // Pipelines / CI
  listPipelines(projectId, userId, userRole): Promise<PipelineItem[]>;
  triggerPipeline(projectId, branch, userId, userRole, repoId?): Promise<PipelineItem>;

  // Fichiers (le module build pousse Dockerfile, etc.)
  readFile(projectId, filePath, ref?): Promise<string | null>;
  writeFiles(projectId, files, serviceId?): Promise<RepoWriteResult>;

  // Connexion / webhooks (voir l'interface pour la signature exacte)
  // …
}
```

## Étapes (4)

### 1. Écrire l'adapter
`src/modules/source-providers/bitbucket/bitbucket.service.ts`
```ts
@Injectable()
export class BitbucketService implements IGitProvider {
  readonly type = 'BITBUCKET' as const;
  constructor(/* HttpService, PrismaService, CryptoService… */) {}

  async listRepos(projectId, userId, userRole) { /* API Bitbucket */ }
  async triggerPipeline(...)                    { /* API Bitbucket */ }
  async writeFiles(...)                         { /* API Bitbucket */ }
  // … remplir tout le contrat IGitProvider
}
```
> Toute la logique **spécifique** au provider vit ICI. Rien ailleurs.

### 2. Ajouter la valeur d'enum (schéma)
`prisma/schema.prisma` :
```prisma
enum GitProviderType {
  GITLAB
  GITHUB
  BITBUCKET   // ← +1
}
```
Puis `npx prisma migrate dev --name add_bitbucket_provider` (additif, non destructif).

### 3. Enregistrer l'adapter dans le registre
`source-providers.service.ts` — la **seule** ligne de couplage :
```ts
private get registeredProviders(): IGitProvider[] {
  return [this.gitlabCore, this.github, this.bitbucket]; // ← +1
}
```
(et l'injecter au constructeur + le déclarer dans `source-providers.module.ts`)

### 4. Brancher le webhook entrant
Implémenter `IWebhookHandler` (parsing du payload Bitbucket) — enregistré
dans le registre des webhooks ; la logique de **matching** (push → quel
Service rebuild) est **générique**, déjà écrite une fois.

## Ce qu'on ne touche JAMAIS

- `forType()` / `listAvailable()` / `forProject()` — résolution par registre.
- Le moteur build/deploy — il appelle `provider.xxx()` via l'interface.
- Les controllers, le frontend (contrat OpenAPI inchangé sauf la valeur d'enum).

## Pourquoi c'est « niveau entreprise »

Le point d'extension est **fermé à la modification, ouvert à l'extension** :
un nouveau provider est une **addition isolée**, testable seule, sans risque
de régression sur les providers existants. C'est le standard des IDP pro
(Railway, Render, Qovery).
