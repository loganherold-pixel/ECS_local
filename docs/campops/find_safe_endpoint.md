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

## Feature Flag

The flow is disabled unless `campopsRecommendationsEnabled` is enabled through the existing CampOps rollout config or direct input.

When disabled:

- no endpoint is recommended
- no production search behavior changes
- `decisionSummary.status` is `disabled`

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
