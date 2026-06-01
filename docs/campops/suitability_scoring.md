# CampOps Suitability Scoring

`lib/campops/campOpsScoring.ts` is the deterministic scoring stage that runs after CampOps hard gates. It ranks candidates that are allowed or caution-level without replacing the existing camp search flow.

## Output

Each score result includes:

- `scores`: `overall`, `legal`, `access`, `time`, `resources`, `terrain`, `weather`, `groupFit`, `trailerFit`, `lateArrival`, `privacy`, and `dataConfidence`
- `rankScore`: the overall ranking score, or `null` for rejected candidates
- `recommendationEligible`: `true` only for allowed or caution candidates
- `operationalRole`: primary, backup, emergency, or another CampOps role
- `hardGateStatus`: the hard-gate status used by scoring
- `explanation`: positive factors, negative factors, assumptions, missing data, and a confidence note

Rejected candidates do not receive a normal recommendation score. Their `overall` and `rankScore` remain `null`.

## Scoring Inputs

The scorer consumes:

- `CampSearchContext`
- `CampCandidate`
- `CampCandidateEnrichment`
- hard-gate evaluation or gate results
- scoring config overrides
- optional operational role

AI is not used for scoring.

## Behavior

- Legal status and legal confidence are heavily weighted.
- Unknown data lowers `dataConfidence`.
- Caution and unknown gates reduce relevant category scores.
- Field mode increases the weight of time and late-arrival risk.
- Trailer fit gets much heavier when the vehicle or convoy has a trailer.
- Trailer scoring considers `trailerSuitability`, `turnaroundSuitability`, `trailerTurnaroundConfidence`, `deadEndRisk`, `backingRequired`, and `roadWidthConfidence` when those fields are available.
- Unknown trailer turnaround is not treated as good. It lowers trailer fit and appears as an assumption.
- Group fit gets heavier when group or convoy size is known.
- Group scoring considers `groupCapacityEstimate` and `groupCapacityConfidence`. Low or unknown capacity confidence reduces group fit.
- If convoy `vehicleCount` is available, capacity is evaluated against vehicles; otherwise CampOps falls back to people count.
- Fuel and water debt lower the resource score before they become hard rejections.
- Fire restriction signals lower the weather/fire portion of suitability without automatically rejecting a camp.
- Campfire prohibition, stove restrictions, high red-flag risk, and high smoke/AQI risk appear as negative explanation factors.
- Fire or emergency area closures are handled by hard gates first; rejected camps do not receive normal recommendation scores.
- Emergency-role scoring reduces comfort emphasis and increases legality, known access, resource, time, and data-confidence emphasis so a less comfortable camp can still rank as an emergency endpoint.

## Trailer And Group Confidence

CampOps uses confidence language rather than certainty:

- `trailerTurnaroundConfidence: high` supports trailer handling, but does not guarantee the turn.
- `turnaroundSuitability: not_fit` can block trailer-required candidates through hard gates.
- `deadEndRisk: high` and `backingRequired: true` create caution or lower trailer scoring.
- `roadWidthConfidence: low` or `unknown` is surfaced as uncertainty, not invented road-width knowledge.
- `groupCapacityEstimate` should be interpreted with `groupCapacityConfidence`.
- Unknown group capacity should not be treated as enough space for large groups.

## Fire Restriction Scoring

CampOps separates campsite suitability from open-flame rules:

- `campfireAllowed: no` means campfires are prohibited by the provided source. It should be shown clearly and scored down, but it does not reject camping by itself.
- `stoveAllowed: no` or `restricted` reduces weather/fire suitability and produces caution language.
- `redFlagRisk: high` or `smokeOrAirQualityRisk: high` materially reduces weather suitability and appears in warnings.
- `fireRestrictionStatus: fire_ban` or `restricted` reduces the weather score and can create caution gates.
- `areaClosedDueToFire` is normalized through closure status and can reject the candidate before scoring.
- Unknown or stale fire data lowers confidence; it must not be treated as permission to have a campfire or use open flame.

## Configuration

Weights and thresholds live in `lib/campops/campOpsScoringConfig.ts`:

- category weights
- field-mode late-arrival multiplier
- trailer-present multiplier
- group-known multiplier
- emergency-role multipliers
- caution/unknown gate penalties
- missing-data penalties
- comfort thresholds for fuel and water margin

The rollout flag is disabled by default:

`DEFAULT_CAMP_OPS_SCORING_ROLLOUT_CONFIG.campOpsSuitabilityScoringEnabled = false`

This keeps current camp search behavior unchanged until a future PR intentionally wires CampOps scoring into production search behind the flag.
