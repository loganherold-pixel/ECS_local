# Convoy QA Device B Setup Eligibility

Status: QA preparation only.

Branch: `codex/convoy-qa-device-b-setup-eligibility`

Do not store raw screenshots, full account identifiers, invite codes, coordinates, or credentials in git. Raw evidence belongs under ignored `.qa/` folders only.

## Purpose

Device B can have a valid QA Member identity and still be blocked from `planning-offline-sync:///convoy-command` if the app's normal protected-shell setup gate is incomplete. That is expected production behavior, not a Convoy privacy failure.

This document defines the minimum Device B Fleet/setup eligibility needed before true two-device Convoy privacy QA can proceed.

## Device B Fleet/setup eligibility

Minimum baseline:

- Device B is signed in as the QA Member account.
- Device B has completed the normal Fleet Profile setup flow.
- At least one local Fleet profile exists.
- Setup completion flag is present.
- A configured vehicle is present.
- Active vehicle selection is preferred for roster quality, but the shell gate is based on configured vehicle presence.
- No active Convoy exists.
- No live sharing is active.
- No pending invite or join state exists.
- `planning-offline-sync:///convoy-command` is reachable and shows the no-active-convoy baseline.

## Why the Redirect Happened

`/convoy-command` is a protected shell route. The root shell allows it only when setup is complete and a configured vehicle exists. If Device B lacks a completed Fleet profile, the app correctly redirects to Fleet/Profile setup.

Do not bypass this gate for QA. The correct fix is to complete Device B's minimum Fleet profile through the same app flow a real user would use.

## Safe Manual Setup Procedure

On Device B:

1. Confirm the device is signed in as the intended QA Member account.
2. Open `planning-offline-sync:///dev/convoy-identity-qa`.
3. Confirm identity is present, backend/project matches Device A, and no Convoy baseline state is active.
4. If Setup eligibility reports blocked or Convoy Command reachable is `no`, open the Fleet/Profile setup screen shown by the app.
5. Complete the Fleet Profile setup flow with a valid QA vehicle profile. Existing prefilled values may be used if they are acceptable for QA.
6. Save/confirm the profile through the normal UI.
7. Do not create a convoy, generate an invite, join a convoy, or start sharing location.
8. Reopen `planning-offline-sync:///dev/convoy-identity-qa`.
9. Confirm Setup eligibility shows:
   - Setup complete: `yes`
   - Configured vehicle: `yes`
   - Fleet profiles: at least `1`
   - Convoy Command reachable: `yes`
   - Clean Convoy baseline: `yes`
10. Open `planning-offline-sync:///convoy-command`.
11. Confirm Convoy Command opens to no-active-convoy/no-invite baseline.

## Guardrails

The setup eligibility diagnostic is read-only. It must not:

- create production Convoy membership
- generate or redeem invites
- publish location
- complete setup for the user
- create Fleet profiles
- select an active vehicle
- mutate Active Trip
- mutate Offline Incident Packet
- mutate Badge state
- touch telemetry, Mopeka, Bluestack, OBD2, EcoFlow, or provider state

## Blockers

Stop the two-device run if any of these are true:

- Device B auth is missing.
- Device B is not the QA Member account.
- Device B setup remains incomplete.
- Device B has no configured vehicle.
- Convoy Command reachable is `no`.
- Any active convoy, live sharing, pending invite, or pending join state exists.

## Verification Command

Run:

`npm run test:convoy-qa-device-b-setup-eligibility`

This command verifies the setup gate helper, the diagnostic display contract, the read-only/non-mutation guard, and the two-device checklist references.
