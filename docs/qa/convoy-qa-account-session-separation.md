# Convoy QA Account Session Separation

Status: QA tooling and diagnostic contract only.

Branch: `codex/convoy-qa-identity-diagnostic-and-lint-fix`

Do not record raw user ids, tokens, invite codes, or account credentials in git. Store raw native screenshots/logs only under ignored `.qa/` folders and redact identifiers in docs.

## Purpose

True two-device Convoy privacy QA is only valid when Device A and Device B are authenticated as two distinct QA identities before any convoy is created. The same account on both devices is invalid because both devices can collapse into the same visible self/leader identity.

## Valid Two-Device Identity Model

A valid run requires:

- Device A signed in as QA Leader account.
- Current approved Device A QA Leader identity: `admin@expeditioncommand.com`.
- Device B signed in as QA Member account.
- Distinct Supabase user ids.
- Same intended backend/project/environment.
- Same intended app build family.
- Fleet/setup eligibility complete on each device that must open Convoy Command.
- Clean local Convoy baseline on both devices.
- No active convoy membership before the test.
- No live sharing is active.
- No pending invite/join state exists.

The same account on both devices is invalid for this QA gate. It may be a product-tolerated account state, but it cannot prove two-person privacy/scoping.

## Safe Identity Diagnostic

The dev/test-only diagnostic route is:

`planning-offline-sync:///dev/convoy-identity-qa`

It is guarded by the existing dev/test route pattern:

- `__DEV__`
- `NODE_ENV === 'test'`

Production/release builds redirect away from the route.

The diagnostic displays only non-secret redacted fields:

- Auth present: yes/no
- Redacted authenticated user id
- Redacted email/display label if available
- Backend/project label
- Redacted active convoy id if present
- Redacted participant id if present
- Live sharing active: yes/no
- Current Convoy baseline state
- Fleet/setup eligibility and Convoy Command reachability
- Local preflight result: ready / blocked / incomplete

It must not display:

- access token
- refresh token
- full auth state JSON
- full email unless already user-facing and safe
- secrets
- provider credentials

The route is read-only. It does not sign users in or out, create convoy membership, accept invites, publish location, unlock badges, mutate Fleet, mutate Active Trip, mutate Offline Packet, touch telemetry, or modify provider state.

## Device B Debuggable-Build Guidance

Device B must use one of:

- debuggable dev-client build with readable diagnostics
- safe in-app diagnostic surface
- approved non-secret identity diagnostic

Do not rely on `run-as` if the installed package is not debuggable. If `run-as` fails with `package not debuggable`, use the in-app diagnostic route or reinstall a debuggable QA/dev-client build before attempting true live two-device Convoy privacy QA.

## Hard-Stop Preflight

Stop immediately unless all of these are true:

- Device A user id is present.
- Device B user id is present.
- User ids are distinct.
- Backend/project labels match.
- No active convoy exists on either device.
- No live sharing is active on either device.
- No pending invite/join state exists on either device.
- Confirm no pending invite/join state exists before continuing.
- Fleet/setup eligibility shows Convoy Command reachable on Device B before attempting create/join.

If any condition fails, do not create a convoy, do not generate an invite, do not join, and do not start location sharing.

## Rerun Checklist

Before creating a convoy:

1. Confirm Device A is unlocked, awake, and running the intended QA build.
2. Confirm Device B is unlocked, awake, and running the intended QA build.
3. Confirm both devices use the same QA backend/project/environment.
4. Open the diagnostic route on Device A.
5. Open the diagnostic route on Device B.
6. Capture only redacted diagnostic output in the ignored evidence folder.
7. Confirm Device A is the QA Leader account. The currently approved Device A QA Leader identity is `admin@expeditioncommand.com`.
8. Confirm Device B is the QA Member account.
9. Confirm redacted user ids differ.
10. Confirm Fleet/setup eligibility reports Setup complete, Configured vehicle, and Convoy Command reachable on Device B.
11. Confirm no active convoy, live sharing, or pending invite/join state exists.
12. Only then create the convoy on Device A.

After QA:

1. Stop sharing on both devices if it was started.
2. Device B leaves or Device A ends the convoy, depending on the scenario.
3. Revoke unused invites.
4. Confirm both devices return to no active convoy/member state.
5. Document cleanup status in the concise QA summary only.

## Automated Guard

Run:

`npm run test:convoy-qa-account-session-separation`

The guard covers:

- missing authenticated user id
- unreadable auth state
- same user id blocked
- distinct user ids ready
- backend mismatch blocked
- active convoy present blocked
- live sharing active blocked
- pending invite/join state blocked
- Fleet/setup eligibility and protected Convoy Command reachability documented
- redaction of user ids, participant ids, convoy ids, and emails
- no tokens or secrets exposed
- diagnostic route dev/test guard
- diagnostic does not mutate Convoy, Badge, Fleet, Active Trip, Packet, telemetry, or provider state

## Known Limitations

- This tooling does not create QA accounts.
- This tooling does not sign users in or out automatically.
- This tooling does not perform backend/admin cleanup.
- This tooling does not prove live two-device privacy by itself.
- True live Convoy privacy remains blocked until both devices show present, distinct authenticated QA identities before convoy creation.
