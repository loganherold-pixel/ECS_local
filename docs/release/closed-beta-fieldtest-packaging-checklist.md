# Closed Beta Fieldtest Packaging Checklist

Date: 2026-06-12

Branch: `codex/closed-beta-packaging-fieldtest`

## Build Identity

- Android package: `com.expeditioncommand.planningofflinesync`
- Local Android `versionCode`: `4`
- Expo Android `versionCode`: `4`
- `versionName`: `1.0.0`
- Expo app version/runtime version: `1.0.0`
- EAS project: `cd718e96-3084-4d2b-ae06-d1b5bd187071`
- Fieldtest profile: `fieldtest`
- Fieldtest channel: `fieldtest`
- Fieldtest artifact type: internal Android APK

EAS uses `appVersionSource: remote`, so the local `versionCode` is not the effective next uploaded fieldtest build number. The remote Android fieldtest build version was checked on 2026-06-12 and was `20`. With `autoIncrement: true`, the next fieldtest build should upload with a build number higher than `20`.

## Build Commands

Preferred fieldtest command:

```bash
npm run build:android:apk:eas
```

Equivalent EAS command printed by the helper:

```bash
eas build --platform android --profile fieldtest --clear-cache
```

Direct package script:

```bash
npm run android:fieldtest
```

Do not run or upload a build until the pre-build checklist below is complete.

## Pre-Build Checklist

- Confirm `git status --short --branch` is clean or contains only intentionally included release docs.
- Confirm raw evidence remains ignored under `.qa/` or `qa-evidence/`.
- Confirm `npm run lint` passes.
- Confirm `npm run smoke -- --json` passes.
- Confirm the closed-beta regression suite passes.
- Confirm EAS remote Android build number is still `20` or lower than the intended next upload.
- Confirm EAS fieldtest environment has:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_MAPBOX_TOKEN`
  - `MAPBOX_DOWNLOADS_TOKEN`
- Confirm no service-role key or provider credential is present in mobile runtime config.
- Confirm fieldtest build profile remains internal APK, channel `fieldtest`, and `autoIncrement: true`.
- Confirm Play/internal tester release notes include the beta caveats below.

## Release Gates

Dev/test QA routes must remain disabled or redirected outside dev/test:

- `/dev/convoy-identity-qa`
- `/dev/route-overlay-qa`
- `/dev/provider-outage-qa`
- `/dev/convoy-participant-qa`
- `/dev/trip-confidence-qa`
- `/dev/campops-visual-qa`

The route modules use `__DEV__`/test guard helpers and redirect to `/` when disabled. Fixture modules return empty production fixture lists, do not call providers, and do not mutate product state.

## Tester Caveats

- Hardware telemetry is truth-boundary cleared, but individual live hardware providers remain field-qualified or gated. OBD2, EcoFlow, Mopeka, and BLU/power data may show unavailable, stale, manual, unsupported, or unknown states.
- Convoy location sharing is opt-in. Participants can be live, stale, disconnected, or unknown. Stale location must not be treated as live.
- Offline Incident Packet is local-only. It is not SOS, dispatch transmission, or emergency sharing.
- Terrain Risk and Camp Viability are advisory and conservative. They are not safety, legal-access, weather, or land-use guarantees.
- Route authority labels matter. Demo, preview, approach-only, trailhead-only, imported, source-backed, and verified states are intentionally distinct.
- Community route publishing is not part of this closed beta.
- Android Auto remains internal/not ready for beta tester claims.
- Standalone lint passes. The smoke harness can locally skip its nested lint substage with `spawn EINVAL`; rely on the standalone lint result.

## Play / Internal Testing Checklist

- Version code higher than the prior uploaded Android fieldtest build.
- Release notes describe closed-beta scope and known caveats.
- Tester list or internal distribution group is correct.
- Privacy policy and support contact are available.
- Data safety notes cover location, Bluetooth, account identity, diagnostics, and telemetry labels.
- Permissions review covers foreground/background location, Bluetooth scan/connect, network access, and why they are requested.
- Location permission explanation says Convoy and navigation are opt-in/contextual and may show stale/unknown states.
- Crash/log monitoring is active through the privacy-safe issue reporting workflow.
- Rollback plan: keep the previous successful fieldtest APK/build available and stop distribution of a failed build.
- Raw screenshots, UI dumps, invite codes, precise coordinates, account ids, tokens, and hardware serials stay out of git.

## Build Recommendation

Ready to build fieldtest after confirming the remote EAS Android build number immediately before upload and keeping hardware telemetry caveats in tester-facing notes.
