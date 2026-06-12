# Convoy Stale Threshold Native Long-Wait QA

Date: 2026-06-12
Branch: `codex/convoy-stale-threshold-native-long-wait`
Backend: Supabase `ppullxxprgyeoakzqnxi`
Raw evidence folder: `.qa/convoy-stale-threshold-native-long-wait/`
Patched rerun evidence folder: `.qa/convoy-stale-threshold-native-long-wait-patched-rerun/`

## Devices

- Device A: Samsung SM-X230, Android 16, serial `R5GL13VYSRY`
- Device B: Samsung SM-S948U, Android 16, serial `R3GL302P1YE`

Both devices were connected over ADB, unlocked, awake, debuggable `versionCode=4`, and passed `/dev/convoy-identity-qa` with distinct authenticated QA identities.

## Native Run Summary

- Device A created `Trail Convoy`.
- Device A generated a one-time `MEMBER` invite.
- Device B joined through the intended invite flow.
- Device A saw Device B as `MEMBER`; Device B saw Device A as `LEAD`.
- Both devices started live sharing through the Dispatch control.
- T0 showed `2 active`, `0 stale`, `RPT 2/2`, and `Tracking: sharing live location`.
- Sharing was then stopped through the confirmation dialog on both devices so last-known rows could age naturally.

## Checkpoints

| Checkpoint | Mounted Dispatch Result | Refresh/Restart Result |
| --- | --- | --- |
| 5+ minutes | Still `2 active`, `0 stale`, `RPT 2/2` | `SYNC DISPATCH` still showed `2 active`, `0 stale` |
| 10+ minutes | Still `2 active`, `0 stale`, `RPT 2/2` | `SYNC DISPATCH` still showed `2 active`, `0 stale` |
| 15+ minutes | Still `2 active`, `0 stale`, `RPT 2/2` | `SYNC DISPATCH` still showed `2 active`, `0 stale` |
| 15+ minutes after force-stop/relaunch | Not applicable | Recomputed to `0 active`, `2 stale`, `RPT 0/2` |

## Findings

- The stale threshold itself works after a fresh app launch/refetch: both devices recomputed stale correctly after restart.
- Mounted Dispatch did not age the existing tracking snapshot over elapsed time.
- `SYNC DISPATCH` did not refresh the Convoy tracking snapshot age during the run.
- After restart, the row counts were stale-correct, but the panel copy still said `Live convoy telemetry is active.` while reporting `0 active`, `2 stale`.

## Fix Applied

- `stores/convoyTrackingStore.ts` now exposes a time-only stale recompute for existing location rows.
- `components/dispatch/DispatchConvoyCommandPanel.tsx` recomputes staleness every 30 seconds while an active convoy is visible.
- Dispatch now labels telemetry as live only when at least one member is fresh/reporting.

## Cleanup

- Device A ended the convoy through the normal `END CONVOY` flow.
- Device B left through the normal `LEAVE CONVOY` flow.
- Both devices returned to clean `/dev/convoy-identity-qa` baselines with no active convoy, no participant id, and live sharing inactive.

## Status

The first native long-wait run found and fixed the stale-display lifecycle blocker. The patched rerun below closes the native stale-threshold caveat.

## Patched Rerun - 2026-06-12

- Both devices reloaded the patched dev-client bundle from Metro on `codex/convoy-stale-threshold-native-long-wait`.
- Device A and Device B were debuggable `versionCode=4`, unlocked, awake, and connected to backend `ppullxxprgyeoakzqnxi`.
- `/dev/convoy-identity-qa` passed on both devices with distinct authenticated QA identities, clean baselines, setup complete, configured vehicles, no active convoy, no active participant, and live sharing inactive.
- Device A created `Trail Convoy`, generated a one-time `MEMBER` invite, and Device B joined through the intended UI.
- Device A saw Device B as `MEMBER`; Device B saw Device A as `LEAD`; no unrelated/global users appeared.
- Both devices started live sharing through Dispatch. T0 showed `Tracking: sharing live location`, `RPT 2/2`, and live telemetry copy on both devices.
- Both devices then stopped sharing through the confirmation dialog, leaving the Dispatch panels mounted for the long-wait test.

### Patched Rerun Checkpoints

| Checkpoint | Device A Mounted Dispatch | Device B Mounted Dispatch |
| --- | --- | --- |
| T0 live | `Tracking: sharing live location`, `RPT 2/2`, live telemetry copy | `Tracking: sharing live location`, `RPT 2/2`, live telemetry copy |
| 5+ minutes | `Tracking: disabled`, `RPT 2/2`, still below full stale transition | `Tracking: disabled`, `RPT 2/2`, still below full stale transition |
| 10+ minutes | `Tracking: disabled`, `RPT 2/2`, still below full stale transition | `Tracking: disabled`, `RPT 2/2`, still below full stale transition |
| 15+ minutes | `Tracking: disabled`, `RPT 0/2`, no live telemetry copy | `Tracking: disabled`, `RPT 0/2`, no live telemetry copy |
| Restart after threshold | `RPT 0/2`, non-live roster copy remained correct | `RPT 0/2`, non-live roster copy remained correct |

Post-threshold Convoy Command roster views showed both participants last updated about 17 minutes ago with `stopped` status. The mounted Dispatch panel transitioned without restart, and the restart/refetch path remained consistent.

### Patched Rerun Cleanup

- Device A ended the convoy through the normal `END CONVOY` flow.
- Device B reconciled to no active convoy through `SYNC DISPATCH`.
- Both devices returned to clean `/dev/convoy-identity-qa` baselines with no active convoy, no participant id, and live sharing inactive.
- No badge unlock or telemetry mutation was observed.
- Final logcat scan showed no app fatal/redbox pattern; Device B contained unrelated Android AppOps noise.

### Patched Rerun Status

Closed: the mounted Dispatch stale recompute fix passed native two-device long-wait QA. The 15-minute stale transition now occurs without app restart, and stale participants no longer show as live telemetry.
