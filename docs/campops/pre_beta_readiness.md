# CampOps Pre-Beta Readiness Report

Date: 2026-05-01

## Historical Status

This is a historical pre-beta report. The current release packet is tracked in `docs/campops/closed_field_test_readiness.md`, `docs/campops/internal_beta_evidence.md`, `docs/campops/live_readiness_gates.md`, and `docs/release/qa-system-checkoffs.md`.

Current status as of 2026-05-17: CampOps is risk-accepted for a restricted closed field test only. Public rollout, provider influence, AI assist, telemetry, community publishing, and broad privacy/storage rollout remain blocked unless separately approved.

## Recommendation

CampOps is ready for internal beta preparation and controlled internal tester evaluation, with feature flags off by default and with provider influence, AI assist, telemetry, and community publishing kept gated.

At the time of this 2026-05-01 report, CampOps was not ready for closed field test, limited regional rollout, or public rollout until the blockers below were resolved or explicitly risk-accepted.

Historical recommended rollout stage: internal beta preparation only.

Internal beta enablement package: `docs/campops/internal_beta_enablement.md`.

## Ready Items

| Area | Readiness | Evidence |
| --- | --- | --- |
| Core pipeline | Ready for internal beta | Source signals, hard gates, scoring, recommendation roles, resource debt, endpoint recommendations, and decision point tests passed in the CampOps suite. |
| Provider architecture | Ready for shadow validation | Provider adapters, source provider registry, conflict resolver, stale-source handling, validation harness, fixture pack, and readiness report tests passed. |
| Feature flags | Ready for internal beta | Rollout flags default off and tests cover recommendation, provider, AI, endpoint, decision point, source transparency, telemetry, and debrief-community gates. |
| AI assist guardrails | Ready for internal beta review | AI prompt/output tests and adversarial checks pass; AI receives CampOps output as source of truth and cannot resurrect rejected candidates in fixtures. |
| Privacy defaults | Ready for internal beta | Debriefs default private, community publishing remains off, telemetry remains off by default, telemetry sink approval gate exists, privacy storage tests pass, and the storage/retention decision matrix documents current ownership. |
| Legacy coexistence | Ready for internal beta | Compatibility adapter, coexistence copy, and migration docs exist; legacy list remains available and CampOps cards are distinct from search results. |
| Observability implementation | Ready but disabled | Privacy-safe telemetry helpers and sink approval gate pass tests; no sink is enabled by default. |
| Documentation package | Ready for internal review | Rollout, internal beta enablement, product acceptance, mobile QA, visual state matrix, provider readiness, field test plan, observability, privacy, and legacy migration docs exist. |

## Partial Items

| Area | Status | Reason |
| --- | --- | --- |
| Mobile QA | Partial | Fixture/dev-state docs and contract tests existed, but no Android emulator or physical-device QA evidence was recorded at the time of this report. Current guarded Android QA evidence is tracked in `mobile_qa_evidence.md`. |
| Provider quality | Partial | Harness and fixtures pass, but real legal/access, closure, fire, weather, and service provider quality has not been validated by region. |
| Offline/stale UX | Partial | Source metadata and tests pass, but stale/offline copy still needs Android field-mode visual QA. |
| AI production behavior | Partial | Parser and fixture tests pass; real model outputs still need adversarial review before AI assist is enabled for field testers. |
| Privacy/storage | Partial | Retention/deletion/encryption status is now documented honestly, and local debrief delete/clear paths are tested. CampOps still does not provide encryption, and broad real trip/debrief data needs assigned storage/privacy ownership before rollout beyond controlled internal beta preparation. |
| Legacy migration | Partial | Coexistence is reduced, but CampOps-powered legacy ordering is not enabled and should not be enabled before parity and rollback validation. |

## Blockers

| Blocker | Severity | Blocks | Current state | Required action |
| --- | --- | --- | --- | --- |
| Real provider readiness unproven | Critical | Closed field test influence, limited region rollout, public rollout | Only fixture/shadow tooling evidence exists. | Run provider validation shadow mode by region and approve readiness thresholds for legal/access, closure, fire, weather, and service data. |
| Android/device QA incomplete | High | Closed field test, public confidence in UI | Historical blocker. Current guarded Android QA evidence exists, but real provider-backed route-line candidate validation remains follow-up. | Continue Android QA with provider-backed candidate routes before provider-influenced rollout. |
| Full repo test sweep has non-CampOps failures | High | App-wide release confidence | CampOps suite passes, but broad script sweep failed nine existing/non-CampOps scripts. | Triage and fix or intentionally update the failing string-contract/snapshot tests before app-wide release. |
| Field evidence absent | High | Closed field test completion, limited rollout | Field-test plan exists, but no real route/test-cell evidence is recorded. | Execute closed field-test plan using region labels and privacy-safe feedback. |
| Community debrief governance incomplete | Critical | Any community-visible debrief release | Guardrails exist, but policy/moderation/tooling approval is not complete. | Keep `campopsDebriefCommunityPublishingEnabled` off until product/privacy/moderation approval. |
| Telemetry sink not approved | Medium | Any analytics emission | Telemetry is disabled and gated. | Keep telemetry off unless privacy/product approve a sink, retention, access control, and joining behavior. |
| Offline storage encryption and ownership pending | High | Real-user field data beyond controlled internal beta preparation | The storage decision pass documents current retention, deletion, and encryption status. CampOps does not provide encryption, and owner decisions remain pending for broad real trip/debrief data. | Assign storage/privacy owners, approve encryption/access-control posture, and confirm deletion ownership before broader real-data field testing. |

## Tests Run

### Privacy Storage Decision Pass - 2026-05-01

```bash
node scripts/test-campops-privacy-storage.js
node scripts/test-campops-telemetry.js
Get-ChildItem scripts -Filter 'test-campops*.js' | Sort-Object Name | ForEach-Object { node $_.FullName }
npx tsc --noEmit --pretty false
npm run lint
npm run build
```

Result: passed.

Notes:

- The privacy storage pass documents retention, deletion, encryption, AI, telemetry, community visibility, and owner/decision status by data category in `docs/campops/privacy_storage_review.md`.
- Telemetry raw-payload validation now rejects cached source/provider blobs, source signals, source summaries, and raw provider status before sanitization.
- Build completed successfully. Expo still printed the known post-export message: `Something prevented Expo from exiting, forcefully exiting now.`

### Passed

```bash
Get-ChildItem scripts -Filter 'test-campops*.js' | Sort-Object Name | ForEach-Object { node $_.FullName }
npx tsc --noEmit --pretty false
npm run lint
npm run build
```

Notes:

- All `test-campops*.js` scripts passed.
- Typecheck passed.
- Lint passed.
- Web export build passed. Expo still printed the known post-export message: `Something prevented Expo from exiting, forcefully exiting now.`

### Full Repo Script Sweep

Command:

```bash
Get-ChildItem scripts -Filter 'test-*.js' | Sort-Object Name | ForEach-Object { node $_.FullName }
```

Result: failed.

Failing scripts:

- `test-campsite-ui-polish.js`
  - Failure: expected Draw interaction to expose campsite area draw control.
- `test-community-campsite-map-layer.js`
  - Failure: expected marker/source state `saved`, observed `community`.
- `test-dashboard-remoteness-confidence-widgets.js`
  - Failure: dashboard registry validation did not account for added widget.
- `test-dashboard-widget-config.js`
  - Failure: Expedition Summary card expected gated placeholder snippet.
- `test-dispatch-helpers.js`
  - Failure: CAD detail modal still includes roster/assignment/team-position UI according to test.
- `test-field-utilities-weather-parity.js`
  - Failure: `ForecastTimeline` expected forecast header field.
- `test-fleet-legacy-state-migration.js`
  - Failure: expected auth layout migration before startup route hydration completes.
- `test-gpx-run-detail-navigation.js`
  - Failure: Route Staged indicator expected campsite draw toolbox height handling.
- `test-navigate-road-preview-layout.js`
  - Failure: Draw area control expected campsite-search accessibility label.

Assessment: these failures are outside the current CampOps modules and appear to be broader repo contract drift. They are app-wide release blockers, but they do not block the CampOps internal beta code path from being reviewed with flags off/default-safe behavior.

## Known Limitations

- No live provider quality evidence is recorded for real regions.
- At the time of this report, no Android emulator or physical-device visual QA evidence was recorded for CampOps cards. Current guarded QA evidence is now tracked separately.
- Field-test package exists, but no closed field-test feedback has been captured.
- Internal beta enablement exists, but it does not by itself mark closed field test ready. Current restricted test readiness depends on accepted risk scope and current evidence docs.
- AI assist has fixture/adversarial coverage, not real model-output acceptance evidence for every target prompt/model path.
- Community debrief publishing must remain disabled.
- Telemetry must remain disabled unless a sink is explicitly approved.
- CampOps source/provider data should be treated as decision support, not legal/access authority.
- Legacy result list remains visible beside CampOps cards until migration proceeds.

## Recommended Next PRs

1. Triage the nine non-CampOps broad-suite failures and either fix code or update stale contract tests intentionally.
2. Continue Android emulator/physical-device CampOps mobile QA with real provider-backed route-line candidate validation.
3. Run provider validation shadow mode for one closed field-test region label and generate readiness reports.
4. Execute the closed field-test plan with privacy-safe feedback capture.
5. Continue AI adversarial evals against real model outputs for stale, missing, conflict, rejected-camp, and low-legal-confidence cases.
6. Assign privacy/storage owners and decide encryption/access-control requirements before broader real tester data is used.
7. Keep legacy ranking migration at coexistence/annotation stage until parity and rollback tests are complete.

## No-Go Items For Public Rollout

- Do not enable public or broad CampOps rollout without real provider readiness evidence.
- Do not enable community debrief publishing.
- Do not enable telemetry without approved sink configuration and retention/access review.
- Do not claim legal status, access, closure, weather, fire, fuel, water, or services are certain when source confidence is medium, low, unknown, stale, or conflicting.
- Do not let AI choose camps, override hard gates, or soften stale/missing/conflict warnings.
- Do not enable CampOps-powered legacy ordering until legacy coexistence conflicts are validated on mobile.
- Do not proceed to public rollout while full repo release tests are failing.
