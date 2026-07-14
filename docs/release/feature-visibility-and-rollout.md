# ECS Feature Visibility And Rollout

## Purpose

`lib/features/featureVisibilityRegistry.ts` is the authoritative policy model
for whether an ECS feature is visible, reachable, degraded, unavailable, or
eligible to claim production approval. Domain stores and deterministic engines
still own operational behavior; the registry owns presentation and entry
eligibility.

The registry does not make a feature production-ready. Implementation
availability and production approval are separate fields.

## Required Definition

Every centrally governed feature declares:

- stable feature ID, owner domain, user-facing label, and maturity;
- default rollout state and allowed environments;
- account, backend, provider, native hardware, permission, and feature
  dependencies;
- privacy approvals and production evidence requirements;
- offline support and explicit degraded behavior;
- kill switch, unavailable copy, route policy, and related readiness gate.

Definitions must pass `validateECSFeatureRegistry()`. Duplicate IDs/routes,
unknown dependencies, missing environments, missing copy, and invalid degraded
contracts fail closed.

## Decision Semantics

- **Available** means the feature may be used at its declared maturity.
- **Degraded** means only the declared cached, local, manual, or read-only
  behavior is available.
- **Unavailable** means the UI must hide the entry point or route to the shared
  capability explanation surface.
- **Production approved** is true only for production-maturity features whose
  required evidence and privacy approvals are present in the evaluation
  context.

A beta or restricted-field-test feature may be intentionally visible without
being production approved. The capability matrix must preserve that distinction.

## Fail-Closed Rules

- Missing runtime environment or registry configuration is unavailable.
- Malformed enable flags or kill switches are unavailable.
- Development controls are unavailable in production regardless of flags.
- A force-enabled sensitive feature remains unavailable until privacy and
  evidence requirements are accepted.
- Required account, backend, provider, hardware, permission, or feature
  dependencies cannot be inferred from absence.
- Routes with blocked policy redirect to `feature-unavailable`; routes with an
  intentional degraded/read-only policy remain reachable with degraded state.

## Adapters And Migration

`CommandDock`, shell route/deep-link resolution, Explore planning features, and
development QA routes consume the central resolver directly. Existing Dispatch,
Fleet, CampOps, device, and provider rollout modules remain compatibility
adapters during incremental migration. New UI code must not read rollout
environment variables directly.

## Capability Report

Run:

```text
npm run gate:production-visibility
```

The command writes `.smoke/production-visibility-report.json` using schema
`ecs.production-visibility.v1`. The report contains field names and decision
states only; it excludes environment values, provider credentials, tokens, and
raw evidence payloads.

The gate proves that visibility controls are enforced. It does not approve
providers, hardware, privacy posture, field behavior, or a public release.
Those decisions remain with each feature's related readiness gate and owner
evidence process.
