# CampOps Safety, Privacy, and Security Review

Review date: 2026-04-30

## Scope

Reviewed the current CampOps implementation in `lib/campops`, the CampOps UI/search integration points, debrief capture, AI assist payload construction/parsing, and campsite candidate diagnostics that feed CampOps.

## Low-Risk Fixes Applied

- AI prompt minimization:
  - `buildCampOpsAiAssistPayload` no longer sends vehicle IDs or vehicle labels.
  - The AI payload no longer sends convoy group IDs, group labels, or `medicalOrAccessibilityConstraint`.
  - Nested least-capable and low-resource vehicle summaries are stripped of vehicle IDs/labels before prompt construction.
- Resource Debt explanation minimization:
  - Fuel and water debt explanations now refer to the convoy limiting vehicle/resource without naming the vehicle.
- Diagnostic log minimization:
  - Campsite candidate logs redact coordinate-bearing polygon IDs before logging `routeIntelligenceId` or `polygonId`.
- Tests added/updated:
  - AI assist tests assert private vehicle/convoy identifiers and medical/accessibility flags are not present in prompts.
  - Convoy-aware Resource Debt tests assert private low-resource vehicle labels are not included in explanations.

## Findings

### 1. Location Data Handling

Camp candidates and debrief records may contain precise coordinates. CampOps AI camp briefs do not currently send candidate coordinates, which is good. CampSearchContext current location is also not included in the AI payload.

Risk: local storage and in-memory recommendation objects still contain precise camp and debrief coordinates. This is needed for routing and field use, but it should be treated as sensitive trip data.

Follow-up:
- Add a data retention policy for stored CampOps debriefs and recommendation snapshots.
- Consider a location precision policy for community/public submissions, with explicit user confirmation before any exact coordinate leaves private storage.

### 2. Vehicle Profile Data Handling

Vehicle IDs and labels were previously included in the AI prompt context. This has been removed. Operational capability fields such as vehicle type, width, wheelbase, clearance, trailer presence, rooftop tent, and confidence may still be sent because they materially affect CampOps explanation.

Follow-up:
- Keep VIN, plate, nickname, owner, and profile IDs out of all AI payloads.
- Add snapshot tests if a future prompt adds more vehicle fields.

### 3. Group / Convoy Data Handling

AI receives only operational counts and booleans: vehicle count, people count, pets/kids counts, trailer presence, delayed member count, mechanical issue flag, preferred risk tolerance, source, and confidence. Group IDs and labels are redacted.

Follow-up:
- Avoid adding member names, invite IDs, or expedition channel IDs to CampOps AI prompts.
- Keep convoy limiting-resource explanations generic unless the user is viewing private local UI.

### 4. Kids / Pets / Passenger Data

The model supports `kidCount`, `kidsPresent`, `petCount`, and `peopleCount`. These are operationally relevant for water, group fit, and conservative recommendations. They are not public by default.

Follow-up:
- Treat kids/passenger counts as sensitive trip metadata in any sync, export, or community feature.
- Avoid exposing kids/pets details in public debriefs; aggregate only into suitability hints where needed.

### 5. Emergency / Medical-Related Fields

`medicalOrAccessibilityConstraint` exists in the deterministic convoy profile. It is intentionally omitted from the AI prompt after this review.

Follow-up:
- If medical/accessibility constraints are ever used for AI narration, require explicit consent and pass only a non-medical operational phrase such as "accessibility constraint present."
- Keep any medical details out of logs, community reports, and public debriefs.

### 6. AI Prompt Contents

AI assist is constrained to CampOps output: recommendations, hard gates, scores, Resource Debt, warnings, missing data, assumptions, and confidence. It does not receive raw unrelated user profile data.

Current protections:
- Prompt says deterministic CampOps is the source of truth.
- Prompt forbids invented legal/weather/closure/fuel/water/slope/occupancy/road facts.
- Prompt forbids hard-gate overrides.
- Parser downgrades rejected-camp resurrection attempts.

Follow-up:
- Keep prompt tests current whenever new context fields are added.
- Add a prompt fixture for stale offline data warnings.

### 7. AI Output Handling

`parseCampOpsAiAssistOutput` normalizes malformed output and enforces deterministic truth:

- rejected candidates cannot become recommended
- a different primary camp selected by AI is downgraded to caution
- empty `why` or `requiredActions` are filled from deterministic fallback output

Follow-up:
- Consider rejecting, rather than only downgrading, any AI response that names a non-CampOps candidate ID.

### 8. Public Community Report / Debrief Behavior

CampOps debrief defaults to private visibility. Vehicle profile association is opt-in. Structured fields are stored separately from notes, and notes/hazards are sanitized.

Risk: `community_candidate` visibility exists as a value, but privacy review is still needed before any public/community publishing behavior is expanded.

Follow-up:
- Require EXIF stripping before photo upload or community visibility.
- Add explicit review/confirmation before precise location, notes, photos, or vehicle-associated information can become public.
- Add tests proving vehicle profile IDs remain null unless explicitly allowed.

### 9. Offline Storage Of Trip / Camp Data

Local CampOps debrief storage uses localStorage when available and in-memory fallback otherwise. Stored records can include precise coordinates, notes, photos refs, user IDs, and private camp observations.

Follow-up:
- Move private CampOps debrief storage to the repo's secure/persistent storage abstraction if available.
- Add retention/clear controls for local debriefs.
- Consider encrypting private debriefs if synced or stored beyond local device runtime.

### 10. Logging / Telemetry

CampOps modules do not currently emit broad telemetry. Legacy campsite candidate logs did expose coordinate-bearing polygon IDs in diagnostics. This review redacted coordinate-like IDs in those log lines.

Follow-up:
- Audit non-CampOps campsite/community/dispatch logs for precise coordinates and private route IDs.
- Prefer counts, coarse status, and redacted IDs in all CampOps logs.

## Feature Flag Review

CampOps search integration remains behind `campopsRecommendationsEnabled`. Resource Debt and recommendation rollout configs are also feature-gated. The legacy campsite output shape is preserved when the feature flag is disabled.

Follow-up:
- Add a single end-to-end test that asserts flag-off output has no CampOps UI-visible behavior change.

## Safety Wording Review

CampOps AI rules avoid overconfident wording such as "definitely legal", "guaranteed open", and unqualified "safe." UI/doc language should prefer:

- recommended
- caution
- fallback only
- unknown confidence
- not recommended

Follow-up:
- Continue replacing unqualified "safe" in user-visible CampOps text unless a specific safety gate or emergency flow name is being referenced.
