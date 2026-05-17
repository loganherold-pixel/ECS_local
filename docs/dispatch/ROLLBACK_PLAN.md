# ECS Dispatch Rollback Plan

Last updated: 2026-04-24

## Purpose

This plan explains how to safely reduce, pause, or hide Dispatch launch behavior without destructive cleanup.

Rollback should use Dispatch rollout flags and adapter boundaries. Do not delete local data, remove migrations, reset user storage, or remove expedition records as a first response.

## Feature Flags To Disable

Dispatch rollout controls live in:

- `lib/dispatchRolloutConfig.ts`

Available flags:

- `dispatchTabVisibility`
- `liveTeamRoster`
- `teamPing`
- `dispatchQueue`
- `assistRequest`
- `emergencyPing`
- `realtimeSync`
- `offlineReplay`
- `notifications`
- `developerDiagnostics`
- `smartSuggestions`
- `automatedCheckIns`
- `escalationAutomation`
- `mapContextIntegration`
- `expeditionLogIntegration`

Recommended rollback order:

1. Disable `notifications`.
2. Disable `realtimeSync`.
3. Disable `offlineReplay`.
4. Disable high-risk interaction flags such as `teamPing`, `assistRequest`, and `emergencyPing`.
5. If the whole surface must be hidden, disable `dispatchTabVisibility`.

## Disable Notifications

Set:

```ts
notifications: false
```

Expected behavior:

- Dispatch should stop surfacing notification policy outcomes.
- Demo/mock actions should remain notification-safe.
- No SMS, email, phone, push provider, or emergency services should be triggered.

Verification:

- Create or receive a Dispatch event in dev/test.
- Confirm no notification toast/push behavior occurs from Dispatch notification policy.
- Confirm Dispatch UI still renders local state.

## Disable Realtime Dispatch Sync

Set:

```ts
realtimeSync: false
```

Expected behavior:

- Dispatch realtime session should not subscribe.
- Local Dispatch state should continue to work.
- Incoming remote Dispatch broadcast events should not mutate the screen.

Verification:

- Open Dispatch in development.
- Confirm diagnostics or UI show realtime disabled.
- Confirm local pings/queue actions do not crash when realtime publish returns unavailable.

## Disable Offline Replay

Set:

```ts
offlineReplay: false
```

Expected behavior:

- Dispatch should continue displaying queued/failed local states.
- Automatic replay should pause.
- Queued local data should remain preserved.

Verification:

- Create or load a queued/failed Dispatch record in dev/test.
- Confirm it remains visible.
- Confirm no replay attempt is made while the flag is disabled.

## Hide Or Disable Team Ping

Set:

```ts
teamPing: false
```

Optional for emergency-specific rollback:

```ts
emergencyPing: false
```

Expected behavior:

- Team Ping composer/actions should be disabled or show rollout-paused copy.
- Existing pings should remain visible if other surfaces still show them.
- No ping data should be deleted.

Verification:

- Open Dispatch.
- Confirm New Team Ping is disabled/paused.
- Confirm existing queue/timeline data remains available.

## Disable Assist Request

Set:

```ts
assistRequest: false
```

Expected behavior:

- Assist Request action should be disabled or show rollout-paused copy.
- Existing assist-related queue/timeline records should remain visible.
- Emergency/assist safety copy remains accurate.

Verification:

- Open Dispatch.
- Confirm Assist Request cannot be submitted.
- Confirm existing assist queue items are not deleted.

## Hide Dispatch Entirely

Set:

```ts
dispatchTabVisibility: false
```

Expected behavior:

- Dispatch surface should show rollout-paused copy or be hidden depending on route configuration.
- Local Dispatch data should remain intact.
- Other ECS tabs/routes should continue functioning.

Verification:

- Launch app.
- Confirm Dispatch is not available or shows paused state.
- Confirm dashboard, map/navigation, expedition log, route manager, and sync/offline systems still open.

## Preserve Existing Expedition Data

Do not delete:

- expedition records
- expedition timeline/log entries
- local Dispatch persistence snapshots
- roster/member records
- queue/ping/timeline records
- Supabase auth/operator data
- migration files
- demo/mock data files

Dispatch local persistence is stored through `dispatchPersistenceAdapter` using the `ecs_dispatch_persistence` key-value file. Preserve it unless a user explicitly requests data removal and the product team approves the data impact.

## What Not To Delete

Do not remove or reset these as part of rollback:

- `lib/dispatchTypes.ts`
- `lib/dispatchPersistenceAdapter.ts`
- `lib/dispatchIntegrity.ts`
- `lib/dispatchRolloutConfig.ts`
- `components/dispatch/*`
- `docs/dispatch/*`
- Supabase migrations
- expedition state or timeline storage
- user auth/session storage
- local/offline queues

Rollback should be reversible.

## Support And Debug Steps

1. Capture the current Dispatch rollout config.
2. Check whether the issue is UI-only, realtime, offline replay, notification, permission, or persistence related.
3. Use the dev-only Dispatch diagnostics panel in development builds if available.
4. Check aggregate counts: pings, queue items, awaiting acknowledgments, escalations, queued offline actions, failed deliveries.
5. Check realtime subscription state and last realtime event timestamp.
6. Check last offline replay timestamp.
7. Confirm notifications are disabled if notification spam is suspected.
8. Confirm permissions are blocking restricted actions before writes occur.
9. Use deterministic demo scenarios from `lib/dispatchDemoScenarios.ts` to reproduce safely.
10. Avoid clearing local data unless the issue is confirmed to be corrupted local state and removal is approved.

## Verification After Rollback

After changing flags, verify:

- App starts normally.
- Dispatch hidden/paused state behaves as expected.
- Disabled actions cannot submit.
- Existing Dispatch data is still present when the feature is re-enabled.
- Notifications do not fire when disabled.
- Realtime Dispatch sync does not subscribe when disabled.
- Offline replay does not run when disabled.
- Existing map/navigation remains functional.
- Existing expedition log/live log remains functional.
- Existing route manager remains functional.
- Existing sync/offline system remains functional.
- No emergency services, SMS, email, or phone behavior is triggered.

## Re-Enable Plan

Re-enable conservatively:

1. `dispatchTabVisibility`
2. `dispatchQueue`
3. `teamPing`
4. `assistRequest`
5. `emergencyPing`
6. `mapContextIntegration`
7. `offlineReplay`
8. `realtimeSync`
9. `notifications` only after policy verification
10. `expeditionLogIntegration` only after log dedupe verification

Run TypeScript, Dispatch helper/scenario tests, and a manual Dispatch smoke after re-enabling behavior.
