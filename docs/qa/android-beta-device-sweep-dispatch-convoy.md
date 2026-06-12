# Android Beta Device Sweep - Dispatch Convoy Copy

Date: 2026-06-12
Branch: `codex/android-beta-device-sweep-dispatch-convoy`
Raw evidence folder: `.qa/android-beta-device-sweep-dispatch-convoy/`

## Device Coverage

- Samsung SM-X230, Android 16, serial `R5GL13VYSRY`.
- Samsung SM-S948U was not connected over ADB during this sweep.

The SM-X230 was unlocked, awake, debuggable `versionCode=4`, connected to Metro, and signed in as the intended QA Leader identity on backend `ppullxxprgyeoakzqnxi`.

## Results

- Native launch passed. No redbox or app fatal logcat pattern was observed.
- Bottom dock sweep passed for Fleet, Navigate, center Dashboard, Explore, and Dispatch.
- Clean baseline passed through `/dev/convoy-identity-qa`: no active convoy, no participant id, live sharing inactive, setup complete, configured vehicle present, and preflight ready.
- No-active Dispatch copy passed: top Dispatch did not show active convoy, Convoy panel showed `No Active Convoy`, `Tracking: disabled`, `RPT 0/0`, and no roster/global users.
- Active convoy / tracking disabled initially exposed a remaining copy blocker: the valid active convoy card still showed stale lifecycle copy from the sharing state.
- A narrow copy-only fix suppressed lifecycle stop messages from `lastError` while an active convoy roster is visible.
- Active convoy / tracking disabled passed after reload: top Dispatch showed `ACTIVE CONVOY ROSTER`, `Trail Convoy`, `1 member`, and the Convoy panel showed `Tracking disabled. Active convoy roster is available.` without stale stopped/ended copy.
- Active convoy / live sharing passed: Dispatch showed `Live convoy location sharing is active.`, `Tracking: sharing live location`, `Stop`, and `RPT 1/1`.
- Post-end cleanup passed: ending the convoy returned Dispatch to `No Active Convoy`, `Tracking: disabled`, `RPT 0/0`, and the lifecycle ended copy appeared only in the no-active state.
- Final diagnostic passed: no active convoy, no participant id, live sharing inactive, clean Convoy baseline.

## Stale Roster Coverage

This short beta sweep did not rerun the full 15-minute stale wait. Stale/all-non-live behavior is covered by the completed patched native long-wait run in `docs/qa/convoy-stale-threshold-native-long-wait.md`.

## Product Safety

- No badge unlock notification or badge/title mutation was observed.
- No telemetry/provider mutation was observed.
- No Fleet, Active Trip, Offline Packet, route catalog, Mopeka, or Bluestack flow was touched during this sweep.
- Convoy membership was cleaned up through the normal leader `END CONVOY` flow.

## Status

Passed on the available Android beta device after the copy-only blocker fix. Broader Android beta device sweep should include the SM-S948U or another second Android device when available.
