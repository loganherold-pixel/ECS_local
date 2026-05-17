# CampOps Provider Readiness - Region 001

Date: 2026-05-01

## Region

- Region label: Region 001 - Northern Nevada controlled provider shadow cell
- Route labels: On-time normal day; two-hour delay endpoint review; trailer access review; low fuel endpoint review; low water endpoint review; stale source review
- Release cohort label: internal-shadow-validation-region-001
- Validation mode: fixture-backed
- Provider influence allowed: no
- Provider shadow mode: yes
- Raw provider payloads excluded from shared evidence: yes
- Precise private coordinates excluded: yes
- Production recommendation impact: none
- Provider output applied to recommendations: false

This report uses a region label only. It does not include precise coordinates, raw user IDs, vehicle IDs, private debriefs, raw AI prompts, secrets, or provider credentials.

## Provider Category/Region Approval Packet

Use this packet for the next real target-region/category shadow validation pass. Leave approval fields blank or `not approved` until actual provider evidence and approval exist.

- Region label: Region 001 - Northern Nevada controlled provider shadow cell
- Route labels: On-time normal day; two-hour delay endpoint review; trailer access review; low fuel endpoint review; low water endpoint review; stale source review
- Validation mode: fixture-backed
- Provider influence allowed: no
- Provider shadow mode: yes
- Raw provider payloads excluded from shared evidence: yes
- Precise private coordinates excluded: yes

Validation modes:

- `fixture-backed`: proves normalization and report shape only.
- `real-shadow`: records real provider output in shadow mode only; does not allow provider influence by itself.
- `approved`: requires category approval fields, approver, and approval date before influence is allowed.

Category statuses:

- `not_approved`: no influence allowed.
- `shadow_validated`: real-shadow evidence exists, but influence remains disabled until approved.
- `approved`: influence may be requested only for this region/category after approver/date/category fields are complete.

## Category Matrix

| Category | Status | Validation mode | Evidence date | Freshness window | Coverage summary | Conflict rate | Stale/unknown rate | Unknown handling behavior | Provider influence allowed | Approver | Approval date | Remaining issues |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| legal/access | not_approved | fixture-backed | 2026-05-01 fixture only | fixture only | Fixture legal/public-access signals covered sample candidates; standalone access source still missing. | 0 in fixture | 0 in fixture; real unknown rate not measured | Unknown legal/access must reduce confidence and may caution/reject in high-risk contexts. | no |  |  | Real target-region legal/access provider quality unproven. |
| closure/seasonal restriction | not_approved | fixture-backed | 2026-05-01 fixture only | fixture only | Fixture closure signals covered sample candidates. | 0 in fixture | 0 in fixture; real unknown rate not measured | Unknown/stale closure must reduce confidence and never be treated as open. | no |  |  | Real closure/seasonal provider freshness and restriction-window behavior unproven. |
| fire restriction | not_approved | fixture-backed | 2026-05-01 fixture only | fixture only | Fixture fire signals covered sample candidates. | 0 in fixture | 0 in fixture; real unknown rate not measured | Unknown fire status must remain explicit; fire closures may hard-gate. | no |  |  | Real fire restriction/red-flag source quality unproven. |
| weather | not_approved | fixture-backed | 2026-05-01 fixture only | fixture only | Fixture weather signals covered sample candidates. | 0 in fixture | 0 in fixture; real unknown rate not measured | Unknown/stale weather must reduce confidence and show stale/missing warnings. | no |  |  | Real weather source freshness and regional accuracy unproven. |
| service/resupply | not_approved | fixture-backed | 2026-05-01 fixture only | fixture only | Fixture service signals covered sample candidates. | 0 in fixture | 0 in fixture; real unknown rate not measured | Unknown service status/hours must not be presented as open. | no |  |  | Real service coverage, open-status, and route-aware distance quality unproven. |

## Shadow Run Configuration

The first Region 001 validation run used the existing CampOps provider validation harness with fixture-backed source providers. No live network provider calls were made, and no production feature flags were enabled.

Observed gate posture:

- `campopsProviderValidationShadowModeEnabled=true` for the validation run only.
- `campopsRecommendationsEnabled=false`.
- `campopsProviderAdaptersEnabled=false`.
- `providerOutputAppliedToRecommendations=false`.

Provider set:

| Provider category | Provider ID | Status |
| --- | --- | --- |
| legal/access | `region_001.fixture_legal_access` | configured, fixture-backed |
| closure/seasonal restriction | `region_001.fixture_closure` | configured, fixture-backed |
| fire restriction | `region_001.fixture_fire` | configured, fixture-backed |
| weather | `region_001.fixture_weather` | configured, fixture-backed |
| service/resupply | `region_001.fixture_service` | configured, fixture-backed |

Provider categories missing:

- Standalone `access` source category. Access/public-access fields are currently normalized by the legal/access fixture provider, but no separate `sourceCategory: 'access'` provider is configured.
- Real upstream provider integrations for all categories. The current evidence proves the shadow-validation path and normalized shape, not real regional provider quality.

## Source Coverage Summary

Candidate count: 2

Provider result count: 10

Overall coverage band: high

| Category | Provider status | Coverage band | Result count | Covered candidates | Missing data |
| --- | --- | --- | ---: | ---: | ---: |
| legal | configured | high | 2 | 2 | 0 |
| access | missing | none | 0 | 0 | 0 |
| closure | configured | high | 2 | 2 | 0 |
| fire | configured | high | 2 | 2 | 0 |
| weather | configured | high | 2 | 2 | 0 |
| service | configured | high | 2 | 2 | 0 |

## Source Freshness Summary

Overall freshness band: fresh

| Category | Freshness band | Stale source count | Stale rate |
| --- | --- | ---: | ---: |
| legal | fresh | 0 | 0 |
| access | unknown | 0 | 0 |
| closure | fresh | 0 | 0 |
| fire | fresh | 0 | 0 |
| weather | fresh | 0 | 0 |
| service | fresh | 0 | 0 |

## Confidence Distribution

| Category | High | Medium | Low | Unknown |
| --- | ---: | ---: | ---: | ---: |
| legal | 2 | 0 | 0 | 0 |
| access | 0 | 0 | 0 | 0 |
| closure | 2 | 0 | 0 | 0 |
| fire | 2 | 0 | 0 | 0 |
| weather | 2 | 0 | 0 | 0 |
| service | 2 | 0 | 0 | 0 |

## Conflicts, Stale Sources, Unknowns

- Conflict frequency: 0
- Conflicts detected: none
- Stale rate: 0
- Stale sources detected: none
- Unknown rate: 0
- Missing-data rate: 0
- Unknown/missing caveat: the standalone `access` category is missing, so access readiness should not be treated as complete even though public-access fields are present through the legal/access fixture provider.

## Recommendation Impact Summary

Shadow validation normalized provider output and summarized coverage/freshness/confidence. It did not change hard gates, scoring, recommendation roles, UI, AI assist, or production search output.

Category impact:

- Legal/access: fixture output was shape-valid for legal/public-access fields. A standalone access provider remains missing, so this category is not ready for provider influence.
- Closure: fixture output was shape-valid and fresh. Real closure source quality remains unproven.
- Fire: fixture output was shape-valid and fresh. Real fire restriction source quality remains unproven.
- Weather: fixture output was shape-valid and fresh. Real weather freshness and regional coverage remain unproven in this shadow pass.
- Service/resupply: fixture output was shape-valid and fresh. Real service coverage, status/open hours, and route-aware distances remain unproven.

## Readiness by Category

| Category | Current readiness | Reason |
| --- | --- | --- |
| legal/access | Internal beta shadow-validation only | Legal/public-access fixture data covered both candidates, but standalone access provider coverage is missing and real upstream data is not validated. |
| closure/seasonal restriction | Internal beta shadow-validation only | Fixture data covered both candidates with fresh high-confidence signals; real regional closure provider quality remains unproven. |
| fire restriction | Internal beta shadow-validation only | Fixture data covered both candidates with fresh high-confidence signals; real fire restriction/red-flag source quality remains unproven. |
| weather | Internal beta shadow-validation only | Fixture data covered both candidates with fresh high-confidence signals; real weather source freshness and regional accuracy remain unproven. |
| service/resupply | Internal beta shadow-validation only | Fixture data covered both candidates with fresh high-confidence signals; real POI/service coverage and open-status confidence remain unproven. |

Overall readiness decision: not ready for closed field test provider influence, limited regional rollout, or public rollout.

## Required Follow-Up

1. Add or configure a standalone access provider category, or explicitly document that legal/access remains combined in one provider category.
2. Run this same shadow workflow with real upstream provider outputs for the Region 001 label.
3. Record provider-specific coverage, freshness, unknown, stale, and conflict rates from real data.
4. Keep `campopsProviderAdaptersEnabled=false` until real provider evidence is accepted.
5. Keep source transparency visible during any future closed field-test provider review.
6. Do not mark legal/access, closure, fire, weather, or service data ready for limited regional rollout until real provider coverage is validated.

## Validation Command

The run used the existing `runCampOpsProviderValidation` harness with fixture-backed providers and this rollout config:

```ts
{
  campopsProviderValidationShadowModeEnabled: true,
  campopsRecommendationsEnabled: false,
  campopsProviderAdaptersEnabled: false
}
```

Key observed output:

```txt
enabled=true
mode=shadow
shadowMode=true
productionImpactAllowed=false
providerOutputAppliedToRecommendations=false
overallCoverageBand=high
overallFreshnessBand=fresh
conflictFrequency=0
unknownRate=0
staleRate=0
missingDataRate=0
readinessDecision=not_ready
```
