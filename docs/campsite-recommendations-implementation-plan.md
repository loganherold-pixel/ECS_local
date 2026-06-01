# Campsite Recommendations Implementation Plan

## Repository Map

- Frontend: Expo Router React Native app with routes under `app/`, shared UI under `components/`, app/domain services under `lib/`, and some newer domain modules under `src/lib/`.
- Navigation map: `app/(tabs)/navigate.tsx` owns the Navigate screen state, Map Tools popups, and map interaction modes. `components/navigate/MapRenderer.tsx` renders the Mapbox WebView and receives overlay, pin, route, and interaction props from Navigate.
- Map Tools: the Tools popup is currently inline in `app/(tabs)/navigate.tsx`. It already exposes utilities such as Offline Cache, Intel, Trail, Drop Pin, and Pins.
- Pin/drop-marker flow: `handleDropPinHere`, `handleLongPress`, `handlePinSave`, `components/navigate/PinDetailsModal.tsx`, `components/navigate/PinDrawer.tsx`, `components/navigate/PinTypes.ts`, and `lib/pinStore.ts`.
- Campsite systems already present: `components/navigate/CampsiteCandidatePanel.tsx`, `components/navigate/CampIntelDetailCard.tsx`, `components/navigate/CampIntelMarkerLayer.tsx`, `lib/campsites/campsiteLocatorService.ts`, `lib/campsites/routeCampsiteLocatorAdapter.ts`, `lib/campsiteCandidateEngine.ts`, and `lib/campIntel/*`.
- Auth/user model: `context/AppContext.tsx` exposes the active user/session state used by screens. `lib/auth.ts`, `lib/sessionStore.ts`, and `lib/supabase.ts` handle Supabase auth, entitlement/access metadata, offline session validity, and edge function availability.
- Backend/API: Supabase is the backend. Edge functions live in `supabase/functions/` and migrations live in `supabase/migrations/`. Current deployed functions include auth, weather, map token, route suggestions, issue intelligence, and EcoFlow integration.
- Persistence: local data uses a mix of Dexie/local storage patterns in `lib/db.ts`, `lib/storage.ts`, `lib/keyValuePersistence.ts`, and feature stores. `lib/pinStore.ts` is a local-first store for Navigate pins. Cloud persistence uses numbered Supabase migrations with RLS policies.
- Upload/media: `components/detail/AttachmentsTab.tsx` uploads files to the Supabase `ecs` storage bucket and records metadata in an `attachments` table. Pin data has a `photo_url` field, but the current pin editor does not expose upload.
- Admin/moderation: existing admin/intelligence surfaces include `components/admin/EcsIssueIntelligencePanel.tsx`, `lib/admin/*`, `supabase/functions/issue-intelligence`, and `supabase/migrations/003_ecs_issue_intelligence.sql`. No dedicated campsite moderation screen was found.
- Feature/config pattern: rollout config modules exist, such as `lib/dispatchRolloutConfig.ts` and `lib/fleet/fleetPremiumReleaseConfig.ts`. Supabase edge function availability is also guarded in `lib/supabase.ts`.
- Tests: the repo uses Node-based script tests exposed through `package.json`, plus Expo lint and TypeScript checks. Relevant campsite scripts include `test:campsite-locator`, `test:campsite-viability`, `test:campsite-renderer`, `test:campsite-navigation`, `test:campsite-ui-polish`, and `test:camp-intel-evidence`.

## Files Likely To Change

- `app/(tabs)/navigate.tsx`: add a Map Tools action for Recommend Campsite and route it to a focused popup/sheet state without changing the map shell.
- `components/navigate/RecommendCampsitePanel.tsx`: likely new form/panel for the recommendation flow, following existing Navigate popup styling.
- `components/navigate/CampIntelMarkerLayer.tsx` and `components/navigate/CampIntelDetailCard.tsx`: possible display/edit surfaces for saved recommendations.
- `components/navigate/PinDetailsModal.tsx`, `components/navigate/PinDrawer.tsx`, `components/navigate/PinTypes.ts`, and `lib/pinStore.ts`: only if accepted campsite recommendations should also create or appear as pins.
- `lib/campsites/campsiteRecommendationTypes.ts`: likely new typed model.
- `lib/campsites/campsiteRecommendationStore.ts`: likely new local-first store, or an adapter around `pinStore` if the first release treats recommendations as a special pin category.
- `lib/campsites/campsiteRecommendationService.ts`: optional service wrapper for create/list/update/delete and later sync.
- `supabase/migrations/006_campsite_recommendations.sql`: only when shared/public campsite recommendations are introduced.
- `lib/syncActionQueue.ts` and `lib/syncProcessors.ts`: only if offline cloud sync is required for recommendations.
- `scripts/test-campsite-recommendations*.js`: source-level tests for store, validation, UI wiring, and migration contract.

## Proposed Data Model

Use a local-first model that can later map cleanly to Supabase:

```ts
type CampsiteRecommendationStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'archived';
type CampsiteRecommendationVisibility = 'private' | 'team' | 'public_candidate';
type CampsiteRecommendationSource = 'user_recommended' | 'ecs_candidate' | 'imported';

type CampsiteRecommendation = {
  id: string;
  creatorUserId?: string;
  createdBy?: string;
  expeditionId?: string;
  routeId?: string;
  lat: number;
  lng: number;
  title: string;
  notes?: string;
  accessNotes?: string;
  suitabilityTags?: string[];
  vehicleFit?: 'unknown' | 'passenger' | 'awd' | 'high_clearance' | 'four_wheel_drive';
  capacityEstimate?: number;
  confidenceScore?: number;
  source: CampsiteRecommendationSource;
  visibility: CampsiteRecommendationVisibility;
  status: CampsiteRecommendationStatus;
  moderationNotes?: string;
  attachmentIds?: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  dirty?: 0 | 1;
};
```

For a cloud-backed release, add a Supabase table shaped like `campsite_recommendations` with `creator_user_id`, optional `authorized_user_ids`, `location` or `lat`/`lng`, `payload jsonb`, `visibility`, `status`, moderation fields, and timestamps. Follow the existing migration pattern with indexes, RLS, creator-owned writes, team visibility if available, and approved public reads only if public campsite discovery is in scope.

Avoid adding media in the first pass unless required. If media becomes required, reuse the existing `attachments`/storage pattern rather than embedding image URLs directly in the recommendation payload.

## Proposed API Or Service Methods

Start with local service methods so the Map Tools feature works offline:

- `listCampsiteRecommendations(options)`
- `getCampsiteRecommendation(id)`
- `createCampsiteRecommendation(input)`
- `updateCampsiteRecommendation(id, changes)`
- `softDeleteCampsiteRecommendation(id)`
- `promoteCampsiteRecommendationToPin(id)` if the recommendation should appear in the existing pin drawer.

For cloud sharing, prefer direct Supabase table operations through a small service adapter. Add an edge function only if recommendation submission needs server-side validation, public moderation, community QA, or anti-abuse logic.

## Proposed UI Flow

1. User opens Navigate, then Map Tools.
2. User taps Recommend Campsite.
3. ECS asks for location using existing map behavior: current GPS, current map center, or tap map. This should reuse the existing drop-pin interaction style where practical.
4. A compact Navigate popup/sheet opens with campsite fields: title, notes, access notes, suitability tags, vehicle fit, optional capacity estimate, and visibility if sharing is enabled.
5. Saving creates a local campsite recommendation immediately and shows a marker or list item using existing campsite/pin presentation patterns.
6. If signed in and cloud sharing is enabled, the recommendation can be queued or submitted for moderation without blocking the local save.

## Unknowns And Assumptions

- Product scope is not yet clear on whether recommendations are private, team-shared, or public/community-submitted.
- No dedicated campsite moderation screen was found, so public recommendations should either remain behind a moderation backlog or reuse the existing issue intelligence/admin pattern.
- Native media upload for campsite recommendations is not established. Existing attachment upload is web-oriented and expedition-detail oriented.
- Geospatial database support was not confirmed. A first cloud schema can use numeric `lat`/`lng` and bounding-box queries, with PostGIS left as a later enhancement if available.
- The first implementation should not add a new map renderer path; it should reuse the current MapRenderer, pin, and camp intel patterns.

## Recommended Implementation Sequence

1. Confirm visibility and moderation scope: private-only, team-shared, or public candidate.
2. Add campsite recommendation types plus pure validation helpers under `lib/campsites`.
3. Add a local-first store/service that mirrors existing ECS persistence conventions and works fully offline.
4. Add the Map Tools entry and a compact recommendation panel without changing the map layout.
5. Render saved recommendations through the existing camp intel or pin marker/list patterns.
6. Add source-level tests for validation, store behavior, and Navigate wiring.
7. Add Supabase migration, RLS, and sync/outbox integration only when shared/public persistence is required.
8. Add moderation/admin workflow only if public recommendations become visible to other users.
