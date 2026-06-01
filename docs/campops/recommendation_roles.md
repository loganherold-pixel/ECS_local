# CampOps Recommendation Roles

`lib/campops/campOpsRecommendations.ts` turns deterministic hard-gate and suitability outputs into a serializable `CampRecommendationSet`. It does not replace the current camp search flow.

## Required Inputs

- `CampSearchContext`
- camp candidates
- enrichments by candidate id
- hard-gate evaluations by candidate id
- suitability score results by candidate id
- optional recommendation config overrides

The generator does not use AI. AI may summarize the resulting roles, scores, warnings, assumptions, and tradeoffs.

## Roles

- `recommendedCamp`
  - Best overall balance of safety, legality, access, resources, time, and group fit.
  - If a planned camp is within the configured score delta of the top candidate, CampOps keeps the planned camp as primary.
- `backupCamp`
  - Next viable alternative.
  - Prefers a meaningfully different location/source/access profile when one exists.
- `emergencyCamp`
  - Prioritizes legality, access certainty, resource margin, time, weather, and data confidence.
  - Can be less comfortable or private if it has stronger known access, resource, and timing margin than continuing.
- `weatherFallbackCamp`
  - Best viable weather score when weather data exists.
  - Prefers candidates with lower wind exposure, storm risk, heat/cold risk, precipitation risk, smoke/AQI risk, and fresher weather source confidence.
  - Stale or missing weather does not create a confident fallback; it lowers confidence and should be surfaced as a warning.
- `resupplyCamp`
  - Best viable resource margin, useful for next-day fuel/water/service risk.
- `trailerSafeCamp`
  - Only assigned when a trailer is present or required.
  - Prefers known trailer fit, known turnaround, lower dead-end risk, lower backing burden, stronger road-width confidence, and easier access.

## Trailer And Group Role Behavior

CampOps should not promote unknown trailer or group data into certainty:

- Known no-turnaround camps are rejected when a trailer is present or required.
- Unknown turnaround becomes an unknown/caution condition and lowers trailer fit.
- Dead-end risk and backing-required signals reduce trailer suitability unless the user explicitly accepts that tradeoff elsewhere.
- Large groups use `vehicleCount` when available, then people count as fallback.
- One-vehicle or low-confidence capacity camps are downgraded or rejected for larger convoy groups.
- Emergency fallback prioritizes known access and hard-gate clearance over comfort/privacy.

## Explanations

The output includes `explanations` with:

- why the primary camp was recommended
- why backup/emergency/weather/resupply/trailer roles were assigned
- why the planned camp was downgraded, when applicable
- key tradeoffs

Warnings and assumptions are carried separately so UI and AI assist can display confidence and data limits without inventing facts.

Weather-specific explanations should stay bounded to provided source signals. Use wording like "stronger weather margin," "high wind exposure," "storm risk in the forecast window," or "weather exposure unknown." Do not describe a camp as guaranteed calm, open, legal, or safe.

## Configuration

`lib/campops/campOpsRecommendationConfig.ts` contains:

- minimum primary score
- minimum emergency safety score
- planned-camp retention score delta
- backup distance difference threshold
- weather/trailer/resupply role thresholds
- low-score warning threshold

The rollout flag is disabled by default:

`DEFAULT_CAMP_OPS_RECOMMENDATION_ROLLOUT_CONFIG.campOpsRecommendationSetEnabled = false`

Existing camp search behavior remains unchanged until a future PR wires this generator into production search behind the flag.
