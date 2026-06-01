# CampOps Hard Gates

`lib/campops/campOpsHardGates.ts` is the first deterministic CampOps filtering layer. It is reusable domain code and is not wired into the existing campsite search flow yet.

## Output

Each candidate evaluation returns:

- `status`: `allowed`, `caution`, `rejected`, or `unknown`
- `failedGates`: rejected gates
- `cautionGates`: non-blocking gates that should be visible to the user
- `unknownGates`: gates that cannot be cleared because data is missing or confidence is too low
- `missingData`: unique missing field names
- `reasons`: human-readable deterministic explanations
- `severity`: highest gate severity
- `allGates`: every non-allowed gate result

## Supported Gates

- Known prohibited camping rejects the candidate.
- Known closure or access restriction rejects the candidate.
- Active seasonal closure or time-windowed restriction rejects when it applies to camping or vehicle access.
- Private land rejects the candidate.
- Unknown public access with legal confidence below the configured threshold marks the candidate unknown.
- Permit-required access produces caution.
- Fixture-backed legal/access source records normalize public/private/mixed/unknown land and baseline open/restricted/closed access before gates run.
- Fixture-backed closure source records normalize current open/closed/seasonal/restricted/unknown closure status before gates run.
- Vehicle `not_fit` rejects; `limited` cautions.
- Trailer-required groups reject known trailer-incompatible camps.
- Group size over known capacity cautions for small excess and rejects when excess meets the configured threshold.
- ETA after the safe-arrival window rejects when late-arrival risk is configured as reject-level.
- Fuel exit margin below the configured minimum rejects.
- Water margin below the configured minimum rejects when no reliable refill is known.
- Fire or emergency restriction conflicts reject when the conflict is explicit.
- Campfire prohibitions and stove restrictions warn/caution; they do not reject camping unless a fire/emergency closure also affects camping or access.
- Missing high-risk data rejects only when the context is high risk and required fields are absent.

## Configuration

Thresholds live in `lib/campops/campOpsHardGateConfig.ts`:

- minimum public-access confidence
- minimum fuel exit margin
- minimum water margin
- group capacity rejection excess
- high-risk delay threshold
- high-risk offline modes
- late-arrival caution/reject levels
- required data fields for high-risk recommendations

The rollout flag is disabled by default:

`DEFAULT_CAMP_OPS_HARD_GATE_ROLLOUT_CONFIG.campOpsHardGateFilteringEnabled = false`

This keeps existing camp search behavior unchanged until a future PR intentionally wires CampOps into production search behind the flag.

## AI Boundary

AI must not decide these gates. AI may summarize the resulting status, failed gates, cautions, missing data, and assumptions, but legal/access/resource/safety outcomes come from this deterministic layer.

## Legal/Access Source Behavior

`CampOpsLegalAccessSourceProvider` currently provides the first legal/access adapter path. It is fixture-backed until real parcel, MVUM, public-land, or agency geometry sources are wired.

Gate mapping remains conservative:

- camping not allowed -> rejected through `campops.legal.prohibited`
- private land -> rejected through `campops.access.private_land`
- closed access -> rejected through `campops.access.closed`
- restricted access -> rejected through `campops.access.restricted`
- permit-required access -> caution through `campops.access.permit_required`
- unknown public access with low/unknown legal confidence -> unknown/caution

When sources conflict, restrictive fresh or authoritative records are preserved for gate evaluation. Stale positive legal/access records do not upgrade a camp.

## Closure/Seasonal Source Behavior

`CampOpsClosureSourceProvider` provides the first closure and seasonal restriction adapter path. It is fixture/pre-resolved until ECS5 agency ingestion, MVUM, route intelligence, or closure geometry sources are wired to individual camp candidates.

Gate mapping is separate from land legality:

- confirmed closed -> rejected through `campops.access.closed`
- confirmed restricted vehicle/access closure -> rejected through `campops.access.restricted`
- active seasonal closure applying to camping or vehicle access -> rejected through `campops.access.seasonal_closure`
- seasonal restriction with missing or inactive window details -> caution/unknown through `campops.access.seasonal_restriction`
- fire-related closure source -> caution through `campops.restrictions.fire_related_closure` unless a separate explicit fire/emergency conflict rejects
- unknown closure status -> missing hard-gate data and reduced confidence

Stale closure records do not confirm a camp as open or closed. They are retained as source limitations and warnings so UI and AI can say closure status is stale or unknown.

## Fire Restriction Source Behavior

`CampOpsFireRestrictionSourceProvider` provides the first campfire/stove/red-flag/smoke adapter path.

Gate mapping is intentionally narrow:

- campfire prohibited -> caution through `campops.restrictions.fire_ban`
- stove restricted or prohibited -> caution through `campops.restrictions.stove_restricted`
- red-flag or smoke/AQI risk -> suitability and recommendation warning, not a hard rejection by itself
- fire/emergency area closure -> rejected through closure/emergency gates
- unknown or stale fire status -> confidence reduction and explicit unknown/stale language
