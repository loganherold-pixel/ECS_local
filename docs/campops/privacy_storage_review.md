# CampOps Privacy, Storage, and Retention Review

This review covers CampOps offline caches, recommendation payloads, AI summaries, and debrief data before broad rollout. CampOps should remain useful offline, but private trip, vehicle, convoy, and debrief data must stay private by default.

## Storage Decision Matrix

This matrix reflects what CampOps owns today. If another ECS layer persists one of these payloads, that layer becomes the storage owner and must document its own retention, deletion, and encryption status before real tester data is used broadly.

| Data category | Sensitivity | Current storage location | Retention period | Deletion path | Encryption status | AI use | Telemetry use | Community-visible | Owner / decision status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Source signals | Medium to high when tied to camp candidates, route context, legal/access status, service proximity, or provider limitations | In memory inside candidate enrichments and recommendation payloads. Provider outputs can carry cache metadata. CampOps does not currently own a durable source-signal cache. | `CAMP_OPS_SOURCE_SIGNAL_CACHE_RETENTION_DAYS` is 14 days for future normalized source caches unless a provider supplies a shorter `expiresAt`. In-memory signals last only as long as the owning search/endpoint output. | No durable CampOps source cache delete path exists because CampOps does not own persistence here. Future provider caches need explicit clear/delete hooks. | No CampOps encryption layer. Do not assume provider-cache encryption unless the owning provider documents it. | May be summarized for AI only through the CampOps AI payload after redaction and source-truth normalization. | Only coarse freshness/conflict/missing bands if telemetry is explicitly enabled and sink-approved. Raw source signals are rejected as telemetry input. | No. | CampOps architecture owner: typed contract exists. Storage owner: TBD for any future durable provider cache. Decision: internal beta only without durable source cache. |
| Source summaries | Medium to high because summaries can accidentally contain provider notes, place names, or private observations | In memory in `sourceSignals`, `sourceResolutions`, warnings, and provider validation summaries. | Same as owning recommendation or validation output. Future durable source-summary caches should follow the 14-day normalized source retention default or a shorter provider `expiresAt`. | Clear owning recommendation/validation output. No dedicated CampOps source-summary store exists. | No CampOps encryption layer. | Redacted summaries may be passed to AI to explain stale, missing, and conflicting source data. | Raw summaries are not allowed. Telemetry accepts only counts/bands. | No. | CampOps privacy decision: use `redactCampOpsSourceSummaryForOfflineCache` before any persistence or diagnostics. |
| Provider validation outputs | Medium. Developer-facing quality reports may include region labels, provider ids, confidence bands, warnings, and errors. They must not contain precise private locations or raw user/vehicle data. | In memory from `runCampOpsProviderValidation`; optional developer docs such as `docs/campops/provider_readiness_region_001.md`. | Report lifetime is controlled by developer docs/release artifacts. No app runtime retention store exists. | Delete the generated report artifact or clear the in-memory validation result. | No CampOps encryption layer for docs or validation output. | No. Validation outputs should not be sent to AI. | No runtime telemetry. Validation reports are developer diagnostics only unless product creates a reviewed sink later. | No. | Provider/readiness owner: TBD. Decision: shadow validation only; reports use region labels, not precise coordinates. |
| Recommendation sets | Medium to high because they include camp names, candidate ids, scores, warnings, route context, and sometimes candidate coordinates | Generated in memory and attached to search/endpoint outputs. No dedicated CampOps recommendation store is implemented. | Session/output lifetime unless the owning route/search/result layer persists it. | Clear the owning search/route/endpoint state. No separate CampOps recommendation store exists. | No CampOps encryption layer. | Yes, through `buildCampOpsAiAssistPayload`, which strips unnecessary private vehicle/convoy identifiers. | Aggregate/banded observability only. Raw recommendation payloads, candidate ids, camp names, and coordinates are not allowed. | No. | CampOps owner: recommendation engine. Decision: OK for internal beta in memory; durable persistence requires separate storage review. |
| Endpoint recommendations | High when they include route progress, delayed-day logic, camp candidates, and operational next actions | Generated in memory by the safe endpoint flow and exposed through the existing CampOps state/output layer. | Session/output lifetime unless a caller persists the owning trip/route state. | Clear owning trip/route/endpoint state. | No CampOps encryption layer. | Yes, through the redacted AI assist payload when AI is enabled. | Coarse endpoint status, confidence, delay band, and role counts only. | No. | CampOps owner: endpoint flow. Decision: internal beta only; no durable endpoint cache added. |
| Decision points | High because they can include route mile marker, decision deadline, latest turnoff label, and optional location | In memory as part of `CampRecommendationSet.decisionPoint` and endpoint recommendation output. | Session/output lifetime unless a caller persists the owning trip/route state. | Clear owning trip/route/endpoint state. | No CampOps encryption layer. | AI may summarize deadline/action/risk from the redacted payload; do not send private route geometry beyond what is needed. | `decisionPointPresent` boolean only. No raw location, turnoff labels, or route points. | No. | CampOps owner: endpoint/decision-point engine. Decision: do not persist before route storage owner is assigned. |
| AI summaries | Medium to high depending on recommendation context and source warnings | CampOps constructs prompts and parsed summaries on demand. CampOps does not persist raw prompts or model outputs. | Not retained by CampOps. If a caller later stores summaries, use a short retention window and never store raw prompts. | No CampOps AI-summary store exists. | No CampOps encryption layer. | This is the AI boundary. Inputs must be minimized and deterministic CampOps output remains source of truth. | `campops_ai_summary_generated` records only AI mode and aggregate recommendation bands when telemetry is enabled and approved. Raw prompts/responses are forbidden. | No. | AI owner: TBD for production model path. Decision: no durable AI summary storage in CampOps. |
| Debriefs | High. Private debriefs can include user id, vehicle association, precise camp location, notes, structured observations, and local photo refs. | `LocalCampOpsDebriefBackend` stores JSON in `localStorage` using `CAMP_OPS_DEBRIEF_STORAGE_KEY`; restricted runtimes use in-memory fallback. | Private: `CAMP_OPS_PRIVATE_DEBRIEF_RETENTION_DAYS` (365). Convoy shared: `CAMP_OPS_CONVOY_DEBRIEF_RETENTION_DAYS` (180). Community/public candidates: `CAMP_OPS_COMMUNITY_DEBRIEF_RETENTION_DAYS` (90). Explicit `privacy.retentionDays` can override. Expired records are pruned on read. | `deleteStoredCampOpsDebrief(recordId)` and `clearStoredCampOpsDebriefs()`. | No CampOps encryption layer. Browser/local runtime storage must be treated as unencrypted unless the platform provides protection outside CampOps. | No raw private debriefs in AI prompts. Future extraction requires a privacy-reviewed moderation/extraction path. | Optional `campops_debrief_created` event only; privacy-safe fields only. | Only after consent, feature flag, and moderation approval via public-safe export. | CampOps owner: debrief model/local backend. Privacy owner: TBD before real broad field data. Decision: internal beta prep only; encryption review remains required. |
| Private debrief notes | Very high. Notes can contain personal details, vehicle identifiers, precise location hints, hazards, or third-party information. | Stored inside private debrief records when the user enters notes and local debrief persistence is used. Not included in community-safe output. | Same as parent debrief record. | Delete/clear parent debrief. | No CampOps encryption layer. Treat as unencrypted local data. | Not sent to AI. Any future extraction must use a privacy-reviewed moderation/extraction path. | Never. Telemetry validation rejects debrief-note fields. | No. Notes are withheld from public-safe output; redaction helper is for moderation review only. | Decision: keep private by default; broad field use blocked until encryption/deletion ownership is approved. |
| Community debrief drafts | High until reviewed and anonymized. Drafts can still contain private source record metadata and user-entered details. | Stored as debrief records with `publishingState` such as `community_draft` or `pending_review`; community publishing flag remains off by default. | Same as community/public candidate debrief retention: 90 days by default unless explicit retention overrides. | Delete/clear parent debrief or transition to `removed` where product flow supports it. | No CampOps encryption layer. | Not sent to AI by default. | Consent/visibility may be counted only in aggregate if telemetry is enabled and approved. | Not public until `campopsDebriefCommunityPublishingEnabled`, explicit consent, and `approved_anonymized` state are all present. | Product/privacy/moderation owner: TBD. Decision: community publishing remains no-go for beta. |
| Convoy/group context | High. Group size, kids/pets, lowest fuel/water, mechanical issue, and constraints can be sensitive. | Transient `CampSearchContext.convoyProfile`; not persisted by CampOps except if another app layer owns trip/convoy state. | Governed by owning app state. No CampOps-specific retention store. | Owning app delete path. CampOps has no separate convoy store. | No CampOps encryption layer. | AI payload includes minimized operational fields only and strips group ids, labels, and medical/accessibility constraint flags. | No raw convoy ids, labels, locations, or sensitive constraints. | No. | Owner: owning convoy/trip app state. Decision: CampOps may consume transient minimized context only. |
| Vehicle context | High. Vehicle ids, nicknames, VIN-like identifiers, and resource status can identify a user or vehicle. | Transient `CampSearchContext.vehicleProfile`, resource state, and optional debrief association when explicitly allowed. | Governed by owning vehicle/fleet state. Debrief copies follow debrief retention. | Owning vehicle/fleet delete path plus debrief delete/clear for debrief copies. | No CampOps encryption layer. | AI payload includes vehicle type/dimensions/capability/resource margins but strips vehicle id and label. | No vehicle ids, labels, VINs, or raw vehicle identifiers. | No. Community-safe debrief output omits vehicle association by default. | Owner: Fleet/vehicle state for source data; CampOps for debrief copy. Decision: no public vehicle association by default. |
| Cached service/POI data | Medium to high when tied to route, camp, or resupply decisions; may include service names and locations | In memory inside `CampCandidateEnrichment.nearestFuel`, `nearestWater`, `nearestPropane`, `nearestDump`, `nearestRepair`, and `nearestTownOrExit`. No dedicated CampOps durable service/POI cache exists. | Same as owning source signal/recommendation output. Future provider caches should use 14-day normalized source retention or shorter `expiresAt`/operating-status expiry. | No CampOps service cache clear path exists because no durable CampOps service cache exists. Future service providers need a clear/delete hook. | No CampOps encryption layer. | AI may receive service availability summaries and unknown/stale notes from CampOps output; it must not invent status or hours. | Only coarse resource/service confidence bands and missing/stale counts. Raw POI/service records are not allowed. | No. | Owner: future service provider/cache TBD. Decision: do not persist raw POI/service provider payloads in CampOps. |

## Decision Outcome

- Internal beta preparation can continue with feature flags off by default, local debriefs private by default, telemetry disabled, community publishing disabled, and provider validation in shadow mode only.
- Real trip/debrief field data is approved for guarded closed-field testing under the approval packet below. Broad/public collection remains blocked until a separate rollout review approves telemetry, community publishing, and any durable provider/source caches.
- CampOps does not currently provide encryption. Any storage location using `localStorage` or developer docs must be treated as unencrypted unless the platform or owning storage layer documents otherwise.
- Durable provider/source/service caches are not owned by CampOps yet. When added, they must persist only normalized and redacted data, include a clear/delete path, and be documented here before rollout.

## Saved Camp And Report-Unusable Handling

Saved camps storage is limited to explicit user action from the Camp Intel popup. The current Navigate integration saves a selected CampOps candidate through the existing saved pin path so the coordinate has a clear user-facing purpose: returning to or navigating to that saved camp. Saved camp records must not be used as hidden telemetry, provider validation payloads, or public/community data.

Report unusable data handling is currently local/reportable-placeholder only unless a reviewed reporting sink is added. The placeholder can include the candidate id, user-facing camp label/rank, reason, and created-at timestamp for local debugging or future queued submission. It must not include private user ids, vehicle ids, raw provider payloads, raw AI prompts, or unnecessary precise coordinates in shared evidence.

User coordinates are not intentionally logged by CampOps readiness or Navigate popup handlers. If future reporting needs precise coordinates, the report schema must document purpose, retention, deletion, access controls, and encryption posture before closed field-test use.

## Closed Field-Test Privacy/Storage Approval Packet

- Status: approved
- Owner: L. Herold
- Approval date: 2026-05-17
- Approved data categories: guarded closed-field tester route labels, region labels, scenario labels, recommendation status bands, source freshness/confidence bands, private local CampOps debrief records, saved-camp user actions, and local report-unusable placeholders
- Retention period: Private debrief retention defaults to 365 days, convoy shared to 180 days, community/public candidates to 90 days; closed field-test retention approved for these existing limits
- Deletion path: `deleteStoredCampOpsDebrief(recordId)` and `clearStoredCampOpsDebriefs()` exist for CampOps debrief records; other app-layer caches require owner-specific delete paths before they are approved for closed field testing
- Storage location: `LocalCampOpsDebriefBackend` stores debrief JSON in `localStorage` using `CAMP_OPS_DEBRIEF_STORAGE_KEY`; restricted runtimes use in-memory fallback; CampOps recommendation/source outputs are currently in-memory unless another app layer persists them
- Encryption status: No CampOps encryption layer exists; local storage and developer docs must be treated as unencrypted unless an owning platform/storage layer documents otherwise
- Access controls: approved for guarded internal tester use; private/local debrief data remains on-device/local runtime unless a separately approved sink is added
- Private debrief data posture: private structured debrief capture approved for guarded closed-field testing only; no community/public use; private notes remain private and are not sent to AI or telemetry
- Private debrief owner approval: approved by L. Herold on 2026-05-17 for guarded closed-field private/local use only
- Telemetry posture: disabled unless separately approved
- Telemetry sink: not approved
- Community publishing: disabled
- Raw provider payloads stored: no
- Raw AI prompts stored: no
- Private coordinates in shared evidence: no
- Remaining issues: No unresolved approval blocker for guarded closed-field testing. Broader rollout still requires a separate review for telemetry sinks, community publishing, encryption-backed storage, durable provider/source caches, and any public-safe export workflow.

## Hardening Applied

- Added explicit debrief retention constants and default retention windows by visibility.
- Added pruning of expired local debrief records during storage reads.
- Added production-safe debrief deletion helpers: `deleteStoredCampOpsDebrief` and `clearStoredCampOpsDebriefs`.
- Exported `CAMP_OPS_DEBRIEF_STORAGE_KEY` so storage ownership is discoverable in tests and docs.
- Added source/provider redaction helpers for cached source summaries, diagnostics, and future provider caches.
- Kept community publishing private-by-default and consent-gated.
- Tightened CampOps telemetry raw-payload validation so cached source/provider blobs, source summaries, source signals, and raw provider status cannot be emitted accidentally.

## Offline Rules

- Offline source data must carry freshness metadata: `cachedAt`, `expiresAt`, `sourceGeneratedAt`, `retrievedAt`, `freshnessStatus`, and `offlineAvailable`.
- Stale or expired provider data must remain visible as stale/expired. It must not be narrated or displayed as current.
- If no cached source data exists offline, CampOps should keep the affected fields unknown and lower confidence rather than inventing source truth.
- Future provider caches should persist only normalized, redacted source signals. Do not persist raw provider payloads, secrets, precise user locations, raw trip data, user ids, vehicle ids, or private debrief notes.

## AI Boundary

CampOps AI assist can receive the deterministic recommendation set, source confidence, stale/missing/conflict notes, resource debt, and decision point summaries. It should not receive:

- private user ids
- vehicle ids or vehicle labels
- convoy ids or convoy labels
- medical/accessibility flags
- private debrief notes
- raw provider payloads
- raw AI prompts from earlier runs

AI cannot override deterministic gates, upgrade unknown legal/access confidence, or soften stale-source warnings.

## Remaining Risks

- CampOps does not provide encryption for `localStorage` debrief persistence. Treat local debrief storage as unencrypted unless the runtime provides protection outside this module.
- No dedicated durable source cache exists yet. When real provider caches are added, they need explicit clear/delete hooks and storage-location documentation.
- If another app layer persists recommendation sets, endpoint outputs, or AI summaries, that layer must apply the same redaction and retention rules.
- Community debrief publishing remains intentionally narrow. Broad community pipelines still require a separate privacy review.
- Community-safe output is now additionally blocked by moderation state. Draft, pending-review, rejected, and removed records are not public-visible.
- Retention, encryption, deletion, and access-control owners are still TBD for broad real trip/debrief field data. Internal beta should use controlled tester data and keep community publishing and telemetry disabled unless separately approved.
