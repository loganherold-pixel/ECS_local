# ECS App Size Diet Plan

Generated from `npm run audit:app-size`, `npm run audit:bundle-inclusions`, and `npm run gate:app-size` on 2026-06-13.

## 2026-07-14 Production Asset Update

Production source assets were reduced from 249.57 MiB to 215.84 MiB while retaining the 225 MiB hard limit. The measured inventory, every removed/excluded/recompressed asset, pixel-equivalence method, and offline preservation contract are documented in `docs/production-asset-size-reduction-2026-07-14.md`.

The inactive Power Monitor Rive implementation and native dependencies were retired because the production widget already uses its native telemetry panel. Six ignored recovery-artwork staging copies are now guarded by EAS and Metro while their tracked offline protocol equivalents remain packaged.

The fresh universal APK is 368.07 MiB, 15.72 MiB smaller than the prior 383.79 MiB artifact. It remains over the 350 MiB warning because the four-ABI APK contains 157.90 MiB of native libraries plus 191.98 MiB of packaged resources; the 400 MiB hard APK limit remains unchanged.

## 2026-07-12 Smoke-Fix Measurement Update

This follow-up compressed the two startup/login videos, applied lossless PNG optimization to five large runtime images, and rebuilt both the Expo export and native release APK. Representative video frames were visually inspected; optimized PNGs were verified against their original decoded RGBA hashes.

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Auth/login MP4 assets | 46.36 MiB | 2.13 MiB | -44.23 MiB (-95.4%) |
| Production Android export | 239.53 MiB | 194.03 MiB | -45.50 MiB (-19.0%) |
| Universal release APK | 428.20 MiB | 383.79 MiB | -44.41 MiB (-10.4%) |
| Production bundled assets | 264.03 MiB | 224.15 MiB | -39.88 MiB (-15.1%) |

`npm run gate:app-size` now passes with warning status. The APK is 16.21 MiB below the 400 MiB hard ceiling, while the 350 MiB APK warning and 180 MiB bundled-asset warning remain active. A production AAB and delivered install-size measurement are still required before changing ABI or native shrink settings.

## Baseline Measurements

| Area | Size | Notes |
| --- | ---: | --- |
| Repo scanned, excluding `node_modules` and `.git` | 45.13 GiB | Dominated by Android/Gradle build caches, local evidence, APKs, and temp output. |
| Production candidate source | 291.19 MiB | App/source/config plus production asset roots. |
| Production bundled assets | 264.03 MiB | Hard budget blocker; mostly PNG and MP4 media. |
| Docs/specs | 426.33 MiB | Should not upload with production mobile builds. |
| Fixtures | 249.6 KiB | Small, but still excluded from production upload. |
| Artifacts/evidence | 4.61 GiB | APKs, QA evidence, and generated output that must stay out of app bundles. |
| Build outputs | 33.43 GiB | Local Gradle, Expo export, source maps, intermediates, and caches. |
| Expo export | 240.62 MiB | Current web export in `dist`. |
| Offline starter/cache fixtures | 2.46 MiB | Small enough for current starter content budget. |
| Largest APK found | 455.87 MiB | `artifacts/ecs-fieldtest-20260531-154648.apk`; budget blocker. |
| Current release APK output | 421.95 MiB | `android/app/build/outputs/apk/release/app-release.apk`. |

## Largest Contributors

Top workspace contributors are local build/evidence directories rather than production source:

| Path | Size |
| --- | ---: |
| `android` | 8.27 GiB |
| `.gradle-local-fieldtest` | 5.14 GiB |
| `.gradle-local` | 4.93 GiB |
| `.gradle-user-home` | 4.36 GiB |
| `.gradle-local-build2` | 4.23 GiB |
| `.gradle-local-release-audit` | 3.79 GiB |
| `.gradle-local-apk-build` | 3.66 GiB |
| `artifacts` | 3.25 GiB |
| `.tmp` | 2.06 GiB |
| `.qa` | 1.96 GiB |
| `.smoke` | 1.21 GiB |

Top runtime asset contributors:

| Asset | Size | Decision |
| --- | ---: | --- |
| `assets/auth/loading-transition.mp4` | 28.83 MiB | Product review: compress, shorten, or defer. |
| `assets/login/intro-login-video.mp4` | 17.53 MiB | Product review: compress, shorten, or defer. |
| `assets/power/blu_power_module.riv` | 4.26 MiB | Runtime Rive asset; keep unless product accepts fallback. |
| `public/rive/blu_power_module.riv` | 4.26 MiB | Potential duplicate with runtime Rive asset; review web/native split. |
| `assets/dashboard/route-progress-placeholder.png` | 2.80 MiB | Optimize when approved tooling/visual QA is available. |
| `assets/ecs/nav/ecs-center.png` | 2.76 MiB | Optimize when approved tooling/visual QA is available. |
| `assets/weather/Snow.png` | 2.62 MiB | Consider WebP or lower-resolution weather art. |

Asset extension breakdown:

| Extension | Size |
| --- | ---: |
| `.png` | 209.15 MiB |
| `.mp4` | 46.36 MiB |
| `.riv` | 8.52 MiB |
| `.wav` | 9.5 KiB |

## Bundle Inclusion Findings

`npm run audit:bundle-inclusions` found:

- Forbidden included files: 0.
- Missing upload exclusions: 0.
- Broad `assetBundlePatterns`: 0.
- Runtime referenced assets: 104.
- Warnings: 0.

The audit intentionally does not flag known runtime safety/protocol assets under `assets/images/protocols` and `assets/images/safety-protocols`.

## Exclusions Added

Production upload/build hygiene was tightened for non-runtime bulk:

- `.easignore` now excludes `docs/`, `fixtures/`, `qa-evidence/`, `mock-data-inventory.md`, test-only scripts, readiness check scripts, and Android no-network evidence runners.
- `metro.config.js` blocklists `docs`, `fixtures`, `qa-evidence`, `tmp`, `.tmp`, `.metro-tmp`, and `.qa` from Metro resolution.
- Generated reports remain under `artifacts/app-size`, which is already ignored for production upload.

Runtime import scan found only a string reference to `docs/dispatch/CONVOY_TRACKING_RLS.md`, not a JS import. Offline runtime protocol assets remain under runtime asset roots and are not excluded.

## Native And Build Config Findings

- `eas.json` production Android uses `app-bundle`; fieldtest/preview profiles still create APKs.
- `android/gradle.properties` currently includes `armeabi-v7a,arm64-v8a,x86,x86_64`.
- Hermes is enabled.
- PNG crunching is enabled for release builds.
- WebP support is enabled.
- Release minification and resource shrinking are controlled by Gradle properties and default to disabled in `android/app/build.gradle`.
- Native libraries dominate Android build intermediates. The audit groups detected `.so` files by ABI; current local build/intermediate totals are largest for `arm64-v8a`, `x86_64`, `x86`, and `armeabi-v7a`.

Do not enable minify/shrinkResources or remove ABIs blindly. The next size pass should produce a clean release AAB and compare device-delivered install size before changing native delivery.

## Size Budget Gate

Added `config/app-size-budget.json` and `npm run gate:app-size`.

Current gate status: `blocked`.

Blockers:

- APK exceeds hard budget: 455.87 MiB > 400.00 MiB.
- Production bundled assets exceed hard budget: 264.03 MiB > 225.00 MiB.

Warnings:

- Largest single asset exceeds warning budget: 28.83 MiB > 25.00 MiB.

Measured values:

| Metric | Current | Hard budget |
| --- | ---: | ---: |
| APK | 455.87 MiB | 400.00 MiB |
| AAB | unavailable | 260.00 MiB |
| Expo export | 240.62 MiB | 300.00 MiB |
| Production bundled assets | 264.03 MiB | 225.00 MiB |
| Largest single asset | 28.83 MiB | 32.00 MiB |
| Runtime offline starter content | 2.46 MiB | 50.00 MiB |

## Size Delta

No runtime media files were modified in this pass because visual/media compression requires product approval and visual QA.

| Area | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Static asset bytes | 264.03 MiB | 264.03 MiB | 0 B |
| Asset optimization changed files | 0 | 0 | 0 |
| Forbidden bundle inclusion findings | 0 | 0 | 0 |

The practical reduction from this pass is packaging protection: docs, fixtures, QA evidence, and test/check scripts are now explicitly kept out of production upload and Metro resolution. APK/runtime asset reduction remains blocked on media/native product decisions.

## Next Size Decisions

1. Produce a clean production AAB and compare Play/device-delivered install size instead of judging only universal/field-test APKs.
2. Decide whether auth/login videos ship globally, are compressed, or become on-demand media.
3. Review the duplicated `blu_power_module.riv` in `assets` and `public`.
4. Optimize PNG-heavy dashboard/weather assets with visual QA and approved tooling.
5. Decide whether production Android should remove emulator ABIs from APK-style builds while keeping AAB delivery safe.
6. Consider enabling release shrink/minify only behind a tested release profile.
