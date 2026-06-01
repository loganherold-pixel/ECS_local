# ECS Active File Manifest

Snapshot branch: `codex/ecs-source-cleanup`

Baseline commit: `7541e88 feat: finish prepared-device offline sign-in`

Baseline tag: `ecs-working-baseline-2026-06-01`

Purpose: define the current ECS source surface, separate clearly active files from cleanup candidates, and keep deletion work small enough to review. This manifest is intentionally conservative. It identifies the first safe quarantine batch and the areas that need owner review before removal.

## Current Source Inventory

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
| `public/rive/blu_power_module.riv` | Required by `scripts/test-blu-power-module-rive.js` along with the matching asset copy. |
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
| `assets/power/blu_power_module.riv` and `public/rive/blu_power_module.riv` | Keep. Both are expected by the Rive asset regression script. |
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

## Investigate Before Removing

These are plausible cleanup targets, but they need one more evidence pass or a user decision before deletion.

| Area | Evidence So Far | Next Check |
| --- | --- | --- |
| Maybe-unreferenced `scripts/` files | Strict scan found 71 scripts without package-script ownership or direct repo text references. Nearly all are regression tests; one is `scripts/trails-postgis-check.sql`. | Keep regression tests unless a domain owner explicitly retires the covered behavior. Decide whether the PostGIS one-liner should move into docs or be removed. |
| `ECS_Dashboard_Icon_512.png` | No code reference found. Existing asset audit says it is release-looking and retained for external store/listing material. | User decision: keep as release collateral or move to a separate release-assets archive. |
| `.vscode/` | Editor-local workspace config. | User decision: keep team editor settings or remove from source-only tree. |
| Windows EAS and EcoFlow dev helpers | `scripts/run-eas-fieldtest-windows.mjs` and `scripts/start-ecoflow-ble-dev.ps1` are not package-script owned, but they are clearly tied to ECS field-test and hardware workflows. | Keep unless those workflows are intentionally retired or replaced by documented package scripts. |

Sample scripts from the maybe-unreferenced set:

```text
scripts/campops-react-native-test-shim.js
scripts/run-eas-fieldtest-windows.mjs
scripts/start-ecoflow-ble-dev.ps1
scripts/test-account-command-hub-geofence-default.js
scripts/test-account-command-hub-signin.js
scripts/test-attitude-command-active-vehicle-resolver.js
scripts/test-attitude-command-connected.js
scripts/test-attitude-command-tire-pressure.js
scripts/test-attitude-command-widget.js
scripts/test-attitude-gauge.js
scripts/test-attitude-readout.js
scripts/test-bailout-intelligence-pipeline.js
scripts/test-bailout-route-confidence-resolver.js
scripts/test-blu-diagnostics-log.js
scripts/test-blu-veepeak-reference-pipeline.js
scripts/test-camp-scout-aggregator.js
scripts/test-camp-scout-area-selection.js
scripts/test-camp-scout-command.js
scripts/test-camp-scout-community-adapter.js
scripts/test-camp-scout-scoring.js
scripts/test-campops-ai-real-output-review-harness.js
scripts/test-campops-dispersed-camping-candidates.js
scripts/test-campops-domain-model.js
scripts/test-campops-internal-beta-feedback.js
scripts/test-campsite-photo-support.js
scripts/test-campsite-published-lifecycle.js
scripts/test-campsite-submissions-ui.js
scripts/test-command-dock-center-icon-layout.js
scripts/test-command-module-selector-layout.js
```

## Recommended Cleanup Workflow

1. Keep `ecs-working-baseline-2026-06-01` as the known-good anchor.
2. Use `codex/ecs-source-cleanup` for all cleanup work.
3. Delete or quarantine only one candidate group per commit.
4. After every group, run `npm run test:auth-offline-sign-in` and `npm run smoke`.
5. If a group fails verification, restore only that group and keep the manifest updated with the reason.
6. Do not remove large assets, scripts, or docs just because they are not entrypoint-referenced. ECS uses explicit offline/manual/test artifacts that may be intentionally reachable by operators or release scripts.

## Proposed Next Commit

Classify maybe-unreferenced scripts into manual harnesses, migration utilities, active test coverage, and obsolete files before deleting any scripts:

```text
scripts/
```

Expected result: the remaining cleanup work distinguishes manually useful ECS regression harnesses from genuinely old one-time files.
