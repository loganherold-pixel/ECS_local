# CampOps Provider Readiness - Region 001

Date: 2026-05-17

## Region

- Region label: Region 001 - Northern Nevada controlled provider shadow cell
- Route labels: On-time normal day; two-hour delay endpoint review; trailer access review; low fuel endpoint review; low water endpoint review; stale source review
- Release cohort label: internal-shadow-validation-region-001
- Validation mode: fixture-backed pending real-shadow
- Provider influence allowed: no
- Provider shadow mode: yes
- Raw provider payloads excluded from shared evidence: yes
- Precise private coordinates excluded: yes
- Production recommendation impact: none
- Provider output applied to recommendations: false

This report uses a region label only. It does not include precise coordinates, raw user IDs, vehicle IDs, private debriefs, raw AI prompts, secrets, provider credentials, or raw provider payloads.

## Provider Category/Region Approval Packet

This packet records the current Region 001 provider-readiness posture. The existing evidence proves the provider validation harness, normalized report shape, source transparency copy, and fixture handling. It does not prove real upstream provider quality and does not authorize provider influence.

Validation modes:

- `fixture-backed`: proves normalization and report shape only.
- `real-shadow`: records real provider output in shadow mode only; does not allow provider influence by itself.
- `approved`: requires real upstream category evidence, approver, approval date, and an explicit influence allowance before provider output may affect recommendations.

Category statuses:

- `not_approved`: no influence allowed.
- `shadow_validated`: real-shadow evidence exists, but influence remains disabled until approved.
- `approved`: influence may be requested only for this region/category after approver/date/category fields are complete.

## Access Provider Category Policy

Region 001 does not currently have a standalone `access` provider category. Access/public-access fields remain combined under the existing `legal/access` provider category until a separate access provider is configured, validated, and approved.

Because access remains combined, legal/access readiness must be reviewed as one category and must not be treated as independently complete for either legal status or physical/public access. Unknown, missing, stale, or conflicting access signals must remain visible and must reduce confidence rather than imply permission, safety, or route suitability.

## Category Matrix

| Category | Status | Validation mode | Evidence date | Freshness window | Coverage summary | Conflict rate | Stale/unknown rate | Unknown handling behavior | Provider influence allowed | Approver | Approval date | Remaining issues |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| legal/access | not_approved | fixture-backed | 2026-05-01 fixture shadow | fixture only | Shape-valid fixture legal/public-access signals exist; no standalone access provider and no real upstream evidence accepted. | 0 in fixture; real not run | 0 in fixture; real not run | Unknown legal/access must reduce confidence and may caution/reject in high-risk contexts. | no | not approved | not approved | Real upstream legal/access and access coverage, freshness, unknown, stale, and conflict rates are required. |
| closure/seasonal restriction | not_approved | fixture-backed | 2026-05-01 fixture shadow | fixture only | Shape-valid fixture closure signals exist; real closure quality is unproven. | 0 in fixture; real not run | 0 in fixture; real not run | Unknown/stale closure must reduce confidence and never be treated as open. | no | not approved | not approved | Real upstream closure coverage, freshness, unknown, stale, and conflict rates are required. |
| fire restriction | not_approved | fixture-backed | 2026-05-01 fixture shadow | fixture only | Shape-valid fixture fire signals exist; real fire restriction quality is unproven. | 0 in fixture; real not run | 0 in fixture; real not run | Unknown fire status must remain explicit; fire closures may hard-gate. | no | not approved | not approved | Real upstream fire coverage, freshness, unknown, stale, and conflict rates are required. |
| weather | not_approved | fixture-backed | 2026-05-01 fixture shadow | fixture only | Shape-valid fixture weather signals exist; real weather freshness and regional coverage are unproven. | 0 in fixture; real not run | 0 in fixture; real not run | Unknown/stale weather must reduce confidence and show stale/missing warnings. | no | not approved | not approved | Real upstream weather coverage, freshness, unknown, stale, and conflict rates are required. |
| service/resupply | not_approved | fixture-backed | 2026-05-01 fixture shadow | fixture only | Shape-valid fixture service signals exist; real service status/open hours and route-aware coverage are unproven. | 0 in fixture; real not run | 0 in fixture; real not run | Unknown service status/hours must not be presented as open. | no | not approved | not approved | Real upstream service coverage, freshness, unknown, stale, and conflict rates are required. |

## Shadow Run Configuration

The first Region 001 validation run used the existing CampOps provider validation harness with fixture-backed source providers. No live network provider calls were made, no raw provider payloads were retained in this report, and no production feature flags were enabled.

Observed gate posture:

- `campopsProviderValidationShadowModeEnabled=true` for the validation run only.
- `campopsRecommendationsEnabled=true` may be used for deterministic closed-field review.
- `campopsProviderAdaptersEnabled=false` until a real upstream provider category passes Region 001 readiness and approval.
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

- Standalone `access` source category. Access/public-access fields are currently normalized by the combined legal/access fixture provider.
- Real upstream provider integrations for all categories in this Region 001 readiness report. Current evidence proves the shadow-validation path and normalized shape, not real regional provider quality.

## Fixture Source Coverage Summary

Candidate count: 2

Provider result count: 10

Overall coverage band: high for fixtures only

| Category | Provider status | Coverage band | Result count | Covered candidates | Missing data |
| --- | --- | --- | ---: | ---: | ---: |
| legal | configured fixture | high | 2 | 2 | 0 |
| access | missing standalone provider | none | 0 | 0 | 0 |
| closure | configured fixture | high | 2 | 2 | 0 |
| fire | configured fixture | high | 2 | 2 | 0 |
| weather | configured fixture | high | 2 | 2 | 0 |
| service | configured fixture | high | 2 | 2 | 0 |

## Fixture Source Freshness Summary

Overall freshness band: fresh for fixtures only

| Category | Freshness band | Stale source count | Stale rate |
| --- | --- | ---: | ---: |
| legal | fresh fixture | 0 | 0 |
| access | unknown standalone provider | 0 | 0 |
| closure | fresh fixture | 0 | 0 |
| fire | fresh fixture | 0 | 0 |
| weather | fresh fixture | 0 | 0 |
| service | fresh fixture | 0 | 0 |

## Real Upstream Provider Evidence Ledger

No real upstream provider shadow run has been completed for this Region 001 label in this report. The rows below are placeholders for the next evidence packet and must be filled from real provider outputs before any category can be proposed for influence.

| Category | Provider/source | Real shadow status | Coverage rate | Freshness rate | Unknown rate | Stale rate | Conflict rate | Accepted for influence |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| legal/access | TBD real provider set | not run | n/a | n/a | n/a | n/a | n/a | no |
| standalone access | not configured | missing | n/a | n/a | n/a | n/a | n/a | no |
| closure/seasonal restriction | TBD real provider set | not run | n/a | n/a | n/a | n/a | n/a | no |
| fire restriction | TBD real provider set | not run | n/a | n/a | n/a | n/a | n/a | no |
| weather | TBD real provider set | not run | n/a | n/a | n/a | n/a | n/a | no |
| service/resupply | TBD real provider set | not run | n/a | n/a | n/a | n/a | n/a | no |

## Conflicts, Stale Sources, Unknowns

- Fixture conflict frequency: 0
- Fixture conflicts detected: none
- Fixture stale rate: 0
- Fixture stale sources detected: none
- Fixture unknown rate: 0
- Fixture missing-data rate: 0
- Real upstream conflict, stale, unknown, and missing-data rates: not run
- Unknown/missing caveat: the standalone `access` category is missing, so access readiness is not complete even though public-access fields can be represented through the combined legal/access shape.

## Recommendation Impact Summary

Shadow validation normalized fixture provider output and summarized coverage/freshness/confidence. It did not change hard gates, scoring, recommendation roles, UI, AI assist, or production search output.

Category impact:

- Legal/access: fixture output was shape-valid for legal/public-access fields. A standalone access provider remains missing, and real upstream legal/access quality has not been accepted.
- Closure: fixture output was shape-valid and fresh. Real closure source quality remains unproven.
- Fire: fixture output was shape-valid and fresh. Real fire restriction source quality remains unproven.
- Weather: fixture output was shape-valid and fresh. Real weather freshness and regional coverage remain unproven.
- Service/resupply: fixture output was shape-valid and fresh. Real service coverage, status/open hours, and route-aware distances remain unproven.

## Readiness by Category

| Category | Current readiness | Reason |
| --- | --- | --- |
| legal/access | Not approved | Combined legal/access fixture shape exists, but standalone access is missing and real upstream evidence has not been accepted. |
| closure/seasonal restriction | Not approved | Fixture shape exists, but real closure coverage/freshness/conflict evidence has not been accepted. |
| fire restriction | Not approved | Fixture shape exists, but real fire restriction coverage/freshness/conflict evidence has not been accepted. |
| weather | Not approved | Fixture shape exists, but real weather coverage/freshness/conflict evidence has not been accepted. |
| service/resupply | Not approved | Fixture shape exists, but real service/open-status coverage/freshness/conflict evidence has not been accepted. |

Overall readiness decision: not approved for provider influence. Region 001 may continue fixture-backed and real-shadow validation with source transparency visible, but legal/access, closure, fire, weather, and service data are not ready for broader regional rollout or production claims.

## Required Follow-Up

1. Keep legal/access combined in one provider category until a standalone access provider is configured, validated, and approved.
2. Run this same shadow workflow with real upstream provider outputs for the Region 001 label.
3. Record provider-specific coverage, freshness, unknown, stale, and conflict rates from real data in the Real Upstream Provider Evidence Ledger.
4. Keep `campopsProviderAdaptersEnabled=false` outside any future approved Region 001 category/route scope until real provider evidence is accepted for additional regions.
5. Keep source transparency visible during any future closed field-test provider review.
6. Do not mark legal/access, closure, fire, weather, or service data ready for broader regional rollout until real provider coverage is validated and accepted.

## Validation Command

The completed run used the existing `runCampOpsProviderValidation` harness with fixture-backed providers and this rollout config:

```ts
{
  campopsProviderValidationShadowModeEnabled: true,
  campopsRecommendationsEnabled: true,
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
overallCoverageBand=high for fixtures only
overallFreshnessBand=fresh for fixtures only
conflictFrequency=0 in fixtures
unknownRate=0 in fixtures
staleRate=0 in fixtures
missingDataRate=0 in fixtures
readinessDecision=not_ready
```
