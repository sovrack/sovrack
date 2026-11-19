# shared/hooks/

App-shell hooks — consumed by `app/` route files or by `shared/common/`,
never by a business feature (`features/*`). Verified 2026-07 (Sprints 4+5+6
mission, B10):

- `use-pagination.ts` — client-side pagination of an already-loaded array;
  consumed by `app/(app)/admin/servers`, `admin/users`, `projects`,
  `deployments` pages.
- `use-theme.ts` — consumed by `shared/common/theme-toggle.tsx` (app-shell
  chrome, not a feature).
- `use-toasts.ts` — local per-page toast state (auto-dismiss), distinct from
  the global `ToastProvider`/`useToast` in `shared/contexts/toast-context.tsx`
  (features use the global one via `useToast()`; this hook only factors out
  duplicated local-toast-rendering logic across 3 `app/` pages that don't use
  the global provider: admin/users, settings/registry, settings/git).

Features needing pagination or toasts should use `shared/contexts/toast-context.tsx`'s
`useToast()` (already the convention across `features/*`) rather than these.
