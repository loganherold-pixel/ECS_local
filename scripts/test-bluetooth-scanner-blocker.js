const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const adapter = read('src/vehicle-telemetry/OBD2Adapter.ts');
const troubleshootingDoc = read('docs/bluetooth-unified-scanner-troubleshooting.md');
for (const marker of [
  '[BT_SCAN] scan_button_pressed',
  '[BT_SCAN] device_raw_seen',
  '[BT_SCAN] device_normalized',
  '[BT_SCAN] device_upserted',
  '[BT_SCAN] device_dropped',
  '[BT_SCAN:ECOFLOW]',
  '[OBD2] telemetry_store_updated',
]) {
  assert(troubleshootingDoc.includes(marker), `scanner troubleshooting doc must include ${marker}`);
}
for (const marker of [
  '[BT_BLOCKER]',
  'scan_button_pressed',
  'permissions_status',
  'permissions',
  'adapter_state',
  'manager_ready',
  'scan_start',
  'scan_started',
  'device_raw_seen',
  'raw_device',
  'device_normalized',
  'device_filtered_out',
  'device_added',
  'accepted_device',
  'filtered_device',
  'normalized_count',
  'scan_stopped',
  'scan_error',
  'scan_stop',
]) {
  assert(adapter.includes(marker), `raw BLE scanner must log ${marker}`);
}
assert(
  adapter.includes('mgr.startDeviceScan(\n        null,\n        { allowDuplicates: true },') &&
    adapter.includes('{ allowDuplicates: true }'),
  'raw BLE scanner must scan without service UUID filters and allow duplicate updates',
);
assert(
  adapter.includes("return `${isLikelyOBD ? 'OBD2 Adapter' : 'Unknown device'} ${suffix}`"),
  'unnamed devices must receive an Unknown device fallback row label with a partial id',
);
assert(
  adapter.includes('buildTemporaryDiscoveryId') &&
    adapter.includes("'temporary'") &&
    adapter.includes("'ble'") &&
    adapter.includes("reason: 'missing_stable_identifier'"),
  'raw BLE scanner must create temporary discovery ids for namable/manufacturer-identifiable devices without hardware ids',
);
assert(
  adapter.includes('manufacturerData?: string | null') &&
    adapter.includes('manufacturerDataPresent') &&
    adapter.includes('manufacturerData,'),
  'raw BLE scanner must preserve manufacturer data for downstream provider classification',
);
assert(
  adapter.includes('rawScanLogAtByDeviceId') &&
    adapter.includes('shouldLogRawScanSighting') &&
    adapter.includes('now - previous < 2500'),
  'raw BLE scanner must throttle repeated raw sightings for the same device',
);
assert(
  adapter.includes('waitForPoweredOn') &&
    adapter.includes('waitForBlePoweredOn') &&
    adapter.includes('initialBluetoothState'),
  'raw BLE scanner must use the shared readiness helper to wait for native BLE state before scanning',
);
assert(
  !adapter.includes("'fff0', 'ffe0'"),
  'common UART service UUIDs must not be treated as OBD-only scan filters because they collide with power-device pipelines',
);
assert(
  !adapter.includes('return entry.isLikelyOBD') && !adapter.includes('if (!isLikelyOBD) return'),
  'raw scanner must not gate rendered scan results to only likely OBD devices',
);
assert(
  adapter.includes('private scanSessionId = 0') &&
    adapter.includes('const scanSessionId = this.scanSessionId') &&
    adapter.includes("reason: 'stale_scan_session'"),
  'raw BLE scanner must use scan session ids to ignore stale callbacks',
);
assert(
  adapter.includes('this.clearScanTimers();') &&
    adapter.includes("this.stopNativeDeviceScan('pre_scan_cleanup', false)") &&
    adapter.includes("this.stopScan('timeout')"),
  'raw BLE scanner must clean up existing scans and enforce timeout cleanup',
);

const permissions = read('src/power/ble/BlePermissions.ts');
assert(
  permissions.includes('ANDROID_BLE_PERMISSIONS.ACCESS_FINE_LOCATION as any'),
  'BLE permission flow must include location permission for scan callback reliability',
);
assert(
  permissions.includes('if (!locationGranted) missing.push(ANDROID_BLE_PERMISSIONS.ACCESS_FINE_LOCATION)'),
  'BLE permission precheck must report missing location permission',
);
assert(
  permissions.includes('formatBlePermissionDeniedMessage') &&
    permissions.includes('Bluetooth permission is required to scan.') &&
    permissions.includes('Android also requires location permission for nearby Bluetooth discovery.'),
  'BLE permission denial copy must be centralized and explain location when required',
);

const readiness = read('src/power/ble/BleScanReadiness.ts');
assert(
  readiness.includes('ensureBleScanReadiness') &&
    readiness.includes('waitForBlePoweredOn') &&
    readiness.includes('manager.onStateChange') &&
    readiness.includes("bluetoothState !== 'PoweredOn'"),
  'BLE scan readiness helper must gate scan start on permission, manager readiness, and powered-on adapter state',
);
assert(
  readiness.includes("missing: ['runtime.expo_go']") &&
    readiness.includes('Expo Go and web preview do not include the native Bluetooth scanner'),
  'BLE scan readiness helper must surface an Expo Go/current-runtime unsupported message',
);
assert(
  readiness.includes('export function isBleNativeModuleUnavailableError') &&
    readiness.includes('createclient') &&
    readiness.includes('bleclientmanager') &&
    readiness.includes('cannot read property') &&
    readiness.includes('getBleRuntimeUnsupportedMessage()'),
  'BLE scan readiness helper must classify Expo Go/react-native-ble-plx native createClient failures as runtime unsupported',
);

const unified = read('lib/useUnifiedDeviceConnections.ts');
for (const marker of [
  '[BT_BLOCKER] entry_opened',
  '[BT_SCAN] scan_button_pressed',
  '[BT_SCAN] brand_matched',
  '[BT_SCAN] connection_ready',
  '[BT_BLOCKER] scan_start',
  '[BT_BLOCKER] rendered_count',
  'rawScanDevices',
  'routedAccessories',
]) {
  assert(unified.includes(marker), `unified scanner hook must expose ${marker}`);
}
assert(
  unified.includes('isReleaseScannerBluetoothRoute') &&
    unified.includes("entry.routing.owner === 'sensor' || entry.routing.owner === 'generic'") &&
    unified.includes('releaseAccessoryDevices'),
  'generic Bluetooth noise must stay hidden while Bluestack propane/water utility sensors can become visible release rows',
);
assert(
  unified.includes('telemetryFallbackCandidateDiscoveries') &&
    unified.includes('OBD2 Candidate') &&
    unified.includes('Tap Connect to test the ELM327 handshake') &&
    unified.includes('OBD2_FALLBACK_CANDIDATE_LIMIT') &&
    unified.includes('OBD2_STRONG_UNKNOWN_CANDIDATE_MIN_RSSI'),
  'unified scanner must surface capped OBD2 fallback candidates when no branded OBD2 adapter is found',
);
assert(
  unified.includes("await stopScan('connect_attempt')"),
  'scanner must stop with an explicit connect-attempt reason before connecting',
);
assert(
  !unified.includes('const [scanStarted') &&
    !unified.includes('void rescan();\n  }, [rescan, scanStarted]'),
  'unified Device Connections must not auto-start scanning on mount',
);
assert(
  unified.includes("const [manualScanStatus, setManualScanStatus]") &&
    unified.includes("scanStatus: manualScanStatus") &&
    unified.includes("hasUserRequestedScan: manualScanStatus !== 'idle'") &&
    unified.includes("hasCompletedManualScan: manualScanStatus === 'completed'"),
  'unified Device Connections must distinguish idle, scanning, and completed manual scan states',
);
assert(
  unified.includes("setManualScanStatus('scanning');") &&
    unified.includes("setManualScanStatus('completed');"),
  'manual scan button path must own scan lifecycle state transitions',
);
assert(
    unified.includes("ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] scan_idle'") &&
    unified.includes("ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] manual_scan_requested'") &&
    unified.includes("ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] scan_start'") &&
    unified.includes("ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] scan_result'"),
  'unified Device Connections must log idle, manual scan request, manual scan start, and result count through ecsLog without device payloads',
);
assert(
  unified.includes("return obdError ?? 'Bluetooth permission is required to scan.'"),
  'Device Connections must surface the permission-denied message from the manual scan flow',
);
assert(
  unified.includes("export type ECSConnectionScanAreaState") &&
    unified.includes("scanAreaState: ECSConnectionScanAreaState") &&
    unified.includes("return 'permission_denied'") &&
    unified.includes("return 'bluetooth_unavailable'") &&
    unified.includes("return 'runtime_unsupported'") &&
    unified.includes("return 'api_failed'") &&
    unified.includes("return 'ble_failed'") &&
    unified.includes("return 'classic_unsupported'") &&
    unified.includes("return 'scan_failed'") &&
    unified.includes("return 'empty'") &&
    unified.includes("return 'idle'"),
  'unified Device Connections must expose explicit live scan-area UI states',
);
assert(
  unified.includes("return obdError ?? 'Bluetooth permission is required to scan.'") &&
    unified.includes("return obdError ?? 'Bluetooth is unavailable or turned off.'") &&
    unified.includes("return obdError ?? 'Bluetooth scan failed. Check permissions and Bluetooth state, then try again.'") &&
    unified.includes("return 'API discovery failed. BLE results remain available when nearby devices are seen.'") &&
    unified.includes("return 'Classic Bluetooth unsupported in this runtime. BLE, API, and cached devices remain visible.'") &&
    unified.includes("return 'No nearby devices found. Make sure the device is powered on, nearby, and discoverable.'") &&
    unified.includes("return 'Tap Scan for Device Connections to search nearby Bluetooth devices.'"),
  'unified Device Connections must expose exact scan-area messages for idle, empty, permission, and unavailable states',
);
assert(
  unified.includes('export interface ECSScanSummary') &&
    unified.includes('rawDevicesSeenCount') &&
    unified.includes('filteredDevicesCount') &&
    unified.includes('filterReasons') &&
    unified.includes('sourceStatuses') &&
    unified.includes('bluetoothDiagnostics') &&
    unified.includes('lastScanSummary'),
  'unified Device Connections must expose a last scan summary with raw, filtered, reasons, source status counts, and native BLE diagnostics',
);
assert(
  unified.includes("makeDiscoverySourceSummary('ble', 'scanning'") &&
    unified.includes("makeDiscoverySourceSummary('ecoflow_api', 'scanning'") &&
    unified.includes("makeDiscoverySourceSummary('classic_bluetooth', 'scanning'") &&
    unified.includes("updateDiscoverySourceStatus("),
  'manual scanner flow must track BLE/API/Classic source states visibly',
);
assert(
  unified.includes("export type ECSConnectionSection = 'connected' | 'nearby' | 'known' | 'attention'") &&
    unified.includes("return 'known'") &&
    unified.includes('knownDevices'),
  'saved/known devices must remain in the production known-device section after disconnects',
);
assert(
  unified.includes('sortDevices([...powerDevices, ...telemetryDevices, ...releaseAccessoryDevices])') &&
    !unified.includes('sortDevices([...powerDevices, ...telemetryDevices, ...accessoryDevices])') &&
    unified.includes('unsupported_bluetooth_noise_hidden'),
  'release scanner rows must include power, telemetry, and vetted Bluestack utility sensors while counting generic Bluetooth noise in diagnostics',
);
assert(
  unified.includes('stopScanning: (reason?: string) => Promise<void>;') &&
    unified.includes("const stopScanning = useCallback") &&
    unified.includes("current === 'scanning' ? 'completed' : current"),
  'unified scanner hook must expose cleanup that stops active scans without retriggering them',
);
assert(
    unified.includes("discoverEcoFlowDevicesForUnifiedScanner") &&
    unified.includes("from './ecoflowUnifiedScannerDiscovery';") &&
    unified.includes('const ecoFlowDiscovery = discoverEcoFlowDevicesForUnifiedScanner()') &&
    unified.includes('setDiscoveredPowerDevices((current) =>') &&
    unified.includes('Promise.allSettled([bleScan, ecoFlowDiscovery, classicDiscovery])'),
  'manual scanner flow must run EcoFlow API discovery in parallel with BLE and bridge results into the unified device list',
);
assert(
  unified.includes('discoverClassicBluetoothDevicesForUnifiedScanner') &&
    !unified.includes('discoverMockDevicesForUnifiedScanner') &&
    unified.includes('mergeDiscoveredDevices') &&
    unified.includes('normalizeDiscoveredDevice'),
  'manual scanner flow must use the source-aware unified discovery aggregator for BLE/API/Classic lanes without a production mock lane',
);
assert(
  unified.includes('upsertScannerDeviceList') &&
    unified.includes('upsertDiscoveredPowerDeviceList') &&
    unified.includes("'ecoflow_api_success'") &&
    unified.includes('setDiscoveredPowerDevices((current) =>'),
  'EcoFlow API scan refreshes must use functional scanner-state upserts without dropping other discovered power devices',
);
const scannerState = read('lib/scannerDeviceListState.ts');
assert(
  scannerState.includes('getScannerDeviceStableKey') &&
    scannerState.includes('upsertScannerDeviceList') &&
    scannerState.includes('clearScannerDeviceList') &&
    scannerState.includes('device_upserted') &&
    scannerState.includes('device_deduped') &&
    scannerState.includes('device_dropped') &&
    scannerState.includes('list_cleared') &&
    scannerState.includes('temporary:'),
  'scanner device list state must centralize upsert, dedupe, fallback ids, drops, and explicit clear logging',
);
assert(
  unified.includes('scanInFlightRef') &&
    unified.includes('activeScanSessionRef') &&
    unified.includes("reason: scanInFlightRef.current || isRefreshing ? 'scan_pending' : 'batch_busy'") &&
    unified.includes('isCurrentScanSession()'),
  'manual scanner flow must guard same-frame duplicate taps and ignore stale source callbacks',
);
assert(
  unified.includes("return 'Refrigerator';") &&
    unified.includes('EcoFlow Glacier refrigerator found through the EcoFlow API'),
  'unified scanner UI model must expose EcoFlow Glacier refrigerator category and API-ready detail copy',
);

const ecoflowScannerDiscovery = read('lib/ecoflowUnifiedScannerDiscovery.ts');
for (const marker of [
  '[BT_SCAN:ECOFLOW]',
  'edge_function_start',
  'edge_function_success',
  'device_count',
  'glacier_detected',
  'normalize_failed',
  'edge_function_error',
]) {
  assert(ecoflowScannerDiscovery.includes(marker), `EcoFlow scanner discovery must log ${marker}`);
}
assert(
  ecoflowScannerDiscovery.includes('throw new EcoFlowCloudDiscoveryError') &&
    unified.includes("updateDiscoverySourceStatus(\n              current,\n              'ecoflow_api',\n              'failed'"),
  'EcoFlow API failures must surface as a failed source status without blocking BLE discovery',
);
assert(
  ecoflowScannerDiscovery.includes('new EcoFlowCloudProvider()') &&
    ecoflowScannerDiscovery.includes('provider.listDevices()'),
  'EcoFlow scanner discovery must use the existing EcoFlow cloud provider and edge-function-backed device list',
);
assert(
  ecoflowScannerDiscovery.includes("modelDisplayName: isGlacier ? 'EcoFlow Glacier Refrigerator' : model") &&
    ecoflowScannerDiscovery.includes("productType,") &&
    (
      ecoflowScannerDiscovery.includes("connectionType: isGlacier ? 'api' : 'hybrid'") ||
      ecoflowScannerDiscovery.includes("connectionType: 'api'")
    ),
  'EcoFlow scanner discovery must normalize Glacier devices as API-backed refrigerators in the common scanner model',
);
const unifiedAggregator = read('lib/unifiedDeviceDiscoveryAggregator.ts');
assert(
  unifiedAggregator.includes("export type UnifiedDiscoverySource =") &&
    unifiedAggregator.includes("'ble'") &&
    unifiedAggregator.includes("'classic_bluetooth'") &&
    unifiedAggregator.includes("'api'") &&
    unifiedAggregator.includes("'cached'") &&
    !unifiedAggregator.includes("'mock'"),
  'unified discovery aggregator must model BLE, Classic Bluetooth, API, and cached sources without a production mock source',
);
assert(
  unifiedAggregator.includes('normalizeDiscoveredDevice') &&
    unifiedAggregator.includes('mergeDiscoveredDevices') &&
    unifiedAggregator.includes('serial:') &&
    unifiedAggregator.includes('fallback:') &&
    unifiedAggregator.includes("return 'hybrid';"),
  'unified discovery aggregator must normalize and dedupe devices using stable ids, serials, and conservative fallback fingerprints',
);
assert(
  unifiedAggregator.includes('[BT_SCAN:CLASSIC] source_unsupported') &&
    !unifiedAggregator.includes('[BT_SCAN:MOCK] source_disabled') &&
    !unifiedAggregator.includes('mock_discovery_requires_explicit_enablement'),
  'classic discovery diagnostics must remain independent while the production mock discovery source is absent',
);

assert(
  !fs.existsSync(path.join(root, 'components', 'vehicle-telemetry', 'OBD2ScannerModal.tsx')),
  'OBD-only scanner modal must be removed now that Device Connections is canonical',
);
assert(
  adapter.includes("readiness.code === 'permission_denied' ? 'permission_denied' : 'adapter_unavailable'") &&
    adapter.includes('readiness.message') &&
    adapter.includes('reason: readiness.code') &&
    !adapter.includes('Bluetooth permissions required: ${permResult.missing.join'),
  'raw scanner must stop after denied readiness and avoid raw permission-id UI copy',
);
assert(
  adapter.includes('isBleNativeModuleUnavailableError') &&
    adapter.includes('getBleRuntimeUnsupportedMessage') &&
    adapter.includes('Failed to initialize Bluetooth manager'),
  'raw BLE/OBD connection path must convert native BLE manager initialization failures into a clear runtime message',
);
assert(
  adapter.includes("ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] scan_stop'") &&
    adapter.includes("this.stopScan('timeout')"),
  'raw scanner must log scan stop reasons including timeout through ecsLog',
);

const obdSetup = read('app/obd-setup.tsx');
assert(
  obdSetup.includes("router.replace('/power/blu')") &&
    obdSetup.includes('one production scanner for nearby power devices and OBD2 telemetry adapters'),
  'legacy OBD setup route must redirect to canonical Device Connections',
);
assert(
  !obdSetup.includes('scanner.startScan') &&
    !obdSetup.includes('useUnifiedOBD2Scanner') &&
    !obdSetup.includes('OBD2ScannerModal'),
  'legacy OBD setup route must not keep an independent scanner UI',
);

const powerConnectionStep = read('components/power-setup/ConnectionStep.tsx');
assert(
  !powerConnectionStep.includes('const timer = setTimeout(() => {\n      void startScan();') &&
    !powerConnectionStep.includes('}, 400);\n    return () => clearTimeout(timer);'),
  'power setup connection step must not auto-start scanning after provider selection',
);
assert(
  powerConnectionStep.includes('onPress={() => void startScan()}') &&
    powerConnectionStep.includes('SCAN FOR DEVICE CONNECTIONS'),
  'power setup connection step must still expose explicit user-started scan buttons',
);

const bluConnection = read('lib/useBluConnection.ts');
assert(
  bluConnection.includes('session_restore_requires_manual_scan') &&
    !bluConnection.includes('restored = await bluettiAdapter.restoreSession();') &&
    !bluConnection.includes('restored = await ankerSolixAdapter.restoreSession();'),
  'BLU hook startup restore must not auto-scan remembered sessions',
);

const nativeBleAdapter = read('lib/createNativeBleBluAdapter.ts');
assert(
  nativeBleAdapter.includes('Start a device scan before connecting.') &&
    !nativeBleAdapter.includes('} else if (active && this.connectionState !== \'connected\'') &&
    !nativeBleAdapter.includes('void this.restoreSession();'),
  'native BLE adapter must not auto-restore or auto-scan from app lifecycle/connect fallback',
);
assert(
  nativeBleAdapter.includes('isBleNativeModuleUnavailableError') &&
    nativeBleAdapter.includes('getBleRuntimeUnsupportedMessage') &&
    nativeBleAdapter.includes("return 'PLATFORM_UNSUPPORTED';") &&
    nativeBleAdapter.includes('return this.failScan(errorFromCode(errorCode), errorCode);'),
  'native BLE power adapter must report Expo Go/createClient native module failures as platform unsupported instead of Bluetooth disabled or per-device failures',
);

const deviceConnectionsScreen = read('app/power/blu.tsx');
const powerLayout = read('app/power/_layout.tsx');
assert(
  powerLayout.includes('<Stack.Screen name="blu"') &&
    powerLayout.includes('/power/blu') &&
    powerLayout.includes('Device Connections'),
  'Expo Router must register /power/blu as the active Device Connections route',
);
assert(
    !deviceConnectionsScreen.includes('PremiumAccessGate') &&
    !deviceConnectionsScreen.includes('featureLabel="Device connections"') &&
    deviceConnectionsScreen.includes('BLUESTACK UNIFIED SCANNER') &&
    deviceConnectionsScreen.includes('Scan for supported OBD2, power, propane, and water monitor connections'),
  'Bluestack must remain directly available for field device setup instead of being blocked by a Pro gate',
);
const globalHeader = read('components/Header.tsx');
const bluetoothNavigation = read('lib/bluetoothCommandNavigation.ts');
assert(
  globalHeader.includes('openUnifiedBluetoothCommand(router') &&
    globalHeader.includes('accessibilityHint="Opens device connections and Bluetooth controls"'),
  'global Bluetooth pill must route to the corrected Device Connections screen',
);
const dashboardHeader = read('components/dashboard/DashboardHeader.tsx');
assert(
  dashboardHeader.includes('openUnifiedBluetoothCommand(router') &&
    dashboardHeader.includes('accessibilityHint="Opens device connections and Bluetooth controls"'),
  'dashboard Bluetooth pill must route to the corrected Device Connections screen',
);
assert(
  bluetoothNavigation.includes("UNIFIED_BLUETOOTH_COMMAND_ROUTE = '/power/blu'") &&
    bluetoothNavigation.includes('openUnifiedBluetoothCommand') &&
    !globalHeader.includes("router.push('/power')") &&
    !dashboardHeader.includes("router.push('/power')"),
  'top banner Bluetooth launchers must share the canonical Device Connections route without a legacy Power fallback',
);
assert(
    deviceConnectionsScreen.includes('Ready to scan') &&
    deviceConnectionsScreen.includes('Scanning nearby devices') &&
    deviceConnectionsScreen.includes('No Bluestack devices found') &&
    deviceConnectionsScreen.includes('Permission needed') &&
    deviceConnectionsScreen.includes('Bluetooth off') &&
    deviceConnectionsScreen.includes('Runtime unsupported') &&
    deviceConnectionsScreen.includes('Scanner source failed') &&
    deviceConnectionsScreen.includes('BLE discovery failed') &&
    deviceConnectionsScreen.includes('Classic Bluetooth unsupported') &&
    deviceConnectionsScreen.includes('Scan failed') &&
    deviceConnectionsScreen.includes('connections.scanAreaMessage'),
  'Device Connections screen must show distinct idle, scanning, empty, permission, source failure, and unavailable scan states',
);
assert(
    !deviceConnectionsScreen.includes('Scan Visibility') &&
    !deviceConnectionsScreen.includes('Scan notes') &&
    !deviceConnectionsScreen.includes('connections.lastScanSummary') &&
    deviceConnectionsScreen.includes('title="Available devices"'),
  'Device Connections screen must keep scan diagnostics out of the normal scanner UI and place available devices directly under the hero scan action',
);
assert(
  !deviceConnectionsScreen.includes('Saved / Known') &&
    !deviceConnectionsScreen.includes('A zero-result nearby scan does not remove these records.') &&
    !deviceConnectionsScreen.includes('Failed / Needs Attention') &&
    !deviceConnectionsScreen.includes('connections.attentionDevices.map') &&
    deviceConnectionsScreen.includes('connectedReleaseDevices') &&
    deviceConnectionsScreen.includes('connections.knownDevices') &&
    deviceConnectionsScreen.includes('for (const device of connections.connectedDevices)') &&
    deviceConnectionsScreen.includes('isVisibleReleaseDevice') &&
    deviceConnectionsScreen.includes('visibleReleaseDevices') &&
    deviceConnectionsScreen.includes('for (const device of connections.devices)') &&
    deviceConnectionsScreen.includes('connections.nearbyDevices, connections.attentionDevices') &&
    !deviceConnectionsScreen.includes('onRescan={handleRescanPress}') &&
    !deviceConnectionsScreen.includes('actionLabel="Scan for Device Connections"') &&
    !deviceConnectionsScreen.includes('actionLabel="Scan for Devices"') &&
    deviceConnectionsScreen.includes('title="Connected devices"') &&
    deviceConnectionsScreen.includes('Live and attached Bluestack devices') &&
    deviceConnectionsScreen.includes('Connected devices are listed above') &&
    deviceConnectionsScreen.includes('title="Available devices"'),
  'Device Connections screen must render connected and remembered devices as visible controllable rows without duplicate scan buttons or failed containers',
);
assert(
  deviceConnectionsScreen.includes('useFocusEffect') &&
    deviceConnectionsScreen.includes("stopScanning('screen_blur')") &&
    deviceConnectionsScreen.includes('disabled={connections.isScanning}') &&
    deviceConnectionsScreen.includes('connections.isCheckingScanReadiness'),
  'Device Connections screen must stop scans on blur and prevent duplicate button starts while checking/scanning',
);
assert(
  deviceConnectionsScreen.includes("file: 'app/power/blu.tsx'") &&
    deviceConnectionsScreen.includes("hook: 'lib/useUnifiedDeviceConnections.ts'") &&
    deviceConnectionsScreen.includes("buttonText: 'Scan for Device Connections'"),
  'active Device Connections route must identify the corrected source file and visible scan button text in dev logs',
);

const quickActions = read('components/QuickActionsSheet.tsx');
assert(
  !quickActions.includes('const openDeviceConnections = useCallback') &&
    !quickActions.includes('openUnifiedBluetoothCommand(router') &&
    !quickActions.includes("key: 'bluetooth'") &&
    !quickActions.includes('onPress: openDeviceConnections') &&
    !quickActions.includes('function FieldUtilitiesBluetoothPanel()') &&
    !quickActions.includes('useUnifiedDeviceConnections()') &&
    !quickActions.includes('connections.scanAreaMessage'),
  'Field Utilities must not embed or duplicate Bluetooth; the global banner opens canonical Device Connections',
);

const powerCenter = read('app/power/index.tsx');
const moreTab = read('app/(tabs)/more.tsx');
assert(
  powerCenter.includes("router.push('/power/blu')") &&
    powerCenter.includes('DEVICE CONNECTIONS') &&
    moreTab.includes("router.push('/power/blu' as any)") &&
    moreTab.includes('Device Connections'),
  'Power Center and More tab entry points must route to /power/blu with current Device Connections labels',
);

const routing = read('lib/bluetoothDeviceRouting.ts');
assert(
  routing.includes('isReleaseScannerBluetoothRoute') &&
    routing.includes("owner: 'generic'") &&
    routing.includes("routeKey: 'bluetooth/generic'") &&
    routing.includes("providerLabel: 'Bluetooth Device'"),
  'provider classification must route unknown BLE devices generically while release scan visibility excludes them',
);
const presentation = read('lib/bluetoothDevicePresentation.ts');
const brandRegistry = read('lib/bluetoothBrandRegistry.ts');
assert(
  presentation.includes('matchBluetoothBrands') &&
    brandRegistry.includes('BLUETOOTH_BRAND_REGISTRY') &&
    brandRegistry.includes('BLUETTI_SERVICE_UUID') &&
    brandRegistry.includes('GOAL_ZERO_SERVICE_UUID') &&
    brandRegistry.includes('ANKER_SOLIX_SERVICE_UUID'),
  'provider classification must use existing power brand BLE service UUID pipelines',
);
assert(
  brandRegistry.includes("'Dakota Lithium'") &&
    brandRegistry.includes('dakota\\s*lithium') &&
    routing.includes("'Dakota Lithium': 'dakota_lithium'"),
  'provider classification must route Dakota Lithium broadcasts into the power pipeline',
);
assert(
  brandRegistry.includes("'Blue Eddy / BLUETTI'") &&
    brandRegistry.includes('blue\\s*eddy') &&
    brandRegistry.includes("'Anker / Solix'") &&
    brandRegistry.includes("'V Peak / Veepeak OBD2'"),
  'brand registry must support Blue Eddy/BLUETTI, Anker/Solix, and V Peak/Veepeak labels',
);
assert(
  presentation.includes("return suffix ? `Unknown device ${suffix}` : 'Unknown device';"),
  'provider presentation must render unnamed devices instead of requiring a display name',
);
assert(
  routing.includes('needsUserConfirmation') &&
    routing.includes("providerId: 'brand_confirmation'"),
  'routing must keep ambiguous multi-brand matches visible for user confirmation instead of dropping them',
);

console.log('Bluetooth scanner blocker checks passed.');
