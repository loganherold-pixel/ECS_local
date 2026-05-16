# Cleanup Validation Checklist

Use this checklist before and after any cleanup quarantine run. It is designed to confirm that folder cleanup did not affect the current ECS app state, while preserving production/runtime data.

## Branch Baseline

Do not switch branches during validation.

Baseline detection order:

1. Use `origin/HEAD` when available.
2. Otherwise use `main` when present.
3. Otherwise use `master` when present.
4. Otherwise use the current branch.

For this workspace, `origin/HEAD` was unavailable, `main` was absent, and `master` existed, so `master` is the baseline.

## Detected Stack

- Package manager: npm, because `package-lock.json` exists.
- App stack: Expo React Native with Expo Router.
- Build service: EAS Android profiles in `eas.json`.
- Docker: no Dockerfile, docker-compose file, `.dockerignore`, or ECS task definition was detected.

## Validation Commands

Safe default command:

```powershell
npm run lint
```

Detected but not automatic:

```powershell
npm run build
```

This exports web output and writes `dist/`, so run it only when generated output is acceptable.

```powershell
npm run smoke
```

This writes `.smoke/` and `.expo-runtime/`, so it is useful for release validation but is not read-only.

```powershell
npm run start
```

This starts a long-lived Expo server. Use it for manual smoke testing and stop it with `Ctrl+C`.

There is no generic `npm test` script. Use targeted `test:*` scripts based on the area being validated.

Recommended targeted cleanup regression checks:

```powershell
npm run test:startup-warning-hygiene
npm run test:auth-startup-route-selection
npm run test:dashboard-widgets
npm run test:navigate-readiness
npm run test:fleet-full-flow
npm run test:react-native-text-children
```

## Read-Only Validation Script

Run the cleanup validator before and after quarantine:

```powershell
node scripts/validate-cleanup.mjs
```

To include the safe lint command:

```powershell
node scripts/validate-cleanup.mjs --run-lint
```

For machine-readable output:

```powershell
node scripts/validate-cleanup.mjs --json
```

The script checks:

- detected baseline branch
- package manager and validation commands
- critical config/source path presence
- route smoke path presence
- declared app icon/splash/favicon assets
- `.env*` file fingerprints and key names only, never values
- runtime storage/artifact path presence
- latest cleanup quarantine manifest, if present

The script does not delete files, move files, run cleanup, run build, run smoke, start Expo, connect to production services, or mutate runtime data.

## Pre-Cleanup Baseline

1. Confirm current branch:

```powershell
git branch --show-current
```

2. Capture current worktree state:

```powershell
git status --short
```

3. Run read-only validation:

```powershell
node scripts/validate-cleanup.mjs
```

4. Run lint:

```powershell
node scripts/validate-cleanup.mjs --run-lint
```

5. Capture cleanup dry-run:

```powershell
node scripts/safe-cleanup.mjs --dry-run --allow-dirty
```

6. If release confidence is required, run targeted tests relevant to the current work area. For broad cleanup validation, prefer:

```powershell
npm run test:startup-warning-hygiene
npm run test:auth-startup-route-selection
npm run test:dashboard-widgets
npm run test:navigate-readiness
npm run test:fleet-full-flow
npm run test:react-native-text-children
```

7. Optional generated-artifact checks, only when acceptable:

```powershell
npm run build
npm run smoke
```

## Quarantine Step

Only after the baseline passes, move approved cleanup candidates to quarantine:

```powershell
node scripts/safe-cleanup.mjs --quarantine --allow-dirty
```

Do not use `--delete-quarantine` during validation.

## Post-Cleanup Verification

1. Re-run read-only validation:

```powershell
node scripts/validate-cleanup.mjs
```

2. Re-run lint:

```powershell
node scripts/validate-cleanup.mjs --run-lint
```

3. Re-run the same targeted tests used in the pre-cleanup baseline.

4. Compare the reported critical path list, route path list, declared assets, and `.env*` fingerprints with the pre-cleanup output.

5. Confirm no protected paths changed or disappeared:

- `.env*`
- `package.json`
- `package-lock.json`
- `app.json`
- `eas.json`
- `metro.config.js`
- `babel.config.js`
- `tsconfig.json`
- `app/`
- `components/`
- `lib/`
- `src/`
- `stores/`
- `assets/`
- `public/`
- `supabase/functions/`
- `supabase/migrations/`
- any upload, media, storage, backup, export, database, or user-generated path

## Manual App Smoke Test

Run this before and after cleanup when an app-level check is needed:

```powershell
npm run start
```

Stop it with `Ctrl+C` after the smoke test.

Manual checks:

- App starts without Metro resolver errors.
- Login/auth screens render and show expected visual assets.
- Dashboard route opens.
- Navigate route opens and does not report missing map/assets because of cleanup.
- Fleet route opens and uses the existing Fleet label.
- Expedition Command route opens.
- Power/Rive widget either renders or falls back truthfully when native runtime is unavailable.
- Existing `.env` values were not changed.
- No user uploads, runtime storage, local database, backups, exports, or release artifacts were moved unless explicitly approved.

If using an emulator or device, also check:

- app launches from a clean reload
- splash/icon assets appear
- no fatal redbox appears during route navigation
- offline/manual fallback surfaces still appear where live data is unavailable

## Database And API Checks

Do not connect to production databases as part of cleanup validation unless that is explicitly approved.

Non-mutating checks:

- Confirm `.env` contains expected public client keys by name only.
- Confirm Supabase Edge Function source paths still exist under `supabase/functions/`.
- Confirm migrations still exist under `supabase/migrations/`.

Provider secrets and service-role keys must remain server-side only.

## Rollback

If any validation check fails after quarantine, restore the quarantined files:

```powershell
node scripts/safe-cleanup.mjs --restore --allow-dirty
```

Then re-run:

```powershell
node scripts/validate-cleanup.mjs --run-lint
```

If a specific quarantine root was used:

```powershell
node scripts/safe-cleanup.mjs --restore --allow-dirty --quarantine-dir ..\ECS_local-cleanup-quarantine
```

Only permanently delete quarantine after manual approval and successful validation:

```powershell
node scripts/safe-cleanup.mjs --delete-quarantine --confirm-delete --allow-dirty
```

Permanent deletion must never happen in the same pass as the first quarantine validation.
