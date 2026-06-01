# CampOps Observability

CampOps observability is privacy-safe by default. The app should track recommendation behavior only through coarse, operational bands and counts. It must not emit precise coordinates, raw camp names, user identifiers, vehicle identifiers, raw trip details, AI prompts, private notes, or photo references.

## Current Pattern

The repository uses local ECS diagnostics through `ecsLog`. CampOps adds `campOpsTelemetry` as an optional layer over that pattern:

- Telemetry is disabled by default.
- A caller must opt in with `configureCampOpsTelemetry({ campopsTelemetryEnabled: true, campopsTelemetrySinkApproved: true, sink })`.
- A sink must be configured and explicitly approved before any event can emit.
- The default implementation stores only a small in-memory test buffer and can optionally write debug-only ECS logs.
- No network analytics provider is configured by this module.
- Raw payloads are checked for forbidden sensitive keys before sanitization.
- All accepted payloads are sanitized through an allowlist before an event is emitted.

## Approval Gate

CampOps telemetry cannot emit unless all of these are true:

- The telemetry feature gate is enabled with `campopsTelemetryEnabled: true`.
- A sink function is configured.
- The sink has been approved with `campopsTelemetrySinkApproved: true`.
- The raw payload passes sensitive-key validation.
- The sanitized payload passes the allowlist validation.

The older `enabled` and `sinkApproved` config fields remain compatibility aliases, but new callers should use `campopsTelemetryEnabled` and `campopsTelemetrySinkApproved` so product/privacy approval is visible in configuration.

Release gate:

```bash
npm run gate:campops-publishing-telemetry -- --json
```

This gate must pass before telemetry or community debrief publishing is enabled for any field cohort. Passing while telemetry is disabled only confirms the restricted posture; it does not approve a telemetry sink.

Do not enable a sink merely because an analytics backend exists. Each sink needs privacy/product review for payload handling, retention, joining behavior, access controls, and deletion paths.

## Events

Supported event names:

- `campops_recommendation_generated`
- `campops_endpoint_recommendation_generated`
- `campops_recommendation_accepted`
- `campops_recommendation_dismissed`
- `campops_planned_camp_downgraded`
- `campops_ai_summary_generated`
- `campops_provider_stale_data_detected`
- `campops_source_conflict_detected`
- `campops_debrief_created`

Generation hooks are wired where CampOps already produces deterministic recommendation sets, safe endpoint results, AI assist payloads, and debrief records. Recommendation accepted/dismissed helpers are available for future UI actions.

## Allowed Payload Fields

Payloads may include:

- feature flag state
- offline/degraded/online mode
- candidate, rejected, warning, and assumption counts
- confidence bands
- operational role counts
- recommendation status
- planned-camp-downgraded boolean
- resource/risk category bands
- source freshness bands
- stale source count
- source conflict count
- missing data count
- delay band
- decision point present boolean
- AI assist mode
- debrief visibility, consent boolean, photo-presence boolean, and hazard count

Payloads must not include:

- precise coordinates or current location
- raw camp names or candidate IDs
- route IDs or trip IDs
- user IDs
- vehicle IDs or vehicle profile IDs
- raw AI prompts
- debrief notes
- photo references or URLs
- raw provider payloads
- cached source/provider blobs, source signals, source summaries, or raw provider status

## Source Truth

Telemetry must not influence CampOps recommendations. The deterministic CampOps engine remains the source of truth for hard gates, scoring, recommendations, source conflicts, stale-data warnings, and AI assist grounding.

AI summary telemetry records only coarse event metadata. It does not log prompts or model output text.

## Debrief Events

`campops_debrief_created` records only private-safe metadata:

- debrief visibility
- whether community publishing consent exists
- whether photos exist
- hazard count

It does not log note text, precise coordinates, user IDs, vehicle IDs, raw photo refs, or camp names.

## Adding a Sink

If ECS later adds an analytics backend, wire it by passing a sink:

```ts
configureCampOpsTelemetry({
  campopsTelemetryEnabled: true,
  campopsTelemetrySinkApproved: true,
  sink: (event) => {
    // Send event.name and event.payload only after backend privacy review.
  },
});
```

Backend adapters must keep the allowlisted payload intact and must not join telemetry events with private user, vehicle, or location records unless an explicit product/privacy review approves that design.

## Verification

Run:

```bash
npm run test:campops-telemetry
npx tsc --noEmit
npm run lint
```

The telemetry test asserts default-disabled behavior, sink-missing blocking, approval-missing blocking, generated recommendation events, stale/conflict events, AI summary metadata, debrief metadata, raw sensitive-key rejection, and payload redaction.
