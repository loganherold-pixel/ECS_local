# CampOps Debrief Loop

CampOps debrief capture records what actually happened after a user camps or marks a camp visited. The first implementation is private, structured, and deterministic. It does not publish community campsite submissions or alter public campsite records automatically.

## Captured Fields

The debrief model stores structured fields separately from freeform notes:

- camp accessibility
- observed legal/signage status
- approximate vehicle capacity
- flatness/slope
- trailer turnaround difficulty
- privacy
- wind exposure
- fire restriction signage
- hazards
- late-arrival suitability
- pets/kids suitability
- recommendation hints for solo, family, trailer, and large group use
- notes
- photo references when the existing app photo path supplies them
- visit/submission date and time
- optional vehicle profile association

## Privacy Rules

- Debriefs default to `private`.
- Community-visible publishing requires explicit consent and `campopsDebriefCommunityPublishingEnabled`. A caller must provide the matching `publishingConsent` field and enabled rollout flag before a debrief can become `community_anonymized` or `public_verified`.
- Convoy sharing uses `shared_with_convoy` and also requires an explicit convoy-sharing consent flag.
- Legacy visibility values are treated as aliases only: `group` maps to `shared_with_convoy`, and `community_candidate` maps to `community_anonymized`.
- Vehicle profile association is omitted unless the caller explicitly sets `allowVehicleProfileAssociation`.
- The default lightweight backend stores private structured records locally when local storage is available, with memory fallback for restricted runtimes.
- Photo fields are references only. Upload, EXIF stripping, moderation, and publication should continue through existing campsite photo/report flows.
- Public community submission behavior is unchanged. A debrief can become a community candidate only through a future privacy-reviewed bridge.
- Community-visible debrief records are privacy-minimized by default. They do not store private user IDs, vehicle profile associations, raw photo references, or precise location/accuracy metadata unless a future privacy-reviewed flow explicitly opts in.
- `createCampOpsDebriefRecord` defensively keeps a debrief private when a community or convoy visibility is requested without the matching consent, and when community publishing is requested without the enabled rollout flag.
- Records carry retention metadata through `privacy.retentionExpiresAtIso` by default. Private debriefs default to 365 days, convoy-shared debriefs default to 180 days, and community/public candidate debriefs default to 90 days unless the caller supplies a shorter or longer `privacy.retentionDays`.
- Expired records are pruned when local debrief storage is read.
- Local debrief persistence uses `localStorage` when available and an in-memory fallback otherwise. CampOps does not add encryption to this storage path; treat it as unencrypted unless the platform provides protection outside this module.
- Stored debriefs can be removed with `deleteStoredCampOpsDebrief(recordId)` or cleared with `clearStoredCampOpsDebriefs()`.

## Storage Decision Status

- Private debrief capture is acceptable for internal beta preparation with controlled tester data, because records default private, can be deleted locally, and are not community-visible by default.
- Broad real trip/debrief data collection still needs an assigned privacy/storage owner for encryption, retention approval, deletion ownership, and access-control review.
- Until that owner decision is complete, do not enable community publishing, do not enable telemetry sinks, and do not route private debrief notes into AI extraction.

## Publishing State Machine

Community publishing is guarded by `publishingState` and remains private/off by default. Supported states are:

- `private`
- `shared_with_convoy`
- `community_draft`
- `pending_review`
- `approved_anonymized`
- `rejected`
- `removed`

Allowed state transitions are intentionally narrow:

- `private` can move to `shared_with_convoy` or `community_draft`.
- `shared_with_convoy` can move back to `private` or into `community_draft`.
- `community_draft` can move to `pending_review`, `private`, or `removed`.
- `pending_review` can move to `approved_anonymized`, `rejected`, or `removed`.
- `approved_anonymized` can move only to `removed`.
- `rejected` can move back to `community_draft` for revision or to `removed`.
- `removed` is terminal.

Use `canTransitionCampOpsDebriefPublishingState` and `transitionCampOpsDebriefPublishingState` when changing states. Do not bypass this state machine from UI or service code.

## Public-Safe Debrief Output

Community pipelines should use `buildCampOpsCommunitySafeDebrief` instead of publishing raw debrief records. This helper returns `null` unless all guardrails are satisfied:

- community publishing rollout flag is enabled at export time
- record visibility is `community_anonymized` or `public_verified`
- publishing state is `approved_anonymized`
- matching consent metadata is present
- record has not been rejected or removed

The public-safe object includes only structured operational observations:

- camp id and name where already allowed by the product flow
- optional generalized location, never exact coordinates by default
- observed access
- observed legal/signage status
- approximate vehicle capacity
- observed trailer suitability
- observed fire signage
- observed hazards
- month-level date bucket
- confidence

The public-safe object omits user id, vehicle id, raw photo refs, exact timestamps, precise coordinates, and freeform notes. Notes can be passed through `redactCampOpsDebriefNoteForCommunity` for moderation review, but they should not be community-published automatically. Rejected, removed, draft, and pending-review debriefs must not produce community-visible output.

## Suitability Feedback

`buildCampOpsDebriefSuitabilityPatch` converts a debrief into a structured suitability patch for future scoring. This keeps freeform notes out of deterministic suitability logic while allowing confirmed fields to improve access, legal confidence, trailer fit, group capacity, privacy, wind exposure, late-arrival risk, and hazard awareness.

## AI Extraction

No AI extraction is added in this pass. If the app later routes debrief notes through an existing moderation/extraction path, that path should:

- preserve structured user-entered fields as authoritative
- extract only candidate hints from freeform notes
- never publish extracted content without explicit user action and privacy review
- mark extracted values as lower confidence than explicit structured fields
