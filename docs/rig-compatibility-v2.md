# Rig Compatibility V2

## Audit Result

The production `rigCompatibilityEngine` is a five-factor V1 model. Earlier comments called it a six-factor model, but its type, weights, result, and consumers all define five factors. V1 also treats GVWR and payload capacity as a broad `vehicleCapability` proxy, so a heavier vehicle can receive a higher trail-capability score without drivetrain, tire, geometry, or recovery evidence.

V1 remains unchanged apart from correcting the factor-count comments. Existing Explore, Navigate, Fleet, ranking, and AI consumers continue to use V1.

## V2 Contract

`calculateRigCompatibilityV2` is a pure deterministic function. It evaluates nine separate factors:

1. Payload / operating-weight readiness.
2. Drivetrain / traction fit.
3. Tire suitability.
4. Suspension / lift fit.
5. Vehicle dimensions / geometry.
6. Trailer constraints.
7. Fuel / water / power range.
8. Recovery readiness.
9. Route terrain / grade exposure.

GVWR is used only to compute operating-weight utilization. It does not increase drivetrain, tire, geometry, terrain, or recovery scores. Unknown tires are not replaced with stock estimates, unknown suspension is not treated as stock, and missing MPG is not replaced with 15 MPG.

Each factor returns a score or explicit unknown state, evidence, missing inputs, source truth, warnings, and verification targets. Unknown factors are excluded from the numeric compatibility average and remain visible through weighted factor coverage. A known incompatible factor forces the overall posture to `incompatible` even when other factors score well.

Compatibility and confidence are separate. Confidence combines weighted factor coverage with canonical `SourceTruthRef` quality. Manual, cached, estimated, inferred, simulated, unavailable, stale, and conflicting sources retain their original meaning. Source conflicts cap confidence; they do not silently rewrite compatibility evidence.

## Deterministic Policies

- Payload watch starts at 90% GVWR usage, limited margin at 95%, and critical at 100%.
- Fuel comparisons reserve 20% by default unless a normalized route input supplies an explicit reserve ratio.
- Recovery policy derives `basic` at remoteness 4 and `remote` at remoteness 8 when no explicit route requirement exists.
- Geometry is scored only when the route supplies explicit constraints and the vehicle supplies corresponding verified dimensions.
- Four-wheel drive does not imply low range or lockers. Those remain verification targets when relevant.
- Trailer state and route trailer access must be explicit. No trailer coordinate, dimension, or access fact is inferred.

## Rollout And Migration

`isRigCompatibilityV2Enabled` reads an explicit override or `EXPO_PUBLIC_ECS_RIG_COMPATIBILITY_V2`; its default is `false`. `resolveVersionedRigCompatibility` returns the original V1 object unchanged while disabled. When explicitly enabled, the adapter can map V2 into the existing card contract for incremental review.

`compareRigCompatibilityVersions` exposes V1/V2 score and factor-count diagnostics without logging or mutating state. Production UI wiring is intentionally deferred until V2 fixtures and field evidence are approved.

## Data And Privacy

The active-vehicle adapter reads normalized local Fleet state, saved specs, route analysis, consumables, and packed loadout labels. It does not call providers and does not add schema or native dependencies. Only canonical `SourceTruthRef` metadata enters results. API keys, auth data, raw provider payloads, precise location traces, and service-role material are not accepted by the V2 contracts.
