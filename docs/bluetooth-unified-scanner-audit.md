# Bluetooth Unified Scanner Audit

Date: 2026-05-15

Scope: repo-wide audit of Bluetooth, BLE, EcoFlow, power-device, OBD2, mock discovery, saved-device, known-device, failed-device, and legacy scanner paths.

## Executive Finding

The intended canonical user-facing scanner is the Device Connections / unified scanner path:

- `app/power/blu.tsx`
- `components/QuickActionsSheet.tsx`
- `lib/useUnifiedDeviceConnections.ts`
- `lib/unifiedDeviceDiscoveryAggregator.ts`
- `lib/scannerDeviceListState.ts`

This path is real and should be preserved, but it is not yet a single pure native BLE scanner engine. It orchestrates several sources:

- OBD2 native BLE scanning through `src/vehicle-telemetry/OBD2Adapter.ts`
- EcoFlow cloud/API device discovery through `lib/ecoflowUnifiedScannerDiscovery.ts`
- cached/known devices from registries
- generic accessory connect/disconnect handling
- disabled mock/classic sources from `lib/unifiedDeviceDiscoveryAggregator.ts`

The repo still contains several older Bluetooth and power-device discovery surfaces that are not cleanly wired into the unified scanner. Some are explicitly simulated or UI-only. Those should not remain production-facing if the product requirement is a single real scanner engine.

## Search Terms Used

Searched repo-wide with combinations of:

- `Bluetooth`
- `BLE`
- `scanner`
- `unified scanner`
- `mock`
- `simulated`
- `saved devices`
- `known devices`
- `failed devices`
- `needs attention`
- `EcoFlow`
- `OBD`
- `OBD2`
- `ELM327`
- `power devices`
- `nearby devices`

Searches excluded `node_modules` and `.git`.

## Canonical Scanner Files

These are the current canonical files for the unified Device Connections experience.

- `app/power/blu.tsx`
  - Primary Device Connections screen.
  - Renders one production action list for currently discovered nearby power and OBD2 devices; saved, known, failed, cloud-only, generic, TV, headset, and unrelated Bluetooth rows stay out of the connectable list.
  - Uses `useUnifiedDeviceConnections`.

- `components/QuickActionsSheet.tsx`
  - Field Utilities Bluetooth entry point.
  - Routes to the canonical Device Connections screen instead of embedding a second scanner UI.

- `lib/useUnifiedDeviceConnections.ts`
  - Main orchestration hook for scan, connect, retry, clear/dismiss, and disconnect.
  - Calls `useOBD2Scanner`, `discoverEcoFlowDevicesForUnifiedScanner`, `discoverClassicBluetoothDevicesForUnifiedScanner`, `discoverMockDevicesForUnifiedScanner`, `mergeDiscoveredDevices`, `normalizeDiscoveredDevice`, `genericBluetoothAccessoryManager`, `powerBrandConnectionAdapters`, `connectEcoFlowCloudDevice`, `bluDeviceRegistry`, `bluStateStore`, `powerDeviceStore`, and `useVehicleTelemetry`.
  - Owns user-visible scan area states such as `idle`, `checking`, `scanning`, `results`, `empty`, `permission_denied`, `bluetooth_unavailable`, `runtime_unsupported`, `api_failed`, `ble_failed`, `classic_unsupported`, and `scan_failed`.

- `lib/unifiedDeviceDiscoveryAggregator.ts`
  - Normalizes and merges discovered devices across supported discovery lanes. Mock discovery is not a production lane.
  - `discoverClassicBluetoothDevicesForUnifiedScanner()` currently returns unsupported.

- `lib/scannerDeviceListState.ts`
  - Stable keys, dedupe, RSSI filtering, power-brand allowlist, dismiss cooldowns, and list upsert logic.

- `lib/bluetoothDeviceRouting.ts`
  - Routes Bluetooth devices to owner domains: power, telemetry, sensor, generic.

- `lib/bluetoothDevicePresentation.ts`
  - Presentation helpers for discovered Bluetooth devices.

- `lib/bluetoothBrandRegistry.ts`
  - Brand and device matching metadata for Bluetooth discovery.

- `lib/deviceConnectionSourceRouting.ts`
  - Normalizes device connection source/connection type.

- `lib/deviceConnectionRequestPolicy.ts`
  - User/auto connection request policy and route labels.

- `lib/deviceConnectionScanMessaging.ts`
  - Native Bluetooth runtime support messaging.

- `src/power/ble/BleScanReadiness.ts`
  - Shared BLE runtime readiness, native module diagnostics, Bluetooth state, permission and powered-on gate.

- `src/power/ble/BlePermissions.ts`
  - Platform BLE permission helper.

- `app.json`
  - iOS Bluetooth usage copy, Android Bluetooth permissions, `react-native-ble-plx` plugin.

- `android/app/src/main/AndroidManifest.xml`
  - Android Bluetooth permissions: `BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`.

## Must Preserve Files

Preserve these during cleanup because they are real scanner, real telemetry, canonical connection state, or safety/truthfulness guards.

- `app/power/blu.tsx`
- `components/QuickActionsSheet.tsx`
- `lib/useUnifiedDeviceConnections.ts`
- `lib/unifiedDeviceDiscoveryAggregator.ts`
- `lib/scannerDeviceListState.ts`
- `lib/bluetoothBrandRegistry.ts`
- `lib/bluetoothDevicePresentation.ts`
- `lib/bluetoothDeviceRouting.ts`
- `lib/deviceConnectionSourceRouting.ts`
- `lib/deviceConnectionRequestPolicy.ts`
- `lib/deviceConnectionScanMessaging.ts`
- `src/power/ble/BleScanReadiness.ts`
- `src/power/ble/BlePermissions.ts`
- `src/vehicle-telemetry/OBD2Adapter.ts`
- `src/vehicle-telemetry/useOBD2Scanner.ts`
- `src/vehicle-telemetry/OBD2PIDPoller.ts`
- `src/vehicle-telemetry/VehicleTelemetryService.ts`
- `src/vehicle-telemetry/VehicleTelemetryStore.ts`
- `src/vehicle-telemetry/VehicleTelemetryDeviceRegistry.ts`
- `src/vehicle-telemetry/useVehicleTelemetry.ts`
- `components/vehicle-telemetry/BluetoothScannerDeviceRow.tsx`
- Vehicle Telemetry scanner entry points now route to `app/power/blu.tsx`; the old OBD-only scanner modal was removed.
- `lib/BluDeviceRegistry.ts`
- `lib/BluSessionStore.ts`
- `lib/BluStateStore.ts`
- `lib/BluPowerAuthority.ts`
- `lib/bluetoothAccessoryRegistry.ts`
- `lib/genericBluetoothAccessoryManager.ts`
- `lib/bluetoothLiveTelemetry.ts`
- `lib/createNativeBleBluAdapter.ts`
- `lib/RedarcBluAdapter.ts`
- `lib/DakotaLithiumBluAdapter.ts`
- `lib/powerBrandConnectionAdapters.ts`
- `lib/EcsProviderRegistry.ts`
- `lib/IEcsPowerProvider.ts`
- `lib/ecoflowUnifiedScannerDiscovery.ts`
- `lib/ecoflowCloudConnection.ts`
- `lib/ecoflowBluTelemetryEligibility.ts`
- `lib/ecoflowUnauthorizedDevice.ts`
- `src/power/cloud/providers/EcoFlowCloudProvider.ts`
- `src/power/devices/PowerDeviceStore.ts`
- `supabase/functions/ecoflow/index.ts`

Note: EcoFlow cloud files are must-preserve as cloud/API power integration, not as proof that Bluetooth works.

## Legacy, Mock, Or UI-Only Scanner Files

These files are not acceptable as production-facing Bluetooth scanner paths without migration to the canonical unified scanner.

- `components/power-setup/ConnectionStep.tsx`
  - Legacy provider setup UI.
  - Uses `useBluConnection`.
  - Contains user-facing notes that several providers are UI-only or simulated fallback paths.
  - Shows "Bluetooth Setup Needs Attention".
  - Should not claim Bluetooth is working unless backed by the unified scanner.

- `lib/useBluConnection.ts`
  - Legacy BLU provider connection hook used by setup and still consumed by the unified hook for provider state.
  - Aggregates many brand adapters, including simulated/placeholder adapters.
  - Keep temporarily as a compatibility bridge, but it should not be the primary user-facing scanner.

- `lib/createSimulatedBluAdapter.ts`
  - Explicit simulated BLU discovery/connect/telemetry adapter.
  - Guarded by `isDevMockTelemetryAllowed`, but still a production import risk.
  - Removal candidate from production runtime.

- `lib/BluettiBluAdapter.ts`
- `lib/AnkerSolixBluAdapter.ts`
- `lib/JackeryBluAdapter.ts`
- `lib/GoalZeroBluAdapter.ts`
- `lib/RenogyBluAdapter.ts`
  - Brand-specific legacy adapters with simulated fallback behavior or native scan placeholders.
  - Several paths emit simulated devices and simulated telemetry.
  - These should be removed, dev-only, or replaced with real `createNativeBleBluAdapter` implementations before being exposed.

- `src/power/connectors/MockPowerConnector.ts`
  - Mock/simulated `IPowerConnector`.
  - `getDiscoveredDevices()` returns a fake `ECS Simulator`.
  - Removal/dev-only candidate.

- `src/power/connectors/BleConnector.ts`
  - Generic BLE transport connector outside the unified scanner route.
  - Not directly wired to Device Connections.
  - Candidate to fold into the canonical engine or remove if unused.

- `src/features/power/components/PowerDeviceScanner.tsx`
  - Legacy "Found nearby power devices" scanner component.
  - Exported by feature package but not found as an active app route consumer in this audit.
  - Removal candidate.

- `src/features/power/services/powerDiscoveryService.ts`
  - Parallel power-device discovery service.
  - Aggregates feature adapters instead of the unified scanner.
  - Candidate to remove or convert into a thin adapter over `useUnifiedDeviceConnections`/canonical engine.

- `src/features/power/adapters/bluettiAdapter.ts`
- `src/features/power/adapters/ankerSolixAdapter.ts`
  - Feature adapters with `supportsBle: true`, `discover: async () => []`, and no-op connect/disconnect.
  - UI-only capability risk.

- `app/obd-setup.tsx`
- `app/vehicle-telemetry-settings.tsx`
- `components/dashboard/VehicleTelemetryWidget.tsx`
- `components/dashboard/DashboardHeader.tsx`
  - Standalone OBD scanner entry points using `useOBD2Scanner` directly.
  - These are real OBD paths, not fake, but they duplicate scanner UI outside the unified Device Connections panel.
  - Migration candidate: keep OBD functionality, route scanner entry to Device Connections with telemetry/OBD filtering.

- `app/vehicle-twin.tsx`
- `components/vehicle-twin/EcoFlowPickerModal.tsx`
- `lib/useEcoFlowLive.ts`
- `lib/ecoFlowSelectionStore.ts`
  - Legacy EcoFlow picker/live telemetry path, cloud/API based.
  - Should not be presented as Bluetooth capability.
  - Migrate selection to unified Device Connections and Power Center cloud-device flows.

- `app/power/devices.tsx`
  - EcoFlow cloud device picker/catalog.
  - User-facing copy includes "BLE Active" statuses for non-EcoFlow brands near the bottom of the file.
  - This is not proof of native Bluetooth and should be audited before the unified scanner cleanup ships.

## UI Components Currently Showing Bluetooth State

- `app/power/blu.tsx`
  - Canonical full-screen Device Connections UI.

- `components/QuickActionsSheet.tsx`
  - Canonical quick panel for Device Connections.

- `components/power-setup/ConnectionStep.tsx`
  - Legacy setup UI with Bluetooth attention and provider notes.

- Vehicle Telemetry scan actions
  - Route to canonical Device Connections instead of opening a separate OBD scanner modal.

- `components/vehicle-telemetry/BluetoothScannerDeviceRow.tsx`
  - Row component for Bluetooth scanner devices.

- `app/obd-setup.tsx`
  - OBD setup route redirects to canonical Device Connections.

- `app/vehicle-telemetry-settings.tsx`
  - Telemetry settings screen routes scanner actions to canonical Device Connections.

- `components/dashboard/VehicleTelemetryWidget.tsx`
  - Dashboard telemetry widget routes scanner actions to canonical Device Connections.

- `components/dashboard/DashboardHeader.tsx`
  - Dashboard header consumes `useOBD2Scanner`.

- `app/power/index.tsx`
  - Power Center / EcoFlow power live state.

- `app/power/devices.tsx`
  - EcoFlow cloud/catalog device picker and connection state labels.

- `app/vehicle-twin.tsx`
  - Vehicle Twin EcoFlow live panel and picker.

- `components/vehicle-twin/EcoFlowPickerModal.tsx`
  - Legacy EcoFlow cloud picker.

- `src/features/power/components/PowerDeviceScanner.tsx`
  - Legacy scanner component; likely unused, but still exported.

## Stores And State Machines Involved

- `lib/BluDeviceRegistry.ts`
  - Persisted key: `ecs.blu.devices.v1`.
  - Stores provider devices, primary device, connection state, and registry updates.

- `lib/BluSessionStore.ts`
  - Persisted key: `ecs.blu.session.v1`.
  - Stores provider, primary device, polling state, connection state, disconnect reason, and freshness.

- `lib/BluStateStore.ts`
  - Live BLU summary and per-device telemetry cache.
  - Computes `live`, `reconnecting`, `updating`, `stale`, and `disconnected`.
  - Rejects mock telemetry through `bluetoothLiveTelemetry` guard.

- `lib/bluetoothAccessoryRegistry.ts`
  - Persisted key: `ecs.bluetooth.accessories.v1`.
  - Stores generic/sensor Bluetooth accessories and connection state.

- `src/vehicle-telemetry/VehicleTelemetryDeviceRegistry.ts`
  - Uses `VT_STORAGE_KEYS.DEVICES` and `VT_STORAGE_KEYS.PRIMARY_DEVICE`.
  - Restores OBD/vehicle telemetry devices and resets connection state to disconnected on launch.

- `src/vehicle-telemetry/VehicleTelemetryStore.ts`
  - Stores latest normalized OBD telemetry, summary, source/freshness, and last-known values.
  - Rejects `mock_dev` unless explicit mock Bluetooth flag is enabled.

- `src/power/devices/PowerDeviceStore.ts`
  - Persisted key: `ecs.power.selectedDevices.v1`.
  - Stores selected cloud/catalog power devices.

- `lib/ecoFlowSelectionStore.ts`
  - Legacy selected EcoFlow device state used by `useEcoFlowLive`.

- `lib/BluPowerAuthority.ts`
  - Aggregates BLU/provider power state for dashboard and other consumers.

- `lib/EcsProviderRegistry.ts`
  - Provider registry/orchestration layer.
  - Normalizes provider readings and blocks mock sources through truth guards.

## Connection And Disconnect Handling

- `lib/useUnifiedDeviceConnections.ts`
  - Canonical UI actions for connect/disconnect/retry/clear.
  - EcoFlow cloud/API connect: `activateEcoFlowCloudDevice()` -> `connectEcoFlowCloudDevice()` -> `PowerDeviceStore` and BLU/power state updates.
  - OBD2 connect: `useOBD2Scanner().connectToDevice()`.
  - Generic/sensor connect: `genericBluetoothAccessoryManager.connect()`.
  - Power provider connect: `getPowerBrandConnectionAdapterForDevice()` and `ecsProviderRegistry`.
  - Disconnect: brand adapter disconnect, `useVehicleTelemetry().disconnectProvider`, `genericBluetoothAccessoryManager.disconnect()`, and registry state updates depending on route.

- `src/vehicle-telemetry/OBD2Adapter.ts`
  - `startScan()`, `stopScan()`, `connectToDevice()`, `disconnect()`, health check disconnect, device disconnect monitor, reconnect handling.

- `src/vehicle-telemetry/VehicleTelemetryService.ts`
  - `disconnect()`, adapter unbinding, registry connection state updates, service events.

- `lib/useBluConnection.ts`
  - Legacy connect/disconnect/refresh entry point over brand adapters.
  - Must be downgraded to compatibility-only during migration.

## OBD2 Transport, Parser, Pipeline, And Widgets

Transport and scanner:

- `src/vehicle-telemetry/OBD2Adapter.ts`
  - Native BLE scanner and connection adapter using `react-native-ble-plx`.
  - OBD name patterns include `OBD`, `ELM327`, `VLink`, `VeePeak`, `BAFX`, `OBDLink`, `Vgate`, `BlueDriver`, etc.
  - Uses `ensureBleScanReadiness`, `waitForBlePoweredOn`, `getBleRuntimeDiagnostics`, and BLE runtime unsupported helpers.
  - Discovers services/characteristics, writes ELM327 commands, monitors notifications, starts PID polling, and emits telemetry events.

Parser and poller:

- `src/vehicle-telemetry/OBD2PIDPoller.ts`
  - `parseELM327Response()`.
  - Parses PID responses and battery voltage responses.
  - Polls RPM, speed, coolant temperature, engine load, fuel level, intake air temperature, runtime, throttle position, fuel rate, and MAF where supported.
  - Produces normalized telemetry with source `bluetooth_obd_live`.

Service and storage:

- `src/vehicle-telemetry/VehicleTelemetryService.ts`
  - Attaches adapter to store, emits lifecycle events, updates registry state, handles disconnect/reconnect.

- `src/vehicle-telemetry/VehicleTelemetryStore.ts`
  - Ingests normalized telemetry and exposes summary/freshness snapshots.

- `src/vehicle-telemetry/VehicleTelemetryDeviceRegistry.ts`
  - Stores known OBD devices and primary device.

Hooks and UI:

- `src/vehicle-telemetry/useOBD2Scanner.ts`
- `src/vehicle-telemetry/useVehicleTelemetry.ts`
- `app/power/blu.tsx`
- `components/vehicle-telemetry/BluetoothScannerDeviceRow.tsx`
- `components/dashboard/VehicleTelemetryWidget.tsx`
- `components/dashboard/WidgetRenderers.tsx`
- `components/dashboard/DashboardHeader.tsx`
- `app/(tabs)/dashboard.tsx`
- `app/obd-setup.tsx`
- `app/vehicle-telemetry-settings.tsx`

## EcoFlow Cloud Integration Files

These files are cloud/API integration, not native Bluetooth proof.

- `src/power/cloud/providers/EcoFlowCloudProvider.ts`
  - EcoFlow cloud provider.
  - Calls Supabase edge functions for device catalog and per-device telemetry.
  - Tracks `pending_approval`, `unauthorized`, `unauthorizedDeviceIds`, `_lastCloudError`, simulation fallback, and per-device poll results.
  - Surfaces cloud authorization errors and pending approval states.

- `supabase/functions/ecoflow/index.ts`
  - Supabase edge function for EcoFlow integration.

- `lib/ecoflowUnifiedScannerDiscovery.ts`
  - Unified scanner API source adapter for EcoFlow catalog devices.
  - Calls `EcoFlowCloudProvider.listDevices()`.
  - Logs edge function start/success/error.

- `lib/ecoflowCloudConnection.ts`
  - Connects selected EcoFlow cloud devices and normalizes cloud telemetry into ECS power state.

- `lib/EcoFlowBluAdapter.ts`
  - Legacy EcoFlow BLU adapter backed by cloud/API catalog and telemetry eligibility.
  - Tracks unauthorized devices and can enter no-eligible-device states.
  - Should not be treated as native Bluetooth.

- `lib/ecoflowBluTelemetryEligibility.ts`
  - Determines EcoFlow telemetry eligibility from cloud/catalog metadata.

- `lib/ecoflowUnauthorizedDevice.ts`
  - Classifies unauthorized EcoFlow cloud telemetry errors.

- `lib/useEcoFlowLive.ts`
  - Legacy hybrid EcoFlow live telemetry hook used by Vehicle Twin.

- `lib/ecoFlowSelectionStore.ts`
  - Legacy persisted EcoFlow selection helpers.

- `src/features/power/adapters/ecoflowAdapter.ts`
  - Feature power adapter for EcoFlow cloud telemetry/catalog.

- `app/power/index.tsx`
- `app/power/devices.tsx`
- `app/vehicle-twin.tsx`
- `components/vehicle-twin/EcoFlowPickerModal.tsx`
  - User-facing cloud/catalog selection and display surfaces.

## Exact Removal Candidates

Remove, dev-only gate, or migrate these before claiming there is one real unified Bluetooth scanner:

1. `components/power-setup/ConnectionStep.tsx`
   - Replace provider-specific legacy Bluetooth setup with navigation to `app/power/blu.tsx` or embedded `useUnifiedDeviceConnections`.

2. `src/features/power/components/PowerDeviceScanner.tsx`
   - Remove if unused; otherwise rewrite as a thin presenter over the canonical scanner.

3. `src/features/power/services/powerDiscoveryService.ts`
   - Remove as a scanner source; do not run parallel discovery outside unified scanner.

4. `src/features/power/adapters/bluettiAdapter.ts`
5. `src/features/power/adapters/ankerSolixAdapter.ts`
   - Remove UI-only BLE capabilities or wire to real canonical scanner/provider adapters.

6. `src/power/connectors/MockPowerConnector.ts`
   - Move to dev/test-only or remove from production exports.

7. `lib/createSimulatedBluAdapter.ts`
   - Move to dev/test-only or remove from production imports.

8. `lib/BluettiBluAdapter.ts`
9. `lib/AnkerSolixBluAdapter.ts`
10. `lib/JackeryBluAdapter.ts`
11. `lib/GoalZeroBluAdapter.ts`
12. `lib/RenogyBluAdapter.ts`
   - Replace simulated/placeholder scanning with real `createNativeBleBluAdapter` implementations or mark unavailable until supported.

13. `app/vehicle-twin.tsx`
14. `components/vehicle-twin/EcoFlowPickerModal.tsx`
15. `lib/useEcoFlowLive.ts`
16. `lib/ecoFlowSelectionStore.ts`
   - Migrate EcoFlow selection into unified Device Connections / Power Center cloud catalog path.

17. `app/obd-setup.tsx`
18. `app/vehicle-telemetry-settings.tsx`
19. `components/dashboard/VehicleTelemetryWidget.tsx`
20. `components/dashboard/DashboardHeader.tsx`
   - Keep OBD logic, but remove duplicate scanner UI entry points after Device Connections supports OBD-focused launch/filtering.

21. `src/power/connectors/BleConnector.ts`
   - Fold into canonical native BLE engine or remove if no active supported provider depends on it.

22. `app/power/devices.tsx`
   - Keep cloud catalog, but remove or reword "BLE Active" claims for brands not backed by canonical native BLE scanner.

## Proposed Migration Order

1. Freeze scanner truth contract.
   - Define "Bluetooth working" as native BLE runtime readiness plus scanner callbacks from the canonical engine, not EcoFlow cloud authorization.
   - Keep cloud/API devices labeled as cloud/API.

2. Consolidate UI entry points.
   - Keep `app/power/blu.tsx` and `components/QuickActionsSheet.tsx`.
   - Replace `components/power-setup/ConnectionStep.tsx` Bluetooth setup actions with the canonical Device Connections UI.
   - Remove or gate user-facing copy that says a provider path is UI-only/simulated.

3. Move OBD scanner entry points behind unified scanner.
   - Add a route/filter mode for telemetry/OBD in Device Connections.
   - Update OBD setup/settings/dashboard buttons to launch that mode.
   - Keep `OBD2Adapter`, `useOBD2Scanner`, parser, service, registry, and store.

4. Separate EcoFlow Cloud from Bluetooth.
   - Preserve EcoFlow cloud/catalog integration.
   - Ensure all EcoFlow cloud UI says cloud/API, not Bluetooth.
   - Remove cloud authorization as a proxy for BLE health.

5. Remove simulated provider adapters from production.
   - Move `createSimulatedBluAdapter` and `MockPowerConnector` to test/dev-only if still needed by tests.
   - Replace `Bluetti`, `AnkerSolix`, `Jackery`, `GoalZero`, and `Renogy` placeholder adapters with unavailable states or real native adapters.

6. Decide what happens to generic BLE power connector.
   - Either integrate `src/power/connectors/BleConnector.ts` into the canonical engine or remove it from production exports.

7. Prune legacy feature discovery.
   - Remove `PowerDeviceScanner` and `powerDiscoveryService` or make them thin wrappers over canonical scanner state.

8. Update tests.
   - Keep existing scanner truthfulness tests.
   - Add tests that production UI cannot show simulated/mock Bluetooth devices unless explicit dev flags are enabled.
   - Add tests that EcoFlow cloud failure/unauthorized does not mark native Bluetooth failed.

## Risky Areas

- `lib/useUnifiedDeviceConnections.ts` currently uses OBD2 scanning as the native BLE scanner source. That means the unified scanner may miss non-OBD peripherals unless other native power/accessory scanners are integrated.

- `lib/useBluConnection.ts` remains a compatibility bridge and imports provider adapters with simulated/placeholder behavior. Leaving this as a user-facing path can reintroduce fake Bluetooth claims.

- EcoFlow has two active concepts that users can confuse:
  - EcoFlow Cloud/API telemetry.
  - Native Bluetooth availability.
  These need strict labels and separate health states.

- Multiple OBD UI entry points can launch scanner flows outside the unified scanner. They are real BLE paths, but duplicate the scanner UX and state.

- Existing tests explicitly check Bluetooth truthfulness and scanner blockers. Cleanup should preserve those guardrails and expand them around UI surfaces.

- Removing mock/simulated adapters may break tests that intentionally inspect mock gating. Migrate those tests to assert dev-only location/flags rather than production availability.

## Relevant Test Commands Available

From `package.json`:

- `npm run test:bluetooth-live`
- `npm run test:bluetooth-scanner`
- `npm run test:bluetooth-classification`
- `npm run test:power-brand-adapters`
- `npm run test:ecoflow-unified-scanner`
- `npm run test:ecoflow-blu-telemetry-eligibility`
- `npm run test:blu-state-store-telemetry-guard`
- `npm run test:unified-device-discovery`
- `npm run test:scanner-device-state`
- `npm run test:device-connection-routing`
- `npm run test:device-connection-request-policy`
- `npm run test:device-connection-scan-messaging`
- `npm run test:device-connection-diagnostics`
- `npm run test:ecoflow-cloud-connection`
- `npm run test:telemetry-discovery-stability`
- `npm run test:telemetry-detail-panel`
- `npm run test:telemetry-render-loop-guards`
- `npm run test:vehicle-telemetry-live`
- `npm run test:power-provider-boundary`
- `npm run lint`

Recommended cleanup regression set:

```bash
npm run test:bluetooth-live
npm run test:bluetooth-scanner
npm run test:bluetooth-classification
npm run test:unified-device-discovery
npm run test:scanner-device-state
npm run test:ecoflow-unified-scanner
npm run test:ecoflow-cloud-connection
npm run test:vehicle-telemetry-live
npm run test:power-provider-boundary
```
