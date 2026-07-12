# Find Safe End Point

The first CampOps "Find Safe End Point" flow answers:

> Where can we safely end the day if we are delayed?

This is a deterministic CampOps action. AI may summarize the result after it is computed, but AI must not choose the endpoint.

## Entry Point

Use `findCampOpsSafeEndPoint` from `lib/campops`.

The function accepts:

- current `CampSearchContext` fields, when available
- current location, when available
- delay estimate or scenario
- desired arrival window, or `beforeSunset`
- vehicle, group, convoy, trailer, resource, and camp preference context through `CampSearchContext`
- existing `CampCandidate` values
- existing `CampCandidateEnrichment` values

It returns:

- `CampRecommendationSet`
- concise `decisionSummary`
- structured `decisionPoint`, when route/progress data is sufficient
- resolved delay scenario and context

## Feature Flags And Navigate Rollout

The deterministic flow is disabled unless `campopsEndpointRecommendationEnabled` is enabled through the existing CampOps rollout config or direct input. Decision-point output additionally requires `campopsDecisionPointsEnabled`.

The first Navigate UI uses `getCampOpsSafeEndpointRolloutConfig`. It keeps the existing CampOps default-off posture and only enables the endpoint and decision-point flags when the existing internal-beta rollout gate is active. When that gate is off, the `END DAY SAFELY` Navigate Tools action is not rendered and no endpoint computation is exposed.

When disabled:

- no endpoint is recommended
- no production search behavior changes
- `decisionSummary.status` is `disabled`

## Navigate Decision Mode

Navigate Tools exposes the first user-facing decision mode without adding a tab or changing the Navigate layout. The sheet supports no delay, 30-minute, 1-hour, 2-hour, and bounded custom-delay scenarios plus a before-sunset control.

Implementation boundaries:

- `lib/campops/campOpsSafeEndpointDecisionMode.ts` is the pure adapter and presentation-model layer. It normalizes active route progress, vehicle/resources, convoy state, power, candidate evidence, weather source state, and connectivity before invoking `findCampOpsSafeEndPoint`.
- `components/navigate/SafeEndpointDecisionSheet.tsx` renders the compact ECS sheet and Source Truth inspectors.
- `app/(tabs)/navigate.tsx` only supplies existing store snapshots and orchestrates map preview or guarded route staging.

Map preview is read-only and does not replace the active route, camp, expedition, or convoy plan. Route staging uses the existing active-guidance replacement confirmation before ending guidance or replacing the staged preview. It does not start navigation automatically and it does not notify Dispatch or convoy members.

The view model preserves manual, cached, stale, missing, estimated, and inferred input labels. Route-wide weather freshness is shown to the user but is not applied to candidate scoring unless CampOps already has candidate-linked weather evidence. Missing route geometry or progress produces an explicit no-decision-point reason instead of an invented turnoff.

## Delay Support

Built-in scenarios:

- `no_delay`
- `delay_30m`
- `delay_1h`
- `delay_2h`
- custom `{ kind: "custom", minutes }`

`findCampOpsSafeEndPointScenarios` runs the standard preset set for preview or later UI controls.

## How It Works

1. Resolve delay minutes from explicit scenario, explicit delay estimate, current context delay, or current route delay.
2. Build a delayed `CampSearchContext`.
3. If `beforeSunset` is true, use sunset as the latest safe-arrival deadline unless an earlier window is configured.
4. Shift candidate ETA and sunset margin by the delay.
5. Recompute late-arrival risk.
6. Attach Resource Debt.
7. Run hard gates.
8. Run suitability scoring.
9. Generate `CampRecommendationSet`.
10. Build a concise decision summary.
11. If route/progress data is available, identify the practical continue-or-divert decision point before the user passes it.

## Decision Summary

The summary includes:

- recommended safe endpoint
- backup endpoint
- emergency endpoint
- planned camp downgrade reason
- decision deadline
- structured decision point, when available
- no-decision-point reason, when route geometry/progress is insufficient
- key risks
- next action

## Decision Point

`decisionSummary.decisionPoint` and `recommendationSet.decisionPoint` are populated when CampOps has enough route or progress context to identify where the user must choose between continuing and diverting.

The decision point can include:

- location or route mile marker
- decision deadline time
- reason
- recommended action
- continue option
- divert option
- risk if the user continues
- latest recommended turnoff
- confidence

Supported decision point kinds:

- `technical_section`
- `trailer_turnaround`
- `resupply`
- `before_dark`
- `legal_boundary`
- `unknown`

Route/progress fields that improve decision points include `routeMileMarker`, `distanceRemainingMiles`, `driveTimeRemainingMinutes`, `latestTurnoff*`, `lastTrailerTurnaround*`, `nextResupply*`, `nextLegalBoundary*`, `currentSegmentLabel`, and current location.

If those fields are missing, CampOps does not invent a decision point. It returns `decisionPoint: null` with `noDecisionPointReason`, while still producing endpoint recommendations when possible.

Decision deadlines prefer the latest practical turnoff time when distance and remaining drive time are available. Otherwise, CampOps falls back to the arrival/deadline window.

## Safety Rule

If the planned camp moves after sunset or beyond the configured safe-arrival window and late-arrival risk is high, hard gates can reject or downgrade it. CampOps should then prefer a safer accessible endpoint where one exists.

The flow never uses AI to compute this recommendation. AI may summarize the decision point, but it must not override CampOps hard gates, confidence, continue/divert options, stale-source warnings, or endpoint roles.

## Verification

- `npm run test:campops-safe-endpoint-decision-mode`
- `npm run test:navigate-safe-endpoint-decision-ui`
- `npm run test:campops-two-hour-delay`
- `npm run test:campops-readiness`
- `npm run test:active-guidance-replacement-guard`
