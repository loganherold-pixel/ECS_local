# CampOps Overview

CampOps is the planned ECS operational camp and resource logistics system. It should help users decide where they can safely, legally, and realistically end the day, including delayed-arrival and Plan B situations.

## Product Goal

CampOps turns camp finding from a pin search into an expedition endpoint decision. A camp candidate should be evaluated as part of the route, vehicle, group, resource, weather, land-use, and arrival context.

CampOps should eventually support:

- Fuel range and fuel margin.
- Water range and water margin.
- Propane, dump, shower, laundry, and service planning where data exists.
- Camp suitability score.
- Group capacity.
- Flatness or slope estimate where available.
- Wind exposure where available.
- Fire restriction awareness.
- Privacy likelihood.
- Late-arrival risk.
- Pet and kid suitability.
- Trailer turnaround suitability.
- Plan B and emergency camp automation.

The target question is: "Where can we safely end the day if we are delayed two hours?"

## Architecture Principle

The deterministic CampOps engine should produce the recommendation, scores, filters, hard gates, resource margins, and confidence values. AI should explain and summarize those outputs.

AI must not invent:

- Legal status or land-use permission.
- Access confidence.
- Fuel or water margins.
- Weather facts, fire restrictions, or provider coverage.
- Coordinates, route state, telemetry, resource availability, or safety-critical conclusions.

When data is missing, stale, cached, mocked, estimated, or manually entered, CampOps outputs and AI summaries must say so.

## Data And Output Shape

Prefer structured, typed engine inputs and outputs over ad hoc UI strings. CampOps outputs should include:

- Candidate identity, location, and source.
- Status or recommendation tier.
- Hard gates and whether each gate passed, failed, or is unknown.
- Scores for suitability, access, legality confidence, resource margin, arrival risk, and vehicle fit where supported.
- Fuel and water margin calculations with units and source confidence.
- Data used, source labels, timestamps, and stale/missing/manual/cache markers.
- Human-readable reasons derived from deterministic outputs.

Adapters should normalize route, weather, vehicle, logistics, campsite/community, and manual input state into explicit engine inputs. Business rules should live in pure domain functions where possible.

## Backward Compatibility

Do not break existing camp search, camp intel, campsite recommendations, campsite candidate panels, or community review flows while introducing CampOps. Prefer a wrapper or adapter layer that can consume existing candidate shapes and produce CampOps assessments.

Use feature flags for risky behavior changes, especially:

- Candidate filtering and ranking.
- Route-aware recommendations.
- Plan B automation.
- AI prompt changes.
- Public/community camp visibility.
- Provider-backed legal, closure, fire, or resource data.

## Testing Guidance

Add tests before or alongside behavior changes:

- Filtering and hard-gate tests for legal/access/safety/resource constraints.
- Scoring tests for Normal, Watch, Caution, and Critical style outcomes.
- Resource margin tests for fuel, water, and stale/manual/estimated values.
- Adapter tests for missing, cached, mocked, stale, and manual data paths.
- Backward-compatibility tests against existing campsite candidate/search outputs.
- AI prompt and response tests proving AI only summarizes deterministic outputs and cannot override legal, access, weather, fuel, water, or safety-critical engine conclusions.

## Initial Implementation Assumptions

- CampOps is guidance only until explicitly implemented.
- Existing campsite recommendation and camp intel systems remain the runtime source of camp UI behavior.
- Provider-backed legal/resource/weather fields may be unavailable; unknown must stay unknown.
- Manual input fallback remains necessary for field use.
