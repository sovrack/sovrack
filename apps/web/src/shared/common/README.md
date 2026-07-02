# shared/common/

App-shell building blocks — consumed by `app/` (route/layout/error files) or
by `shared/layout/`, never by a business feature (`features/*`). Verified
2026-07 (Sprints 4+5+6 mission, B10):

- `error-boundary.tsx` — `app/layout.tsx` only.
- `protected-route.tsx` — `app/(app)/**/layout.tsx` only.
- `section-error.tsx` — `app/(app)/**/error.tsx` only.
- `theme-toggle.tsx` — `shared/layout/top-nav.tsx` (app-shell chrome, not a feature).
- `log-terminal.tsx` — a true leaf (its `LogLine` type lives in
  `shared/types/log-line.ts`, not a feature); currently rendered from
  `app/(app)/automation/[id]/page.tsx`.

If a future change makes one of these consumed from inside `features/*`,
either that's a sign that the component belongs to `shared/ui/` (generic,
reusable UI) instead, or that the feature should own its own copy.
