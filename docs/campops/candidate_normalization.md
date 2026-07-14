# CampOps Candidate Normalization

## Canonical boundary

Every recommendation input is adapted to `CampCandidate` before hard gates, scoring, ranking, or presentation. The canonical record preserves its original source IDs and attribution while exposing these independent decision dimensions:

- legal and access evidence
- current condition and closure evidence
- live availability
- vehicle, trailer, group, and operational suitability
- user or community trust

Trust, popularity, or a provider POI record never proves legal access. A legal source does not prove current passability or availability. OpenStreetMap remains supplemental POI data and is never treated as legal or live-availability authority.

Supported classes are generated route candidates, established campgrounds, dispersed eligibility regions, community sites, personal/group/manual/imported records, and CampScout records. Legacy recommendation outputs remain unchanged at their public boundary; current adapters feed those outputs through the canonical pipeline.

## Recommendation visibility

- `operational`: eligible for deterministic gates and ranking.
- `personal`: user- or group-scoped data that can participate without becoming public.
- `research_only`: visible planning reference that cannot become an endpoint until explicitly verified or converted.
- `blocked`: unapproved, flagged, rejected, or otherwise ineligible for operational recommendations.

Unreviewed community submissions are `blocked`. Dispersed eligibility polygons and inferred CampScout areas are `research_only`. Manual camp entry remains available offline and is labeled as manual/personal with unknown legal, condition, and availability state unless separate evidence exists.

## Freshness

CampOps uses the ECS source-truth policies instead of one shared timeout. Legal/access evidence, current condition advisories, and provider availability are evaluated independently. An old provider value such as `available` remains inspectable, but stale, expired, or unavailable freshness sets `usableForDecision` to false and adds an explicit hard-gate warning. Restrictive evidence is retained conservatively during dedupe.

## Identity and dedupe

Canonical IDs combine candidate class, normalized name, and rounded coordinates. Existing provider IDs are retained in provenance. A spatial/name grid merges nearby duplicates without a full pairwise scan; the higher-authority record is the presentation winner while all source IDs, labels, attribution, and restrictive evidence remain attached. Planned-camp IDs are remapped through the alias table before ranking.

## Handoffs

Recommendation roles remain explicit: primary, backup, and emergency. Navigate and Dashboard can inspect these recommendations without mutating a plan. Trip Builder imports only endpoint IDs the user explicitly selected; an empty selection does not silently add a recommended camp.

## Performance and cache bounds

`CampOpsRecommendationCoordinator` owns normalization, gates, scoring, and recommendation generation. It retains at most eight stable input fingerprints and exposes request, calculation, cache-hit, candidate, dedupe, and duration counters. Established campground map dedupe uses spatial buckets and returns deterministic diagnostics.

Run `npm run test:campops-performance` for machine-readable output. On the July 13, 2026 desktop CI fixture, 1,200 map records required 200 distance checks versus 719,400 pairs in the former nested scan. A repeated 250-candidate recommendation input was a cache hit and performed no second calculation. These are deterministic algorithm checks, not Android/iOS frame-rate or memory claims.

## Rollout and evidence

No rollout defaults change. CampOps recommendations, provider adapters, source transparency, endpoint recommendations, AI assist, publishing, and telemetry remain default off in `campOpsRecommendationConfig`. Production provider availability still requires provider credentials, privacy approval, regional source validation, offline-cache evidence, and field validation on supported Android/iOS devices.
