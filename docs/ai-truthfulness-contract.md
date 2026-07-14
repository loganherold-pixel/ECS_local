# ECS AI Truthfulness Contract

Last updated: 2026-07-13

## Authority Boundary

AI is an optional explanation, synthesis, or proposal layer. Deterministic ECS domain logic remains authoritative for safety, status, legality, access, passability, weather facts, route viability, CampOps decisions, vehicle readiness, resource margins, convoy state, incident state, escalation, and allowed actions.

AI may:

- explain an existing deterministic result;
- summarize cited source facts and explicit limitations;
- synthesize compatible, normalized evidence without blending conflicts away;
- propose an unverified route idea for human inspection.

AI must not:

- invent facts, coordinates, provider observations, or availability;
- change deterministic status, confidence, escalation, warnings, or actions;
- call data live or current without a qualifying source;
- make unsupported legal, access, passability, weather, fire, or safety claims;
- choose a camp, recovery method, route, or other safety-critical action;
- publish, transmit, acknowledge, or mutate operational state;
- present a route idea as verified or guidance-ready.

## Canonical Runtime Boundary

`lib/ai/aiPolicyBoundary.ts` owns the policy registry, rollout decision, redaction, deterministic fingerprints, source snapshots, output policy checks, and route-proposal designation.

`lib/ai/aiRequestCoordinator.ts` owns:

- fail-closed execution;
- exact-fingerprint single flight and accepted-output caching;
- timeout and cancellation;
- at most two configured retries;
- bounded cache retention;
- schema/policy rejection;
- aggregate diagnostics without prompts or source payloads.

Provider-backed features must call this coordinator. A prompt warning alone is not an enforcement boundary.

## Deterministic Context

Every provider request must include a typed deterministic snapshot with:

- policy and snapshot identity;
- deterministic status and confidence;
- source origin, freshness, availability, coverage, authority, and conflict state;
- missing, stale, and hard-warning markers;
- a fingerprint of each cited value rather than sensitive raw diagnostics;
- the exact actions already selected by deterministic ECS logic.

Provider context is minimized and recursively redacted. Exact locations, private object IDs, names, contact data, credentials, tokens, and instruction-like community/provider text must not cross the provider boundary. Redaction must not mutate the source object.

The complete deterministic fingerprint is process-salted and retained locally for single-flight/cache identity and traceability. Providers receive a separate fingerprint derived only from redacted context; raw-value fingerprints and snapshot IDs are redacted from provider payloads.

## Output Acceptance

Output is accepted only when its schema and feature policy both pass. ECS rejects output that changes status or escalation, raises confidence above its sources, alters cited evidence, omits deterministic warnings, selects a new action, changes its trace, includes exact coordinates or credentials, echoes prompt injection, or asserts unsupported live, weather, legal, or access facts.

An expired live source with a usable last-good cache must retain both facts. Recent manual or cached data is never relabeled live.

Accepted output is attached to the deterministic snapshot and complete input fingerprint. The model cannot author or replace this trace.

## Fallback Semantics

AI unavailable is distinct from deterministic intelligence unavailable.

- Disabled, offline, timed-out, cancelled, rejected, and failed provider requests return deterministic ECS content where available.
- Provider failure never clears or changes deterministic state.
- Route ideas remain `proposal`, `unverified`, `requiresInspection: true`, and `mayStartGuidance: false`.
- Unknown deterministic data remains unknown.

Legacy debrief provider shapes currently include model-authored grades, risk scores, readiness scores, and optimization actions without a deterministic projection to compare against. Those outputs fail closed, and untraced cached/server AI blobs are not reattached to AARs. Deterministic debriefs and trend aggregates remain available while a separately reviewed deterministic scoring adapter is still absent.

## Rollout

The canonical rollout feature is `ai_assist` in `lib/features/featureVisibilityRegistry.ts`.

- Maturity: `internal`
- Default: disabled
- Enable flag: `EXPO_PUBLIC_ECS_AI_ASSIST`
- Account requirement: admin
- Offline support: none
- Privacy approval: `ai_assist_model_output_approval`
- Production evidence: `ai_assist_real_model_execution_evidence`
- Readiness gate: `npm run gate:ai-assist`

Missing or malformed rollout context fails closed. Public production enablement remains blocked until the exact model/configuration has privacy approval, reviewed real-output evidence, provider controls, and device/field verification.

## Diagnostics

Diagnostics record feature ID, status, attempts, latency bucket, suppression count, token bucket, and cost bucket. They do not record prompts, source payloads, exact locations, user identity, credentials, or raw provider output. Detailed logging is development-only.

## Adoption Checklist

New provider-backed AI code must:

1. Register an existing or new feature policy.
2. Build a typed deterministic snapshot and redacted context.
3. Use a complete deterministic input fingerprint.
4. Execute through `ecsAIRequestCoordinator` with cancellation and timeout.
5. Schema-validate and policy-validate output.
6. Return deterministic fallback copy without changing domain state.
7. Add adversarial truthfulness tests, not only prompt-string tests.
8. Remain disabled until the feature visibility decision allows execution.

## Automated Evidence

- `npm run test:ai-truthfulness-contract`
- `npm run test:expedition-intelligence-layer`
- `npm run test:expedition-assessment-narrative`
- `node ./scripts/test-campops-ai-assist.js`
- `npm run test:ai-assist-gate`
- `npm run gate:ai-assist`

Real model behavior, provider data handling, Android/iOS behavior, and field safety cannot be established by these fixture tests.
