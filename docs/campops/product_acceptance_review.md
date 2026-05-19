# CampOps Product Acceptance Checklist

CampOps product objective:

> Help users decide where they can legally, realistically, and conservatively end the day when the plan changes.

This document separates engineering readiness from launch readiness. Fixture tests, typed contracts, guarded Android QA, and restricted risk acceptance make CampOps reviewable for a restricted closed-field test, but public rollout and provider-influenced rollout still depend on real provider validation, broader privacy/storage approval, production acceptance, and field evidence.

## Status Legend

| Status | Meaning |
| --- | --- |
| `pass` | Meets the acceptance requirement with evidence in this repo or completed review. |
| `partial` | Implemented or documented, but needs more evidence before broader rollout. |
| `blocked` | Must not ship for the affected rollout stage until follow-up is complete. |
| `not started` | No meaningful implementation or review evidence yet. |

## Rollout Readiness Summary

| Stage | Current status | Summary |
| --- | --- | --- |
| Internal dev | `pass` | Deterministic pipeline, fixture tests, docs, and disabled-by-default rollout flags are in place. |
| Internal beta | `pass` | Ready for controlled internal tester evaluation with fixtures, source transparency, guarded Android evidence, and disabled-by-default risky surfaces. |
| Restricted closed field test | `partial` | CampOps is risk-accepted for the approved cohort/scope only. Android/device QA and guarded privacy/storage pass for this packet; provider influence remains shadow-only/unapproved, field tester sessions remain follow-up, and AI/telemetry/community publishing stay disabled unless separately approved. |
| Limited regional rollout | `blocked` | Real legal/access, closure, fire, weather, and service provider quality is not yet proven by region. |
| Broad rollout | `blocked` | Requires validated providers, product/privacy approval for debrief governance and telemetry sinks, production support playbooks, and field evidence. |

## Acceptance Checklist

| Area | Status | Owner | Evidence | Required follow-up |
| --- | --- | --- | --- | --- |
| Core pipeline | `pass` | TBD | `campOpsHardGates`, `campOpsScoring`, `campOpsRecommendations`, `campOpsResourceDebt`, `campOpsSafeEndpoint`; CampOps script suite passes. | Keep deterministic gates/scoring/recommendations as source of truth. |
| Provider quality | `blocked` | TBD | Provider contracts, source adapters, fixtures, validation harness, and readiness reports exist. | Run shadow validation against real provider outputs by target region/source category before limited rollout. |
| Source confidence/conflict handling | `partial` | TBD | Source conflict resolver, confidence aggregation, stale/missing summaries, and tests exist. | Validate conflict rates with real sources and define acceptable thresholds for each rollout cohort. |
| Offline/stale behavior | `partial` | TBD | Offline/stale source metadata, tests, and docs exist. | Verify stale/missing warnings on Android in field-mode UI; define cache retention/deletion policy for production. |
| Mobile QA | `partial` | TBD | `mobile_qa.md`, visual state matrix, UI contract tests, dev visual QA route, QA-only candidate pins/actions, and cramped-screen evidence exist. | Run real provider-backed route-line candidate validation and continue Android checks for field sessions. |
| AI assist guardrails | `partial` | TBD | AI assist consumes CampOps outputs, parser guardrails and adversarial tests exist. | Continue adversarial evals with real model outputs and field-mode copy review; ensure no rejected camp is resurrected. |
| Privacy/storage | `partial` | TBD | Privacy storage review, debrief private defaults, prompt minimization, cache-source tests, telemetry validation, and guarded closed-field approval exist. | Keep broad real trip/debrief data blocked until retention, encryption, deletion, access-control, durable cache, telemetry, and public-safe export owners are approved. Treat local debrief `localStorage` as unencrypted. |
| Community debriefs | `blocked` | TBD | Private-by-default model, consent checks, redaction, and moderation state machine exist. Community-safe output is blocked unless moderation state is `approved_anonymized`. | Product/privacy/moderation policy and tooling must be approved before community-visible publishing; draft, pending-review, rejected, and removed records must stay non-public. |
| Legacy coexistence | `partial` | TBD | CampOps cards coexist with legacy list; compatibility adapter and migration plan exist. | Validate no user-facing contradiction in mobile QA; do not enable CampOps-powered legacy ordering until parity tests and rollback are ready. |
| Observability | `partial` | TBD | Privacy-safe telemetry helpers, payload validation, disabled defaults, and sink approval gate exist. | Approve any telemetry sink, retention, access control, and analytics joining rules before enabling. |
| Feature flags/rollout | `pass` | TBD | Rollout flags default off; rollout flag tests pass; production callers use explicit gates. | Keep risky feature areas independently gated during beta. |
| Field testing | `partial` | TBD | `docs/campops/field_test_plan.md` defines objectives, tester profile, flags, provider validation, offline/stale cases, privacy guardrails, and feedback schema. | Run controlled field tests for delayed-day, trailer, low fuel/water, stale/offline, and source-conflict scenarios. |

## Release Gates

### Internal Dev

Required:

- Core deterministic pipeline tests pass.
- Feature flags default off.
- Fixture-based two-hour delay acceptance test passes.
- Docs identify known launch blockers.

Current status: `pass`.

### Internal Beta

Required:

- Follow `docs/campops/internal_beta_enablement.md` for who may enable CampOps, required flags, flags that must remain off, provider/AI/telemetry requirements, privacy rules, mobile QA prerequisites, feedback capture, and rollback.
- Internal testers can enable CampOps cards with fixtures or controlled data.
- Mobile QA checklist is run on at least one Android target.
- AI assist remains disabled unless adversarial evals pass for the active prompt/model path.
- Telemetry remains disabled unless a sink has explicit approval.
- Community debrief publishing remains disabled.

Current status: `partial`.

### Restricted Closed Field Test

Required:

- Android field-mode QA completed for recommendation cards, source warnings, offline states, and action buttons in the guarded packet.
- Provider validation shadow mode reports are available for test regions, with provider influence disabled unless separately approved.
- Guarded privacy/storage posture is approved for private/local closed-field data only.
- Field testers receive clear limitations for legal/access/provider confidence.
- `field_test_plan.md` checklists and privacy-safe feedback schema are used for every test route/region label.

Current status: `partial`; risk-accepted for restricted cohort/scope only.

### Limited Region Rollout

Required:

- Legal/access, closure, fire, weather, and service providers meet region-specific readiness thresholds.
- Unknown/stale/conflict rates are within accepted bands.
- Support and rollback plans are documented.
- CampOps-powered legacy ordering is either disabled or validated against legacy coexistence risks.

Current status: `blocked`.

### Broad Rollout

Required:

- Multiple regions pass provider readiness gates.
- Community debrief governance is approved if any community visibility ships.
- Observability sink is approved, or telemetry remains disabled.
- Field evidence confirms users understand recommendation confidence, missing data, and source limitations.

Current status: `blocked`.

## Launch Blocker Registry

| Blocker ID | Severity | Description | Affected rollout stage | Mitigation | Status |
| --- | --- | --- | --- | --- | --- |
| CO-BLOCK-001 | Critical | Real provider quality is unproven for legal/access, closure, fire, weather, and service data. | Limited regional rollout, broad rollout | Run provider validation shadow mode by region; define coverage/freshness/conflict/unknown thresholds. | Open |
| CO-BLOCK-002 | High | Android QA is complete for the guarded QA packet, but real provider-backed route-line candidate validation remains unresolved. | Limited regional rollout, provider-influenced closed field review | Execute provider-backed Navigate route-line candidate validation on Android and record pin, popup, Save Camp, Navigate Here, and Report Unusable evidence. | Guarded |
| CO-BLOCK-003 | High | Offline storage, retention, deletion, encryption, and access-control owners are still TBD for broad real trip/debrief data; CampOps local debrief storage is unencrypted unless protected by the runtime. | Limited regional rollout, broad rollout | Assign owners, document encryption/access-control posture, and keep internal beta restricted to controlled tester data. | Open |
| CO-BLOCK-004 | Critical | Community debrief publishing lacks approved product/privacy/moderation policy and tooling; only `approved_anonymized` records may produce community-safe output. | Broad rollout, any community-visible release | Keep `campopsDebriefCommunityPublishingEnabled` off until policy, review queue, redaction, moderation approval, and removal workflow are approved. | Open |
| CO-BLOCK-010 | High | Future durable provider/source caches and app-layer persistence of recommendations, endpoint outputs, or AI summaries need explicit storage location, retention, redaction, clear/delete hooks, and encryption-status documentation. | Limited regional rollout, broad rollout | Do not add durable provider caches or persisted CampOps outputs without updating `privacy_storage_review.md` and the owning delete path. | Open |
| CO-BLOCK-005 | Medium | Legacy result ranking can still coexist beside CampOps recommendations and may confuse users if copy/status annotations are incomplete. | Internal beta, closed field test | Use compatibility adapter annotations, mobile QA, and keep CampOps-powered ordering disabled until parity and rollback are ready. | Open |
| CO-BLOCK-006 | Medium | AI guardrails are fixture-tested but need continued adversarial checks against real model outputs and evolving prompts. | Closed field test, limited regional rollout | Run adversarial evals for stale data, rejected camps, low legal confidence, and overconfident wording before enabling AI assist. | Open |
| CO-BLOCK-007 | Medium | Observability is implemented but any real analytics sink needs explicit approval for privacy, retention, access, and joining behavior. | Internal beta if telemetry is desired, broader rollout | Keep telemetry off; require `campopsTelemetryEnabled`, configured sink, and `campopsTelemetrySinkApproved`. | Guarded |
| CO-BLOCK-008 | High | No controlled field evidence yet proves the two-hour delay flow under real route/provider/mobile conditions. | Closed field test, limited regional rollout | Run field tests for delayed arrival, trailer, low fuel/water, stale/offline, and source-conflict scenarios. | Open |
| CO-BLOCK-009 | High | Restricted closed-field risk is accepted, but field tester sessions and real provider-backed route/provider/mobile evidence remain incomplete. | Restricted closed field follow-up, limited regional rollout | Complete the required next evidence in `docs/campops/internal_beta_evidence.md` and re-review P0/P1/P2 status after the restricted run. | Guarded |

## Closed Field-Test Package

The closed field-test package lives in `docs/campops/field_test_plan.md`.

It requires:

- region and route labels instead of precise private locations
- explicit feature flag states
- provider validation reports for test cells
- offline and stale-data scenarios
- private-only debrief capture
- AI review only when explicitly enabled
- mobile UI review against the existing QA docs
- telemetry disabled unless sink approval exists
- privacy-safe feedback capture

## Acceptance Notes

- Do not mark real provider quality as ready from fixtures alone.
- Do not mark provider-backed mobile QA complete without real provider-backed route-line candidate evidence.
- Do not mark community publishing ready until privacy, moderation, and product policy are approved.
- Do not treat draft, pending-review, rejected, or removed community debrief records as public-visible.
- Do not persist recommendation sets, endpoint outputs, AI summaries, or provider/source caches without the same redaction, retention, deletion, and encryption-status rules documented for CampOps.
- Do not allow AI to override deterministic gates or source confidence.
- Do not call unknown legal/access status allowed.
- Do not enable telemetry unless feature flag, sink configuration, sink approval, and payload validation are all present.

## Verification Evidence

Recent expected verification for product acceptance changes:

```bash
node scripts/test-campops-two-hour-delay-acceptance.js
node scripts/test-campops-provider-validation.js
node scripts/test-campops-provider-readiness-report.js
node scripts/test-campops-mobile-qa-harness.js
node scripts/test-campops-ai-assist.js
node scripts/test-campops-privacy-storage.js
node scripts/test-campops-debrief.js
node scripts/test-campops-legacy-coexistence.js
node scripts/test-campops-telemetry.js
node scripts/test-campops-rollout-flags.js
npx tsc --noEmit
npm run lint
```
