# ECS Active File Manifest

Snapshot branch: `codex/ecs-source-cleanup`

Baseline commit: `7541e88 feat: finish prepared-device offline sign-in`

Baseline tag: `ecs-working-baseline-2026-06-01`

Purpose: define the ECS source surface, separate clearly active files from cleanup candidates, and keep deletion work small enough to review. This manifest is intentionally conservative. It records the cleanup batches applied after the working baseline and the files intentionally retained.

2026-07-14 correction: the Power Monitor Rive path described in this historical snapshot became unreachable after the native telemetry panel took ownership. Its wrappers, duplicate `.riv` assets, and Rive/Nitro dependencies were retired under the measured production asset reduction. Historical baseline counts below are intentionally unchanged.

## Cleanup Result

Current tracked files after cleanup: 2568

Net tracked file reduction from the baseline inventory: 458 files. This includes 459 removed files and one added manifest file.

Removed or relocated cleanup groups:

| Batch | Result |
| --- | --- |
| Build/temp artifacts | Removed tracked logs and Supabase temp metadata. |
| Local Mapbox style bundle | Removed unused `mapbox/` style and sprite export. |
| Vehicle attitude asset cleaner | Removed obsolete one-time Python cleaner; kept runtime cleaned PNGs. |
| Editor-local VS Code settings | Removed `.vscode/` from tracking and ignored future local settings. |
| Dashboard icon collateral | Moved root-level release-looking PNG to `docs/release-assets/`. |
| Retired cleanup utility workflow | Removed old quarantine cleanup scripts/docs and one unowned PostGIS check. |

Remaining standalone script files are intentionally retained when they are regression harnesses, field-test helpers, hardware helpers, or manual operational checks.

## Baseline Source Inventory Before Cleanup

Tracked files at the baseline: 3026

Tracked source-like files excluding dependency folders: 3006

Largest tracked top-level areas by file count:

| Area | Files | Notes |
| --- | ---: | --- |
| `lib/` | 849 | Core domain, auth, expedition, camp, fleet, data, and service logic. |
| `scripts/` | 560 | Test harnesses, readiness gates, data utilities, and operational checks. |
| `components/` | 494 | React Native UI surfaces and shell/dashboard components. |
| `mapbox/` | 442 | Local Mapbox style and sprite bundle. No direct code reference found in this pass. |
| `docs/` | 118 | Release evidence, architecture notes, audit logs, and workflow docs. |
| `assets/` | 116 | Runtime media and app imagery. Large but actively referenced in multiple flows. |
| `supabase/` | 89 | Migrations, edge functions, and local Supabase metadata. |
| `src/` | 86 | Shared web/backend source. |
| `app/` | 57 | Expo Router app entry and screens. |
| `android/` | 53 | Android native project and field-test build support. |
| `fixtures/` | 51 | Test fixtures and scenario inputs. |
| `apps/` | 36 | Web and API apps used by build/typecheck/docs. |
| `plugins/` | 20 | Expo config plugins referenced by app config. |
| `tests/` | 15 | Test support files and regression fixtures. |

Largest tracked top-level areas by size:

| Area | Files | Approx. Bytes | Notes |
| --- | ---: | ---: | --- |
| `assets/` | 116 | 260270527 | Contains large runtime videos and images. Keep unless an asset graph proves otherwise. |
| `lib/` | 849 | 13144877 | Active application and domain source. |
| `components/` | 494 | 9314561 | Active UI source. |
| `scripts/` | 560 | 4919603 | Large, but many scripts are package/readiness gates. |
| `public/` | 1 | 4467435 | Public Rive asset used by tests and runtime checks. |
| `app/` | 57 | 3000548 | Active app source. |
| `android/` | 53 | 1841143 | Active native project support. |
| `docs/` | 118 | 1146175 | Release, audit, and workflow context. |
| `mock-data-inventory.md` | 1 | 924740 | Existing audit inventory. Keep for now because it documents mock/stale data paths. |
| `src/` | 86 | 827569 | Active source. |
| `mapbox/` | 442 | 672985 | Local map style bundle. Investigate before removal. |
| `supabase/` | 89 | 603409 | Active backend database/function source plus local temp metadata. |

## Active ECS Source Surface

Keep these areas as active ECS source unless a later manifest proves a narrower replacement:

| Area | Keep Rationale |
| --- | --- |
| `app/` | Expo Router screens and app entry. |
| `components/` | Primary mobile UI, shell, dashboard, auth, fleet, expedition, camp, and widget components. |
| `context/`, `stores/`, `config/` | Runtime state, configuration, and app-level boundaries. |
| `lib/` | Core ECS domain logic, auth boundary, offline sign-in, deterministic scoring, adapters, services, and data contracts. |
| `src/` | Shared web/API source used by the repository. |
| `apps/web/` | Referenced by root `typecheck` through `npm --prefix apps/web run build`. |
| `apps/api/` | Referenced by architecture docs, Docker compose, and Makefile workflows. |
| `packages/shared/` | Shared package source. |
| `android/` | Native Android project and field-test support. |
| `plugins/android-auto/`, `plugins/carplay/` | Referenced directly in `app.json` Expo plugin configuration. |
| `supabase/functions/`, `supabase/migrations/` | Backend edge functions and schema source. |
| `fixtures/`, `tests/` | Regression and scenario support. |
| `scripts/` package/readiness gates | Scripts invoked from `package.json`, smoke, auth regressions, release checks, and domain harnesses. |
| Runtime assets under `assets/` | Referenced by login, loading, dashboard, Rive, and asset verification flows. |
| Power Monitor Rive path | Retired on 2026-07-14 after production-import and native-dependency verification. |
| Root config files | Expo, Metro, Babel, TS, ESLint, Jest, Docker, Makefile, Supabase, package, and native build config. |
| `docs/` release/audit/workflow files | Needed to preserve recent decisions, build provenance, and cleanup evidence. |

## Explicit Non-Candidates For This Cleanup Pass

These looked tempting because they are large, nested, or separate from the main app tree, but this pass found active references or workflow ownership:

| Area | Decision |
| --- | --- |
| `apps/web/` | Keep. Root typecheck builds it. |
| `apps/api/` | Keep. Referenced by Docker, Makefile, README, and architecture docs. |
| `packages/shared/` | Keep. Shared source package. |
| `plugins/android-auto/` and `plugins/carplay/` | Keep. Referenced by `app.json`. |
| `assets/auth/loading-transition.mp4` | Keep. Used by `components/LoadingTransitionVideo.tsx`. |
| `assets/login/intro-login-video.mp4` | Keep. Used by `components/login/LoginHeroBackground.tsx`. |
| `assets/dashboard/route-progress-placeholder.png` | Keep. Used by dashboard widget rendering/tests. |
| `assets/dashboard/terrain-risk-background.png` | Keep. Used by dashboard widget rendering/tests. |
| `assets/power/blu_power_module.riv` and `public/rive/blu_power_module.riv` | Retired. The regression script now enforces native Power Monitor telemetry and absence of the dead dependency path. |
| `mock-data-inventory.md` | Keep for now. It documents mocked/stale data surfaces that matter to ECS offline and field-readiness behavior. |

## First Safe Quarantine Batch

These files are the lowest-risk removal candidates because they are build logs or local Supabase temp metadata. They should be quarantined or deleted in one small commit, then verified with auth/smoke gates.

Batch status: removed from source tracking on the cleanup branch after the manifest commit. The ignore rules keep these artifacts from being re-added.

| Candidate | Why It Can Move First | Suggested Action |
| --- | --- | --- |
| `android-build.log` | Tracked log artifact and already ignored by git. | Remove from source tracking. |
| `build-log.txt` | Root build log artifact, not source. | Remove from source tracking and add ignore rule if needed. |
| `supabase/.temp/gotrue-version` | Local Supabase temp metadata and already ignored. | Remove from source tracking. |
| `supabase/.temp/pooler-url` | Local Supabase temp metadata and already ignored. | Remove from source tracking. |
| `supabase/.temp/postgres-version` | Local Supabase temp metadata and already ignored. | Remove from source tracking. |
| `supabase/.temp/project-ref` | Local Supabase temp metadata and already ignored. | Remove from source tracking. |
| `supabase/.temp/rest-version` | Local Supabase temp metadata and already ignored. | Remove from source tracking. |
| `supabase/.temp/storage-migration` | Local Supabase temp metadata and already ignored. | Remove from source tracking. |
| `supabase/.temp/storage-version` | Local Supabase temp metadata and already ignored. | Remove from source tracking. |

Recommended verification after the first quarantine batch:

```powershell
npm run test:auth-offline-sign-in
npm run smoke
```

## Second Cleanup Batch: Local Mapbox Style Bundle

Batch status: removed from source tracking on the cleanup branch after exact path-reference checks.

Evidence:

- `mapbox/` contains 442 files, approximately 672985 bytes.
- The bundle is a local `Mapbox Outdoors` `style.json`, `license.txt`, and 440 SVG sprite files under `mapbox/sprite_images/`.
- Exact path-style searches found no runtime reference to `mapbox/`, `mapbox\`, `mapbox/style.json`, `mapbox\style.json`, `sprite_images`, or `mapbox/license` outside this manifest.
- Active Mapbox usage is still preserved through `@rnmapbox/maps`, `mapbox-gl`, `lib/mapConfig.ts`, remote `mapbox://styles/...` URLs, and the existing Mapbox token/runtime tests.
- This removal does not remove Mapbox support from ECS. It removes only the unused checked-in local style/sprite export.

Recommended verification after removing the bundle:

```powershell
npm run test:auth-offline-sign-in
node ./scripts/test-mapbox-native-config.js
node ./scripts/test-route-progress-minimap.js
npm run smoke
```

## Third Cleanup Batch: Obsolete Vehicle Attitude Asset Cleaner

Batch status: removed from source tracking on the cleanup branch.

Evidence:

- `scripts/clean-vehicle-attitude-assets.py` generated cleaned PNGs under `assets/vehicles/attitude/clean/`.
- The original uncleaned source PNGs are no longer tracked; the tracked attitude assets are the 21 cleaned runtime PNGs only.
- Runtime code references the cleaned files through `src/features/attitude/vehicleAttitudeAssetManifest.ts`.
- Existing tests protect the cleaned asset manifest and resolver behavior through `npm run test:vehicle-attitude-assets`.
- The cleaner depends on Python/Pillow and is not package-script owned. Keeping it in the source tree implies a regeneration workflow that no longer has tracked inputs.

Recommended action: remove only the obsolete cleaner, keep all cleaned attitude assets.

Recommended verification after removing the cleaner:

```powershell
npm run test:vehicle-attitude-assets
npm run test:auth-offline-sign-in
npm run smoke
```

## Fourth Cleanup Batch: Editor-Local VS Code Settings

Batch status: removed from source tracking on the cleanup branch.

Evidence:

- `.vscode/` contained only `extensions.json` and `settings.json`.
- The settings enabled the Deno VS Code extension for `supabase/functions` and configured editor formatting/linting behavior.
- No runtime, package script, build, or documentation path referenced `.vscode/`.
- Supabase source remains tracked under `supabase/functions/` and `supabase/migrations/`.
- `.vscode/` is now ignored so local editor preferences do not re-enter the source-only ECS tree.

Recommended verification after removing editor-local settings:

```powershell
npm run test:auth-offline-sign-in
npm run smoke
```

## Fifth Cleanup Batch: Root-Level Dashboard Icon Collateral

Batch status: moved out of the runtime root and preserved under release assets on the cleanup branch.

Evidence:

- `ECS_Dashboard_Icon_512.png` had no app/code reference.
- `docs/asset-branding-release-audit.md` previously retained it because it looked like possible external store/listing material.
- The active app icon remains `assets/images/icon-safe.png`; Android adaptive foreground remains `assets/images/adaptive-icon-foreground.png`.
- The file is now tracked as `docs/release-assets/ECS_Dashboard_Icon_512.png`, which keeps the collateral associated with ECS while removing it from the runtime root.

Recommended verification after moving the icon collateral:

```powershell
npm run test:android-launcher-icon-safe-zone
npm run test:auth-offline-sign-in
npm run smoke
```

## Sixth Cleanup Batch: Retired Cleanup Utility Workflow

Batch status: removed from source tracking on the cleanup branch.

Evidence:

- `scripts/safe-cleanup.mjs` and `scripts/validate-cleanup.mjs` supported an older quarantine-based cleanup workflow.
- `docs/safe-cleanup-utility.md` and `docs/cleanup-validation-checklist.md` documented that older workflow.
- This cleanup branch now uses the locked baseline tag, isolated worktree, one candidate group per commit, and auth/smoke verification documented here.
- `scripts/trails-postgis-check.sql` was an unowned one-line manual check. PostGIS ownership is now covered by Supabase migrations and API tests such as `apps/api/tests/test_trail_migrations.py` and `apps/api/tests/test_trail_domain_contract.py`.

Recommended verification after removing the retired cleanup workflow:

```powershell
npm run test:auth-offline-sign-in
npm run smoke
```

## Investigate Before Removing

These are plausible cleanup targets, but they need one more evidence pass or a user decision before deletion.

| Area | Evidence So Far | Next Check |
| --- | --- | --- |
| Standalone `scripts/` regression harnesses | Strict scan after cleanup found 70 scripts without package-script ownership or direct repo text references. They are regression-style test harnesses, not obvious generated artifacts. | Keep unless a domain owner explicitly retires the covered behavior. |
| Windows EAS and EcoFlow dev helpers | `scripts/run-eas-fieldtest-windows.mjs` and `scripts/start-ecoflow-ble-dev.ps1` are not package-script owned, but they are clearly tied to ECS field-test and hardware workflows. | Keep unless those workflows are intentionally retired or replaced by documented package scripts. |

Representative retained standalone regression harnesses:

```text
scripts/test-communication-packet-workflow.js
scripts/test-dashboard-ecs-intelligence-readout.js
scripts/test-dispatch-route-terrain-fallback.js
scripts/test-dispersed-camping-route-search.js
scripts/test-documentation-center-refresh.js
scripts/test-ecs-assessment-workflow.js
scripts/test-ecs-logger-hygiene.js
scripts/test-expedition-readiness-command.js
scripts/test-fleet-first-vehicle-flow.js
scripts/test-fleet-housekeeping.js
scripts/test-fuel-range-confidence-resolver.js
scripts/test-login-visual-polish.js
scripts/test-navigate-pin-system.js
scripts/test-offline-mode-hysteresis.js
scripts/test-route-geometry-lifecycle.js
scripts/test-shell-tab-transition-performance.js
scripts/test-terrain-risk-command-module.js
scripts/test-trail-route-geometry-resolver.js
scripts/test-trip-builder-live-wiring.js
scripts/test-weather-forecast-timeline-dedupe.js
```

## Recommended Cleanup Workflow

1. Keep `ecs-working-baseline-2026-06-01` as the known-good anchor.
2. Use `codex/ecs-source-cleanup` for all cleanup work.
3. Delete or quarantine only one candidate group per commit.
4. After every group, run `npm run test:auth-offline-sign-in` and `npm run smoke`.
5. If a group fails verification, restore only that group and keep the manifest updated with the reason.
6. Do not remove large assets, scripts, or docs just because they are not entrypoint-referenced. ECS uses explicit offline/manual/test artifacts that may be intentionally reachable by operators or release scripts.

## Proposed Next Commit

Stop source deletion here unless a domain owner explicitly retires a remaining feature, test harness, or manual hardware workflow:

```text
scripts/*.js regression harnesses
scripts/run-eas-fieldtest-windows.mjs
scripts/start-ecoflow-ble-dev.ps1
```

Expected result: the remaining tree is ECS source, release evidence, active assets, backend/app code, and intentionally retained regression or field-test harnesses.
