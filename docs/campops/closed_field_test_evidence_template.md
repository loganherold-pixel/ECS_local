# CampOps Closed Field-Test Evidence Template

Use this template when real internal beta or closed field-test readiness evidence is collected. Placeholder values do not count as approval, completion, or readiness. Leave fields as `TODO`, `not run`, `not approved`, or `blocked` until actual evidence exists.

This template must use route labels, region labels, scenario labels, and evidence artifact references only. Do not include precise private coordinates, private user ids, vehicle identifiers, raw AI prompts, private debrief notes, raw provider payloads, secrets, or provider credentials.

## Evidence Header

| Field | Value |
| --- | --- |
| Evidence packet id | TODO |
| Prepared date | TODO |
| Prepared by | TODO role/team label only |
| Reviewers | TODO role/team labels only |
| Evidence date range | TODO |
| Target rollout stage | closed field test |
| Recommendation | blocked / ready with restrictions / not ready |
| Summary | TODO |

## Tester Coverage

| Field | Value |
| --- | --- |
| Tester count | TODO number; use `0` until sessions are complete |
| Tester cohort label | TODO label only |
| Tester profile coverage | TODO, for example solo vehicle, convoy, trailer, family/pets labels |
| Completed sessions | TODO |
| Incomplete sessions | TODO |
| Feedback artifacts | TODO repo-safe references only |

## Device Coverage

| Field | Value |
| --- | --- |
| Android/device QA execution date | TODO or `not run` |
| Device coverage | TODO labels only, for example small Android, large Android, landscape |
| App/runtime build label | TODO label only |
| Visual QA route used | TODO, for example `/dev/campops-visual-qa` |
| Screenshots/evidence references | TODO repo-safe references only; no private data |
| Status | not run / partial / complete |
| Notes | TODO |

## Route, Region, And Scenario Labels

Use labels only. Do not include exact camps, private coordinates, raw route files, or private trip names.

| Evidence type | Labels tested | Status | Notes |
| --- | --- | --- | --- |
| Region labels | TODO | not run / partial / complete | TODO |
| Route labels | TODO | not run / partial / complete | TODO |
| Camp scenario labels | TODO | not run / partial / complete | TODO |
| Offline/cache scenario labels | TODO | not run / partial / complete | TODO |

## Required Scenario Set

| Scenario label | Evidence status | Artifact reference | Notes |
| --- | --- | --- | --- |
| On-time normal route | TODO | TODO | TODO |
| Two-hour delay with planned camp after sunset | TODO | TODO | TODO |
| Trailer or full-size vehicle access/turnaround | TODO | TODO | TODO |
| Low fuel margin or next-fuel uncertainty | TODO | TODO | TODO |
| Low water margin or next-day water concern | TODO | TODO | TODO |
| Offline cached source data | TODO | TODO | TODO |
| Offline no-cache or missing-source state | TODO | TODO | TODO |
| Stale closure, weather, fire, or service data | TODO | TODO | TODO |
| Legacy result list differs from CampOps endpoint recommendation | TODO | TODO | TODO |
| Private debrief capture without community publishing | TODO | TODO | TODO |

## Provider Readiness By Category

Provider readiness must be approved by region label and category before provider output can influence recommendations. Shadow-only validation is not approval.

| Provider category | Mode used | Readiness status | Coverage band | Freshness band | Conflict status | Unknown/missing status | Approval status | Evidence reference |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Legal/access | shadow only / influence approved | not approved / approved for test | TODO | TODO | TODO | TODO | not approved | TODO |
| Closure/seasonal restriction | shadow only / influence approved | not approved / approved for test | TODO | TODO | TODO | TODO | not approved | TODO |
| Fire restriction | shadow only / influence approved | not approved / approved for test | TODO | TODO | TODO | TODO | not approved | TODO |
| Weather | shadow only / influence approved | not approved / approved for test | TODO | TODO | TODO | TODO | not approved | TODO |
| Service/resupply | shadow only / influence approved | not approved / approved for test | TODO | TODO | TODO | TODO | not approved | TODO |

## Privacy, AI, Telemetry, And Community Posture

| Area | Required posture | Current evidence | Owner approval status | Notes |
| --- | --- | --- | --- | --- |
| Privacy/storage | Retention, deletion, encryption status, and owner decisions approved for the test data posture | TODO | not approved / approved | TODO |
| AI assist | Disabled unless exact model/config real-output review is approved | disabled / approved config TODO | not approved / approved | TODO |
| Telemetry | Disabled unless sink/privacy approval is recorded | disabled / approved sink TODO | not approved / approved | TODO |
| Community publishing | Disabled | disabled | not approved | Must remain off for closed field test unless separately approved |
| Provider influence | Shadow-only unless target region/category approval exists | shadow only / approved categories TODO | not approved / approved | TODO |
| Rollback verification | Rollback tested for active build/cohort | TODO | not verified / verified | TODO |

## Issue Summary

Classify issues using `docs/campops/internal_beta_issue_rubric.md`.

| Severity | Open count | Resolved count | Summary | Blocks closed field test |
| --- | ---: | ---: | --- | --- |
| P0 unsafe or privacy-critical | TODO | TODO | TODO | yes if any open |
| P1 recommendation trust failure | TODO | TODO | TODO | yes if any open |
| P2 UX or source transparency issue | TODO | TODO | TODO | maybe; product/safety decision required |
| P3 polish/copy issue | TODO | TODO | TODO | no unless product escalates |
| P4 enhancement | TODO | TODO | TODO | no |

## Recommendation

Select one and explain with evidence:

- `blocked`: Required gates are missing, blocked, unapproved, or have unresolved P0/P1 issues.
- `ready with restrictions`: Required gates pass for approved testers, approved region/route labels, approved provider categories, community publishing off, telemetry off unless approved, and AI disabled unless approved.
- `not ready`: Evidence is incomplete or too weak to support closed field testing, even if no single P0/P1 is open.

Recommendation: blocked / ready with restrictions / not ready

Required follow-up:

1. TODO
2. TODO
3. TODO

## Sign-Off Checklist

Do not sign off with placeholders.

- [ ] No unresolved P0 issues.
- [ ] No unresolved P1 recommendation-trust issues.
- [ ] Provider readiness approved for target region/category, or provider influence remains shadow-only.
- [ ] Android/device QA completed with evidence.
- [ ] Privacy/storage owner approval recorded for the test data posture.
- [ ] Community publishing disabled.
- [ ] Telemetry disabled unless sink/privacy approval is recorded.
- [ ] AI assist disabled unless exact model/config real-output review is approved.
- [ ] Rollback verified for the active build.
- [ ] Route/region/scenario labels defined without private data.
