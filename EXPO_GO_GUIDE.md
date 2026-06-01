# Expo Development Guide (SDK 54)

This project currently uses Expo SDK 54:

- `package.json -> expo`: `^54.0.2`
- `app.json -> runtimeVersion`: `1.0.0`
- Native plugins: `react-native-ble-plx`, Android Auto, CarPlay, Secure Store, Video

Because the app includes custom native plugins, the full native feature set requires
a custom native build. Expo Go can still be useful for limited JavaScript and web
preview work, but it should not be treated as a thorough-device-test runtime for
BLE, Android Auto, CarPlay, or other native plugin behavior.

## Prerequisites

- Node.js >= 18
- Dependencies installed with `npm install`
- Android Studio or Xcode when testing native builds
- Device and dev machine on the same network when using a physical device

## Finite Checks Before Starting Metro

Run quick finite checks first so validation does not hang on a long-lived Metro
server:

```bash
npx expo config --json
npm run lint
npx tsc --noEmit
npm run test:dashboard-widgets
npm run test:connectivity-startup
npm run test:command-state-hardening
npm run test:release-readiness
npm run test:explore-favorites
npm run test:subscription-hardening
npm run test:shared-account-management
```

For the web export path:

```bash
npm run build
```

## Starting Metro

The basic script is:

```bash
npm start
```

On Windows, if Expo worker startup hits `spawn EPERM`, use the safer local command:

```bash
npx expo start --localhost --port 8081 --max-workers 1
```

For automated smoke validation, start Metro with a timeout or in the background.
Do not use a long-lived Expo server as a blocking validation step.

## Native Device Runs

Use native builds for BLE and vehicle integration testing:

```bash
npm run android
npm run ios
```

For Android field builds:

```bash
npm run android:fieldtest
```

The Android manifest must include the BLE permissions that the runtime permission
helper requests, including `android.permission.BLUETOOTH_SCAN` and
`android.permission.BLUETOOTH_CONNECT` on Android 12+.

## Web Preview

Use web preview for UI smoke checks and route rendering that does not require
native modules:

```bash
npm run web
```

BLE is intentionally unavailable on web preview. The scanner should report that
Bluetooth is not available instead of crashing.

## Troubleshooting

### Metro Starts But The App Does Not Load

- Verify Metro status: `curl http://127.0.0.1:8081/status`
- Clear Metro cache: `npx expo start --clear --localhost --port 8081 --max-workers 1`
- Re-run `npx expo config --json` to catch config/plugin errors

### Bluetooth Permissions Fail On Android

- Confirm the app was installed from a native build, not Expo Go
- Confirm the manifest includes `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT`
- On Android < 12, confirm location permission is granted for BLE scanning

### Weather Data Does Not Load

- Deploy the edge function: `supabase functions deploy get-weather`
- Set the secret: `supabase secrets set OPENWEATHER_API_KEY=<your-openweather-api-key>`
- Check function logs: `supabase functions logs get-weather`

## Available Scripts

| Command | Description |
|---|---|
| `npm start` | Start Expo Metro |
| `npm run android` | Build/run Android native app |
| `npm run android:fieldtest` | Start an Android EAS field-test build |
| `npm run ios` | Build/run iOS native app |
| `npm run web` | Start web preview |
| `npm run lint` | Run Expo ESLint |
| `npm run build` | Export web build |
| `npm run test:dashboard-widgets` | Validate dashboard widget defaults/config |
| `npm run test:connectivity-startup` | Validate connectivity startup hardening |
| `npm run test:command-state-hardening` | Validate command state guards |
| `npm run test:release-readiness` | Run release readiness sweep |
| `npm run test:explore-favorites` | Validate explore favorites behavior |
| `npm run test:subscription-hardening` | Validate subscription hardening |
| `npm run test:shared-account-management` | Validate shared account management |
