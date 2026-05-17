# ECS Dispatch Roadmap

Last updated: 2026-04-24

## Scope Note

This document describes future Dispatch opportunities. These items are **not current launch scope** unless another product spec or implementation task explicitly promotes them.

Current launch behavior is documented separately in:

- `docs/dispatch/PRODUCT_SPEC.md`
- `docs/dispatch/USER_GUIDE.md`
- `docs/dispatch/RELEASE_NOTES.md`

Future work must preserve Dispatch safety rules:

- Assist Request is ECS team coordination only.
- Emergency Ping does not contact emergency services.
- External communication must not be added unless explicitly designed, approved, implemented, verified, and permission-gated.
- Member location and contact details must remain privacy protected.
- Backend writes should continue through Dispatch adapters, not UI components.

## 1. Near-Term Improvements

### Saved Ping Templates

Allow operators to save and reuse common Team Ping messages such as check-ins, rally instructions, hazard confirmations, and resource checks.

Safety/privacy notes:

- Templates should not store private contact details.
- Emergency templates must keep ECS-only safety copy.

### Richer Role/Group Routing

Expand routing beyond owner/member/viewer into operational roles such as Navigator, Driver, Scout, Mechanic, Medic, Comms, Recovery, Camp Lead, and Supply Lead.

Safety/privacy notes:

- Do not invent a separate group system if an ECS team/role system exists.
- Group sends must respect permissions and recipient availability.

### Improved Empty And Error States

Refine copy for no active expedition, roster unavailable, sync unavailable, no queue items, no timeline events, and permission-restricted states.

### Dispatch Demo Scenario Selector

Add a safe developer/QA-only way to load deterministic demo scenarios from `lib/dispatchDemoScenarios.ts`.

Safety/privacy notes:

- Demo scenarios must remain local-only.
- Demo actions must not trigger notifications or external communication.

### Field Diagnostics Export

Add an operator/support export for aggregate Dispatch diagnostics: counts, delivery states, realtime status, feature flags, and adapter status.

Safety/privacy notes:

- Exports must omit member coordinates and contact details unless explicitly permitted.
- Avoid raw technical IDs in support-facing exports when labels exist.

## 2. Medium-Term Expansions

### Advanced Automated Check-Ins

Support configurable check-in cadences, stale-member prompts, waypoint-based reminders, and check-in response follow-up.

Safety/privacy notes:

- Avoid unmanaged background loops.
- Timers must be bounded, cancellable, and rollout-controlled.
- Emergency responses should escalate inside ECS only.

### Geofence-Triggered Check-Ins

Trigger check-in suggestions when the team enters/leaves a geofence, reaches a waypoint, or approaches a route decision point.

Safety/privacy notes:

- Requires location permission and privacy review.
- Must not expose member location to unauthorized users.

### Team Response Reliability Metrics

Track response timeliness, acknowledgment completion, stale-member patterns, and failed delivery recovery rates.

Safety/privacy notes:

- Metrics should be aggregate and operational.
- Avoid exposing sensitive individual behavior unless permissions and product policy allow it.

### Dispatch Replay Mode

Allow operators to review Dispatch activity chronologically after an expedition: pings, queue transitions, assist requests, escalations, acknowledgments, and context.

Safety/privacy notes:

- Replay should use privacy-safe timeline/log data.
- Sensitive linked context should obey permissions.

### After-Action Report Generation

Generate a Dispatch section for expedition after-action reports, including queue resolution, assist events, hazards, resource checks, and unresolved items.

Safety/privacy notes:

- Reports should avoid raw IDs and restricted location/contact data.
- Emergency/assist wording must remain ECS team coordination only.

## 3. Advanced Operational Intelligence

### Commander Dashboard

Create a higher-level Dispatch overview for expedition leads: team readiness, open critical items, stale members, route/resource alerts, and escalation pressure.

Safety/privacy notes:

- Dashboard visibility must respect role permissions.
- It should not expose private member details to viewers.

### Team Availability Forecasting

Estimate likely availability based on status, last seen time, assignments, response history, and offline risk.

Safety/privacy notes:

- Keep the model deterministic and explainable.
- Do not use hidden location/contact data.
- Do not auto-assign without explicit user action.

### Smart Rally Point Suggestions

Suggest rally points based on existing pins, waypoints, route context, risk state, vehicle/resource status, and connectivity conditions.

Safety/privacy notes:

- Suggestions must explain their reasoning.
- Location-sensitive inputs must be permission checked.

### Resource Depletion Triggers

Suggest resource checks or queue items when fuel, water, or power forecasts cross thresholds.

Safety/privacy notes:

- Trigger suggestions first; avoid automatic team broadcast without confirmation.
- Keep power/vehicle telemetry access scoped to existing ECS permissions.

### Multi-Expedition Dispatch Overview

Give operators a summary across active or recent expeditions: open queue counts, stale channels, failed deliveries, and unresolved escalations.

Safety/privacy notes:

- Requires careful expedition scoping and role enforcement.
- Do not leak data between expeditions.

## 4. Integrations

### Backend Dispatch Tables

Add dedicated backend persistence for Dispatch pings, queue items, assignments, assist requests, acknowledgments, timeline events, offline actions, and notification dedupe.

Safety/privacy notes:

- Use migrations with RLS.
- Preserve idempotency keys and version/update metadata.
- Do not remove local fallback until migration and replay behavior are verified.

### Expedition Log Deep Integration

Persist Dispatch audit events into the expedition log with dedupe and privacy-safe descriptions.

Safety/privacy notes:

- Avoid duplicate log entries from optimistic updates and realtime echoes.
- Do not log sensitive coordinates/contact details unless policy allows it.

### Map-Based Assignment Drawing

Allow operators to draw or select a map area, route segment, pin cluster, or waypoint path and create assignment context from it.

Safety/privacy notes:

- Map context must remain permission-gated.
- Avoid exposing member location to unauthorized users.

### Vehicle Convoy Coordination

Connect Dispatch to convoy state: lead/tail vehicle status, spacing, relay points, scout requests, recovery needs, and route blockers.

Safety/privacy notes:

- Vehicle telemetry must use existing ECS telemetry permissions.
- Do not expose vehicle/member location without permission.

### Optional External Communication Integrations

Potential future integrations could include verified push, SMS, email, satellite messenger, or emergency-contact workflows.

Safety/privacy notes:

- These are not currently implemented.
- They require explicit design, approval, infrastructure, permissions, audit logs, opt-in settings, notification dedupe, and safety copy.
- Emergency services must never be implied unless a verified emergency-service integration exists and is enabled.

## 5. Nice-To-Have Polish

### Ping Composer Quality Improvements

Add richer templates, last-used recipient memory, smarter defaults, and compact preview before submit.

### Queue Views And Filters

Add saved queue filters for critical, stale, route, resource, assist, resolved, and mine/team views.

### Timeline Readability

Add grouping by phase/time, compact event chips, and better linked-context summaries.

### Operator Training Mode

Add a demo-only training mode that walks leads and members through Team Ping, Assist Request, Queue, and acknowledgment workflows.

Safety/privacy notes:

- Training mode must not send live notifications.
- Training mode must be clearly marked demo-only.

### Accessibility Pass

Continue improving touch targets, readable labels, contrast, and non-icon-only critical actions.

### Support Playbooks

Create support macros for queued delivery, failed retry, permissions, emergency-language confusion, and data-preservation rollback.

## Roadmap Graduation Checklist

Before moving any roadmap item into active implementation:

- Confirm it is not already implemented.
- Define product scope and acceptance criteria.
- Identify adapter changes before UI changes.
- Confirm permission and privacy implications.
- Confirm offline/realtime/idempotency behavior.
- Confirm notification policy, if relevant.
- Add or update docs.
- Add helper/scenario tests where practical.
- Verify rollback flags or safe-disable behavior.
