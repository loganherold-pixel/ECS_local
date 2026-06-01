# CampOps Evaluation Scenarios

CampOps evaluation fixtures live in `fixtures/campops/evaluationFixtures.js`, with executable checks in `scripts/test-campops-evaluation-fixtures.js`.

Provider fixture packs live in `fixtures/campops/providerFixtures.js`, with executable checks in `scripts/test-campops-provider-fixtures.js`. They are stable, local-only fixtures for legal/access, closure, fire restriction, weather, service/resupply, source conflicts, and stale/offline behavior. They intentionally avoid real secrets, raw provider payloads with private data, and moving timestamps.

These fixtures are intentionally deterministic. They exercise the hard gates, Resource Debt, suitability scoring, recommendation roles, confidence warnings, and AI assist guardrails without changing production camp search behavior.

## Scenario Set

- `on_time_normal_day`
  - Planned camp remains recommended when arrival, legality, access, resources, and confidence are acceptable.
- `two_hour_delay`
  - Original scenic camp is downgraded when delay pushes ETA after sunset with high late-arrival risk.
  - A closer, easier-access camp becomes the recommendation.
- `trailer_convoy`
  - A narrow or dead-end camp is rejected or downgraded when a trailer is present.
  - A trailer-suitable camp is recommended and receives the trailer-safe role.
- `low_fuel_margin`
  - A remote scenic camp is downgraded when it creates tight fuel margin.
  - A camp preserving fuel margin is recommended.
- `low_water_margin`
  - A dry remote camp is downgraded when group water margin is low.
  - A camp closer to reliable water or exit is recommended.
- `high_wind_exposed_ridge`
  - An exposed ridge is downgraded when weather exposure data exists.
  - A sheltered camp is recommended and used as the weather fallback.
- `legal_uncertainty`
  - A low-confidence legal candidate is not treated as confidently recommended.
  - Missing legal confidence is surfaced for UI and AI narration.
- `confirmed_closure`
  - A confirmed closure hard-gates the affected camp even when the underlying land status is otherwise legal.
  - An open alternative remains available for recommendation.
- `conflicting_legal_access_source`
  - A candidate with legal access but current restricted access is rejected or downgraded by the deterministic gates.
  - A resolved public-access alternative is recommended.
- `emergency_stop`
  - A less comfortable but legal, accessible, close camp can be selected as an emergency endpoint.
- `large_group`
  - A small camp is rejected or downgraded when known group capacity is insufficient.
  - A larger camp is recommended.
- `offline_stale_data`
  - Offline or stale data lowers confidence and emits freshness warnings.

## Provider Fixture Pack

`providerFixtures.js` exports:

- `legalAccessSources`
- `closureSources`
- `fireRestrictionSources`
- `weatherSources`
- `serviceResupplySources`
- `mixedSourceConflictCases`
- `staleOfflineCases`
- `providerRegressionScenarios`

The provider fixture regression script validates that these records can be reused across source adapter tests, hard-gate tests, scoring tests, recommendation tests, and AI assist payload tests. The scenario set covers:

- provider-backed on-time normal day
- provider-backed two-hour delay
- provider-backed trailer convoy
- provider-backed low fuel
- provider-backed low water
- provider-backed high wind exposed ridge
- provider-backed legal uncertainty
- provider-backed confirmed closure
- provider-backed stale offline source
- provider-backed conflicting legal/access source

## AI Assist Checks

The eval script also verifies that CampOps AI assist:

- cannot resurrect a hard-gate-rejected camp as recommended
- includes unknown legal confidence in the payload
- receives deterministic tradeoff text in the prompt payload
- uses concise, conservative field-mode instructions

AI remains a narrator over CampOps output. It must not invent legal status, weather, closures, fuel, water, access, or safety-critical conclusions.

## Running

```bash
node ./scripts/test-campops-evaluation-fixtures.js
node ./scripts/test-campops-provider-fixtures.js
```

The script uses the repository's lightweight TypeScript require hook pattern used by the other CampOps test scripts.
