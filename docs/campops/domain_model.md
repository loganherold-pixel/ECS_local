# CampOps Domain Model

`lib/campops` is the first isolated CampOps domain layer. It does not replace the current Navigate campsite search, CampIntel ranking, community campsite layers, or recommendation submission flows.

## Purpose

CampOps models camps as operational endpoints in an expedition plan. The model is designed to hold route context, vehicle and group constraints, resource margins, legal/access confidence, weather/fire/daylight risk, and recommendation roles before AI explains anything.

## Main Types

- `CampSearchContext`
  - Current location, route/trip/planned camp ids, current time, desired arrival window, daylight/sunset data, vehicle profile, convoy profile, resources, user preferences, risk tolerance, offline mode, delay estimate, and route progress.
- `CampCandidate`
  - A normalized camp candidate with id, name, location, source, confidence, verification date, basic POI fields, score/rating, amenities, conditions, and a reference to the existing source record.
- `CampCandidateEnrichment`
  - Operational facts layered onto a candidate: legal/access confidence, vehicle and trailer fit, capacity, ETA, sunset margin, fuel/water impact, slope, weather exposure, fire restriction status, privacy/occupancy likelihood, late-arrival risk, and data confidence.
- `CampHardGateResult`
  - Deterministic gate output: allowed, rejected, caution, or unknown, plus gate id, severity, reason, and missing data fields.
- `CampSuitabilityScores`
  - Score buckets for overall, legal, access, time, resources, terrain, weather, group fit, trailer fit, late arrival, privacy, and data confidence.
- `CampOperationalRole`
  - Candidate role labels: primary, backup, emergency, weather fallback, resupply, recovery, trailer safe, family safe, or unknown.
- `CampRecommendationSet`
  - Final deterministic recommendation contract with recommended, backup, and emergency camps; rejected candidates; warnings; assumptions; confidence summary; roles; scores; and enrichments.

## Compatibility Adapters

`lib/campops/campOpsAdapters.ts` adds thin adapters from existing campsite shapes:

- Generated route/draw-area `CampsiteCandidate`
- Locator `CampsiteCandidate`
- Approved `PublicCampSite`
- `CampSiteReportResponse`
- `GroupCampSiteItem`

These adapters preserve source provenance through `existingRef` and do not change production behavior.

## Migration Rule

CampOps should remain deterministic-first. Future AI prompts should consume `CampRecommendationSet` and explain its gates, scores, warnings, assumptions, and confidence. AI must not invent legal status, access confidence, fuel/water margins, weather/fire facts, or safety-critical conclusions.
