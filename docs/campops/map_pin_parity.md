# CampOps Map Pin Parity

## Shared Pin Style

The shared remote camp pin style lives in `components/navigate/MapRenderer.tsx`.
It is the existing Camp Scout DOM marker renderer, not a Mapbox image registration:

- `CampScoutMapMarkerPayload`
- `normalizeRenderedCampScoutMarkers`
- `.camp-scout-marker`
- `.camp-scout-core`
- `.camp-scout-selected`
- `createCampScoutMarkerElement`
- `replaceCampScoutMarkers`

CampOps does not register a separate Mapbox image id, symbol layer, or CSS marker family.

## CampOps Adapter

CampOps endpoint recommendations are converted in `lib/campops/campOpsMapPins.ts`.
The adapter reads an already-generated `CampRecommendationSet` and emits the same payload shape consumed by the Camp Scout marker renderer.

The adapter does not change CampOps hard gates, scoring, source adapters, AI decisions, rollout flags, telemetry, or community publishing.

## Role Mapping

CampOps roles use the same base Camp Scout pin style with short role labels:

- Recommended endpoint: shared Camp Scout pin, `REC`, selected state when tapped.
- Backup endpoint: shared Camp Scout pin, `BKP`, normal/secondary endpoint role.
- Emergency fallback: shared Camp Scout pin, `EMG`, fallback role without implying the camp is guaranteed open, legal, or confirmed.

Confidence grades are derived from existing CampOps recommendation scores and source confidence. Source classes reuse the Camp Scout source style buckets:

- `community` -> `community_suggested`
- `private`, `group`, `gpx`, `manual`, `user_saved` -> `imported_route_context`
- `route_candidate`, `draw_area_candidate`, `inferred`, `offline_dataset` -> `ecs_inferred`
- unknown sources -> `unknown`

## Feature Flag Behavior

CampOps endpoint pins render only when the campsite candidate result already includes `result.campOps.enabled === true` and a recommendation set.
The CampOps recommendation rollout flags remain default-off, so the Navigate map keeps legacy behavior unless the internal CampOps recommendation payload is explicitly produced.

When CampOps is off, no CampOps endpoint pins are added to the shared Camp Scout marker layer.

Community publishing and telemetry remain off.

## Interaction

CampOps endpoint pins travel through the existing Camp Scout marker tap channel. The payload is tagged with `pinFamily: 'campops'`, preserving the shared visual renderer while allowing Navigate to select the CampOps endpoint and open the existing camp detail path when a matching camp-intel site exists.

Stale, missing, unknown, legality, and source-confidence warnings remain in CampOps cards and callouts. The pin is only a compact map affordance.

## Known Limitations

- The current web Mapbox renderer uses DOM markers for Camp Scout pins, so there is no shared Mapbox image id to reuse.
- Official mapped source styling is available in the shared renderer, but current CampOps source enums do not expose a dedicated official/provider source.
- If a CampOps endpoint does not map to an existing camp-intel site id, the marker still selects visually and shows the operational endpoint toast; detailed warnings remain available wherever the CampOps recommendation cards are rendered.

## Manual QA Notes

1. With CampOps flags off, open Navigate Mapbox and verify existing campsite/search markers are unchanged.
2. With a test CampOps recommendation payload enabled, verify recommended, backup, and emergency endpoints appear as Camp Scout-style pins.
3. Tap each endpoint pin and verify the selected state uses the existing Camp Scout selected style.
4. Confirm the pin labels are compact: `REC`, `BKP`, `EMG`.
5. Confirm route guidance, temporary notifications, compass/recenter controls, tools menu, and existing route campsite pins are not obscured.
6. Confirm stale or unknown source warnings appear in cards/callouts, not hidden in the pin UI.
7. Verify cached/offline recommendation data still renders pins when the recommendation payload is present.
