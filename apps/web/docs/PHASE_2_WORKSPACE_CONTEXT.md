# Phase 2 — Frontend workspace context

The customer UI treats the selected workspace as explicit session context.

## Lifecycle

1. Authentication restores the customer identity.
2. `WorkspaceSessionManager` loads `GET /workspaces`.
3. The previous selection is retained only if the identity is still an active
   member. Otherwise the first authorized workspace is selected.
4. `WorkspaceSwitcher` changes the selection and invalidates cached queries so
   data from the previous workspace is not reused.
5. The shared HTTP client attaches `X-Workspace-Id`; integration screens use
   canonical `/workspaces/:workspaceId/...` paths as well.
6. Logout/account deletion clears both identity and workspace state.

The local-storage value is never trusted by the backend. A removed membership,
foreign resource or stale workspace selection is rejected server-side.

## UI authorization

`useAuth()` derives customer administration from the selected membership:

- OWNER and ADMIN see workspace administration/integration/server surfaces;
- MEMBER sees only projects granted through project membership;
- project actions are rendered according to MAINTAINER, DEVELOPER or VIEWER.

Legacy global user creation screens redirect to Workspace Members. Membership
is established through email invitations, not by creating another global user.
The invitation acceptance page requires an authenticated identity whose email
matches the invitation.

Billing navigation is feature-disabled until its future permission and product
contract are implemented.
