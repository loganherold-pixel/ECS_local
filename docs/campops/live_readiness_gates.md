# CampOps Live Readiness Gates

Date: 2026-05-04

Current CampOps status: **Internal beta ready; closed field test blocked pending risk acceptance**.

Internal beta activation is controlled by `EXPO_PUBLIC_ENABLE_CAMPOPS_INTERNAL_BETA=true` for client builds, or `ENABLE_CAMPOPS_INTERNAL_BETA=true` for local Node harnesses. Leave the flag unset or `false` for normal production/public behavior. The flag does not mark CampOps closed-field-test ready and does not approve provider influence, Android/device QA, privacy/storage posture, AI assist, telemetry, or community publishing.

Use `npm run gate:campops-live-readiness` before any claim that CampOps is closed-field-test ready. The gate writes `.smoke/campops-live-readiness-result.json` and blocks closed field testing unless every live gate passes or the missing gates are explicitly accepted in `docs/campops/closed_field_test_risk_acceptance.md`.

Risk acceptance permits only a restricted closed field test. It does not mark missing Android/device QA, provider approval, or privacy/storage owner approval as complete.

## Gate Matrix

| Gate | Required evidence | Current status | Closed field-test effect |
| --- | --- | --- | --- |
| Rendering | CampOps pins render on Navigate Mapbox, do not duplicate, reuse ECS camp pin style, and open/dismiss Camp Intel popups. | Implementation wired through the shared Camp Scout marker pipeline. | Pass for implementation; still needs Android/device evidence. |
| Scoring | Candidates below threshold are suppressed, route candidates are capped at 5, nearby duplicates collapse, and no production demo fallback camps render. | Implementation wired with conservative thresholds and regression tests. | Pass for implementation. |
| Safety/copy | No overconfident legal/safety claims, `ECS-Inferred` copy is used, and unverified legal/access status is labeled. | Implementation uses confidence/verification language. | Pass for implementation; continue scanning copy changes. |
| Privacy/storage | Saved camp storage and report-unusable handling are documented, coordinates are not logged unnecessarily, sensitive location persistence has a clear purpose, and owner approval is complete. | Documented, but owner approval remains incomplete. | Blocks closed field testing unless risk-accepted. |
| Provider/source | Source confidence is represented, provider limitations are documented, and target region/category readiness is explicit and approved. | Source confidence and limitations are documented; provider influence is not approved for the target region/category. | Blocks closed field-test provider influence unless risk-accepted as shadow-only. |
| Android/device QA | Device evidence exists for map rendering, pin tap, popup scroll, popup dismiss, save, navigate, and report flows. | Required QA packet exists, but device execution/evidence is incomplete. | Blocks closed field testing unless risk-accepted. |

## Required Commands

Run before changes that affect CampOps routing, pins, scoring, popup behavior, storage, provider influence, or release readiness:

```bash
npm run test:campops-live-readiness
npm run gate:campops-live-readiness
npm run gate:closed-field-test
```

Also run the focused implementation regressions when touching the relevant surface:

```bash
npm run test:campops-map-pin-parity
node scripts/test-campops-candidate-filtering.js
node scripts/test-campops-camp-intel-popup.js
node scripts/test-campops-lifecycle.js
```

## Status Categories

- **Internal beta ready**: rendering, scoring, and safety/copy gates pass, but closed-field evidence or approvals are still incomplete.
- **Closed field test ready**: all live gates pass with evidence and owner/provider/device approvals recorded.
- **Blocked pending risk acceptance**: one or more live gates fail and no accepted restricted field-test risk acceptance exists.

## Current Blockers

- Android/device QA evidence is incomplete for the Navigate Mapbox pin and Camp Intel popup flows.
- Provider/source readiness is not approved for real recommendation influence in the target region/category.
- Privacy/storage owner approval remains incomplete for saved camp and report/debrief data posture.

Closed field testing must not proceed until those blockers are resolved or explicitly risk-accepted by product, safety, privacy, and engineering with restricted scope, expiration, incident contact, and rollback path.
