# Phase 2 — Workspace authorization contract

## Scope and vocabulary

- `User` is a customer identity. It has no authoritative customer-wide role.
- `Staff` is a separate platform identity (`ROOT`, `ADMIN`, `OPERATOR`).
- `Team` is the existing persistence name for the product concept `Workspace`.
- `TeamMember` is the source of truth for a user's role in one workspace.
- `ProjectMember` grants a workspace member a role in one project.

The public API and UI use **workspace**. The existing database table remains
`Team` during the migration so no second tenant aggregate is introduced.

## Workspace roles

| Action | OWNER | ADMIN | MEMBER |
| --- | --- | --- | --- |
| Read workspace | allow | allow | allow |
| Update workspace | allow | allow | deny |
| Create project | allow | allow | deny |
| Delete project | allow | allow | deny |
| Manage servers and terminal | allow | allow | deny |
| Invite MEMBER | allow | allow | deny |
| Manage ADMIN | allow | deny | deny |
| Manage OWNER | allow | deny | deny |
| Delete workspace | allow | deny | deny |

There may be multiple owners, but a workspace must always retain at least one
active owner. Billing is not a mutually exclusive workspace role. When billing
returns, it will use an orthogonal permission such as `MANAGE_BILLING`.

## Project roles

| Action | MAINTAINER | DEVELOPER | VIEWER |
| --- | --- | --- | --- |
| Read project, deployments and non-secret logs | allow | allow | allow |
| Deploy to an unprotected environment | allow | allow | deny |
| Deploy to a protected environment | allow | deny | deny |
| Roll back | allow | deny | deny |
| Manage project configuration | allow | deny | deny |
| Replace secrets | allow | deny | deny |
| Assign existing workspace members | allow | deny | deny |

Workspace owners and admins inherit maintainer capabilities on every project in
their workspace. A workspace member needs an explicit `ProjectMember` row.
Project deletion and server terminal access remain workspace-level operations.
Provider tokens, SSH keys and configuration secrets are write-only and are
never returned after storage. Generated managed-database credentials use a
separate, audited reveal endpoint restricted to a project MAINTAINER (including
workspace OWNER/ADMIN inheritance); its response must never be cached.

## Authorization decision order

Every protected operation is evaluated in this order:

1. authenticate the customer identity and verify the account is active;
2. resolve the explicit workspace context;
3. load an active workspace membership;
4. load the resource scoped by both resource id and workspace id;
5. evaluate the workspace/project permission;
6. apply contextual constraints (protected environment, ready server, etc.);
7. deny by default when no rule grants the action.

A foreign-workspace resource is returned as `404`; a known same-workspace
resource with insufficient privileges is returned as `403`.

## Tenant invariants

- Every customer project, server and credential configuration belongs to one
  workspace.
- A project member must also be an active member of the project's workspace.
- HTTP queries, counts, background jobs, Redis keys, WebSocket rooms and audit
  records carry workspace context.
- Workers reload and validate relationships; queued payloads are not treated as
  authorization proof.
- Account deletion removes the identity and its memberships, never resources
  owned by workspaces. The last active owner must transfer ownership or delete
  the workspace explicitly first.

## Stable policy actions

The backend policy layer uses actions instead of scattered enum comparisons:

```text
workspace.read
workspace.update
workspace.delete
workspace.members.invite
workspace.members.manage
workspace.owners.manage
project.read
project.update
project.delete
project.members.manage
project.deploy
project.deploy_protected
project.rollback
server.read
server.manage
server.terminal
integration.read
integration.manage
```

This document is the Phase 2 authorization source of truth. A change to a role
must update this contract and its table-driven policy tests in the same change.

## Account and invitation flows

### New customer registration

1. `POST /auth/register` creates an inactive global identity. The legacy
   `User.role` remains `MEMBER` and is not used to grant customer access.
2. The requested workspace name is kept until email verification.
3. `POST /auth/verify-email` activates the identity, creates the workspace and
   creates an active `TeamMember(OWNER)` membership atomically.
4. The workspace appears in `GET /workspaces`; the frontend selects it and
   sends its id on subsequent requests.

### Joining an existing workspace

1. An OWNER or ADMIN submits an email and an allowed role. ADMIN can invite
   MEMBER only; OWNER can also invite ADMIN or OWNER.
2. The database stores only a SHA-256 hash of the random invitation token.
3. The recipient signs in with exactly the invited email and submits the raw
   token to `POST /workspaces/invitations/accept`.
4. Acceptance verifies status, expiration and normalized email, then creates
   or activates the membership and consumes the invitation in one transaction.
5. Reuse, revocation, expiration and cross-email acceptance are rejected.

Invitations do not create global accounts and do not change `User.role`.

## HTTP workspace context

The canonical API shape carries the workspace explicitly:

```text
/workspaces/:workspaceId/projects/:projectId/...
/workspaces/:workspaceId/servers/...
/workspaces/:workspaceId/integrations/...
```

Legacy routes remain temporarily available. They resolve the workspace from
`X-Workspace-Id`; the header is optional only when the identity has exactly one
active workspace. A multi-workspace identity without explicit context receives
`WORKSPACE_CONTEXT_REQUIRED`.

The frontend persists only the selected workspace id. It reloads memberships
from `/workspaces` after authentication, removes a stale selection and attaches
`X-Workspace-Id` through the shared HTTP client. The workspace id is context,
not authorization proof: every request reloads the membership server-side.

## Resource ownership and credential boundaries

The following roots have mandatory workspace ownership:

- projects and project memberships;
- servers, SSH keys and server runs;
- Git providers, registries and DNS providers;
- audit records whenever a workspace can be resolved.

Services, environments, deployments, domains, containers, volumes, proxy
rules, webhooks and monitoring data are scoped through their parent project or
server. Queries use both the resource id and its workspace ancestry. Provider
ids supplied by a request are checked against the project's workspace before
they are linked. Secret fields are write-only or masked in ordinary responses.
The single managed-database credential reveal operation follows the explicit,
audited exception documented above.

## Asynchronous and real-time boundaries

- Queue payloads include a workspace id, but workers reload the deployment,
  project or server and compare the persisted relationship before acting.
- Redis concurrency keys include the workspace/project boundary.
- WebSocket connections authenticate the identity. Room subscription reloads
  project/server access instead of trusting an id from the socket payload.
- Automation runs and server setup runs persist `teamId`; processors validate
  all target servers against it.
- Webhook management validates the authorized project and then requires the
  supplied service and endpoint to belong to that same project.
- Nest closes every BullMQ producer during shutdown; unit and E2E fixtures mock
  all queues and therefore terminate naturally without a Redis dependency.

## Error contract

The global exception filter returns a stable JSON envelope containing HTTP
status, machine-readable `code`, human-readable `message`, request path,
timestamp and `requestId`. The response also exposes `X-Request-Id`.

Important authorization behavior:

- `401`: identity absent, invalid or inactive;
- `404`: workspace/resource absent or outside the actor's authorized scope;
- `403`: resource is in the selected workspace but the effective role cannot
  perform the action;
- `400 WORKSPACE_CONTEXT_REQUIRED`: several active workspaces exist and none
  was selected;
- `400 LAST_OWNER_REQUIRED`: an action would leave a workspace without an
  active owner.

## Billing and global customer administration

Customer billing and notification controllers are intentionally not registered
in Phase 2. The old global platform configuration controller and customer-side
global user administration endpoints are also removed. Back-office Staff
identities remain separate. Billing can return later as an orthogonal
`MANAGE_BILLING` permission without adding a mutually exclusive BILLING role.

## Database migrations

The phase is represented by three forward migrations:

1. `20260817183000_phase2_workspace_authorization` adds workspace roles,
   membership status, invitation storage, mandatory ownership and scoped
   credential constraints. It backfills only unambiguous ownership and aborts
   when a manual mapping is required.
2. `20260817190000_phase2_server_runs_workspace` backfills server runs from
   their server/steps and aborts if a historical run mixes workspaces.
3. `20260818120000_phase2_security_invariants` adds registration-attempt
   binding for verification codes plus scoped uniqueness for webhook deliveries
   and external pipeline runs. The credential backfill script encrypts legacy
   database credentials before the pre-migration gate permits deployment.

Do not edit historical migrations. Before production, take a database backup,
run the pre-migration checks against a restored snapshot, resolve every abort
explicitly, then use `npm run db:migrate:safe`. A rollback after the schema
migration is a database restore plus application rollback; it is not an
automatic destructive down migration.

## Local verification baseline

Run from `backend/`:

```bash
npm run lint
npm run arch:check
npm run build
npx prisma validate
npm run prisma:migrate:status
npm test -- --runInBand
npm run test:e2e
```

Run from `frontend/`:

```bash
npm run contract:generate
npm run type-check
npm run lint
npm run check:architecture
npm test
npm run build
```

Production deployment, production migrations and legacy-route removal are
separate, explicitly approved operations; Phase 2 local completion performs
none of them.
