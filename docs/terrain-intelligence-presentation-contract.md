# Terrain Intelligence Presentation Contract

`buildTerrainIntelligenceSnapshot` is the pure, canonical presentation selector
for compact and expanded Dashboard Terrain Intelligence. The mounted runtime
continues to expose `TerrainRiskDashboardPresentation` as a compatibility
adapter, but both visual densities consume profiles from the same normalized
snapshot.

## Authoritative inputs

- Active route and guidance-session identity from `activeRouteProgress`.
- Canonical route geometry fingerprint from the terrain elevation runtime.
- Imported, cached, manual, canonical-guidance, or provider-estimated elevation
  samples accepted by `terrainElevationRouteEngine`.
- Cumulative route mileage, grade percent, and deterministic elevation-risk
  segments from `terrainRiskCommandProfile`.
- Current completed distance from the active guidance progress contract.
- Active vehicle, loadout, weight, clearance, tire, lift, source, and confidence
  fields from `ActiveVehicleContext`.
- Source origin, freshness, coverage, observation time, provider, and confidence
  from the ECS source-truth domain.

Grade percent is the canonical predictive route-grade unit. Conversion to
degrees is presentation-only through the tested `gradePercentToDegrees`
utility. Device pitch and roll are current attitude telemetry and never become
predictive route grade or side slope.

## Unsupported inferred values

Elevation and grade do not establish technical trail difficulty. Predictive
side slope, segment surface, roughness, water-crossing state or depth, and
terrain-obstacle clearance remain explicitly unavailable until a verified
source supplies those fields. Vehicle data may describe readiness, load, and
configuration, but route fit remains undetermined without corresponding route
requirements.

The selector keeps access, current-condition, weather, terrain, and vehicle-fit
availability separate. Missing inputs produce typed missing-data reasons rather
than safe defaults or fabricated profile points.

## Performance boundary

Route analysis is memoized by stable route analysis identity. Compact and
expanded profiles preserve extrema and material risk points with respective
budgets of 42 and 160 samples. Progress-only updates reuse the processed route
profiles. Vehicle-fit derivation is keyed by the active vehicle profile
signature. Provider calls remain in the runtime effect and never occur in the
selector or during render.

## Quick Terrain Dashboard boundary

- The canonical widget ID is `terrain-risk`; legacy `quick-terrain`,
  `terrain-risk-widget`, and `terrain-intelligence` IDs normalize to it.
- New and explicitly restored Expedition profiles place the 1x1 widget in slot
  2, the lower-left cell beneath the full-width Attitude Monitor. Persisted
  valid layouts are normalized in place and are never reset to new defaults.
- The compact runtime requests `profileDensity: compact`, exposes only the
  42-point extrema-preserving profile, and leaves full and expanded profile
  arrays empty. Opening the existing widget detail modal mounts the expanded
  runtime request.
- Progress is presentation state. A progress-only update moves the chart cursor
  without regenerating the route profile or deterministic risk segments.
- `live` source state requires both live origin and live freshness. Active
  guidance alone never produces a live badge.
- Compact posture and risk colors come from deterministic route analysis. Text
  labels remain visible so risk is never communicated by color alone.

## Terrain Intelligence Command boundary

- The expanded HUD is lazy-mounted inside the existing full-height
  `WidgetDetailModal`; it does not resize or replace Dashboard grid slots.
- Range selection, snapped profile inspection, selected risk reasons, event
  inspection, and recommendation disclosure are presentation-only state. Route,
  guidance, speed, camp, and expedition stores are not mutated.
- Driver-safe restrictions read the existing Appearance driving policy. Driving
  forces Auto Follow, disables precision scrubbing and range controls, reduces
  event emphasis to the next concern, and does not create another motion
  detector.
- `SHOW ON MAP` stages an ECS `terrain_inspection` navigation flow containing
  the selected route identity, fingerprint, distance, segment, projected
  coordinate, and Dashboard return path. Navigate consumes it as a camera-focus
  request only. It does not save a replacement route handoff, create a pin, or
  interrupt active guidance.
- Surface, roughness, water crossing, clearance, and predictive side slope use
  their typed canonical fields. Unsupported values remain `UNKNOWN` with source
  and missing-reason detail.

## Terrain motion and diagnostics

Terrain motion is visual only. `react-native-svg` continues to render the
route-derived profile and deterministic risk data. Reanimated owns reveal,
accepted-progress, crosshair, risk-emphasis, recommendation, range, and
expand/collapse interpolation; gesture-handler owns profile scrubbing. Route
and risk values are not encoded in decorative animation.

Motion is disabled for system reduced motion, the ECS animation preference,
driving mode, an unfocused Dashboard, or a backgrounded app. A profile reveals
at most once for each bounded geometry-fingerprint/range identity. A material
upcoming risk can pulse once only when analysis is ready or partial and is not
stale.

Visual progress accepts at most one sample per 220 ms (about 4.5 Hz). Faster
samples are coalesced; route replacement and unavailable progress apply
immediately. The complete chart series and base paths remain memoized by the
bounded profile, range, distance, and unit.

Development-only counters cover compact and expanded renders, profile
computations, base-path generations, accepted and coalesced progress updates,
expand/collapse counts, expansion commit latency, and scrub callback response.
They contain no coordinates, route names, provider payloads, or user
identifiers.

Repository tests can verify computation identity, bounded caches, transition
policy, listener cleanup, and callback execution. Frame rate, native heap
retention after modal cycles, and touch-to-pixel latency require an instrumented
physical-device session and must not be inferred from Node or web-export
timings.
