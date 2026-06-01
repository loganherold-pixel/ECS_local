# ECS Dispatch Demo Scenarios

Last updated: 2026-04-24

## Purpose

Dispatch demo scenarios provide deterministic local seed data for product review, QA, and development. They are defined in `lib/dispatchDemoScenarios.ts` and reuse the existing Dispatch mock-data conventions from `lib/dispatchMockData.ts`.

These scenarios are **demo-only**:

- They do not create real notifications.
- They do not contact external services.
- They do not contact emergency services.
- They do not use real user data.
- They preserve the existing Dispatch mock fallback.

Assist Request and Emergency Ping demo records are ECS team coordination only.

## How To Use

Import demo scenarios from:

```ts
import {
  getDispatchDemoScenario,
  listDispatchDemoScenarios,
  DISPATCH_DEMO_SCENARIO_IDS,
} from '../lib/dispatchDemoScenarios';
```

Each scenario returns:

- `contexts`
- `teamMembers`
- `pings`
- `queueItems`
- `assignments`
- `timelineEvents`

The object also includes safety flags:

- `demoOnly: true`
- `notificationSafe: true`
- `externalCommunication: false`

Example:

```ts
const scenario = getDispatchDemoScenario('queued_offline_ping');

// Use scenario.pings, scenario.queueItems, and scenario.timelineEvents
// as local-only seed data for Dispatch QA.
```

Do not wire these records to live notification, SMS, email, phone, or emergency-service behavior.

## Scenario Catalog

| Scenario ID | Purpose | Primary QA Focus |
| --- | --- | --- |
| `solo_expedition` | One local operator with no team roster | Solo mode, empty pings/queue/assignments, local timeline |
| `team_all_online` | Five demo members active and recently seen | Roster rendering, healthy delivery states, metrics without offline risk |
| `team_one_offline` | Default team with Tail offline | Offline/stale status, offline risk labels, queued delivery state |
| `pending_check_in` | Manual check-in awaiting one response | Required acknowledgment, awaiting-response metrics, follow-up escalation state |
| `hazard_broadcast` | Critical hazard tied to a map pin | Hazard context, critical priority, escalation display |
| `assist_request` | Tail vehicle comms gap support flow | Assist request queue/timeline behavior, ECS-only safety language |
| `emergency_ping` | Critical emergency ping demo | Emergency visual treatment, acknowledgment requirement, no external services |
| `resource_check` | Fuel, water, and power status requests | Resource/power linked context and queue grouping |
| `route_check` | North Spur Connector scout workflow | Route segment context, assignment display, scout workflow |
| `queued_offline_ping` | Ping queued while connectivity is unavailable | Queued delivery state, offline replay readiness |
| `failed_delivery` | Failed ping and queue update | Retry UI, failed delivery copy, duplicate-prevention expectations |
| `recovered_after_reconnect` | Previously queued ping recovered after reconnect | Recovered delivery state and timeline messaging |
| `escalated_queue_item` | Critical queue item escalated to team broadcast | Escalation ladder, intel strip escalation counts |
| `resolved_queue_item` | Resolved queue item retained for review | Resolved state, history retention, sorted terminal items |
| `permission_restricted_member` | Viewer/restricted member with hidden location | Permission-disabled UI, location/contact privacy |

## Data Contract Notes

The demo scenarios use the same TypeScript entities documented in `docs/dispatch/DATA_CONTRACT.md`:

- `DispatchTeamMember`
- `DispatchPing`
- `DispatchQueueItem`
- `DispatchAssignment`
- `DispatchTimelineEvent`
- `DispatchLinkedContext`

Standalone assist request, acknowledgment, offline action, and notification rows are not introduced by this demo seed file. Those concepts remain represented through existing Dispatch pings, queue items, timeline events, and delivery states unless the live schema adds dedicated tables later.

## Safety Notes

Emergency and assist scenarios intentionally include safety copy:

- `ECS team coordination only.`
- No emergency services are contacted.
- No external messaging is triggered.

Notification tests should use adapter mocks or policy checks. These seeds should not be treated as authorization to send push notifications or external communication.
