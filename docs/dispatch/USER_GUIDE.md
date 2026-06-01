# ECS Dispatch User Guide

Last updated: 2026-04-24

## What Dispatch Is

Dispatch is the ECS coordination surface for an expedition. It helps the team see who is available, send structured Team Pings, track active queue items, request assistance, follow escalations, and keep an operational timeline.

Dispatch is not a general chat room. It is meant for clear field coordination: status, assignments, hazards, resources, routes, check-ins, and support requests.

## Expedition Channel

The Expedition Channel is the active coordination context for the current expedition. When Dispatch says "Expedition Channel," it means the pings, queue items, roster state, linked context, and timeline are scoped to the active expedition.

If there is no live expedition context available, Dispatch may show local/demo fallback data or solo mode depending on the app state.

## Team Roster

The Team Roster shows expedition members and their current readiness state.

Typical roster details include:

- display name or call sign
- role
- status
- connection state
- last update
- current assignment
- linked context, when available

Roster statuses help operators quickly understand who is reachable, stale, offline, or needing a check-in. Member location and contact details are restricted unless permissions allow them.

## Sending A Team Ping

Use Team Ping when you need a structured response or update from one member, a role/group, or the whole team.

Common ways to open the composer:

- New Team Ping action
- Request Check-In action
- Ping action on a team member
- Ping/follow-up action on a queue item
- Context-specific ping action from a linked pin, waypoint, route, resource, vehicle, or power item

The composer asks for:

- recipient
- ping type
- priority
- message
- optional linked context
- acknowledgment requirement
- escalation timer placeholder

Empty required fields cannot be submitted.

## Ping Types

Use these ping types for consistent team communication:

- **Check-In**: ask a member or team to confirm status.
- **Rally**: direct members toward a rally point.
- **Assist**: ask for support or recovery help.
- **Route**: request route condition, blockage, scout, or ETA information.
- **Resource**: request fuel, water, power, or supply status.
- **Hazard**: confirm, report, or broadcast a hazard.
- **Emergency**: urgent ECS team coordination.
- **General**: normal Dispatch update.

Critical or emergency pings are visually prioritized and may create escalation state inside Dispatch.

## Acknowledgments

Some pings require acknowledgment. When acknowledgment is required, Dispatch tracks who has responded and who is still pending.

For check-ins, a member may respond with options such as:

- OK
- Delayed
- Need assistance
- At waypoint
- Returning
- Unavailable
- Emergency

Responses update the ping state, queue progress, member status where appropriate, and the Dispatch timeline.

## Assist Requests

Use Assist Request when someone needs structured support.

Assist request types include:

- Vehicle
- Medical
- Navigation
- Fuel
- Water
- Mechanical
- Comms
- Recovery
- General Support

An Assist Request can create a Dispatch ping, queue item, and timeline event. It can be routed to a member, group, or team depending on permissions.

**Safety note:** Assist Request is ECS team coordination only. It does not contact emergency services, SMS, email, phone, or outside rescue services.

## Emergency Ping Safety

Emergency Ping is for urgent coordination inside ECS.

**Emergency Ping does not contact emergency services.** It does not call 911, dispatch rescue, send SMS, send email, or place a phone call unless a future external communication system is specifically implemented, verified, and enabled.

Use Emergency Ping to alert the expedition team and escalate inside ECS only.

## Dispatch Queue

The Dispatch Queue tracks active operational items such as:

- pings requiring response
- assist requests
- route checks
- resource checks
- hazard confirmations
- assignments
- stale/offline concerns
- escalations

Queue items show priority, status, assigned members, linked context, delivery state, and suggested next action. Critical and escalated items sort toward the top.

Resolved queue items are retained for review instead of being deleted.

## Assigning And Resolving Queue Items

Permitted users can assign a queue item to a member or group. Assignment creates visible queue state and can add a timeline event.

Permitted users can also:

- mark an item in progress
- resolve an item
- escalate an item
- retry failed delivery
- cancel queued local delivery when safe

Unauthorized users see disabled states or permission messages instead of performing restricted actions.

## Escalation

Escalation is used when a ping, assist request, check-in, or queue item needs more attention.

Escalation states include:

- monitor
- follow up
- escalate to lead
- broadcast to team
- emergency unresolved
- resolved or recovered

Dispatch may suggest escalation for stale members, critical pending items, failed delivery, blocked queue items, or missed acknowledgment windows. Automatic escalation remains conservative and rollout-controlled.

Escalation remains ECS team coordination only.

## Offline, Queued, Failed, And Recovered

Dispatch is designed to show delivery reliability clearly.

- **Live**: ECS believes Dispatch can deliver or sync normally.
- **Queued**: the action is staged locally and waiting for delivery.
- **Sending**: the action is being retried or sent.
- **Failed**: delivery failed and may need retry.
- **Retrying**: ECS is attempting delivery again.
- **Recovered**: a previously queued or failed action succeeded after reconnect.
- **Stale / Offline Risk**: a member or delivery path may not be fresh.
- **Cancelled**: a queued local action was cancelled before delivery.

Queued or failed states are not necessarily app failures. They usually mean Dispatch is protecting the action until connectivity or sync becomes available.

## Linked Context

Linked context connects a Dispatch item to expedition information.

Examples:

- expedition
- pin
- waypoint
- route segment
- resource
- vehicle
- power
- manual note

Linked context helps answer "what is this action about?" without requiring long messages. It can appear on pings, queue items, assist requests, and timeline events.

Location-sensitive context is permission controlled.

## Permissions

Dispatch actions depend on role, expedition state, and safety rules.

Common permission-controlled actions include:

- send team-wide ping
- send emergency ping
- create assist request
- assign or reassign members
- resolve queue items
- escalate queue items
- view member location
- view contact details
- modify timeline/log entries

If an action is not allowed, Dispatch should show a disabled state or a message such as:

> You do not have permission for this dispatch action.

Solo mode is treated as local-only Dispatch behavior and generally allows the solo operator to use the local coordination tools.

## Solo Mode

Solo mode appears when Dispatch has only the current operator or no live team roster.

In solo mode:

- the roster may show one operator
- Team Ping can still be used for local coordination workflows
- queue and timeline can still track local operational tasks
- no external team communication is implied

Solo mode is useful for testing, planning, and personal expedition tracking.

## Common Troubleshooting

### I do not see the team roster

Check whether there is an active expedition and whether live roster loading is enabled. If live data is unavailable, Dispatch may use solo mode or demo/mock fallback.

### A button is disabled

The action may be blocked by permissions, rollout flags, expedition state, or safety rules. Read the disabled copy shown in the UI.

### A ping says Queued

Queued means Dispatch staged the action locally and is waiting for sync or connectivity. It should not be treated as delivered yet.

### A ping or queue item says Failed

Failed means delivery did not complete. If retry is available, use Retry. Retry should reuse the same Dispatch record instead of creating a duplicate.

### A recovered item appears

Recovered means a queued or failed Dispatch action succeeded after reconnect.

### I do not see notifications

Dispatch notifications are rollout-controlled and may be disabled until notification policy is verified. Demo/mock actions should not trigger live notifications.

### Emergency Ping did not contact emergency services

That is expected. Emergency Ping is ECS team coordination only and does not contact emergency services.

### I cannot see a member location or contact details

Location and contact details are privacy protected. Your role may not have permission to view them.

## QA Notes

QA testers can use deterministic demo scenarios from `lib/dispatchDemoScenarios.ts`. Demo scenarios are local-only and should not trigger live notifications or external communication.

Developer diagnostics may appear in development builds when the diagnostics rollout flag is enabled. Diagnostics show aggregate state only and intentionally omit sensitive member location/contact details.
