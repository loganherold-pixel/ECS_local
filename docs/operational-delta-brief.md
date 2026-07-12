# Operational Delta Brief

## Purpose

Operational Delta answers what materially changed since a saved departure,
last-stop, or last-acknowledgment snapshot. The comparison engine is pure and
deterministic. The existing `departureDeltaBrief` runtime flag remains the UI
rollout control and the legacy `DepartureDeltaPreviousAuditSnapshot` contract is
adapted into the new snapshot model when its route and expedition identity match.

## Contracts

- `OperationalSnapshot` is a timestamped, redacted set of normalized facts.
- `OperationalDelta` is one deterministic source-quality or value transition.
- Freshness, origin, availability, confidence, coverage, and conflict remain
  separate Source Truth dimensions.
- Stable fingerprints exclude capture timestamps. Dismissing a fingerprint only
  suppresses that exact previous/current state.
- Safety-critical and caution deltas use deterministic ECS copy. An AI candidate
  is rejected when it adds, removes, reorders, or rewrites deltas, and is never
  accepted for a critical or caution result.

## Baselines

- `departure` is captured once when readiness enters active-expedition mode and
  the existing rollout flag is enabled. A comparable legacy departure audit may
  seed it when available.
- `last_stop` is an explicit offline-local operator action in the detail sheet.
- `last_acknowledgment` captures the current snapshot when changes are
  acknowledged.
- Route or expedition identity mismatch fails closed and produces no delta claims.

## Noise Thresholds

| Domain fact | Material threshold |
| --- | ---: |
| Readiness score | 5 points |
| Route progress | 2 percentage points |
| Route distance | 1 mile |
| Camp/route ETA | 10 minutes |
| Camp daylight margin | 10 minutes |
| Fuel margin | 5 miles |
| Fuel or power state of charge | 5 percentage points |
| Water | 1 gallon / 4 liters |
| Power runtime | 0.5 hour |
| Vehicle/loadout weight | 25 pounds |
| GVWR usage | 1 percentage point |
| Wind | 5 mph |
| Precipitation chance | 10 percentage points |
| Offline package coverage | 5 percentage points |
| Remoteness score | 10 points |
| Convoy counts | 1 member |
| Loadout readiness | 5 percentage points |

Exact boundaries are material. Smaller numeric movement and timestamp-only
updates are suppressed.

## Persistence And Privacy

The local store uses the existing key-value persistence layer and works offline.
It bounds contexts, facts, and suppression records. Before persistence it removes
coordinate facts, sanitizes source metadata and display text, and omits provider
secrets, auth material, service-role data, raw provider responses, and precise
convoy locations. Operational snapshots are not Dispatch events and are not
published automatically.

## Migration

The old departure-delta domain remains exported for compatibility. New consumers
should build an `OperationalSnapshot`, select a saved baseline, and call
`buildOperationalDeltaResult`. The Command Brief is the first user-facing
consumer; other Dashboard, Navigate, Dispatch, Fleet, and notification surfaces
remain unchanged.
