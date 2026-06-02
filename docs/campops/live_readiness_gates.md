# CampOps Live Readiness Gates

Date: 2026-06-02

Current CampOps status: **APK field-test ready for restricted closed-field validation**.

Internal beta activation is controlled by `EXPO_PUBLIC_ENABLE_CAMPOPS_INTERNAL_BETA=true` for client builds, or `ENABLE_CAMPOPS_INTERNAL_BETA=true` for local Node harnesses. Leave the flag unset or `false` for normal production/public behavior. The flag does not approve public rollout, provider influence, AI assist, telemetry, or community publishing.

Use `npm run gate:campops-live-readiness:json` before any claim about CampOps live readiness. The current gate reports `closed_field_test_ready` for the restricted APK field-test scope recorded in `docs/campops/closed_field_test_risk_acceptance.md`.

Risk acceptance permits only a restricted closed field test. It does not approve provider influence. In the current packet, Android/device QA and guarded privacy/storage posture are complete for restricted validation, while provider/source output remains shadow-only or unknown unless exact category/region approval is separately recorded.

## Gate Matrix

| Gate | Required evidence | Current status | Closed field-test effect |
| --- | --- | --- | --- |
| Rendering | CampOps pins render on Navigate Mapbox, do not duplicate, reuse ECS camp pin style, and open/dismiss Camp Intel popups. | Implementation is wired through the shared Camp Scout marker pipeline; Android QA evidence exists for QA-only candidate pins and popup actions. | Pass for guarded restricted validation; real provider-backed route-line candidate validation remains a rollout follow-up. |
| Scoring | Candidates below threshold are suppressed, route candidates are capped at 5, nearby duplicates collapse, and no production demo fallback camps render. | Implementation uses conservative thresholds and regression tests. | Pass for implementation. |
| Safety/copy | No overconfident legal/safety claims, `ECS-Inferred` copy is used, and unverified legal/access status is labeled. | Implementation uses confidence and verification language. | Pass for implementation; continue scanning copy changes. |
| Privacy/storage | Saved camp storage and report-unusable handling are documented, coordinates are not logged unnecessarily, sensitive location persistence has a clear purpose, and closed-field owner approval is recorded. | Approved for guarded private/local closed-field posture; local debrief `localStorage` remains unencrypted and broad rollout remains blocked. | Pass for restricted validation only; broad real trip/debrief rollout still needs separate approval. |
| Provider/source | Source confidence is represented, provider limitations are documented, and target region/category readiness is explicit and approved or risk-accepted as shadow-only. | Source confidence and limitations are documented; provider influence is not approved for the target region/category; shadow-only posture is accepted for the restricted APK field test. | Pass for restricted APK field test only; blocks provider influence and broader rollout. |
| Android/device QA | Device evidence exists for map rendering, pin tap, popup scroll, popup dismiss, save, navigate, and report flows. | Required QA packet and device evidence are complete for guarded restricted validation. | Pass with issues; real provider-backed route-line candidate validation remains a rollout follow-up. |

## Required Commands

Run before changes that affect CampOps routing, pins, scoring, popup behavior, storage, provider influence, or release readiness:

```bash
npm run test:campops-live-readiness
npm run gate:campops-live-readiness:json
npm run gate:closed-field-test:json
```

Also run the focused implementation regressions when touching the relevant surface:

```bash
npm run test:campops-map-pin-parity
node scripts/test-campops-candidate-filtering.js
node scripts/test-campops-camp-intel-popup.js
node scripts/test-campops-lifecycle.js
```

## Status Categories

- **Internal beta ready**: rendering, scoring, safety/copy, privacy/storage, and Android/device QA gates pass for guarded validation while provider/source influence remains unapproved.
- **APK field-test ready for restricted closed-field validation**: implementation, Android/device QA, and privacy/storage gates pass; provider/source output is accepted only as shadow-only/unknown for the approved cohort/scope, expiration window, and rollback path.
- **Closed field test ready without risk acceptance**: all live gates pass with provider/source, device, privacy, and owner approvals recorded.
- **Blocked**: one or more required gates fail without explicit accepted restricted risk acceptance.

## Current Restrictions

- Provider/source readiness is not approved for real recommendation influence in the target region/category.
- Real provider-backed active route-line candidate validation remains follow-up before provider-influenced regional rollout.
- AI assist remains disabled unless exact model/config real-output review is approved.
- Telemetry remains disabled unless sink/privacy approval is recorded.
- Community publishing remains disabled.
- Broad real trip/debrief rollout remains blocked until encryption-backed storage, durable provider/source caches, telemetry sinks, public-safe export workflows, retention, deletion, and access-control owners are approved.

APK field testing may proceed only inside the accepted restricted cohort/scope, with source transparency visible, provider influence disabled or shadow-only for unapproved categories, and no precise private coordinates in shared evidence.
