# Expedition Replay & Debrief Map UI Flow

Last updated: 2026-06-13

Status: Internal beta product and UI flow spec

## Summary

Expedition Replay & Debrief is a responsive, map-led post-trip review experience for ECS internal beta. It opens on a trip-level debrief summary, then lets users replay the expedition as chapters synchronized across route map, event timeline, evidence details, and next-expedition recommendations.

The posture is learning tool first, with operational record rigor underneath. Historical views must show what ECS knew at the time, not later-corrected truth, and every meaningful claim should carry source, time, confidence, and data-state context.

## Product Outcome

Users can understand how an expedition unfolded, where ECS confidence changed, what gaps or incidents mattered, and what to improve before the next trip. They can convert recommendations into prep tasks tied to readiness, fleet, loadout, route planning, or check-in cadence.

## Existing System Fit

This surface complements existing Debrief and AAR flows. It should not replace static AAR reports, PDF export, CampOps private debrief capture, Incident & Recovery handoffs, or route replay primitives already present in ECS.

Likely source systems:

- Trip timeline and trip route replay
- Route progress and route confidence
- CAD events, check-ins, incident records, and recovery actions
- Offline Honesty and stale-data windows
- Weather snapshots and forecast freshness
- CampOps decisions and endpoint confidence
- Readiness deltas and blockers
- Fleet vehicle, payload, loadout, and recovery gear state

## Non-Goals

- Do not modify route selection, safety status, or readiness posture from the replay view.
- Do not present stale/offline periods as confident route knowledge.
- Do not rewrite historical evidence with later-corrected data.
- Do not publish community debriefs or public route intelligence from this flow.
- Do not redesign the active Expedition dashboard layout as part of this feature.

## Feature Posture

Recommended beta flag:

```ts
expeditionReplayDebriefMapEnabled: boolean;
```

Default state:

- Internal beta only.
- Available from completed expedition/debrief entry points.
- Read-only except recommendation-to-prep-task creation and recommendation dismissal/acceptance.

## Key UI Flow

1. Open on trip-level debrief summary.
2. Show completion status, readiness delta, incident count, offline gap count, and top recommendations.
3. Enter the map-led replay workspace.
4. Select or scrub chapters from the timeline.
5. Keep map, timeline, and detail panel synchronized.
6. Expand evidence chips and detail panels to inspect what ECS knew at that time.
7. Convert recommendations into next-expedition prep tasks.

## Primary Workspace

Desktop layout:

- Center: route map.
- Bottom or left: chaptered event timeline.
- Right: selected chapter details, evidence, recovery actions, related ECS systems, and recommendation actions.

Mobile layout:

- Map first.
- Chapter selector below the map.
- Detail and recommendation panels open as drill-down sheets.
- Same chapters, chips, evidence, and task actions as desktop.

The map should show:

- Route trace and replay position.
- Event markers.
- Confidence-colored route segments.
- Stale/offline spans.
- Incident and CAD/check-in moments.
- Camp endpoints and camp decision context.
- Weather/loadout overlays when available.

The timeline should show:

- Chapter title.
- Event time range.
- Primary status/confidence chip.
- Source/data-state chips.
- Selection state synchronized with the map.

The detail panel should show:

- What happened.
- Why it mattered.
- What ECS knew at the time.
- Evidence and source links.
- Recovery actions when applicable.
- Related ECS systems.
- Recommendation/task actions when applicable.

## Chapter Order

Render chapters in this order when data exists. Missing chapters should remain visible as unavailable in summary or detail context when their absence affects interpretation.

1. Departure and readiness baseline
   - Starting readiness posture, blockers, confidence, vehicle/loadout state, offline package state, and route/camp assumptions.

2. Route confidence changes
   - Confidence shifts by route segment, including legal/access, closure/current condition, terrain/weather, bailout density, recovery exposure, and camp-deadline drivers.

3. Offline or stale data gaps
   - Offline coverage gaps, stale package periods, missing source updates, and cache limitations.

4. Weather snapshots affecting decisions
   - Weather known at the event time, freshness state, confidence, and route/camp/loadout relevance.

5. CAD/check-in/incident moments
   - Check-ins, CAD events, incident reports, status changes, assist requests, and source timestamps.

6. Camp endpoint decisions
   - Planned camp, backup, emergency endpoint context, decision deadlines, endpoint confidence, stale/unvalidated warnings, and final outcome when available.

7. Loadout or vehicle issues
   - Payload, GVWR, power, fuel, water, recovery gear, or vehicle state issues that affected expedition decisions.

8. Recovery actions
   - Recovery packet, dispatch recovery, assist, route bailout, repair, or convoy coordination actions with evidence and timestamps.

9. Next expedition recommendations
   - Recommended prep tasks and rationale tied to evidence from the replay.

## DebriefRecord Read Model

Use a single read model assembled before rendering the replay. UI components should consume this read model rather than querying live systems directly.

```ts
type DebriefRecord = {
  id: string;
  expeditionId: string;
  routeId?: string;
  routeGeometryVersion?: string;
  generatedAt: string;
  status: "complete" | "partial" | "unavailable";
  tripSummary: DebriefTripSummary;
  map: DebriefMapModel;
  chapters: DebriefChapter[];
  recommendations: DebriefRecommendation[];
  sourceCoverage: DebriefSourceCoverage[];
};

type DebriefChapterKind =
  | "departure_readiness_baseline"
  | "route_confidence_changes"
  | "offline_or_stale_data_gaps"
  | "weather_snapshots"
  | "cad_checkin_incident_moments"
  | "camp_endpoint_decisions"
  | "loadout_vehicle_issues"
  | "recovery_actions"
  | "next_expedition_recommendations";

type DebriefEvent = {
  id: string;
  chapterKind: DebriefChapterKind;
  eventTime: string;
  routeMeasure?: number;
  location?: DebriefLocation;
  routeSegment?: DebriefRouteSegmentRef;
  sourceSystem: DebriefSourceSystem;
  knownAtTime: string;
  confidenceAtTime: "high" | "medium" | "low" | "unknown";
  dataState: "observed" | "inferred" | "stale" | "unavailable";
  summary: string;
  evidence: DebriefEvidence[];
  relatedSystemIds: string[];
};

type DebriefRecommendation = {
  id: string;
  title: string;
  rationale: string;
  linkedEvidenceIds: string[];
  linkedEventIds: string[];
  targetEcsArea:
    | "readiness"
    | "fleet"
    | "loadout"
    | "route_planning"
    | "check_in_cadence"
    | "campops"
    | "offline_readiness"
    | "recovery";
  taskCreationPayload: DebriefPrepTaskPayload;
  state: "new" | "accepted" | "dismissed" | "created_as_task";
};
```

Every displayed event must include:

- Event time.
- Location or route segment when available.
- Source system.
- Known-at-time timestamp.
- Confidence/state at that time.
- Whether the value was observed, inferred, stale, or unavailable.

## Provenance UI

Use inline chips on timeline rows, map callouts, and detail headers:

- Source chip: source system label.
- Time chip: event time and known-at-time timestamp.
- Confidence chip: high, medium, low, or unknown.
- Data-state chip: observed, inferred, stale, or unavailable.

Expandable detail panels should expose the supporting evidence records and explain whether ECS had fresh, stale, cached, inferred, or missing information at that point in the trip.

## Map And Timeline Synchronization

- Selecting a map marker selects the matching timeline chapter/event.
- Selecting a timeline item pans or highlights the matching map marker, route segment, or stale/offline span.
- Scrubbing replay time updates the visible route position and the active chapter context.
- If an event has no location, keep it in the timeline and detail panel but do not invent a map position.
- Confidence and stale/offline spans must be visually distinct from known risky or incident markers.

## Recommendation-To-Prep Task Flow

Recommendations should be deterministic outputs assembled from replay evidence, with AI allowed only to summarize provided rationale and evidence.

Each recommendation must include:

- Rationale.
- Linked evidence/events.
- Target ECS area.
- Task creation payload.
- Dismissed/accepted/created state.

Task creation should preserve:

- Source expedition ID.
- Linked event IDs.
- Linked evidence IDs.
- Target ECS area.
- Original recommendation text and rationale.

## Responsive Behavior

Desktop:

- Map-led layout with persistent timeline and detail panel.
- Timeline and detail panel remain visible while inspecting map markers.
- Richer comparison and evidence review is available without leaving the workspace.

Mobile:

- Map is first in the flow.
- Chapter selector appears below the map.
- Detail and recommendation panels use sheets or drill-down views.
- Source/time/confidence/data-state chips remain visible on mobile.
- No chapter, chip, or task action should be desktop-only.

## Empty, Partial, And Offline States

- No completed trip: show an unavailable debrief state and explain that replay requires a completed expedition.
- Partial trip record: show available chapters and a source coverage summary.
- Missing map geometry: show timeline and detail panels without route-map replay.
- Missing event location: show timeline/detail only; do not place a guessed marker.
- Stale/offline periods: render as gaps or stale spans, not confident route knowledge.
- Cached-only data: label as cached/stale according to owning source freshness rules.

## Acceptance Criteria

- Completed trip renders trip summary, map workspace, chaptered timeline, detail panel, and recommendations.
- Map selection, timeline selection, and detail panel selection stay synchronized.
- Stale/offline periods render as gaps or stale spans and never as confident route knowledge.
- Historical weather/readiness/confidence shows values known at the event time.
- Incident chapters show recovery actions and source links.
- Camp endpoint decisions show rationale and confidence context.
- Loadout issues appear in both timeline context and recommendations when evidence supports them.
- Recommendation-to-prep-task creation preserves linked evidence and target ECS area.
- Mobile layout preserves all chapters, chips, evidence, and task actions.

## Test Plan

- Unit test `DebriefRecord` assembly from trip timeline, route progress, CAD events, incidents, check-ins, offline periods, weather, camp decisions, readiness changes, and fleet/loadout state.
- Unit test chapter ordering and unavailable chapter handling.
- Unit test known-at-time evidence selection to prevent later-corrected values from replacing historical values.
- Unit test stale/offline gap classification and map span output.
- Integration test completed trip rendering with synchronized map/timeline/detail selection.
- Integration test incident chapters with recovery actions and source links.
- Integration test camp endpoint decision chapter with confidence and rationale context.
- Integration test loadout issue recommendation creation with linked evidence.
- Responsive UI test for desktop and mobile layouts.
- Safety test that low confidence, stale, and unavailable states are not rendered as confirmed danger.

## Open Questions

- Which completed expedition entry point owns the first beta launch: Expedition dashboard, Intelligence AAR, or a dedicated archive/detail route?
- Should scrub playback be time-continuous in V1, or chapter-step only with optional scrub context?
- Which prep-task store owns accepted recommendation creation?
- What is the retention and privacy posture for map replay records containing private route coordinates?
- Which route/weather/CAD source systems provide immutable known-at-time snapshots versus reconstructable event history?
