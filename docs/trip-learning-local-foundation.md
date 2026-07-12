# Trip Learning Local Foundation

Status: restricted local foundation, default off

## Purpose

Trip Learning compares qualified forecasts with high-confidence actual outcomes, prepares reversible calibration proposals, and produces conservative post-trip inspection prompts. It does not change route, vehicle, readiness, MPG, or resource values automatically.

The feature requires both:

- the default-off `EXPO_PUBLIC_ECS_TRIP_LEARNING_LOCAL` rollout flag (or the equivalent explicit test/session flag), and
- an explicit user opt-in stored in `TripLearningPreferences`.

## Data Flow

1. The trip recorder may capture a departure `TripLearningForecastBaseline` containing only aggregate drive-time, fuel-use, and power-runtime estimates.
2. A completed recorder trip is adapted to `ForecastActualRecord` values without copying coordinates or route geometry.
3. `qualifyForecastActualRecords` rejects incomplete, mocked, simulated, corrupted, duplicate, conflicting, degraded, materially stale, or non-high-confidence actuals.
4. Qualified samples are grouped by metric, vehicle, and terrain class. `analyzeCalibrationSamples` creates a review-only proposal when deterministic sample, materiality, and variance gates pass.
5. Applying a proposal creates a local `TripCalibrationOverlay`. It does not mutate Fleet or route state. Every application records its previous value and can be reverted.
6. Completed Expedition records and source-labeled telemetry exposures may produce `PostTripInspectionPrompt` records. Weak or source-limited evidence is suppressed.

## Qualification And Confidence

- Minimum proposal sample count: 3 qualified samples.
- Actual source confidence: high only.
- Actual source availability: usable only.
- Actual source coverage: complete only.
- Manual actuals require the explicit `verified_manual_actual` warning code.
- Duplicate samples use a stable forecast/actual fingerprint.
- Historical age does not invalidate a sample by itself. Freshness is evaluated at the recorded trip outcome time so stale-at-capture data is rejected without treating all old trips as stale today.
- Drive-time materiality: 8 percent mean error.
- Fuel-use materiality: 10 percent mean error.
- Power-runtime materiality: 10 percent mean error.
- Camp-arrival materiality: 10 minutes mean error.
- Maximum standard deviation for an applicable proposal: 20 percent drive time, 25 percent fuel, 25 percent power, or 30 minutes camp arrival.
- Six or more samples with variance at or below half the maximum can produce high confidence. Three or more samples under the maximum can produce medium confidence. Proposal confidence is capped by the least-confident qualifying forecast/actual source, and aggregate coverage remains partial if any qualifying forecast is partial. High-variance proposals remain visible but cannot be applied.

Current automatic recorder support captures only real-data forecasts computed from zero to six hours before departure. It qualifies drive-time outcomes only when the trip has at least five active minutes, half a mile, 12 recorded points, 8 retained points, and recorded distance within 35 percent of the forecast route distance. Fuel snapshots remain manual/unverified under the current recorder contract and are deliberately rejected. Power-runtime and camp-arrival contracts are present, but require source-backed actual adapters before they can qualify.

## Inspection Semantics

Inspection prompts are deterministic checklists, not diagnoses. Wording uses `inspect`, `verify`, or `consider checking` and never claims that damage or a mechanical fault occurred.

Current strong-evidence thresholds include:

- critical/high terrain exposure: inspect tires, wheels, and visible underbody areas;
- coolant temperature at or above 230 F: inspect fluid levels and verify visible cooling-system condition;
- battery voltage at or below 11.8 V: verify connections and consider checking resting voltage;
- absolute vehicle attitude at or above 20 degrees: inspect load security;
- verified recovery use: inspect recovery equipment and verify attachment points;
- verified high-severity incident exposure: inspect the vehicle and affected equipment.

Source confidence must be high, coverage complete, availability usable, freshness current/recent at observation time, and conflict false. Simulated, mocked, stale, weak, or unverified manual evidence produces no prompt.

## Privacy, Storage, And Export

- Storage key: `ecs_trip_learning_local_v1` through the existing migrating non-secure local storage adapter.
- Stored data is aggregate and local: preferences, forecast baselines, qualified samples, proposals, reversible overlays/applications, prompt evidence, and processed trip IDs.
- The schema has no coordinate, route geometry, route trace, free-form note, raw telemetry/provider response, authentication, token, secret, stack trace, or service-role field.
- Persistence normalizers drop unknown fields and reject forbidden trace/sensitive keys before writes.
- `cloudSyncEnabled` is normalized to `false` and `localOnly` to `true`; there is no Supabase or upload adapter.
- Existing ECS local-data, report, GPX, KML, GeoJSON, and debrief exports do not include the Trip Learning store. A future export requires a separate explicit, redacted export contract and user action.
- `clearLearningData` deletes samples, proposals, overlays, applications, prompts, and baselines while retaining the user preference. Disabling opt-in stops new processing but does not silently delete prior local records.
- The current non-secure storage layer must be treated as unencrypted unless the runtime documents device-level protection.

## Cloud Rollout Blockers

Any cloud sync, telemetry, cross-device learning, shared calibration, or trip-trace use requires a separate privacy/storage approval covering purpose, consent, data minimization, retention, deletion, encryption, access controls, backend ownership, regional handling, export behavior, and incident response. It also requires production evidence for real provider/device source qualification. This local foundation grants none of those approvals.
