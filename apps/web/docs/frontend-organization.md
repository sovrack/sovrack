# Frontend Organization (Professional Baseline)

This document defines the structure to keep the frontend modular, predictable, and easy to scale.

## 1) Single Sources Of Truth

- Navigation and route labels:
  - `src/config/navigation.ts`
- Layout dimensions and shared shell sizing:
  - `src/config/layout.ts`
- Theme/design tokens:
  - `src/styles/globals.css`

When you add or rename a page, update `src/config/navigation.ts` first.

## 2) Folder Strategy

- `src/app/(app)/...`:
  - Page entry points only
  - Keep pages thin (composition, no heavy UI blocks inline)
- `src/components/<feature>/...`:
  - Reusable feature blocks (`projects`, `deployments`, `servers`, etc.)
- `src/components/ui/...`:
  - Generic UI primitives (button, input, badge, alert, etc.)
- `src/hooks/...`:
  - State and behavior reuse (queries, local state orchestration)
- `src/services/...`:
  - API calls only (no presentation logic)
- `src/types/...`:
  - Shared app types and API contracts

## 3) New Page Workflow

1. Scaffold page:

```bash
npm run scaffold:page -- /billing "Billing"
```

2. Scaffold reusable feature blocks:

```bash
npm run scaffold:feature -- billing
```

3. Register route label (and nav item if needed):
   - `src/config/navigation.ts`
4. Move page-specific UI into `src/components/<feature>/...`
5. Move data fetching/actions into `src/hooks/...` and `src/services/...`
6. Validate:

```bash
npm run check:frontend
```

## 4) Modularity Rules

- Avoid large page files (>250 lines) when possible.
- Avoid duplicated class strings. If a style repeats, extract a component.
- Keep business/API logic out of visual components.
- Prefer composition:
  - Page -> Section components -> UI primitives

## 5) Recommended File Pattern Per Feature

- `src/components/<feature>/<feature>-list.tsx`
- `src/components/<feature>/<feature>-form.tsx`
- `src/hooks/use<Feature>.ts`
- `src/services/<feature>.service.ts`
- `src/types/<feature>.ts`

## 6) Why This Works

- One place to control navigation/labels.
- One place to control layout dimensions.
- Clear separation between UI, behavior, and API.
- Faster onboarding and safer page additions.

## 7) Quality Gates

- `npm run check:architecture`
  - Validates that all sidebar/navigation routes point to real page files.
  - Blocks forbidden color families (`purple-*`, `violet-*`, `fuchsia-*`, and hardcoded purple hex values).
- `npm run check:frontend`
  - Runs architecture gate + lint + TypeScript checks in one command.
