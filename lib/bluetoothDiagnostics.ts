import { ecsLog } from './ecsLogger';

export type BluetoothDiagnosticSource =
  | 'native_ble'
  | 'permission'
  | 'unsupported_runtime'
  | 'provider_handshake'
  | 'ecoflow_cloud_auth'
  | 'cloud_access'
  | 'obd2_parser'
  | 'obd2_pid'
  | 'widget_telemetry'
  | 'transport'
  | 'app_state';

export type BluetoothDiagnosticEventType =
  | 'scanner_start'
  | 'scanner_stop'
  | 'permission_request'
  | 'permission_result'
  | 'bluetooth_power_state'
  | 'device_discovered'
  | 'device_classified'
  | 'connect_start'
  | 'connect_success'
  | 'connect_failure'
  | 'service_discovery_success'
  | 'service_discovery_failure'
  | 'provider_handshake_success'
  | 'provider_handshake_failure'
  | 'telemetry_first_packet'
  | 'telemetry_subscription_start'
  | 'telemetry_subscription_stop'
  | 'telemetry_stale'
  | 'disconnect_start'
  | 'disconnect_success'
  | 'disconnect_failure'
  | 'ecoflow_cloud_auth_success'
  | 'ecoflow_cloud_auth_failure'
  | 'obd2_handshake'
  | 'obd2_pid'
  | 'obd2_parser'
  | 'widget_telemetry_update'
  | 'scanner_snapshot'
  | 'ecoflow_ble_probe';

export interface BluetoothDiagnosticEvent {
  id: string;
  type: BluetoothDiagnosticEventType;
  source: BluetoothDiagnosticSource;
  timestamp: number;
  deviceId?: string | null;
  deviceName?: string | null;
  providerId?: string | null;
  message?: string | null;
  error?: string | null;
  details?: Record<string, unknown>;
}

export interface BluetoothDiagnosticsSnapshot {
  events: BluetoothDiagnosticEvent[];
  scannerState: string;
  nativeEnvironmentSupport: string;
  permissions: string;
  bluetoothPoweredState: string;
  bluestackReadinessSummary: {
    cloudApiCount: number;
    parserPendingCount: number;
    nativeBuildRequiredCount: number;
    liveReadyCount: number;
  };
  activeScans: number;
  nearbyDeviceCount: number;
  activeConnection: string | null;
  activeTelemetrySubscriptions: number;
  latestErrorsBySource: Partial<Record<BluetoothDiagnosticSource, BluetoothDiagnosticEvent>>;
  latestTelemetryTimestampByDevice: Record<string, number>;
  updatedAt: number | null;
}

type Listener = (snapshot: BluetoothDiagnosticsSnapshot) => void;

const MAX_EVENTS = 160;
const DEBUG_FLAG = 'ECS_DEBUG_BLUETOOTH_DIAGNOSTICS';

const events: BluetoothDiagnosticEvent[] = [];
const listeners = new Set<Listener>();
const activeScans = new Set<string>();
const telemetrySubscriptions = new Set<string>();
const latestErrorsBySource: Partial<Record<BluetoothDiagnosticSource, BluetoothDiagnosticEvent>> = {};
const latestTelemetryTimestampByDevice: Record<string, number> = {};

let scannerState = 'idle';
let nativeEnvironmentSupport = 'unknown';
let permissions = 'unknown';
let bluetoothPoweredState = 'unknown';
let nearbyDeviceCount = 0;
let bluestackReadinessSummary = {
  cloudApiCount: 0,
  parserPendingCount: 0,
  nativeBuildRequiredCount: 0,
  liveReadyCount: 0,
};
let activeConnection: string | null = null;
let updatedAt: number | null = null;
let sequence = 0;

function nextId(type: BluetoothDiagnosticEventType): string {
  sequence += 1;
  return `${Date.now().toString(36)}-${sequence.toString(36)}-${type}`;
}

function eventKey(event: BluetoothDiagnosticEvent): string {
  return [
    event.type,
    event.source,
    event.deviceId ?? '',
    event.error ?? event.message ?? '',
  ].join(':');
}

function applyEvent(event: BluetoothDiagnosticEvent): void {
  switch (event.type) {
    case 'scanner_start':
      scannerState = 'scanning';
      activeScans.add(String(event.details?.scanId ?? event.id));
      break;
    case 'scanner_stop':
      scannerState = String(event.details?.state ?? 'idle');
      if (event.details?.scanId) {
        activeScans.delete(String(event.details.scanId));
      } else {
        activeScans.clear();
      }
      break;
    case 'permission_request':
      permissions = 'requesting';
      break;
    case 'permission_result':
      permissions = String(event.details?.status ?? event.message ?? 'unknown');
      break;
    case 'bluetooth_power_state':
      bluetoothPoweredState = String(event.details?.state ?? event.message ?? 'unknown');
      nativeEnvironmentSupport = String(event.details?.nativeEnvironmentSupport ?? nativeEnvironmentSupport);
      break;
    case 'scanner_snapshot':
      scannerState = String(event.details?.scannerState ?? scannerState);
      nativeEnvironmentSupport = String(event.details?.nativeEnvironmentSupport ?? nativeEnvironmentSupport);
      permissions = String(event.details?.permissions ?? permissions);
      bluetoothPoweredState = String(event.details?.bluetoothPoweredState ?? bluetoothPoweredState);
      nearbyDeviceCount = Number(event.details?.nearbyDeviceCount ?? nearbyDeviceCount) || 0;
      bluestackReadinessSummary = {
        cloudApiCount: Number(event.details?.bluestackCloudApiCount ?? bluestackReadinessSummary.cloudApiCount) || 0,
        parserPendingCount: Number(event.details?.bluestackParserPendingCount ?? bluestackReadinessSummary.parserPendingCount) || 0,
        nativeBuildRequiredCount: Number(event.details?.bluestackNativeBuildRequiredCount ?? bluestackReadinessSummary.nativeBuildRequiredCount) || 0,
        liveReadyCount: Number(event.details?.bluestackLiveReadyCount ?? bluestackReadinessSummary.liveReadyCount) || 0,
      };
      break;
    case 'connect_start':
      activeConnection = event.deviceName ?? event.deviceId ?? null;
      break;
    case 'connect_success':
      activeConnection = event.deviceName ?? event.deviceId ?? activeConnection;
      break;
    case 'connect_failure':
      activeConnection = null;
      break;
    case 'disconnect_success':
      activeConnection = null;
      break;
    case 'telemetry_subscription_start':
      telemetrySubscriptions.add(String(event.deviceId ?? event.id));
      break;
    case 'telemetry_subscription_stop':
      if (event.deviceId) telemetrySubscriptions.delete(event.deviceId);
      break;
    case 'telemetry_first_packet':
    case 'widget_telemetry_update':
      if (event.deviceId) {
        latestTelemetryTimestampByDevice[event.deviceId] = event.timestamp;
      }
      break;
  }

  if (event.error || /failure|stale/.test(event.type)) {
    latestErrorsBySource[event.source] = event;
  }
}

function notify(): void {
  const snapshot = getBluetoothDiagnosticsSnapshot();
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch {}
  }
}

export function classifyBluetoothDiagnosticSource(
  error: unknown,
  fallback: BluetoothDiagnosticSource = 'transport',
): BluetoothDiagnosticSource {
  const message = String(error instanceof Error ? error.message : error ?? '').toLowerCase();
  if (!message) return fallback;
  if (/permission|denied|unauthorized scan|bluetooth_scan|bluetooth_connect|location/.test(message)) return 'permission';
  if (/expo go|native module|ble manager|not available|null|unsupported runtime|web preview/.test(message)) return 'unsupported_runtime';
  if (/unauthori[sz]ed|forbidden|auth|api key|access key|signature|region|account binding/.test(message)) return 'ecoflow_cloud_auth';
  if (/cloud|api|provider access/.test(message)) return 'cloud_access';
  if (/handshake|capabilit|service|characteristic|telemetry unavailable|decoded live telemetry/.test(message)) return 'provider_handshake';
  if (/elm|pid|obd|parser|decode|no data/.test(message)) return /pid|no data/.test(message) ? 'obd2_pid' : 'obd2_parser';
  if (/widget|telemetry store|subscription/.test(message)) return 'widget_telemetry';
  if (/background|foreground|app state/.test(message)) return 'app_state';
  if (/ble|bluetooth|transport|disconnect|connect/.test(message)) return 'native_ble';
  return fallback;
}

export function recordBluetoothDiagnosticEvent(
  event: Omit<BluetoothDiagnosticEvent, 'id' | 'timestamp'> & { timestamp?: number },
): BluetoothDiagnosticEvent {
  const normalized: BluetoothDiagnosticEvent = {
    ...event,
    id: nextId(event.type),
    timestamp: event.timestamp ?? Date.now(),
  };

  const previous = events[events.length - 1];
  if (previous && eventKey(previous) === eventKey(normalized) && normalized.timestamp - previous.timestamp < 750) {
    return previous;
  }

  events.push(normalized);
  while (events.length > MAX_EVENTS) {
    events.shift();
  }
  updatedAt = normalized.timestamp;
  applyEvent(normalized);
  ecsLog.dev('TELEMETRY', 'bluetooth_diagnostic_event', {
    type: normalized.type,
    source: normalized.source,
    deviceId: normalized.deviceId ?? null,
    providerId: normalized.providerId ?? null,
    message: normalized.message ?? null,
    error: normalized.error ?? null,
  }, {
    tag: '[BT_DIAG]',
    debugFlag: DEBUG_FLAG,
    fingerprint: eventKey(normalized),
    throttleMs: 1000,
    aggregateWindowMs: 10_000,
  });
  notify();
  return normalized;
}

export function subscribeBluetoothDiagnostics(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getBluetoothDiagnosticsSnapshot(): BluetoothDiagnosticsSnapshot {
  return {
    events: [...events].reverse(),
    scannerState,
    nativeEnvironmentSupport,
    permissions,
    bluetoothPoweredState,
    bluestackReadinessSummary: { ...bluestackReadinessSummary },
    activeScans: activeScans.size,
    nearbyDeviceCount,
    activeConnection,
    activeTelemetrySubscriptions: telemetrySubscriptions.size,
    latestErrorsBySource: { ...latestErrorsBySource },
    latestTelemetryTimestampByDevice: { ...latestTelemetryTimestampByDevice },
    updatedAt,
  };
}

export function resetBluetoothDiagnosticsForTests(): void {
  events.length = 0;
  activeScans.clear();
  telemetrySubscriptions.clear();
  for (const source of Object.keys(latestErrorsBySource) as BluetoothDiagnosticSource[]) {
    delete latestErrorsBySource[source];
  }
  for (const deviceId of Object.keys(latestTelemetryTimestampByDevice)) {
    delete latestTelemetryTimestampByDevice[deviceId];
  }
  scannerState = 'idle';
  nativeEnvironmentSupport = 'unknown';
  permissions = 'unknown';
  bluetoothPoweredState = 'unknown';
  nearbyDeviceCount = 0;
  bluestackReadinessSummary = {
    cloudApiCount: 0,
    parserPendingCount: 0,
    nativeBuildRequiredCount: 0,
    liveReadyCount: 0,
  };
  activeConnection = null;
  updatedAt = null;
  notify();
}

export function serializeBluetoothDiagnostics(snapshot = getBluetoothDiagnosticsSnapshot()): string {
  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    scannerState: snapshot.scannerState,
    nativeEnvironmentSupport: snapshot.nativeEnvironmentSupport,
    permissions: snapshot.permissions,
    bluetoothPoweredState: snapshot.bluetoothPoweredState,
    bluestackReadinessSummary: snapshot.bluestackReadinessSummary,
    activeScans: snapshot.activeScans,
    nearbyDeviceCount: snapshot.nearbyDeviceCount,
    activeConnection: snapshot.activeConnection,
    activeTelemetrySubscriptions: snapshot.activeTelemetrySubscriptions,
    latestErrorsBySource: Object.fromEntries(
      Object.entries(snapshot.latestErrorsBySource).map(([source, event]) => [
        source,
        event ? {
          type: event.type,
          message: event.message,
          error: event.error,
          deviceId: event.deviceId,
          providerId: event.providerId,
          timestamp: event.timestamp,
        } : null,
      ]),
    ),
    latestTelemetryTimestampByDevice: snapshot.latestTelemetryTimestampByDevice,
    recentEvents: snapshot.events.slice(0, 50),
  }, null, 2);
}

export function serializeBluetoothProductionEvidenceDraft(snapshot = getBluetoothDiagnosticsSnapshot()): string {
  const latestErrors = Object.fromEntries(
    Object.entries(snapshot.latestErrorsBySource).map(([source, event]) => [
      source,
      event ? {
        type: event.type,
        message: event.message ?? null,
        error: event.error ?? null,
        providerId: event.providerId ?? null,
        timestamp: event.timestamp,
      } : null,
    ]),
  );
  const recentEvents = snapshot.events.slice(0, 50);
  const countEvents = (predicate: (event: BluetoothDiagnosticEvent) => boolean): number =>
    recentEvents.filter(predicate).length;
  const observedDiagnostics = {
    nativeBleEventsObserved: countEvents((event) => event.source === 'native_ble'),
    discoveredDeviceEventCount: countEvents((event) => event.type === 'device_discovered'),
    telemetryFirstPacketCount: countEvents((event) => event.type === 'telemetry_first_packet'),
    disconnectSuccessCount: countEvents((event) => event.type === 'disconnect_success'),
    ecoflowCloudAuthFailureCount: countEvents((event) => event.type === 'ecoflow_cloud_auth_failure'),
    obd2HandshakeCount: countEvents((event) => event.type === 'obd2_handshake'),
    obd2PidEventCount: countEvents((event) => event.type === 'obd2_pid'),
    providerHandshakeFailureCount: countEvents((event) => event.type === 'provider_handshake_failure'),
  };

  return JSON.stringify({
    _instructions: 'Field-test draft only. Keep pass fields false until screenshots, diagnostics, logs, and owner review confirm the real-hardware run. Replace placeholder values before copying this JSON to .smoke/bluetooth-power-obd2-production-evidence.json.',
    androidNativeBleDiscoveryPassed: false,
    powerStationConnectStreamDisconnectPassed: false,
    ecoflowCloudBleSeparationRealDevicePassed: false,
    obd2NoDataPassed: false,
    obd2LiveDataPassed: false,
    obd2DisconnectClearsTelemetryPassed: false,
    productionDecision: 'pending',
    buildAndDevice: {
      appBuildType: null,
      appVersion: null,
      androidDeviceModel: null,
      androidOsVersion: null,
      nativeBuild: null,
      expoGoRuntime: null,
    },
    deviceMatrix: [
      'TODO: Android native development build device',
      'TODO: BLE power station or battery monitor',
      'TODO: EcoFlow cloud/API device or unauthorized EcoFlow account/device',
      'TODO: ELM327-compatible OBD2 adapter',
    ],
    evidenceReferences: [
      'TODO: .smoke/bluetooth-deep/android-native-ble-scan.png',
      'TODO: .smoke/bluetooth-deep/power-connect-stream-disconnect.log',
      'TODO: .smoke/bluetooth-deep/ecoflow-cloud-ble-separation.png',
      'TODO: .smoke/bluetooth-deep/obd2-live-no-data-disconnect.log',
    ],
    reviewerSignoff: {
      product: null,
      engineering: null,
      privacy: null,
      fieldOps: null,
      acceptedAt: null,
    },
    requiredEvidenceChecklist: [
      {
        id: 'android_native_ble_discovery',
        passField: 'androidNativeBleDiscoveryPassed',
        observedInDiagnostics: observedDiagnostics.nativeBleEventsObserved > 0 && observedDiagnostics.discoveredDeviceEventCount > 0,
        requiredReferences: ['permissions screenshot', 'scan result screenshot', 'diagnostics copy'],
        manualReviewRequired: true,
      },
      {
        id: 'power_station_connect_stream_disconnect',
        passField: 'powerStationConnectStreamDisconnectPassed',
        observedInDiagnostics: observedDiagnostics.telemetryFirstPacketCount > 0 && observedDiagnostics.disconnectSuccessCount > 0,
        requiredReferences: ['scan row screenshot', 'telemetry stream log', 'disconnect/stale widget evidence'],
        manualReviewRequired: true,
      },
      {
        id: 'ecoflow_cloud_ble_separation',
        passField: 'ecoflowCloudBleSeparationRealDevicePassed',
        observedInDiagnostics: observedDiagnostics.ecoflowCloudAuthFailureCount > 0 || snapshot.bluestackReadinessSummary.cloudApiCount > 0,
        requiredReferences: ['cloud/API row screenshot', 'auth success or unauthorized log', 'native BLE state screenshot'],
        manualReviewRequired: true,
      },
      {
        id: 'obd2_no_data_live_disconnect',
        passField: 'obd2NoDataPassed + obd2LiveDataPassed + obd2DisconnectClearsTelemetryPassed',
        observedInDiagnostics: observedDiagnostics.obd2HandshakeCount > 0 || observedDiagnostics.obd2PidEventCount > 0,
        requiredReferences: ['no-data evidence', 'live PID evidence', 'disconnect clears/ages telemetry evidence'],
        manualReviewRequired: true,
      },
    ],
    diagnosticsSummary: {
      generatedAt: new Date().toISOString(),
      scannerState: snapshot.scannerState,
      nativeEnvironmentSupport: snapshot.nativeEnvironmentSupport,
      permissions: snapshot.permissions,
      bluetoothPoweredState: snapshot.bluetoothPoweredState,
      bluestackReadinessSummary: snapshot.bluestackReadinessSummary,
      activeScans: snapshot.activeScans,
      nearbyDeviceCount: snapshot.nearbyDeviceCount,
      activeConnectionPresent: snapshot.activeConnection != null,
      activeTelemetrySubscriptions: snapshot.activeTelemetrySubscriptions,
      latestErrorSources: latestErrors,
      latestTelemetryDeviceCount: Object.keys(snapshot.latestTelemetryTimestampByDevice).length,
      observedDiagnostics,
      recentEventTypes: snapshot.events.slice(0, 20).map((event) => ({
        type: event.type,
        source: event.source,
        providerId: event.providerId ?? null,
        timestamp: event.timestamp,
      })),
    },
    notes: 'TODO: replace this note with field-test screenshots/log references and reviewer notes. Do not include raw provider secrets, full tokens, precise coordinates, or private payloads.',
  }, null, 2);
}
