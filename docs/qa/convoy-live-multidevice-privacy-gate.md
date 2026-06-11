# Convoy Live Multi-Device Privacy Gate

Status: preparation / QA validation lane only.

Raw evidence location for future native runs: `.qa/convoy-live-multidevice-privacy-gate/`

Do not store raw screenshots, UI dumps, logcat, invite codes, precise coordinates, account ids, or device identifiers in git. Commit only concise summaries that redact sensitive values.

## Purpose

This gate validates live Convoy Command multi-device privacy before closed beta. It does not add product features, expand telemetry trust, create chat/social/community behavior, or certify hardware telemetry.

Connection presence is not live telemetry. hardware connection presence must not affect convoy live status.

## Live/Multi-Device Architecture Summary

Participants join through the Convoy credentials flow at `app/convoy-command.tsx`.

- A signed-in leader creates a convoy through `convoyMembershipService.createConvoy`.
- The leader creates a short-lived invite through the Supabase Edge Function action `create_invite`.
- The raw invite code is shown once. The backend stores only an HMAC hash.
- Device B joins through `joinConvoyWithInvite`, which redeems the invite and creates/reactivates a row in `convoy_members`.
- Joining adds the user to the roster only. Live location sharing is separate and starts from Convoy Command.

Convoy scope is represented by:

- `convoyId`: primary convoy boundary for roster, realtime channel, location rows, invite records, and active local context.
- `memberId`: current participant membership row, required for publishing location.
- `teamId`: not a first-class live convoy tracking key in the current implementation.
- `tripId`: not a first-class live convoy tracking key in the current implementation.
- Active context cache: `ecs_convoy_membership_state`, keyed to the current `convoyId`, `memberId`, role, callsign, and optional read-only title snapshot.

Live location is published by `lib/convoy/convoyLocationPublisher.ts`.

- The publisher requests foreground location permission only.
- The publisher does not define background tasks.
- Every publish validates the current user, active convoy membership, convoy status, and member id before writing.
- Published rows go to `convoy_member_locations` with `convoy_id`, `member_id`, coordinates, motion hints, movement status, and timestamps.
- Location writes are scoped to the current active member through database RLS and the publisher validation path.

Live/stale/disconnected/unknown/demo state is computed by:

- `lib/convoy/convoyCommandV15Readiness.ts`
- `lib/convoy/convoyParticipantModel.ts`
- `lib/convoy/convoyTrackingThresholds.ts`
- `lib/convoy/convoyRealtimeService.ts`

Realtime and stored data flow:

- Initial roster and location fetches are filtered by `convoy_id`.
- Supabase realtime subscribes to `convoy_member_locations` with `filter: convoy_id=eq.${convoyId}`.
- The local tracking store retains only the current subscribed convoy snapshot in memory.
- Last-known locations remain convoy-scoped and are not global user discovery.
- Leave/end flows clear active local context and stop local sharing.

Backend/realtime data sent:

- Convoy membership operations call the `convoy-membership` Edge Function.
- Location publishing writes only the current member location row for the active convoy.
- Realtime emits location row changes only on the active convoy channel.
- Demo/test fixtures do not call Supabase realtime, publish location, or create membership.

Leave and stop-sharing behavior:

- Stop sharing removes the foreground location subscription and marks local sharing disabled.
- Leaving a convoy revokes only the current user's active membership and deletes only that member's location row.
- Ending a convoy is leader-only, revokes active memberships/invites, deletes convoy location rows, and clears local sharing for the leader.
- Auth loss stops sharing locally.
- Revoked membership or ended convoy stops sharing locally on the next publish validation.

## Privacy/Scoping Contract

`convoyId` is the hard visibility boundary. A participant is visible only when they belong to the active convoy scope.

participant identity scope:

- Participant identity comes from `convoy_members`, not global user discovery.
- Callsign remains the primary tactical identifier.
- Optional `display_name` and `expedition_badge_title` are snapshots scoped to membership display.
- Unknown participant identity must not receive a title, marker identity, or fake display metadata.

Location visibility rules:

- Precise participant location is visible only to active members of the same convoy.
- Location rows must not be shown outside the active convoy scope.
- Invalid coordinates are discarded before marker rendering.
- no global user discovery.
- No global users appear.

Stale last-known visibility rules:

- stale last-known location remains visible only inside the active convoy scope.
- Stale location must be labeled stale/last-known and must not appear live.
- Stale or disconnected rows must not expose precise location outside the convoy.
- Retention cleanup is service-owned; mobile clients do not run retention cleanup.

Invite authority:

- Production invites must be active, unexpired, unrevoked, non-demo, and created by the convoy leader.
- Localhost, demo invite, mock invite, or fixture invite data is not production authority.
- Raw invite codes must not be logged or persisted after the one-time display/share moment.

Join authority:

- Joining requires a signed-in user and a valid invite.
- Joining creates/reactivates a convoy membership row.
- Joining does not start live location sharing.

Leader/member permissions:

- Leaders can create/revoke invites, revoke other members, and end the convoy.
- Members can join and leave.
- Convoy role labels are functional labels only; they do not imply certification, rescue capability, medical qualification, law enforcement, or real-world command authority.

Stop-sharing behavior:

- Stop sharing disables foreground tracking and stops publishing.
- Permission denied, auth loss, revoked membership, or ended convoy must stop or prevent live publishing.
- Permission denied must not show live.
- App restart with cached sharing state but no active watcher must show disabled/non-live state.

Demo/test fixture isolation:

- The existing participant fixture route is dev/test only.
- Fixture rows are marked fixture-only and non-production.
- Demo/mock participants never become production live.
- Demo invite or demo membership cannot become production membership.
- Fixtures must not publish location, create membership, call Supabase realtime, mutate badges, mutate Active Trip, mutate Offline Packet, mutate Fleet, or touch telemetry provider state.

badge title display scope:

- Badge title display is read-only.
- Titles render only for scoped, known, trusted convoy participants.
- Unknown/demo/mock/unscoped participant does not receive title.
- Title remains separate from role/status/vehicle.
- Badge title display does not unlock badges.
- Convoy role/presence/location does not unlock badges.
- Title does not imply real-world authority or credentials.

Telemetry exclusion rules:

- OBD2, EcoFlow, Mopeka, Bluestack, and hardware connection state do not affect convoy participant live status.
- Telemetry is not used to prove convoy presence.
- Connection-only devices are not live telemetry.
- No telemetry provider state leaks into participant location/privacy scope.

## Status Rules

Thresholds:

- Production live threshold: `CONVOY_COMMAND_V15_LIVE_LOCATION_MAX_AGE_MS` = 5 minutes.
- Realtime staleness helper thresholds:
  - fresh under 5 minutes
  - watch after 10 minutes
  - stale after 15 minutes

Status behavior:

- `live`: fresh, valid, scoped location from an active participant with a confirmed live source.
- `stale`: last known location exists but is older than the live threshold, has no timestamp, or comes from a non-live source.
- `disconnected`: participant is known but signal/location is unavailable or participant is offline.
- `unknown`: no usable participant/location state exists.
- `demo`: mock/demo/fixture participant data; never production live.

## Multi-Device QA Harness Decision

No new live multi-device harness is added in this pass.

Reason: creating a fake two-device live convoy harness would risk fabricating production-live behavior. Existing dev/test fixtures are still useful for row/status/title rendering, but live multi-device privacy must be verified with two real signed-in devices/accounts or a controlled Supabase QA environment.

Existing fixture support:

- `planning-offline-sync:///dev/convoy-participant-qa`
- Covers live-looking fixture, stale, disconnected, unknown, missing coordinates, demo, mock, and role variants.
- The fixture is non-production and does not create membership or publish location.

## Manual Native Two-Device QA Checklist

Evidence:

- Store raw evidence under `.qa/convoy-live-multidevice-privacy-gate/`.
- Capture concise summary only in docs/qa if needed.
- Redact raw invite codes, user ids, precise coordinates, screenshots with account identifiers, and logs containing tokens.

One-device no-active-convoy state:

- Launch app on Device A.
- Open Dispatch / Convoy Command.
- Confirm no-active-convoy state is honest.
- Confirm no fake participants, no global users, and no live tracking simulation.

Two-device create/join:

- Device A signs in as leader.
- Device A creates convoy.
- Device A generates short-lived invite.
- Device B signs in as separate user.
- Device B joins with intended invite credentials.
- Device A sees B only after join.
- Device B sees A only after join.
- Confirm roster is scoped to the same `convoyId`.
- Confirm Device C or unrelated account does not appear.

Location allowed:

- Device A starts live sharing with foreground location allowed.
- Device B starts live sharing with foreground location allowed.
- Confirm participant location updates appear only inside the convoy.
- Confirm live appears only after fresh scoped location exists.
- Confirm role/status/vehicle line remains separate from badge title.

location denied:

- Deny location on Device B before sharing.
- Confirm Device B cannot publish live location.
- Confirm Device A does not see B as live from permission-denied state.
- Confirm UI says permission denied/unavailable instead of live/safe.

stop sharing:

- Device B taps Stop sharing.
- Confirm Device B local state changes to disabled.
- Confirm Device A no longer receives fresh B updates.
- Confirm B becomes stale/disconnected according to thresholds, not live.

stale threshold:

- Leave Device B sharing stopped or offline beyond live threshold.
- Confirm stale threshold behavior.
- Confirm stale last-known remains scoped to the convoy.
- Confirm stale copy does not read live/verified/safe.

Disconnected participant:

- Force-stop Device B or revoke location permission after sharing.
- Confirm Device A shows disconnected/stale/unknown as appropriate.
- Confirm no crash.

leave convoy:

- Device B leaves convoy.
- Confirm B active context clears.
- Confirm B location row is deleted or hidden.
- Confirm Device A roster no longer shows B as active.
- Confirm saved trips, Active Trip, Offline Packet, Fleet, Badge, and telemetry are untouched.

App restart:

- Force-stop and relaunch both devices.
- Confirm active convoy context restores only where expected.
- Confirm cached sharing without an active watcher is disabled/non-live.
- Confirm stale last-known remains scoped and labeled.

Badge title scoping:

- Confirm a trusted scoped participant title renders if available.
- Confirm unknown/demo/mock/unscoped participants show no title.
- Confirm title does not replace role/status/vehicle.
- Confirm no badge unlock notification or earned state change occurs from convoy viewing, role, presence, or location.

No telemetry influence:

- With hardware connected or absent, confirm OBD2/EcoFlow/Mopeka/Bluestack state does not change convoy live status.
- Confirm connection-only devices are not used to prove participant presence.
- Confirm hardware telemetry remains classified through the hardware telemetry field qualification lane only.

## Known Limitations

- This branch does not certify real two-device native behavior by itself.
- Supabase RLS and Edge Function behavior still require a deployed QA backend run.
- Background location is intentionally not enabled in this gate.
- `teamId` and `tripId` are not canonical live convoy scope keys yet.
- Hardware telemetry remains excluded from convoy live status.

## 2026-06-10 Android Native QA Attempt

Raw evidence folder: `.qa/convoy-live-multidevice-native/`

Device availability:

- Primary device: Samsung SM-X230, Android 16.
- Secondary device: not available over ADB during this run.
- Result: true live two-device create/join/location/stale/leave privacy QA is blocked until a second Android device or controlled emulator/account is available.

Single-device native evidence:

- App activity focused and keyguard was not active.
- `am start -W` returned a timeout status, but the ECS UI rendered, remained interactive, and captured screenshots/UI dumps successfully.
- No app fatal/redbox pattern was found in captured launch, tab, Dispatch, Convoy Command, or roster log evidence. `AndroidRuntime` lines in these logs were from `uiautomator` helper invocations, not app crash traces.
- Bottom tabs opened through ADB taps: Fleet, Navigate, Dashboard, Explore, Dispatch.
- Dispatch baseline showed `NO ACTIVE TEAM`, `Team channel not configured`, and `No active team`.
- Convoy Command opened read-only without crash and displayed privacy copy: live location is shared only with active convoy members and tracking can be turned off.
- A persisted local `Trail Convoy` record was present on the primary device, so this was not a clean no-convoy install.
- Roster remained scoped to the active local convoy and showed only `LEAD / YOU` with `No location yet / unknown`; no global users appeared.
- No badge/expedition title leakage was observed in the roster evidence.
- No production membership creation, invite generation, revoke action, location publish, telemetry action, or badge unlock action was initiated during this QA pass.

Blocked live scenarios:

- Device A create convoy with Device B join.
- Device A/B mutual participant visibility after join.
- Fresh live location across devices.
- Permission denied/revoked status propagation across devices.
- Stop sharing across devices.
- Stale threshold across devices.
- Leave/end convoy cross-device cleanup.
- Restart recovery across devices.
- Hardware telemetry isolation under an active two-device convoy.

Automated verification run:

- `npm run test:convoy-live-multidevice-privacy-gate` - pass
- `npm run test:convoy-command-v1-5-foundation` - pass
- `npm run test:convoy-command-v1-5-readiness` - pass
- `npm run test:convoy-participant-fixture-qa` - pass
- `npm run test:convoy-badge-title-display` - pass
- `npm run test:convoy-command` - pass
- `npm run test:convoy-command-map-component` - pass
- `npm run test:convoy-privacy-safety` - pass
- `npm run test:badge-expedition-identity-mvp` - pass
- `npm run test:hardware-telemetry-field-qualification` - pass
- `npm run lint` - pass
- `npm run smoke -- --json` - pass
- `git diff --check` - pass

Closed-beta gate result:

- Single-device native launch/navigation/Dispatch/Convoy roster evidence plus automated privacy guards passed.
- Closed-beta live convoy readiness is not cleared until a real two-device privacy/scoping run passes against the intended QA backend/accounts.

## Ready To Run

Live multi-device native QA is ready to run after:

- Two signed-in QA accounts/devices are available.
- Convoy Supabase migrations and Edge Function are deployed.
- Realtime is enabled for `convoy_member_locations`.
- Raw evidence folder is prepared under `.qa/convoy-live-multidevice-privacy-gate/`.

## 2026-06-10 True Two-Device Android Native QA Attempt

Raw evidence folder: `.qa/convoy-two-device-live-privacy/`

Devices:

- Device A: Samsung SM-X230, Android 16.
- Device B: Samsung SM-S948U, Android 16.

Backend/session setup:

- Both devices ran the ECS Android dev-client path through Metro with `adb reverse tcp:8081 tcp:8081`.
- Expo loaded the repo `.env` public Supabase and Mapbox configuration during verification commands.
- The exact backend project label and QA account split were not independently confirmed from the UI.
- Both devices had persisted app state before the run, so this was not a clean account/device baseline.

Native launch/navigation evidence:

- Device A launched after an initial splash-screen delay and then rendered the ECS Dashboard.
- Device B launched cleanly into the ECS Dashboard.
- No app redbox or app fatal crash pattern was found in captured launch, tab, Dispatch, Convoy Command, or roster evidence. `AndroidRuntime` lines observed in logs were from ADB/uiautomator helper processes, not ECS app crash traces.
- Bottom tabs opened on both devices through ADB taps: Fleet, Navigate, Dashboard, Explore, Dispatch.
- Dispatch opened on both devices and Convoy Command opened read-only on both devices.

Clean baseline result:

- Failed / blocked.
- Device A already had multiple persisted `Trail Convoy` records. The read-only roster showed `LEAD / YOU` with `No location yet / unknown`.
- Device B already had multiple persisted `Trail Convoy` records marked `ACTIVE / LEAD`.
- Because both devices were already carrying active/local Convoy state, the run could not truthfully verify "no active convoy", "Device A creates convoy", or "Device B joins only after invite" from a clean baseline.

Read-only privacy evidence gathered before stopping:

- Convoy Command displayed private convoy access copy on both devices.
- Device A roster stayed inside the active convoy context and did not show global users.
- Device B showed persisted active leader convoy records only; no unrelated global user list was observed in the inspected roster screen.
- No badge/expedition title leakage was observed in the inspected screens.
- No location sharing was started.
- No invite was generated.
- No convoy was created or joined during this run.
- No revoke/delete action was tapped.
- No telemetry or hardware path was touched.

Blocked live scenarios:

- Device A creates a new clean convoy.
- Device B joins Device A through an intended invite/credential.
- Device A sees Device B only after join.
- Device B sees Device A only after join.
- Fresh scoped live updates across devices.
- Permission denied/revoked propagation across devices.
- Stop sharing across devices.
- Stale threshold across devices.
- Leave/end convoy cross-device cleanup.
- Restart recovery for a newly-created shared convoy.
- Live telemetry isolation during an active shared convoy.

Cleanup status:

- No new production/backend convoy state was created by this QA pass.
- No new location publish, invite generation, badge unlock, telemetry mutation, Fleet mutation, Active Trip mutation, or Offline Packet mutation was initiated.
- Existing persisted convoy state was not reset because no safe universal cleanup path was visible from the clean baseline screen, and destructive app-data/backend cleanup was not approved for this pass.

Automated verification run:

- `npm run test:convoy-live-multidevice-privacy-gate` - pass
- `npm run test:convoy-command-v1-5-foundation` - pass
- `npm run test:convoy-command-v1-5-readiness` - pass
- `npm run test:convoy-participant-fixture-qa` - pass
- `npm run test:convoy-badge-title-display` - pass
- `npm run test:convoy-command` - pass
- `npm run test:convoy-command-map-component` - pass
- `npm run test:convoy-privacy-safety` - pass
- `npm run test:badge-expedition-identity-mvp` - pass
- `npm run lint` - pass
- `npm run smoke -- --json` - pass
- `git diff --check` - pass

Closed-beta gate result:

- Not cleared.
- The branch passes automated privacy/scoping guards and two-device native launch/navigation/Convoy-read-only evidence.
- True live two-device privacy/scoping remains blocked until both devices/accounts/backend are reset to a clean Convoy baseline or an approved admin cleanup path is available.

## 2026-06-10 Two-Device Live Privacy QA Rerun After Reset

Raw evidence folder: `.qa/convoy-two-device-live-privacy-rerun-after-reset/`

Devices:

- Device A: Samsung SM-X230, Android 16.
- Device B: Samsung SM-S948U, Android 16 target, but ADB authorization was not available during this rerun.

Backend/session setup:

- Branch: `codex/convoy-live-multidevice-privacy-gate`.
- Device A was visible over ADB as an authorized device.
- Device B appeared as `unauthorized`, so app launch, clean baseline confirmation, create/join, and location-sharing verification could not be run on the second device.
- Backend environment, QA account/session split, and backend cleanup completion could not be independently verified from the blocked native run.

Clean baseline result:

- Blocked before baseline verification.
- Device B must be unlocked and the Android USB debugging authorization prompt must be accepted before the true two-device run can start.
- Because Device B was unauthorized, this pass did not verify no active convoy, no active team, tracking disabled, no stale roster, no pending invite/join state, no global users, no badge/title leakage, or no location publishing on both devices.

Native QA scenarios not run because of the precondition blocker:

- Device A creates a convoy from a clean baseline.
- Device B joins through intended invite credentials.
- Cross-device participant visibility and same-convoy scoping.
- Fresh live location updates.
- Location denied/revoked propagation.
- Stop sharing propagation.
- Stale threshold behavior.
- Leave/end convoy cleanup.
- Restart recovery.
- Telemetry isolation during live convoy.

Automated verification run:

- `npm run test:convoy-live-multidevice-privacy-gate` - pass
- `npm run test:convoy-command-v1-5-foundation` - pass
- `npm run test:convoy-command-v1-5-readiness` - pass
- `npm run test:convoy-participant-fixture-qa` - pass
- `npm run test:convoy-badge-title-display` - pass
- `npm run test:convoy-command` - pass
- `npm run test:convoy-command-map-component` - pass
- `npm run test:convoy-privacy-safety` - pass
- `npm run test:badge-expedition-identity-mvp` - pass
- `npm run lint` - pass
- `npm run smoke -- --json` - pass
- `git diff --check` - pass

Closed-beta gate result:

- Not cleared.
- Automated privacy/scoping guards pass, but true two-device live privacy QA remains blocked until Device B is authorized over ADB and both devices can be inspected from a confirmed clean baseline.

## 2026-06-10 Two-Device Live Privacy QA Rerun After Reset, Authorized Devices

Raw evidence folder: `.qa/convoy-two-device-live-privacy-rerun-after-reset-authorized/`

Devices:

- Device A: Samsung SM-X230, Android 16.
- Device B: Samsung SM-S948U, Android 16.
- Both devices were visible over ADB as authorized devices and were awake/unlocked for the run.

Backend/session setup:

- Branch: `codex/convoy-live-multidevice-privacy-gate`.
- Both devices used the ECS Android dev-client path with Metro and `adb reverse tcp:8081 tcp:8081`.
- The intended QA backend was used through the app environment loaded by the dev-client path. Raw backend identifiers, account ids, and invite credentials are intentionally not recorded in this git-tracked summary.
- The clean local/backend baseline appeared effective at the start of the run, but the two-device account/session split was not valid: both devices resolved to the same visible leader identity after Device B joined.

Clean baseline result:

- Passed on both devices.
- Device A and Device B both showed `No active convoys yet.` and `No invite records visible.` on Convoy Command.
- Roster on both devices showed no active convoy, no active members, member view, no global users, no visible badge/title leakage, and no location publishing.

Device A create/invite result:

- Device A created `Trail Convoy` successfully.
- Device A saw only the expected leader/self roster state after creation.
- Device A generated an invite through the intended UI. Raw invite code evidence is stored only in the ignored local evidence folder and is not included here.
- Location sharing remained off; no publish was started.

Device B join result:

- Blocked as a valid two-participant privacy run.
- An initial malformed invite entry was rejected with invalid-code copy, which was expected for the entered malformed value.
- After entering the intended invite code, Device B joined successfully, but it displayed the same leader/self identity and leader controls rather than a distinct member participant.
- Device A still showed only its own leader/self roster after Device B joined.
- No unrelated global users appeared, but the run cannot validate participant visibility, cross-device scoping, live status propagation, or member privacy because Device B was not a distinct QA account/session.

Participant visibility and privacy result:

- Baseline visibility was clean on both devices.
- Device A after create showed only the expected self participant.
- Device B join did not create a distinct visible participant due to same-account/session behavior.
- No global users were observed.
- No production location sharing was started.
- No precise stale location was exposed outside convoy context.

Badge title and badge isolation result:

- No badge/title leakage was observed at baseline.
- No convoy-driven badge unlock was observed.
- Title behavior across distinct real identities was not validated because the session split was invalid.

Telemetry isolation result:

- Hardware telemetry paths were not touched during this QA pass.
- No OBD2/EcoFlow/Mopeka/Bluestack state was used as convoy presence.
- Live telemetry isolation under an active two-participant convoy remains not run because the valid participant split was blocked.

Native QA scenarios not run after the session-split blocker:

- Fresh live updates between two distinct participants.
- Location denied/revoked status propagation.
- Stop sharing propagation.
- Stale threshold behavior.
- Member leave/end behavior from a true member account.
- Restart recovery for a true two-participant convoy.
- Telemetry isolation during a true two-participant live convoy.

Cleanup result:

- Passed.
- Device A revoked the active invite and ended the convoy.
- Final Convoy Command state on both devices returned to `No active convoys yet.` and `No invite records visible.`
- Final roster state on both devices returned to no active convoy, member view, and no active members.
- No location sharing was started, no telemetry state was changed, and no badge unlock was observed.

Automated verification run:

- `npm run test:convoy-live-multidevice-privacy-gate` - pass
- `npm run test:convoy-command-v1-5-foundation` - pass
- `npm run test:convoy-command-v1-5-readiness` - pass
- `npm run test:convoy-participant-fixture-qa` - pass
- `npm run test:convoy-badge-title-display` - pass
- `npm run test:convoy-command` - pass
- `npm run test:convoy-command-map-component` - pass
- `npm run test:convoy-privacy-safety` - pass
- `npm run test:badge-expedition-identity-mvp` - pass
- `npm run lint` - pass
- `npm run smoke -- --json` - pass
- `git diff --check` - pass

Closed-beta gate result:

- Not cleared.
- This rerun proves the reset baseline, create/invite path, invalid invite rejection, cleanup path, and automated guards, but it does not prove true two-device live privacy.
- Rerun true live Convoy privacy only after Device B is signed into a separate QA account, or after an explicitly approved safe session split is confirmed before creating/joining the convoy.

## 2026-06-10 Two-Device Live Privacy QA Rerun With Account Separation

Raw evidence folder: `.qa/convoy-two-device-live-privacy-account-separated/`

Devices:

- Device A: Samsung SM-X230, Android 16.
- Device B: Samsung SM-S948U, Android 16.
- Both devices were visible over ADB, awake, unlocked, and focused on the ECS app.

Backend/session setup:

- Branch: `codex/convoy-live-multidevice-privacy-gate`.
- Both devices used the installed ECS Android app package `com.expeditioncommand.planningofflinesync`.
- The target branch did not contain the optional `test:convoy-qa-account-session-separation` script/helper, so the documented/manual account-separation procedure was used instead.
- Raw user ids, tokens, invite codes, and account credentials are intentionally not recorded in this git-tracked summary.

Account separation preflight result:

- Blocked before Convoy creation.
- Device A authenticated user id was present and recorded only in redacted form in ignored local evidence.
- Device B authenticated user id was not present/readable from the app's persisted Supabase auth state.
- Because Device B did not have a confirmed authenticated QA Member identity, the hard-stop precondition failed.
- No convoy was created, no invite was generated, no join was attempted, and no location sharing was started.

Clean baseline result:

- Not run after the account preflight blocker.
- Because Device B did not expose an authenticated user id, this pass could not truthfully validate no active convoy, no active team, no stale active roster, no pending invite/join state, no badge/title leakage, or no location publishing under distinct QA identities.

Native QA scenarios not run because of the preflight blocker:

- Device A creates convoy.
- Device A generates invite.
- Device B joins as a distinct participant.
- Cross-device participant visibility and participant id comparison.
- Fresh live updates.
- Location denied/revoked propagation.
- Stop sharing propagation.
- Stale threshold behavior.
- Leave/end convoy behavior.
- Restart recovery.
- Telemetry isolation during active live convoy.

Cleanup result:

- No cleanup action was required because no Convoy action was initiated.
- No production/backend convoy state, invite, location publish, badge state, telemetry state, Fleet state, Active Trip state, or Offline Packet state was intentionally mutated during this pass.

Automated verification run:

- `npm run test:convoy-qa-account-session-separation` - missing on this branch
- `npm run test:convoy-live-multidevice-privacy-gate` - pass
- `npm run test:convoy-command-v1-5-foundation` - pass
- `npm run test:convoy-command-v1-5-readiness` - pass
- `npm run test:convoy-participant-fixture-qa` - pass
- `npm run test:convoy-badge-title-display` - pass
- `npm run test:convoy-command` - pass
- `npm run test:convoy-command-map-component` - pass
- `npm run test:convoy-privacy-safety` - pass
- `npm run test:badge-expedition-identity-mvp` - pass
- `npm run lint` - pass
- `npm run smoke -- --json` - pass
- `git diff --check` - pass

Closed-beta gate result:

- Not cleared.
- True two-device live Convoy privacy remains blocked until Device A and Device B both show present, distinct authenticated QA user ids before Convoy creation.

## 2026-06-11 Two-Device Live Privacy QA Rerun With Account Separation

Raw evidence folder: `.qa/convoy-two-device-live-privacy-account-separated/`

Devices:

- Device A: Samsung SM-X230, Android 16, serial `R5GL13VYSRY`.
- Device B: Samsung SM-S948U, Android 16, serial `R3GL302P1YE`.

Backend/session setup:

- Branch: `codex/convoy-live-multidevice-privacy-gate`.
- Backend environment: `ppullxxprgyeoakzqnxi` Supabase project from the repo `.env`.
- Both devices were visible over ADB.
- Raw user ids, tokens, invite codes, and account credentials are intentionally not recorded in this git-tracked summary.

Account separation preflight result:

- Blocked before Convoy creation.
- Device A auth cache was readable, but no authenticated Supabase user id was present in `supabase_auth_state.json`.
- Device B was reachable over ADB, but the installed app package was not debuggable, so `run-as` could not read the persisted Supabase auth state.
- Distinct authenticated QA identities could not be proven.
- The hard-stop precondition failed with `missing_authenticated_user_id_or_unreadable_auth_state`.
- No convoy was created, no invite was generated, no join was attempted, and no location sharing was started.

Clean baseline result:

- Not run after the account preflight blocker.
- Because distinct authenticated QA identities were not confirmed, this pass could not truthfully validate active convoy, active team, stale roster, pending invite/join, badge/title leakage, or location publishing behavior under separate QA accounts.

Native QA scenarios not run because of the preflight blocker:

- Device A creates convoy.
- Device A generates invite.
- Device B joins as a distinct participant.
- Cross-device participant visibility and participant id comparison.
- Fresh live updates.
- Location denied/revoked propagation.
- Stop sharing propagation.
- Stale threshold behavior.
- Leave/end convoy behavior.
- Restart recovery.
- Telemetry isolation during active live convoy.

Cleanup result:

- No cleanup action was required because no Convoy action was initiated.
- No production/backend convoy state, invite, location publish, badge state, telemetry state, Fleet state, Active Trip state, or Offline Packet state was intentionally mutated during this pass.

Automated verification run:

- `npm run test:convoy-qa-account-session-separation` - missing on this branch
- `npm run test:convoy-live-multidevice-privacy-gate` - pass
- `npm run test:convoy-command-v1-5-foundation` - pass
- `npm run test:convoy-command-v1-5-readiness` - pass
- `npm run test:convoy-participant-fixture-qa` - pass
- `npm run test:convoy-badge-title-display` - pass
- `npm run test:convoy-command` - pass
- `npm run test:convoy-command-map-component` - pass
- `npm run test:convoy-privacy-safety` - pass
- `npm run test:badge-expedition-identity-mvp` - pass
- `npm run lint` - fail: `expo lint` exited with ESLint `patterns must be a non-empty string or an array of non-empty strings`
- `npm run smoke -- --json` - pass
- `git diff --check` - pass

Closed-beta gate result:

- Not cleared.
- Automated Convoy privacy/scoping guards remain healthy, but true two-device live Convoy privacy is still blocked.
- Rerun only after Device A and Device B both expose present, distinct authenticated QA user ids before Convoy creation. Device B also needs a debuggable QA/dev-client build or another approved non-secret identity diagnostic surface so account separation can be verified without reading raw credentials.

## 2026-06-11 Identity Diagnostic And Lint Follow-Up

Branch: `codex/convoy-qa-identity-diagnostic-and-lint-fix`

Follow-up result:

- Added a dev/test-only identity diagnostic route at `planning-offline-sync:///dev/convoy-identity-qa`.
- The diagnostic shows only redacted user id, redacted email/display label, backend/project label, redacted active convoy id, redacted participant id, live sharing state, baseline state, and local preflight result.
- The diagnostic is read-only and does not create convoys, join invites, publish location, unlock badges, mutate Fleet, mutate Active Trip, mutate Offline Packet, touch telemetry, or modify provider state.
- Restored `npm run test:convoy-qa-account-session-separation`.
- Fixed the lint command path with a wrapper that drops empty forwarded args before invoking Expo lint.

Updated rerun requirement:

- Device A and Device B must both show present, distinct authenticated QA user ids through either a debuggable dev-client build, the safe in-app diagnostic route, or another approved non-secret identity diagnostic.
- Do not rely on `run-as` if the installed package is not debuggable.
- True two-device live Convoy privacy remains not cleared until the live create/join/share/revoke scenarios are rerun after this preflight passes.

Device A QA Leader designation:

- `admin@expeditioncommand.com` is explicitly approved as Device A's intended QA Leader identity for the live Convoy two-device privacy rerun.
- Device B should remain signed in as the QA Member account, and the two redacted authenticated user ids must remain distinct before Convoy creation.

## 2026-06-11 Final Two-Device Live Privacy QA Rerun Preflight

Raw evidence folder: `.qa/convoy-two-device-live-privacy-final-rerun/`

Devices:

- Device A: Samsung SM-X230, Android 16, serial `R5GL13VYSRY`.
- Device B: Samsung SM-S948U, Android 16, serial `R3GL302P1YE`.

Backend/session setup:

- Requested branch: `codex/convoy-live-multidevice-privacy-gate`.
- Current runnable worktree branch: `codex/convoy-qa-identity-diagnostic-and-lint-fix`.
- Backend environment shown by both device diagnostics: `ppullxxprgyeoakzqnxi`.
- Both devices were visible over ADB, on `com.expeditioncommand.planningofflinesync` versionCode 4/versionName 1.0.0, and running debuggable builds.
- Both devices had Metro reverse active on tcp:8081 and opened the dev/test-only diagnostic route.

Identity diagnostic result:

- Device A auth present: yes.
- Device A redacted user id: present and distinct from Device B.
- Device A visible label: `admin@expeditioncommand.com`.
- Device A active convoy id: unknown.
- Device A participant id: unknown.
- Device A live sharing active: no.
- Device A convoy baseline: clean.
- Device A preflight result: ready / `local_identity_ready_for_pairing`.
- Device B auth present: yes.
- Device B redacted user id: present and distinct from Device A.
- Device B visible label: `QA Member`.
- Device B active convoy id: unknown.
- Device B participant id: unknown.
- Device B live sharing active: no.
- Device B convoy baseline: clean.
- Device B preflight result: ready / `local_identity_ready_for_pairing`.

Hard-stop result:

- Blocked before Convoy creation.
- The technical identity/baseline checks passed, but the documented hard-stop contract requires Device A to be confirmed as the intended QA Leader account before creating a convoy.
- Device A displayed `admin@expeditioncommand.com`, not `QA Leader`; no local doc or automated guard designates that visible identity as the intended QA Leader.
- No convoy was created, no invite was generated, no join was attempted, and no location sharing was started.

Scenario result:

- Clean baseline diagnostic: pass on both devices.
- Device A creates convoy: not run due hard-stop blocker.
- Device B joins convoy: not run due hard-stop blocker.
- Fresh live updates: not run.
- Location denied/revoked propagation: not run.
- Stop sharing propagation: not run.
- Stale threshold: not run.
- Leave/end convoy: not run.
- Restart behavior: not run.
- Telemetry isolation during active convoy: not run.

Cleanup result:

- No cleanup action was required because no Convoy action was initiated.
- No production/backend convoy state, invite, location publish, badge state, telemetry state, Fleet state, Active Trip state, or Offline Packet state was intentionally mutated during this pass.

Automated verification run:

- `npm run test:convoy-qa-account-session-separation` - pass
- `npm run test:convoy-live-multidevice-privacy-gate` - pass
- `npm run test:convoy-command-v1-5-foundation` - pass
- `npm run test:convoy-command-v1-5-readiness` - pass
- `npm run test:convoy-participant-fixture-qa` - pass
- `npm run test:convoy-badge-title-display` - pass
- `npm run test:convoy-command` - pass
- `npm run test:convoy-command-map-component` - pass
- `npm run test:convoy-privacy-safety` - pass
- `npm run test:badge-expedition-identity-mvp` - pass
- `npm run lint` - pass
- `npm run smoke -- --json` - pass
- `git diff --check` - pass

Closed-beta gate result:

- Not cleared.
- Rerun true live Convoy privacy after confirming Device A still displays `admin@expeditioncommand.com`, Device B still displays `QA Member`, both redacted user ids remain distinct, and both devices still show a clean Convoy baseline.

## 2026-06-11 Final Two-Device Live Privacy QA Rerun After Leader Designation

Raw evidence folder: `.qa/convoy-two-device-live-privacy-final-rerun/`

Devices:

- Device A: Samsung SM-X230, Android 16, serial `R5GL13VYSRY`.
- Device B: Samsung SM-S948U, Android 16, serial `R3GL302P1YE`.

Backend/session setup:

- Backend environment shown by both device diagnostics: `ppullxxprgyeoakzqnxi`.
- Device A displayed the approved QA Leader identity `admin@expeditioncommand.com`.
- Device B displayed the QA Member identity `QA Member`.
- Both devices showed present, distinct redacted authenticated user ids.
- Both device diagnostics showed no active convoy id, no participant id, live sharing inactive, clean Convoy baseline, and `local_identity_ready_for_pairing`.

Clean baseline result:

- Device A Convoy Command opened and showed `No active convoys yet.` and `No invite records visible.`
- Device B did not reach Convoy Command. Opening `planning-offline-sync:///convoy-command` redirected to Fleet Profile setup because the app session reported setup incomplete.
- Because Device B could not reach the intended Convoy join surface without changing Fleet/setup state, the true two-device create/join/privacy run was blocked before Convoy creation.

Hard-stop result:

- Blocked before Convoy creation.
- No convoy was created, no invite was generated, no join was attempted, and no location sharing was started.
- Device B must complete or recover the required Fleet/setup state through an approved QA path before true live two-device Convoy privacy can run.

Scenario result:

- Identity diagnostic final preflight: pass.
- Clean baseline on Device A Convoy Command: pass.
- Clean baseline on Device B Convoy Command: blocked by setup/Fleet Profile redirect.
- Device A creates convoy: not run.
- Device B joins convoy: not run.
- Fresh live updates: not run.
- Location denied/revoked propagation: not run.
- Stop sharing propagation: not run.
- Stale threshold: not run.
- Leave/end convoy: not run.
- Restart behavior: not run.
- Telemetry isolation during active convoy: not run.

Cleanup result:

- No cleanup action was required because no Convoy action was initiated.
- No production/backend convoy state, invite, location publish, badge state, telemetry state, Active Trip state, or Offline Packet state was intentionally mutated during this pass.

Automated verification run:

- `npm run test:convoy-qa-account-session-separation` - pass
- `npm run test:convoy-live-multidevice-privacy-gate` - pass
- `npm run test:convoy-command-v1-5-foundation` - pass
- `npm run test:convoy-command-v1-5-readiness` - pass
- `npm run test:convoy-participant-fixture-qa` - pass
- `npm run test:convoy-badge-title-display` - pass
- `npm run test:convoy-command` - pass
- `npm run test:convoy-command-map-component` - pass
- `npm run test:convoy-privacy-safety` - pass
- `npm run test:badge-expedition-identity-mvp` - pass
- `npm run lint` - pass
- `npm run smoke -- --json` - pass
- `git diff --check` - pass

Closed-beta gate result:

- Not cleared.
- The identity/account split is now valid, but Device B is not yet ready for the true two-device Convoy flow because protected Convoy routing is blocked by incomplete Fleet/setup state.
