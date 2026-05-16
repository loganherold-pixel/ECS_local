# ECS Dispatch Release Notes

Last updated: 2026-04-24

## Feature Summary

Dispatch introduces an operational coordination surface for Expedition Command System. It is designed for expedition leads, team members, operators, QA, and support staff to coordinate team status, structured pings, active queue items, assist requests, escalations, linked context, offline delivery state, and timeline review.

Dispatch is scoped to the active Expedition Channel and uses adapter boundaries for persistence, realtime sync, offline replay, notifications, permissions, linked context, and timeline/log behavior.

## User-Facing Changes

- New Dispatch command-center surface.
- Team roster with readiness/status indicators.
- Structured Team Ping composer.
- Dispatch Queue for active coordination items.
- Assist Request flow for support/recovery needs.
- Emergency Ping handling for ECS team coordination only.
- Offline, queued, failed, retrying, and recovered delivery states.
- Linked context previews for expedition, pins, waypoints, routes, resources, vehicle, power, and manual notes.
- Compact timeline of meaningful Dispatch events.
- Permission-aware disabled states and privacy protections.
- Dev-only Dispatch diagnostics panel in development/debug context.

## Team Ping Overview

Team Ping supports structured messages to:

- an individual member
- all team
- a role/group target where supported

Ping types include:

- Check-In
- Rally
- Assist
- Route
- Resource
- Hazard
- Emergency
- General

Pings can require acknowledgment, carry priority, include linked context, and create related queue/timeline state when action is required.

## Dispatch Queue Overview

Dispatch Queue tracks operational work such as:

- check-ins awaiting response
- assist requests
- hazard confirmations
- route checks
- resource checks
- assignments
- stale/offline concerns
- escalations

Queue sorting prioritizes critical, escalated, pending-response, and high-priority work. Resolved items are retained for review rather than deleted.

## Assist Request Overview

Assist Request provides a structured flow for support needs, including:

- Vehicle
- Medical
- Navigation
- Fuel
- Water
- Mechanical
- Comms
- Recovery
- General Support

Assist Request can create a ping, queue item, and timeline event.

**Safety note:** Assist Request is ECS team coordination only. It does not contact emergency services, SMS, email, phone, or external rescue services.

## Offline And Recovered Behavior

Dispatch displays delivery reliability clearly:

- **Live**: delivery/sync appears available.
- **Queued**: action is staged locally for later delivery.
- **Sending/Retrying**: delivery is in progress.
- **Failed**: delivery failed and may need retry.
- **Recovered**: a queued or failed action succeeded after reconnect.
- **Stale/Offline Risk**: a member or delivery path may not be current.
- **Cancelled**: queued local delivery was cancelled before delivery.

Offline replay is rollout-controlled and uses Dispatch adapters rather than direct UI writes.

## Permission Behavior

Dispatch actions are permission-aware. Permissions affect:

- viewing Dispatch
- viewing roster
- viewing member location/contact details
- sending individual/team/role pings
- sending emergency pings
- creating assist requests
- assigning/reassigning members
- resolving/escalating/cancelling queue items
- viewing/modifying timeline or audit history

Unauthorized actions are blocked before writes occur and should show clear disabled or denied copy.

## Safety Notes

- Emergency Ping is ECS team coordination only.
- Emergency Ping does not contact emergency services.
- Assist Request is ECS team coordination only.
- External communication is not triggered unless separately implemented, verified, and enabled.
- Member location and contact details remain privacy restricted.
- Notifications are rollout-gated and disabled by default until notification policy is verified.

## Known Limitations

- Dispatch Phase 3 persistence is local-first through `dispatchPersistenceAdapter`.
- Dedicated backend Dispatch tables are not present in the checked Supabase migrations.
- The referenced `dispatch-feed` edge function is not present/deployed in this checkout.
- Standalone assist request, acknowledgment, queued offline action, and notification tables are not present.
- Expedition log integration is rollout-gated and disabled by default.
- Notifications are rollout-gated and disabled by default.
- Some product event names are represented as status transitions rather than literal timeline event types.

## Future Roadmap

Future work should remain adapter-based and may include:

- dedicated backend Dispatch tables with RLS and idempotency constraints
- live persisted acknowledgments
- standalone assist request records
- persistent notification dedupe
- richer expedition log integration
- verified notification delivery
- more role/group routing
- deeper map/pin/waypoint navigation actions
- safe scheduled check-in automation
- production support diagnostics and export tools

Future external communication must be explicitly designed, implemented, verified, and permission-gated.
