# ECS Shell And Routing Contract

## Purpose

ECS uses one file-based Expo Router stack and five primary CommandDock areas:

`Fleet | Navigate | Dashboard | Explore | Dispatch`

`lib/routeManifest.ts` is the authoritative metadata registry. Route files remain the implementation boundary; the registry determines ownership, access, restoration, safe return, deep-link behavior, and dock state.

## Route Metadata

Every registered route declares:

- route pattern
- parent primary surface and dock selection
- authentication and setup requirements
- feature requirement
- offline support
- restoration eligibility
- safe return route
- deep-link policy
- title and accessibility label
- primary/detail/modal presentation
- eager or lazy load strategy

Dynamic patterns such as `/expedition-channel/join/[code]` are matched by segment. Query parameters do not affect ownership or policy decisions and are preserved through an allowed deep-link handoff.

## Access Decisions

`lib/navigation/ecsRoutePolicy.ts` combines route metadata with the existing authoritative feature registry. It returns a deterministic decision with an allowed target, read-only/degraded state, reason, safe return, and whether an auth/setup interruption should preserve intent.

- Public routes do not require shell identity.
- Shell routes support authenticated, remembered-offline, or explicit guest-offline access where the existing AuthGate permits it.
- Authenticated routes reject guest access and preserve a valid deep-link intent through sign-in.
- Dashboard and vehicle-bound detail routes fail to Fleet when no configured vehicle exists.
- Navigate, Explore, Dispatch, Fleet, Trip Builder, and Offline Prep retain their intentional pre-setup safety/local usefulness.
- Routes with `offlineSupport: none` fail to their safe return while offline.
- Missing, disabled, malformed, or killed feature routes cannot be reached through a deep link.
- Unknown routes fail to the context-appropriate shell fallback.

## Startup And Restoration

`lib/navigation/ecsShellRouteState.ts` preserves the existing `ecs_shell_state` namespace and `last_shell_route_v1` key. Nested routes persist their eligible parent primary route. Legacy values are normalized on read.

Deep-link intent is stored separately as `pending_intended_route_v1` for at most 24 hours. It is cleared when reached, invalid, expired, future-dated, or denied for a non-recoverable reason. Authentication and setup interruptions may retain it.

Restoration evaluates the stored route against current authentication, setup, vehicle, offline, and feature state before rendering. Fallback order is Dashboard, Fleet, Navigate, Explore, then Dispatch, with each candidate evaluated through the same policy.

Orientation does not participate in route identity or restoration. Phone/landscape changes therefore retain the same route; only layout components react to dimensions.

## Navigation Actions

`lib/navigation/ecsNavigationCoordinator.ts` owns one navigation action at a time. Repeated actions to the same destination are duplicates, competing destinations are busy, path settlement releases the action, and an abandoned lock expires after 1.5 seconds.

`useECSNavigation` applies that coordinator to push, replace, navigate, back, and explicit return actions. AuthGate, CommandDock, Explore planning/handoffs, Dispatch map-context handoffs, Navigate return-to-Dispatch, Trip Builder, Offline Prep, and routed detail back controls use this boundary.

## Return Rules

- Dispatch context to Navigate carries a validated `/alert` or `/expedition-dispatch` return.
- Explore preview to Navigate uses router history and the Explore-owned source flow.
- Trip Builder returns to `/discover`.
- Offline Prep returns to the originating Trip Builder plan when one exists; otherwise it returns to Explore.
- Detail routes use `returnTo` only when it resolves to a registered route, then fall back to their metadata safe return.
- Auth and setup completion resume a valid intended route but do not restore unrelated stale history after a normal login.

## Back And Modal Behavior

Detail and modal routes use the root modal presentation where registered. Visible detail back controls use `useECSNavigation.back()`: normal history is preferred, while a deep-linked/no-history route replaces to the registered safe return. Android hardware back uses the same fallback when Expo Router has no prior route. Screen-local sheets and dialogs retain first opportunity to dismiss themselves.

## Loading

Primary shell and authentication entry routes are eager metadata entries. Detail, modal, hardware, planning, Expedition, and development routes are lazy entries. Expo Router's file-based route boundaries provide the actual code splitting; the registry does not import screen implementations and therefore does not break restoration.

## Rollback

The route registry is additive around existing file routes and retains the legacy route-manifest exports. Older builds continue reading `last_shell_route_v1` and ignore `pending_intended_route_v1`. Rolling back removes centralized gating and single-flight behavior but does not require deleting user data.
