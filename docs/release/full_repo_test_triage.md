# Full Repo Script Sweep Triage

Date: 2026-05-01

Scope: triage the nine non-CampOps script failures from the CampOps pre-beta hardening sweep without broad architectural changes.

## Summary

The failing scripts were non-CampOps contract checks. The only production code changes made were small accessibility-label additions in the Navigate tools menu:

- `Draw area to search for campsites`
- `Build a route` / `Exit Build Route mode`

All other changes were low-risk script contract updates for current intentional behavior. No CampOps runtime behavior, telemetry defaults, community publishing defaults, or feature flag defaults were changed.

## Triage Table

| Failing script | Failure reason | Classification | Change made | Remaining blocker status | CampOps internal beta impact | App-wide release impact |
| --- | --- | --- | --- | --- | --- | --- |
| `test-campsite-ui-polish.js` | The script expected older campsite draw copy/layout: `Save campsite drawing`, top-right closed-polygon controls, fixed `topOffset={0}`, and `buildLocationRows(site)`. Current UI uses compact bottom Clear/Finish controls, a shared detail top offset, and search-context-aware location rows. It also exposed a real missing Draw Area accessibility label. | Mixed: copy/accessibility-label drift plus stale layout/test contract. | Added Draw Area accessibility props in Navigate. Updated script expectations to Clear/Finish, bottom draw controls, `campsiteDetailTopOffset`, and `buildLocationRows(site, searchContext)`. | Resolved. | No. The failure was outside CampOps recommendation runtime. | Yes before fix as a script-sweep blocker; no remaining blocker after fix. |
| `test-community-campsite-map-layer.js` | The script expected community campsite markers to use the old `saved` category, while the current map layer intentionally emits `category: 'community'`. | Stale test contract. | Updated expected marker category to `community`. | Resolved. | No. | Yes before fix as a script-sweep blocker; no remaining blocker after fix. |
| `test-dashboard-remoteness-confidence-widgets.js` | The script expected a 12-widget dashboard registry and complete 1-12 ranking. Current registry enforces 7 curated widgets and a complete 1-7 ranking. | Stale test contract. | Updated registry validation expectations to 7 widgets / 1-7 ranking. | Resolved. | No. | Yes before fix as a script-sweep blocker; no remaining blocker after fix. |
| `test-dashboard-widget-config.js` | The script expected Expedition Summary to open an old placeholder path. Current implementation opens the real Expedition summary/debrief modal while preserving route lifecycle gating. | Stale test contract. | Updated expectations to `Ready to generate PDF`, `Summary ready`, `setSummaryOpened(true)`, `onOpenSummary()`, and `ExpeditionDebriefModal` wiring. | Resolved. | No. | Yes before fix as a script-sweep blocker; no remaining blocker after fix. |
| `test-dispatch-helpers.js` | A broad regex matched harmless internal `assignments` data shape while trying to detect resurrected roster/assignment UI. | Stale test contract / overbroad assertion. | Narrowed the assertion to UI-specific roster/assignment selectors instead of generic assignment terms. | Resolved. | No. | Yes before fix as a script-sweep blocker; no remaining blocker after fix. |
| `test-field-utilities-weather-parity.js` | The script expected `forecast.length` and `forecast.map`, but the current timeline intentionally renders a deduped `dailyForecast` list to avoid duplicate date keys. | Stale test contract. | Updated expectations to `dailyForecast.length` and `dailyForecast.map`. | Resolved. | No. | Yes before fix as a script-sweep blocker; no remaining blocker after fix. |
| `test-fleet-legacy-state-migration.js` | The script matched an exact older promise chain. Current startup still runs `sanitizeLegacyVehicleFrameworkState()` before route hydration completes, but the readiness timeout wrapper changed the chain shape. | Stale exact-string contract. | Updated expectations to the current wrapped migration call and readiness timeout. | Resolved. | No. | Yes before fix as a script-sweep blocker; no remaining blocker after fix. |
| `test-gpx-run-detail-navigation.js` | The script expected campsite draw controls to contribute top toolbox height. Current draw controls are bottom-positioned and intentionally kept out of top toolbox measurement. | Layout expectation drift. | Updated expectations to `campsiteAreaTopHeight = 0` and asserted no top toolbox campsite layout measurement. | Resolved. | No. | Yes before fix as a script-sweep blocker; no remaining blocker after fix. |
| `test-navigate-road-preview-layout.js` | The script expected a removed fixed `TOOLS_ACTION_TRIGGER_WIDTH` constant and surfaced a real missing Build Route accessibility label. Current tools menu uses half-width quick action cards with stable min-height. | Mixed: accessibility-label drift plus stale layout expectation. | Added Build Route accessibility props in Navigate. Updated layout expectations to current half-width quick action card and min-height contract. | Resolved. | No. | Yes before fix as a script-sweep blocker; no remaining blocker after fix. |

## Verification

Commands run:

```powershell
Get-ChildItem scripts -Filter 'test-*.js' | Sort-Object Name | ForEach-Object { node $_.FullName }
```

Result: passed.

Additional required commands:

```powershell
npx tsc --noEmit --pretty false
npm run lint
npm run build
```

Result: passed. `npm run build` completed the Expo web export and ended with Expo's known forced-exit message after export.

## Remaining Risk

- These scripts are source-contract tests, so future intentional UI/copy/layout changes may still require script updates.
- No evidence from this triage points to a CampOps internal-beta blocker.
- The fixes remove the app-wide script-sweep blocker represented by these nine failures.
