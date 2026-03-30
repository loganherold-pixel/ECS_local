# Expo Go — Quick Start Guide (SDK 55)

## Prerequisites

- **Node.js** ≥ 18
- **Expo Go** app installed on your device (version 55.x):
  - iOS: [App Store](https://apps.apple.com/app/expo-go/id982107779)
  - Android: [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)
- Device and dev machine on the **same Wi-Fi network**

> **IMPORTANT**: Expo Go 55.0.3+ is required. Older versions (SDK 54) will refuse
> to open this project because the runtime version is `exposdk:55.0.0`.

---

## 1. Install Dependencies

```bash
npm install
```

After install, align all Expo package versions to SDK 55:

```bash
npx expo install --fix
```

This ensures every `expo-*` package matches the SDK 55 compatibility matrix.

---

## 2. Start the Metro Dev Server

```bash
npx expo start
```

Or use the shorthand script:

```bash
npm run go
```

### What You'll See

```
Metro waiting on exp://192.168.x.x:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)

› Using Expo Go
› Press a │ open Android
› Press i │ open iOS simulator
› Press w │ open web
› Press r │ reload app
› Press j │ open debugger
› Press ? │ show all commands
```

---

## 3. Connect Expo Go

### QR Code (Recommended)

1. The terminal displays a QR code after `npx expo start`
2. **iOS**: Open the Camera app → point at the QR code → tap the Expo Go banner
3. **Android**: Open Expo Go app → tap "Scan QR Code" → point at the QR code

### Manual URL

If the QR code doesn't work, enter the URL manually in Expo Go:

```
exp://192.168.x.x:8081
```

Replace `192.168.x.x` with your machine's local IP (shown in the Metro output).

### Tunnel Mode (Different Networks)

If your device and computer are on different networks:

```bash
npx expo start --tunnel
```

This creates a public tunnel URL (requires `@expo/ngrok` — installed automatically on first use).

---

## 4. Runtime Version & SDK Compatibility

### How It Works

This project uses `runtimeVersion.policy: "sdkVersion"` in `app.json`, which
automatically sets the runtime version to `exposdk:<version>` based on the
installed `expo` package.

| Config Field | Value | Purpose |
|---|---|---|
| `app.json → sdkVersion` | `55.0.0` | Explicit SDK target |
| `app.json → runtimeVersion.policy` | `sdkVersion` | Derives runtime version from SDK |
| `package.json → expo` | `~55.0.0` | Installed SDK package |
| **Resolved runtime version** | **`exposdk:55.0.0`** | **What Expo Go checks** |

### Verifying the Runtime Version

After starting the dev server, the Metro output will show:

```
Runtime version: exposdk:55.0.0
```

If you see `exposdk:54.0.0` instead, run:

```bash
npx expo install --fix
npm start -- --clear
```

---

## 5. Expo Go Compatibility Notes

### SDK 55 — What's Included in Expo Go

All dependencies in this project are compatible with Expo Go SDK 55:

| Package | Expo Go Support |
|---------|----------------|
| expo-router | ✅ Built-in |
| expo-image | ✅ Built-in |
| expo-file-system | ✅ Built-in |
| expo-haptics | ✅ Built-in |
| expo-sensors | ✅ Built-in |
| expo-blur | ✅ Built-in |
| expo-constants | ✅ Built-in |
| expo-splash-screen | ✅ Built-in |
| react-native-reanimated | ✅ Built-in |
| react-native-gesture-handler | ✅ Built-in |
| react-native-screens | ✅ Built-in |
| react-native-safe-area-context | ✅ Built-in |
| react-native-webview | ✅ Built-in |
| @supabase/supabase-js | ✅ JS-only |
| dexie | ✅ JS-only (web) |

### What Was Removed for Expo Go Compatibility

- **`react-native-worklets`** — Standalone native module not included in Expo Go. Replaced by `react-native-reanimated/plugin` which provides equivalent worklet support and IS included in Expo Go.
- **`edgeToEdgeEnabled`** — Removed from `app.json` android config. This Android-specific feature requires a custom dev client build and is not supported in Expo Go.

### No Custom Dev Client Required

This project runs entirely within Expo Go — no `expo-dev-client`, no `eas build`, no custom native modules. Just scan and go.

---

## 6. Weather Edge Function Setup

The app calls a Supabase Edge Function for weather data. To enable weather features:

### Deploy the Edge Function

```bash
supabase functions deploy get-weather
```

### Set the OpenWeather API Key

```bash
supabase secrets set OPENWEATHER_API_KEY=<your-openweather-api-key>
```

Get a free API key at: https://openweathermap.org/api

The edge function reads the key via `Deno.env.get("OPENWEATHER_API_KEY")` — it is **never** exposed to the client or stored in the repo.

### Test the Edge Function

```bash
curl -X POST https://your-project.supabase.co/functions/v1/get-weather \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"lat": 37.7749, "lon": -122.4194, "units": "imperial"}'
```

---

## 7. Troubleshooting

### "Network request failed" or "Unable to resolve host"

- Ensure device and computer are on the same Wi-Fi
- Try tunnel mode: `npx expo start --tunnel`
- Check firewall isn't blocking port 8081

### "Invariant Violation: No callback found"

- Clear Metro cache: `npx expo start --clear`
- Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`

### "SDK version mismatch" or "runtime version mismatch"

This means Expo Go's SDK version doesn't match the project's runtime version.

1. Update Expo Go to the latest version (must support SDK 55)
2. Run `npx expo install --fix` to align package versions
3. Restart Metro with `npx expo start --clear`
4. Verify `app.json` has `"sdkVersion": "55.0.0"`

### Preview URL shows `exposdk:54.0.0`

The `expo` package in `node_modules` is still at v54. Fix:

```bash
npm install expo@~55.0.0
npx expo install --fix
npx expo start --clear
```

### Slow first load

- First bundle takes 15-30 seconds — subsequent reloads are fast
- The `resetCache` flag was removed from metro.config.js to speed up restarts

### Weather data not loading

- Verify the edge function is deployed: `supabase functions list`
- Verify the secret is set: `supabase secrets list` (should show `OPENWEATHER_API_KEY`)
- Check edge function logs: `supabase functions logs get-weather`
- The app gracefully falls back to cached/synthetic data when offline

---

## 8. Development Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start Metro dev server |
| `npm run go` | Start Metro in Expo Go mode |
| `npm run android` | Start on Android device/emulator |
| `npm run ios` | Start on iOS device/simulator |
| `npm run web` | Start web version |
| `npm run fix-deps` | Align all expo-* packages to SDK 55 |
| `npm run lint` | Run ESLint |
| `npm run build` | Export web build |

---

## 9. Architecture Overview

```
app/
├── _layout.tsx          ← Root layout (AuthGate, providers)
├── index.tsx            ← Entry redirect
├── login.tsx            ← Authentication
├── (tabs)/              ← Main tab navigation
│   ├── dashboard.tsx    ← Mission dashboard
│   ├── fleet.tsx        ← Vehicle & loadout management
│   ├── expeditions.tsx  ← Expedition management
│   ├── navigate.tsx     ← GPS navigation
│   ├── intel.tsx        ← Intelligence & weather
│   └── ...

├── components/          ← Shared UI components
├── context/             ← React contexts (App, Theme, etc.)
└── lib/                 ← Business logic, stores, utilities
    ├── supabase.ts      ← Supabase client (with offline fallback)
    ├── weatherStore.ts  ← Weather data management
    └── ...
```
