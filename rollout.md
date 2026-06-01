# ECS Rollout

## EAS Cloud APK Build

Use EAS cloud builds for Android APK artifacts:

```bash
npm run build:android:apk:eas
```

Do not use `eas build --local` for the current Windows native build issue. Local Gradle APK attempts have repeatedly failed during `expo-modules-core` CMake configuration because generated native build files were locked by another process. Cloud builds avoid that local Windows file-lock path.

The `campops-preview` EAS profile creates an internal-distribution Android APK build artifact candidate. The resulting APK can be referenced from the EAS build page, downloaded from EAS, or placed under a local path such as `artifacts/ECS-android-campops-preview.apk` after download.

Closed field-test promotion remains gated. The APK artifact alone does not clear Android/device QA evidence, provider readiness, privacy/storage approval, or other release-readiness blockers. If product, safety, privacy, and engineering explicitly accept risk, that acceptance should be recorded separately from the build artifact and should not pretend that missing evidence gates have passed.

Provider influence, AI assist, telemetry, and community publishing remain controlled by their existing approval gates and feature flags. Do not enable them as part of APK creation.

Android/device QA evidence must still be collected separately on real devices.

Useful commands:

```bash
npm install --global eas-cli
eas login
npm run eas:configure:android
eas env:create --environment preview --visibility plaintext --name EXPO_PUBLIC_SUPABASE_URL --value "<VALUE>"
eas env:create --environment preview --visibility plaintext --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<VALUE>"
eas env:create --environment preview --visibility plaintext --name EXPO_PUBLIC_MAPBOX_TOKEN --value "<VALUE>"
npm run build:android:apk:eas
npm run build:android:apk:eas:list
```

If the EAS CLI cannot read local Git metadata in a Windows automation shell, use EAS's no-VCS upload fallback from a normal terminal:

```powershell
$env:EAS_NO_VCS = "1"
$env:EAS_PROJECT_ROOT = (Resolve-Path ".").Path
npm run build:android:apk:eas
```
