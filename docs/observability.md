# ECS Observability Contract

Date: 2026-07-13

## Purpose

ECS observability helps operators diagnose failures without changing deterministic domain decisions or exposing field data. User-facing recovery copy remains separate from operator diagnostics. Diagnostics are bounded, redacted, and local by default.

## Error Taxonomy

Use the typed contract in `lib/observability/ecsErrorContract.ts`:

- `validation`
- `permission`
- `configuration`
- `provider`
- `network`
- `timeout`
- `persistence`
- `migration`
- `native_hardware`
- `realtime`
- `degraded_data`
- `invariant_violation`
- `unexpected`

Every captured failure includes a domain, operation, safe code, severity, recoverability, retryability, source state, optional request/correlation token, optional feature flag, and redacted context. New production paths should use `ecsLog.captureFailure` rather than printing raw exceptions.

## Privacy Rules

The canonical redactor is `lib/observability/ecsDiagnosticRedaction.ts`. It recursively bounds and sanitizes strings, objects, arrays, errors, and binary payloads. It removes or replaces:

- tokens, API keys, passwords, credentials, auth headers, sessions, and cookies
- raw email addresses and account/device/member identifiers
- exact coordinates, restricted position histories, and complete route/trip traces
- raw provider responses, BLE frames, manufacturer payloads, and private file paths

Do not pass raw provider payloads or field traces merely because the redactor exists. Build the smallest useful diagnostic context first; redaction is defense in depth.

## Logging Policy

- `WARN`, `ERROR`, and `CRITICAL` entries are retained in the bounded logger and may print sanitized diagnostics.
- Detailed `DEBUG` and developer logs are disabled in production.
- Approved support diagnostics require both `ECS_SUPPORT_DIAGNOSTICS_ENABLED` and `ECS_SUPPORT_DIAGNOSTICS_APPROVED`.
- Repeated typed failures are deduplicated for 30 seconds by default. The dedupe map, log history, and breadcrumb history are bounded.
- Lifecycle breadcrumbs contain state transitions and aggregate counts, never position samples or telemetry streams.

Feature-scoped boundaries contain failures in tabs, Dashboard widgets, and Command Center widgets. Their fallback copy is user-facing; their typed failure record is operator-facing.

## Remote Telemetry

Automatic issue upload fails closed. It requires all of:

1. Supabase configured.
2. `EXPO_PUBLIC_ECS_OBSERVABILITY_TELEMETRY_ENABLED=true`.
3. `EXPO_PUBLIC_ECS_OBSERVABILITY_PRIVACY_APPROVED=true`.
4. Explicit persisted user consent through the observability telemetry consent API.

Both flags default to false when absent or malformed. Manual field reports may bypass automatic-telemetry consent because the user explicitly submits them, but they still require configured transport and privacy approval. Unsuitable events remain in the bounded local queue.

The `issue-intelligence` edge function now requires an authenticated session, accepts at most 20 events per request, sanitizes again server-side, and returns safe error codes rather than raw database errors. The service-role key remains server-only.

## Support Snapshot

`captureECSSupportSnapshot` builds an on-demand, local-only snapshot containing:

- startup phase and transition count
- outstanding jobs and aggregate subscription count
- bounded cache and queue sizes
- last successful refresh timestamps
- logger counters, recent redacted events, and bounded breadcrumbs
- the explainable telemetry-gate state

`formatECSSupportSnapshotJson` is the export boundary for an approved support surface. It does not upload, share, or write a file by itself. Route geometry, exact positions, auth payloads, provider responses, and telemetry frames are excluded or redacted.

## Initial Migration

This first tranche covers startup stalls, Supabase configuration, issue intelligence, tab/widget/Command Center boundaries, weather refresh, route/expedition/vehicle-display lifecycle, BLE diagnostics, realtime subscriptions, and offline replay.

The repository-wide inventory at task start found 1,117 direct console calls across 213 runtime files. This tranche is intentionally bounded. Highest-value follow-up order:

1. Offline persistence engines and remaining sync queue storage paths.
2. EcoFlow and other power-provider adapters.
3. AI assistant/provider clients.
4. Navigate, Dashboard, Explore, and Dispatch mega-screen diagnostics.
5. Legacy stores and import/export helpers.

## Release Evidence

Code-level tests do not establish field privacy or production telemetry approval. Release still requires:

- Android and iOS device inspection of production logs and support exports
- deployment verification for the updated edge function
- owner-approved retention/deletion policy for `ecs_issue_events`
- privacy approval and explicit consent UX before automatic upload is enabled
- abuse/rate-limit review and an owner decision on table RLS versus service-edge-only access
- provider and hardware failure testing without raw payload capture

