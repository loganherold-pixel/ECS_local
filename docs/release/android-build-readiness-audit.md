# ECS Android Build Readiness Audit

Date: 2026-05-03

## Status

Android release build path is **prepared, with release blockers outside source control**.

The app has valid Expo/EAS configuration, an Android package id, version metadata, launcher/splash assets, intentional location/Bluetooth permissions, and internal-test build profiles. A publishable Play build still requires production EAS secrets and Android signing credentials to be configured outside the repository.

## Metadata

| Item | Current value | Status |
| --- | --- | --- |
| App name | Expedition Command System | Aligned in Expo config and native Android string resources. |
| Android package | `com.expeditioncommand.planningofflinesync` | Keep unless product explicitly approves a package rename. |
| Version name | `1.0.0` | Aligned across `package.json`, `app.json`, native Gradle, and runtime version. |
| Version code | `1` locally; production EAS has `autoIncrement=true` | Valid for a first publish; EAS should increment Android version code for production uploads. |
| Runtime version | `1.0.0` | OTA update channel is configured through Expo Updates. |
| EAS project id | `cd718e96-3084-4d2b-ae06-d1b5bd187071` | Present. |

## EAS Profiles

| Profile | Purpose | Android artifact |
| --- | --- | --- |
| `preview` | Generic internal Android QA build. | APK |
| `fieldtest` | Internal restricted field-test build path used by `npm run android:fieldtest`. | APK |
| `campops-preview` | Existing CampOps/internal preview build path. | APK |
| `production` | Play-ready release upload path. | AAB |

## Permissions

Intentional Android permissions:

- Location: coarse, fine, background. Needed for maps, route guidance, expedition tracking, offline cache relevance, and future telemetry flows.
- Bluetooth: classic legacy permissions plus Android 12+ scan/connect. Needed for BLU/BLE power, vehicle telemetry, and future scanner integrations.
- Internet: needed for Supabase, maps, weather, provider data, and OTA updates.
- Storage/media/audio/system overlay permissions are present in the generated native manifest. Treat them as needs-review before Play submission; do not remove them until the owning feature path is verified.

## Secrets And Environment

Do not commit secrets. `.env` is ignored, and `.env.example` contains placeholders only.

Required client-visible EAS/environment variables:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_MAPBOX_TOKEN`

Server/provider secrets that must stay out of client-visible config unless intentionally proxied:

- `OPENWEATHER_API_KEY`
- `AIRNOW_API_KEY`
- `NASA_FIRMS_MAP_KEY`
- `NPS_API_KEY`
- `STATE_DOT_511_API_KEY`
- `STATE_FIRE_AGENCY_API_KEY`
- `COUNTY_EMERGENCY_API_KEY`
- Garmin/inReach secrets or private feed URLs

Use EAS environment/secret storage or server-side Supabase functions for real provider keys.

## Signing Posture

EAS cloud production builds should use EAS-managed Android credentials or explicitly configured Play upload credentials.

Local Gradle release builds now support upload signing through environment variables or Gradle properties:

- `ECS_ANDROID_UPLOAD_STORE_FILE`
- `ECS_ANDROID_UPLOAD_STORE_PASSWORD`
- `ECS_ANDROID_UPLOAD_KEY_ALIAS`
- `ECS_ANDROID_UPLOAD_KEY_PASSWORD`

If those values are absent, the native release build falls back to debug signing for local smoke output only. Debug-signed release artifacts are **not publishable**.

## Build Commands

Internal APK:

```bash
npm run android:fieldtest
```

Equivalent direct EAS command:

```bash
eas build --platform android --profile fieldtest --clear-cache
```

Existing CampOps preview helper:

```bash
npm run build:android:apk:eas
```

Production Play AAB:

```bash
eas build --platform android --profile production --clear-cache
```

Local Gradle smoke build after native dependencies are installed:

```bash
cd android
./gradlew assembleRelease
```

Local publishable signed build requires the `ECS_ANDROID_UPLOAD_*` values above. Prefer EAS cloud for the release candidate unless local Android SDK/Gradle signing is already configured.

## Blockers

- Production EAS secrets must be configured outside the repo.
- Production Android signing credentials must be configured in EAS or through local upload-signing env vars.
- Closed field testing remains separately blocked by release gates; a successful Android build does not approve field testing.

## Warnings

- The native manifest contains generated permissions beyond the explicit Expo Android permission list. Review Play Console declarations before submission.
- Version code is `1`; increment it before any subsequent Play upload.
- Background location and Bluetooth scan/connect require clear Play Store disclosure and runtime permission copy.
