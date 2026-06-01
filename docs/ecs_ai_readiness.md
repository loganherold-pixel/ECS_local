# ECS AI Readiness Gate

Last updated: 2026-05-05

## Executive Summary

ECS AI is classified as **Internal beta only**.

The centralized ECS AI advisory layer is suitable for controlled internal beta because it now has structured source-truth inputs, deterministic advisory contracts, duplicate suppression, safer ECS copy, and focused regression coverage across the main advisory surfaces. It is **not closed-field-test ready** without documented field QA, privacy review, provider/source validation, and product/safety/engineering risk acceptance. It is **not public-release ready**.

ECS AI must remain behind internal or development feature gates where available. It may assist operators with concise ECS advisories, but it must not be presented as a source of legal, safety, emergency, weather, vehicle, camp, or route certainty.

## Release Status

| Release target | Status | Decision |
| --- | --- | --- |
| Internal beta | Pass with controls | Enable only for internal testers and development builds where diagnostics are available. |
| Closed field test | Blocked pending approvals | Requires privacy/storage approval, Android/device QA evidence, provider/source validation, and risk acceptance. |
| Public release | Blocked | Not appropriate until all truthfulness, privacy, reliability, field, and UI gates pass with production evidence. |

Recommended feature flag state:

| Environment | Recommended state |
| --- | --- |
| Production public | Disabled |
| Internal beta | Enabled only behind explicit internal beta flag |
| Development/test | Enabled with diagnostics and fixture/demo labels visible |
| Closed field test | Disabled until risk acceptance and device QA evidence are recorded |

## Gate Table

| Gate | Status | Evidence checked | Remaining action |
| --- | --- | --- | --- |
| Source truth | Pass for internal beta | `lib/ai/ecsAITypes.ts`, `lib/ai/ecsAITruth.ts`, `lib/ai/ecsAIContext.ts`, `lib/ai/ecsAIAdvisories.ts`; regression `npm run test:ecs-ai-live-advisory-contract` | Validate every production feature passes truth metadata into ECS AI before closed field test. |
| Unsupported claims blocked | Pass for internal beta | `lib/ai/ecsAICopy.ts`; sweep removed unsafe user-facing copy in Navigate, Dashboard, Camp review, mission brief, and route analysis surfaces | Keep sanitizer and prompt guardrails active; add review to release checklist. |
| Advisory suppression | Pass for internal beta | `lib/ai/ecsAISuppression.ts`; `npm run test:ecs-ai-live-advisory-contract`; `npm run test:ecs-brief-guidance-dedupe` | Field-test severity escalation and critical alert behavior on-device. |
| UI safety | Pass for internal beta | Dashboard uses structured advisory lane; Navigate active guidance regression passed with `npm run test:navigate-active-guidance` | Manual phone/tablet verification still required for overlay stacking under active guidance. |
| Fleet integration | Pass for internal beta | `npm run test:fleet-active-vehicle-state`; ECS AI contract test covers estimated vehicle weight copy | Confirm non-Ram profiles in device QA and avoid public release until vehicle catalog confidence is reviewed. |
| Navigate integration | Pass for internal beta | Active guidance priority test; mission brief limited-state copy; route analysis copy qualified by available data | Manual route preview/guidance run still required before closed field test. |
| Dashboard integration | Pass for internal beta | Dashboard advisory lane prefers structured ECS AI advisories and stable suppress keys | Confirm advisory lane does not crowd widgets on target Android devices. |
| Explore integration | Partial pass | Trail Pack route geometry copy no longer implies route is clear | Need targeted Explore route analysis QA with missing/estimated source data. |
| CampOps integration | Pass for internal beta | `npm run test:campops-map-pin-parity`; unsafe "approved campsite" review copy replaced with reviewed/source-aware wording | Provider/source validation and land-use/legal review remain required. |
| Dispatch integration | Partial pass | ECS Brief duplicate suppression coverage applies to shared advisory lane | Dispatch CAD/Intel live-beta QA and emergency/non-official copy review remain required. |
| Weather integration | Pass for internal beta | `npm run test:weather-live-readiness`; ECS AI weather cached/unavailable advisory coverage | Verify live geography and stale forecast behavior on Android with real permissions/network changes. |
| Power/BLU integration | Pass for internal beta | `npm run test:power-live-readiness`; manual power advisory avoids live/fallback claims | Validate provider setup-required states and scanner quieting on device. |
| Telemetry integration | Pass for internal beta | `npm run test:telemetry-brief-publisher`; missing OBD data does not generate mechanical warnings | Validate provider discovery and unavailable sensor paths on device. |
| Privacy | Blocked for wider release | Code sweep found no ECS AI release path intentionally logging API keys or raw GPS trails as advisory text | Requires formal privacy/storage review for logs, location precision, vehicle identity, saved reports, and brief history. |
| Field risk language | Pass for internal beta | Copy sweep replaced generic AI and unsafe certainty language; sanitizer blocks "legal campsite", "safe campsite", "guaranteed", "no risk" claims | Requires product/safety signoff before closed field test. |
| Emergency/dispatch claims | Blocked for wider release | Dispatch not evaluated as an official agency workflow in this gate | Must clearly document that ECS AI/Dispatch messages are non-official unless a real approved agency integration is enabled. |
| Regression gates | Pass for internal beta | TypeScript and lint passed after sweep | Full app smoke/build should be rerun before a release candidate. |

## Source Truth Assessment

ECS AI can represent the required data truth states:

- `live`
- `cached`
- `estimated`
- `manual`
- `simulated`
- `unavailable`

The advisory contract requires each advisory to include `sourceTruth`, `sourceTypes`, `confidence`, and a stable `suppressKey`. The context builder wraps Fleet, Navigate, Weather, CampOps, Power/BLU, Telemetry, offline cache, location, and app-surface inputs with truth metadata before advisory generation.

Unsupported claims are mitigated through deterministic advisory generation and copy sanitization. ECS AI should return no advisory, or a limited "unavailable/lower confidence" advisory, when required source data is missing. It must not fabricate numbers, locations, legality, route conditions, provider coverage, mechanical faults, or emergency transmission status.

## Advisory Suppression Assessment

Duplicate advisory suppression is implemented with a 10-minute suppression window. Advisories with the same `suppressKey` are suppressed unless severity increases. Critical alerts may surface, but visual spam still needs field validation.

Verified suppress-key examples include:

- `weather.cached.route`
- `fleet.weight.estimated`
- `camp.legal.unverified`
- `power.source.manual`
- `telemetry.obd_unavailable`
- `route.offline_tiles_missing`

ECS Brief may retain richer history, but Dashboard and Navigate should show only concise current advisories.

## UI Safety Assessment

Dashboard:

- Shows the highest-priority structured ECS advisory.
- Uses compact lane copy.
- Uses stable suppress keys to avoid repeated flashing.

Navigate:

- Active guidance remains the top-priority route UI.
- ECS advisories are expected below guidance, not over it.
- Route confidence/noise is not reintroduced as a separate active-navigation banner by this gate.

ECS Brief and popups:

- Are the correct surfaces for deeper reasoning and source limitations.
- Should preserve confidence/source labels where useful.

## Feature Integration Notes

Fleet:

- Estimated vehicle weight is labeled as estimated.
- ECS AI should use active vehicle state and confidence labels.
- Ram 2500 must remain one supported profile, not the global baseline.

Navigate:

- Guidance remains visually protected.
- Mission brief limited-state copy avoids presenting fallback content as live truth.

Explore:

- Route geometry copy now avoids "clear route" certainty.
- Additional QA is still needed for source confidence in route cards and expedition analysis.

CampOps:

- Camp suitability must remain ECS-Inferred unless source-backed.
- Camps must not be called legal, safe, guaranteed, or approved unless explicit source data supports that claim.

Dispatch:

- Dispatch/ECS Brief advisories must be concise and non-official unless an approved agency workflow is active.
- Repeated AI/CAD messages must use shared suppression.

Weather:

- Cached/stale/unavailable weather must be labeled.
- Weather advisories must use correct current or selected geography.

Power/BLU:

- Manual power estimates must not render as live.
- Scanner events must not become operational advisories.

Telemetry:

- Missing OBD/device telemetry must not generate mechanical warnings.
- Simulated or unavailable telemetry must remain visibly or programmatically distinguishable from live telemetry.

## Privacy Assessment

Current status: **Blocked for closed field test and public release pending review**.

Required privacy checks:

- Confirm ECS AI logs do not include raw GPS trails, precise camp coordinates, home/work inference, API tokens, session tokens, user identifiers, or vehicle identifiers unless explicitly required and protected.
- Confirm saved ECS Brief/advisory history has retention and deletion behavior.
- Confirm Dispatch, CampOps, Weather, Fleet, Power, and Telemetry inputs passed into ECS AI are minimized to what is operationally necessary.
- Confirm diagnostics are dev/internal only and cannot expose API keys.

## Field Risk Assessment

Current status: **Internal beta only**.

ECS AI recommendations are assistance, not guarantees. Closed field testing requires documented acceptance that ECS AI:

- Does not certify campsite legality, route safety, access permission, weather safety, fire status, vehicle mechanical safety, or recovery safety.
- Does not replace local rules, signs, closure notices, land-manager instructions, weather alerts, or emergency services.
- Does not imply Dispatch reports are transmitted to agencies unless a real approved integration is enabled.

## Evidence Checked

Commands last verified during ECS AI bug sweep:

- `npm run test:ecs-ai-live-advisory-contract` - passed
- `npm run test:ecs-brief-guidance-dedupe` - passed
- `npm run test:navigate-active-guidance` - passed
- `npm run test:weather-live-readiness` - passed
- `npm run test:power-live-readiness` - passed
- `npm run test:telemetry-brief-publisher` - passed
- `npm run test:campops-map-pin-parity` - passed
- `npm run test:fleet-active-vehicle-state` - passed
- `npx tsc --noEmit --pretty false` - passed
- `npm run lint` - passed

Source sweep result:

- Remaining exact unsafe terms are sanitizer rules, prompt guardrails, comments, or internal persistence/fallback identifiers.
- User-facing ECS AI copy was updated away from generic AI labels, no-risk claims, fallback-as-truth labels, and unsupported campsite approval language.

## Remaining Blockers

1. Privacy/storage approval is not documented for ECS AI advisory history, diagnostics, location precision, vehicle identity, or Dispatch/CampOps data flow.
2. Android/device QA evidence is missing for advisory overlays, active guidance priority, Dashboard lane crowding, Power/BLU scanner quieting, Telemetry unavailable states, Weather geography, and Dispatch CAD/Intel behavior.
3. Provider/source validation is incomplete for Weather geography, CampOps legal/access data, Power/BLU live provider support, Fleet vehicle confidence, and Telemetry providers.
4. Product/safety/engineering risk acceptance is required before closed field testing.
5. Public release requires production evidence that feature flags, diagnostics, logs, source truth, and advisory suppression all behave correctly outside test fixtures.

## Required Approvals

- Engineering approval for source-truth contract and suppression behavior.
- Product approval for internal beta scope and UX copy.
- Safety/risk approval for assistance-only language and emergency limitations.
- Privacy/storage approval for advisory logs, diagnostics, location handling, user/vehicle identity, and retention.
- Provider/source approval for any feature that uses external weather, camp, power, telemetry, agency, or map data.
- Android field QA approval before closed field test.

## Recommended Next Action

Keep ECS AI enabled for **internal beta only** behind an explicit internal beta/development flag. Before closed field testing, run device QA on the target Android build, complete privacy/storage review, document provider/source limitations, and record formal risk acceptance for ECS AI as an advisory assistance layer.
