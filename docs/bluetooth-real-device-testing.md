# Bluetooth Real-Device Testing

ECS real Bluetooth scanning requires the native `react-native-ble-plx` bridge. It works only in an installed ECS app or Expo development build. Expo Go and web preview do not include the native BLE scanner and must show a native-runtime-unavailable state instead of fake devices.

## Supported Test Environments

- Android development build from `npx expo run:android` or an EAS internal APK.
- iOS development build from `npx expo run:ios` or an EAS internal build.
- Production/internal installed app builds.

Unsupported environments:

- Expo Go.
- Web preview.
- Any runtime where `react-native-ble-plx` is not linked into the native app.

## Configuration Checklist

Native dependency:

- `react-native-ble-plx` is installed in `package.json`.
- `app.json` includes the `react-native-ble-plx` config plugin.
- Provider readiness and parser-pending status are tracked in `docs/bluestack-provider-readiness.md`.

Android:

- Manifest/config includes `android.permission.BLUETOOTH_SCAN`.
- Manifest/config includes `android.permission.BLUETOOTH_CONNECT`.
- Manifest/config includes `android.permission.ACCESS_FINE_LOCATION`.
- ECS requests those permissions at runtime through `src/power/ble/BlePermissions.ts`.

iOS:

- `NSBluetoothAlwaysUsageDescription` is present.
- `NSBluetoothPeripheralUsageDescription` is present for older iOS compatibility.

Runtime guard:

- `src/power/ble/BleScanReadiness.ts` detects web and Expo Go before scanning.
- `ensureBleScanReadiness()` requests permissions, creates the BLE manager, waits for `PoweredOn`, and returns a specific failure code for permission denial, powered-off Bluetooth, unsupported runtime, or unavailable adapter.

## Android Test Flow

1. Install a development/native build:

   ```powershell
   npx expo run:android
   ```

   Or build an internal APK:

   ```powershell
   eas build --platform android --profile fieldtest
   ```

2. Launch the installed ECS app, not Expo Go.
3. Open Device Connections.
4. Press Scan for Device Connections.
5. Grant Bluetooth and location permissions when prompted.
6. Confirm Bluetooth is powered on.
7. Verify nearby BLE devices appear only from live native scan callbacks.
8. Turn Bluetooth off and scan again. ECS should show a Bluetooth-off state.
9. Revoke Nearby Devices or Location permission and scan again. ECS should show a permission-required state.

## iOS Test Flow

1. Install a development/native build:

   ```powershell
   npx expo run:ios
   ```

   Or install an EAS internal build.

2. Launch the installed ECS app, not Expo Go.
3. Open Device Connections.
4. Press Scan for Device Connections.
5. Grant Bluetooth permission when prompted.
6. Verify nearby BLE devices appear only from live native scan callbacks.
7. Disable Bluetooth and scan again. ECS should show a Bluetooth-off or adapter-unavailable state.

## Expected Runtime States

The unified scanner exposes these production states:

- `idle`
- `permission_required`
- `bluetooth_off`
- `scanning`
- `discovered`
- `connecting`
- `connected`
- `streaming`
- `disconnecting`
- `disconnected`
- `error`

State expectations:

- `connected` means a native connection or valid transport handshake has completed.
- `streaming` means ECS is receiving live telemetry or has an active subscription/polling loop.
- Expo Go/web must not show fake scanner results. They should report native BLE unavailable.
- EcoFlow cloud authorization failures must remain cloud/API failures and must not be presented as Bluetooth failures.
- EcoFlow power stations, Glacier/refrigerator devices, WAVE/portable AC devices, and alternator charger devices are eligible for EcoFlow Cloud/API telemetry when the EcoFlow developer account is authorized for the device serial. Local Bluetooth attachment can remain visible, but native EcoFlow BLE telemetry decoding is still parser-pending unless a validated model parser exists.
- Parser-pending power brands should appear as recognized Bluestack hardware but must not be selectable as live telemetry until field-verified parsers exist.

## Troubleshooting

- If Expo Go shows no devices, that is expected. Install a development build.
- If Android scans return no callbacks, confirm both Nearby Devices and Location permissions are granted.
- If the scanner reports Bluetooth off, turn Bluetooth on from system settings and scan again.
- If the scanner reports runtime unsupported in an installed build, verify the build includes `react-native-ble-plx` and was rebuilt after config changes.
