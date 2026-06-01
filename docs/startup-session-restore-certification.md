# ECS Startup And Session Restore Certification

Date: 2026-05-03

## Scope

Certified the release startup path covering auth startup, Supabase session restore, persistent store hydration, setup-complete state, saved shell-route restore, loading video gating, offline-mode hydration, and initial ECS shell rendering.

## Findings

- TypeScript and startup route selection were already clean before patching.
- The loading-flow regression test failed because authenticated redirects pending from `/login` or `/` were held on an ECS branded spinner surface instead of the approved `LoadingTransitionVideo`.
- The route resolver already supported valid remembered-session shell route restoration, including `/navigate`.
- Fresh authenticated login from `/login` intentionally lands on `/dashboard`, ignoring stale shell-route restore.
- Offline remembered-session restore stays in offline mode and can restore a saved shell route without marking live services ready.

## Patch

- `app/_layout.tsx` now imports and renders `LoadingTransitionVideo` for authenticated post-login/post-restore redirect holding.
- The existing `MIN_LOADING_MS = 3000` gate remains in place, exceeding the 2 second release requirement.
- `scripts/test-auth-startup-route-selection.js` now covers:
  - cold launch valid session restoring `/navigate`
  - fresh login from `/login` landing on `/dashboard`
  - offline remembered session restoring `/navigate` honestly

## Certified Behaviors

- No pre-loading app surface should flash for authenticated redirect holds; the approved loading video owns that transition.
- Valid cold-launch session restores into the ECS shell.
- Invalid/no session at root routes to `/login`.
- Fresh login routes to `/dashboard`.
- Saved shell route restoration works for `/navigate` on remembered startup.
- Offline remembered session restore remains offline-honest and does not fake online readiness.
- Startup route, dashboard hydration, and auth restore all have bounded fallback timers and startup diagnostics.

## Risks And Review Items

- `npm run smoke` internal child-process stages may be skipped by the local sandbox with `spawn EPERM`; standalone TypeScript and lint commands should remain the authoritative checks in this environment.
- Full visual proof of "no flash" still needs device/emulator QA because the current automated checks are static/regression scripts rather than frame captures.

## Verification

Run after patching:

- `npm run test:auth-loading-flow`
- `npm run test:auth-startup-route-selection`
- `npm run test:connectivity-startup`
- `npm run test:startup-warning-hygiene`
- `npx tsc --noEmit --pretty false`
- `npm run lint`
- `npm run smoke`
