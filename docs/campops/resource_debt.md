# CampOps Resource Debt

Resource Debt answers the second question after reachability: "What does choosing this camp cost us tomorrow?"

`lib/campops/campOpsResourceDebt.ts` calculates deterministic debt snapshots and can attach them to `CampCandidateEnrichment.resourceDebt`. Scoring explanations then carry the same snapshot for UI and AI assist.

## Implemented Debts

- `fuel`
  - Uses route-aware distance to camp and route-aware distance to the next known fuel or exit when available.
  - Falls back to straight-line camp distance or provided CampOps margin data when route-aware distance is unavailable.
  - Can use nearest fuel or town/exit service signals to estimate next-fuel/exit margin when candidate-specific fuel impact is missing.
  - Route-aware service distance is preferred when available.
  - Falls back to known fuel reserve if no camp-specific margin exists.
  - Status: `safe`, `tight`, `critical`, or `unknown`.
- `water`
  - Uses projected gallons remaining and the convoy limiting water reserve when available.
  - Accounts for people and pets when convoy data exists.
  - Applies documented conservative travel-day and next-day defaults when group size exists.
  - Increases concern when heat risk is medium or high.
  - Includes a next-day safety buffer.
  - Nearby confirmed potable water can reduce critical water debt to a tighter but more recoverable state.
  - Nearby water with unknown status stays uncertain and must be shown as unknown, not reliable.
  - Status: `safe`, `tight`, `critical`, or `unknown`.
- `daylight`
  - Uses sunset margin when available.
  - Falls back to ETA versus safe-arrival window.
  - Status: `safe`, `tight`, `after_dark`, or `unknown`.
- `campUncertainty`
  - Combines source confidence, enrichment data confidence, legal confidence, source freshness, and occupancy likelihood.
  - Status: `safe`, `tight`, `critical`, or `unknown`.

Future categories are modeled but not fully calculated yet: trail difficulty, recovery, weather exposure, and convoy fatigue.

## Margin Outputs

`CampResourceDebt.margins` carries the operational breakdown used by UI and AI assist:

- `fuelToCamp`
- `fuelAfterCamp`
- `fuelToNextKnownFuel`
- `fuelExitMargin`
- `waterToCamp`
- `waterAfterCamp`
- `waterNextDayMargin`
- `serviceConfidence`
- `assumptions`

Margin labels use conservative user-facing language: `comfortable`, `tight`, `critical`, or `unknown`. Internal debt statuses may still use the existing `safe` enum for backward compatibility, but UI and AI should prefer `comfortable` instead of `safe_margin` or unqualified safe language.

Each margin includes a `basis`:

- `route_aware`
- `straight_line`
- `provided_margin`
- `configured_default`
- `unknown`

Route-aware values should be preferred whenever existing route geometry, candidate route distance, or route-aware service distance exists. Straight-line fallback is allowed only when route-aware distance is unavailable and must remain visible through assumptions or missing-data notes.

## Service Inputs

Service and resupply adapters can attach nearest-service summaries to enrichment:

- `nearestFuel`
- `nearestWater`
- `nearestPropane`
- `nearestDump`
- `nearestRepair`
- `nearestTownOrExit`

Resource Debt treats these as logistics evidence, not guarantees. Closed services do not improve margins. Unknown service status or unknown hours lower confidence and appear in warnings/assumptions. Stale service data is retained as uncertainty, not as current availability.

## Configured Defaults

CampOps does not infer vehicle fuel burn rates without profile data. Fuel calculations operate on available range/miles-reserve values and route/service distances.

Water calculations use documented conservative defaults when group size exists:

- `gallonsPerPersonNextDay`
- `gallonsPerPetNextDay`
- `gallonsPerPersonTravelDay`
- `gallonsPerPetTravelDay`
- `waterSafetyBufferGallons`
- `mediumHeatWaterMultiplier`
- `highHeatWaterMultiplier`

These defaults are deterministic configuration, not AI estimates. When group size or camp distance is unavailable, CampOps returns unknown/fallback margins and records assumptions.

## Missing Data

Missing data does not automatically reject a camp. It produces an `unknown` debt item with `missingDataFields`, lowers confidence, and appears in score explanations.

## AI Boundary

AI may explain Resource Debt outputs, but it must not invent fuel range, water margin, daylight margin, legal confidence, occupancy, or freshness. Those values must come from deterministic CampOps inputs.

## Rollout

The rollout flag is disabled by default:

`DEFAULT_CAMP_OPS_RESOURCE_DEBT_ROLLOUT_CONFIG.campOpsResourceDebtEnabled = false`

Existing camp search behavior remains unchanged until a future PR wires Resource Debt into production CampOps flows behind the flag.
