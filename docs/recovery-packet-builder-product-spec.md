# Recovery Packet Builder Product Specification

Last updated: 2026-06-13

Status: Current user-facing/internal beta product spec

## Summary

Recovery Packet Builder is an Incident & Recovery workflow that assembles a compact, structured incident packet when a user reports something wrong in the field. The goal is to avoid multi-screen panic-scroll by presenting one reviewable, shareable summary of location, vehicle/loadout, incident, team, route/bailout context, communications, and data freshness.

V1 supports gated copy, download, and approved share actions only. Coordinates must be explicitly user-confirmed before any export action is enabled.

## Product Outcome

The user can build a recovery packet from available ECS context and manual incident inputs, then share the same visible, freshness-labeled information with trusted helpers, dispatch operators, or recovery contacts.

The packet must remain useful offline by accepting cached and user-entered data, while clearly labeling stale, unavailable, cached, or user-entered fields.

## Safety Boundaries

- Public copy must call the artifact a "recovery packet" or "incident packet."
- ECS must not imply emergency-service dispatch, automatic rescue, or confirmed SOS handling.
- Garmin, inReach, SOS, ping, or satellite signals may appear only as human-review context when approved and available.
- Nearby bailout candidates are informational route context, not recommendations to abandon recovery.
- Missing data must be visible as unavailable, not hidden silently.
- AI may summarize visible packet fields after deterministic assembly, but may not invent location, incident, vehicle, route, team, comms, weather, rescue, or recovery facts.

Forbidden public claims include:

- "Emergency dispatch sent"
- "SOS sent by ECS"
- "Emergency services contacted"
- "Rescue is on the way"
- "Live location"

## Entry Point And Inputs

Primary entry point:

- Incident & Recovery: "Build Recovery Packet"

Read-only context contributors:

- Dispatch Recovery
- Navigate Assist
- Fleet
- Offline Honesty
- Field Utilities
- Approved Garmin/inReach signals

Required manual inputs:

- Incident type
- User-confirmed location/coordinates

## Workflow

1. User starts "Build Recovery Packet" from Incident & Recovery.
2. ECS creates a draft from available read-only context and marks each field with source and freshness.
3. User selects a manual incident type.
4. User reviews and confirms coordinates.
5. ECS renders packet sections in the required order.
6. Copy, download, and approved share actions remain disabled until the incident type exists and coordinates are confirmed.
7. Exported content mirrors the visible packet fields and safety labels.

## Interface Contracts

```ts
type PacketFreshnessLabel =
  | "current"
  | "stale"
  | "unavailable"
  | "user_entered";

type CoordinateDisplayFormat =
  | "decimal_degrees"
  | "degrees_minutes_seconds"
  | "utm";

type ConfirmedLocation = {
  confirmed: boolean;
  latitude?: number;
  longitude?: number;
  selectedFormat: CoordinateDisplayFormat;
  formattedCoordinates?: string;
  confirmationTimestamp?: string;
  confirmingUserId?: string;
  source: "gps" | "manual" | "cached" | "shared" | "unavailable";
  freshness: PacketFreshnessLabel;
};

type RecoveryPacketDraft = {
  incidentType?: string;
  confirmedLocation: ConfirmedLocation;
  activeRoute?: PacketSourceField<RouteContextSummary>;
  vehicleProfile?: PacketSourceField<VehicleProfileSummary>;
  recoveryGear?: PacketSourceField<RecoveryGearSummary>;
  teamRoster?: PacketSourceField<TeamStatusSummary>;
  lastKnownCommsStatus?: PacketSourceField<CommsStatusSummary>;
  offlineAvailability?: PacketSourceField<OfflineAvailabilitySummary>;
  weatherFreshness?: PacketSourceField<WeatherFreshnessSummary>;
  nearbyBailoutCandidates?: PacketSourceField<BailoutContextSummary[]>;
  garminInreachReviewSignals?: PacketSourceField<HumanReviewSignal[]>;
};

type PacketSourceField<T> = {
  value?: T;
  freshness: PacketFreshnessLabel;
  sourceLabel: string;
  sourceTimestamp?: string;
  notes?: string[];
};

type RecoveryPacketExport = {
  enabled: boolean;
  disabledReason?: "missing_incident_type" | "location_not_confirmed";
  packetId: string;
  generatedAt: string;
  visibleSections: RecoveryPacketSection[];
};
```

Implementation may map these DTOs to existing ECS domain types, but the user-facing behavior must preserve the freshness, source, and coordinate confirmation fields.

## Packet Sections

Render sections in this order.

1. Location
   - Confirmed coordinates in the selected display format.
   - Coordinate source, freshness, confirmation timestamp, and confirming user when available.
   - Default format: decimal degrees.
   - Optional formats: degrees/minutes/seconds and UTM where conversion is available.

2. Incident
   - Manual incident type.
   - User-entered notes when provided.
   - Approved Garmin/inReach signals as review context only.

3. Vehicle and Loadout
   - Active Fleet vehicle identity and loadout summary.
   - Payload/loadout confidence and source labels when available.
   - Unavailable state when no active vehicle profile exists.

4. Recovery Gear
   - Recovery gear checklist or inventory summary.
   - Missing gear data appears as unavailable.
   - User-entered gear corrections are labeled user-entered.

5. Team Status
   - Visible roster members, role/status when permitted, and source freshness.
   - Permission-limited rows must explain redaction instead of implying absence.

6. Route/Bailout Context
   - Active route summary, route freshness, and nearby bailout candidates when available.
   - Bailout candidates are informational context, not automated route recommendations.

7. Comms Status
   - Last known communication state, channel availability, and source timestamps.
   - Satellite or Garmin/inReach data is labeled as review context, not emergency confirmation.

8. Data Freshness
   - Consolidated list of stale, unavailable, cached, and user-entered packet fields.
   - Weather, route, comms, offline package, team, and vehicle/loadout freshness must be represented when included.

9. Share/Export
   - Copy, download, and approved share controls.
   - Disabled until incident type is selected and coordinates are user-confirmed.
   - Export preview uses the same fields and labels shown on screen.

## Coordinate Confirmation

Coordinates are safety-critical and require explicit confirmation before export.

Confirmation requirements:

- Show coordinates in decimal degrees by default.
- Allow degrees/minutes/seconds and UTM when supported.
- Make the selected format visible before export.
- Record confirmation timestamp and confirming user when available.
- If UTM conversion is unavailable, keep decimal degrees available and label UTM unavailable.
- Do not treat cached, inferred, or shared coordinates as confirmed until the user confirms them in the flow.

## Freshness And Source Labels

Every sourced packet field must carry one of:

- `current`: Recent enough for the owning ECS source policy.
- `stale`: Present but beyond the owning freshness window.
- `unavailable`: Missing, inaccessible, unpermitted, or unsupported.
- `user_entered`: Entered or corrected by the user in the packet flow.

Field-level source metadata should include source label and timestamp when available. Offline mode may still generate a packet from cached and user-entered data, but the packet must make cached/stale/unavailable status obvious.

## Export Rules

V1 export is a gated summary only.

Export actions are disabled when:

- `incidentType` is missing.
- `confirmedLocation.confirmed !== true`.

Exported packets must:

- Include the same visible packet fields shown in the UI.
- Preserve every freshness label and safety note.
- Use "recovery packet" or "incident packet" language.
- Avoid emergency dispatch, rescue, SOS-sent, or emergency-service-contact claims.
- Avoid hidden extra fields that were not visible in the review UI.

## Garmin/InReach Handling

Garmin/inReach inputs may contribute only when approved, connected, permitted, and available from the source-of-truth integration.

Allowed treatment:

- "Garmin/inReach review signal received"
- "Satellite message context available for review"
- "SOS-related signal requires human review"

Disallowed treatment:

- ECS sent an SOS.
- Emergency services were contacted.
- Emergency dispatch is confirmed.
- A recovery response is underway.

## Acceptance Criteria

- Packet cannot be copied, downloaded, or shared until coordinates are user-confirmed.
- Packet cannot be finalized until manual incident type is selected.
- All required packet sections render in the specified order.
- Missing section data renders as unavailable.
- Stale weather, comms, route, offline, team, vehicle, and loadout data show freshness labels when present.
- Garmin/inReach signals render only as human-review context.
- Exported packet content matches the visible packet fields and labels.
- Offline mode can generate a packet from cached and user-entered data with clear freshness labels.

## Test Plan

- Unit test export gating for unconfirmed coordinates.
- Unit test incident type requirement before final packet generation.
- Unit test section ordering and unavailable-state rendering.
- Unit test freshness labels for stale weather, comms, route, offline, team, vehicle, and loadout data.
- Unit test Garmin/inReach signal copy to prevent automatic SOS or emergency-service claims.
- Integration test that copy, download, and share exports contain only visible packet fields and visible safety labels.
- Offline scenario test that cached and user-entered data can generate a packet without optimistic freshness language.

## Rollout Notes

- Readiness label: current user-facing/internal beta.
- Initial surface: Incident & Recovery.
- Keep the flow compact and review-first; avoid multi-screen panic-scroll.
- Preserve manual fallback paths when live sensors, OBD, satellite, or internet data are unavailable.
- Audit useful events such as draft created, location confirmed, export blocked, export completed, and freshness warnings shown. Avoid logging raw coordinates in analytics unless the product privacy policy explicitly allows it.

## Open Questions

- Which roles may approve external share actions?
- Which coordinate conversion library or platform service owns UTM formatting?
- Which packet fields are redacted for non-dispatch viewers?
- Should packet downloads use plain text, PDF, JSON, or a staged combination?
- Which Garmin/inReach signal fields are approved for beta visibility?
