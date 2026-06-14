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

CampOps endpoint recommendations are filtered in `lib/campops/campOpsMapPins.ts`.
The adapter reads an already-generated `CampRecommendationSet`, but it only emits map-pin payloads for user-confirmed or imported route-context camp sources such as manual, private, group, GPX, user-saved, or canonical camp-site records.

ECS-inferred route candidates, route-endpoint candidates, draw-area candidates, offline-only candidates, community suggestions, and unknown-source candidates are research-only. They may inform CampOps reasoning, readiness context, and comparison cards, but they must not become tappable campsite pins or navigable map endpoints.

The adapter does not change CampOps hard gates, scoring, source adapters, AI decisions, rollout flags, telemetry, or community publishing.

## Role Mapping

Actionable CampOps pins use the same base Camp Scout pin style with compact numeric labels.
Inferred recommendation roles are not rendered as map pins. This avoids presenting ECS suitability coordinates as confirmed overnight locations.

Confidence grades are derived from existing CampOps recommendation scores and source confidence. Source classes reuse the Camp Scout source style buckets:

- `community` -> `community_suggested` (research-only in CampOps pin rendering)
- `private`, `group`, `gpx`, `manual`, `user_saved` -> `imported_route_context`
- `route_candidate`, `draw_area_candidate`, `inferred`, `offline_dataset` -> `ecs_inferred`
- unknown sources -> `unknown`

## Feature Flag Behavior

CampOps endpoint pins render only when the campsite candidate result already includes `result.campOps.enabled === true`, a recommendation set, and at least one actionable user-confirmed/imported camp source.
The CampOps recommendation rollout flags remain default-off, so the Navigate map keeps legacy behavior unless the internal CampOps recommendation payload is explicitly produced.

When CampOps is off, or when CampOps only has inferred/research candidates, no CampOps endpoint pins are added to the shared Camp Scout marker layer.

Community publishing and telemetry remain off.

## Interaction

Actionable CampOps endpoint pins travel through the existing Camp Scout marker tap channel. The payload is tagged with `pinFamily: 'campops'`, preserving the shared visual renderer while allowing Navigate to select the CampOps endpoint and open the existing camp detail path when a matching camp-intel site exists.

Stale, missing, unknown, legality, and source-confidence warnings remain in CampOps cards and callouts. Inferred candidates are research-only and do not get a compact map affordance.

## Known Limitations

- The current web Mapbox renderer uses DOM markers for Camp Scout pins, so there is no shared Mapbox image id to reuse.
- Official mapped source styling is available in the shared renderer, but current CampOps source enums do not expose a dedicated official/provider source.
- If a CampOps recommendation only contains ECS-inferred candidates, the recommendation remains available for research/readiness context but no marker is rendered.

## Manual QA Notes

1. With CampOps flags off, open Navigate Mapbox and verify existing campsite/search markers are unchanged.
2. With a test CampOps recommendation payload that only contains ECS-inferred route candidates, verify no CampOps pins appear.
3. With a user-saved/manual camp in the recommendation payload, verify the actionable endpoint appears as a Camp Scout-style pin.
4. Tap the actionable endpoint pin and verify the selected state uses the existing Camp Scout selected style.
5. Confirm route guidance, temporary notifications, compass/recenter controls, tools menu, and existing established campsite pins are not obscured.
6. Confirm stale or unknown source warnings appear in cards/callouts, not hidden in the pin UI.
7. Verify cached/offline-only recommendation data remains research-only unless it references a user-confirmed/imported camp source.
