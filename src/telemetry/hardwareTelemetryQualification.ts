declare const __DEV__: boolean | undefined;

export const HARDWARE_TELEMETRY_DATA_STATES = [
  'live',
  'stale',
  'manual',
  'unknown',
  'unavailable',
  'unsupported',
  'mock',
  'demo',
  'error',
] as const;

export type HardwareTelemetryDataState = typeof HARDWARE_TELEMETRY_DATA_STATES[number];

export type HardwareTelemetrySurface =
  | 'vehicle_obd2'
  | 'ecoflow_ble'
  | 'ecoflow_cloud'
  | 'utility_sensor'
  | 'power_store'
  | 'dashboard_power_widget'
  | 'active_trip_snapshot'
  | 'offline_incident_snapshot'
  | 'unified_telemetry';

export type HardwareTelemetryConnectionState =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'reading'
  | 'timeout'
  | 'error'
  | 'unsupported'
  | 'unknown';

export type HardwareTelemetrySourceTrust =
  | 'trusted_live'
  | 'manual'
  | 'cache'
  | 'mock'
  | 'demo'
  | 'unknown'
  | 'unavailable';

export type HardwareTelemetryProviderClassification =
  | 'verified_live'
  | 'hardware_qa_required'
  | 'partial'
  | 'parser_pending_or_manual'
  | 'manual_only'
  | 'mock_demo'
  | 'unsupported'
  | 'unavailable';

export type HardwareTelemetryQaRuntime = {
  dev?: boolean | null;
  nodeEnv?: string | null;
};

export type HardwareTelemetryQualificationInput = {
  providerId: string;
  providerLabel: string;
  surface: HardwareTelemetrySurface;
  connectionState: HardwareTelemetryConnectionState;
  source: HardwareTelemetrySourceTrust;
  decodedMetrics?: string[] | null;
  sampleReceivedAt?: number | null;
  now?: number;
  errorReason?: string | null;
  unsupportedReason?: string | null;
  productionGated?: boolean | null;
};

export type HardwareTelemetryQualification = {
  providerId: string;
  providerLabel: string;
  surface: HardwareTelemetrySurface;
  connectionState: HardwareTelemetryConnectionState;
  source: HardwareTelemetrySourceTrust;
  dataState: HardwareTelemetryDataState;
  isLive: boolean;
  productionReady: boolean;
  productionGated: boolean;
  decodedMetricCount: number;
  freshnessMs: number | null;
  truthLabel: string;
  warning: string;
};

export type HardwareTelemetryProviderInventoryItem = {
  id: string;
  label: string;
  surface: HardwareTelemetrySurface;
  classification: HardwareTelemetryProviderClassification;
  productionGate: boolean;
  currentSourceOfTruth: string;
  knownSafeBehavior: string;
  blocksPromotion: string[];
  checklist: string[];
};

export type HardwareTelemetryAuditRow = {
  surface: string;
  currentPath: string;
  status: HardwareTelemetryDataState | 'mixed';
  note: string;
};

export type HardwareTelemetryQaFixture = {
  id: string;
  title: string;
  description: string;
  productionLive: false;
  mutatesProductState: false;
  publishesLocation: false;
  unlocksBadges: false;
  expectedState: HardwareTelemetryDataState;
  qualification: HardwareTelemetryQualification;
  rows: { label: string; value: string; state: HardwareTelemetryDataState | 'ok' }[];
};

export const HARDWARE_TELEMETRY_LIVE_MAX_AGE_MS = 30_000;
export const HARDWARE_TELEMETRY_STALE_MAX_AGE_MS = 5 * 60_000;

export const HARDWARE_TELEMETRY_TRUTH_RULES = [
  'Connection presence is not live telemetry; decoded metrics with a fresh timestamp are required.',
  'Live requires a trusted hardware or provider source, decoded values, and an age inside the live freshness window.',
  'Stale data may be shown with timestamp context but must not be labeled live or healthy.',
  'Manual readings are useful fallback input and must stay distinct from live hardware telemetry.',
  'Unknown, unavailable, unsupported, and error states must never read as safe or verified.',
  'Mock and demo telemetry are ignored for production confidence, badge unlocks, and live status.',
  'Cloud/API failures must not clear or overwrite separate BLE telemetry unless the same source is explicitly unavailable.',
  'Utility tank sensors require a usable percent or a documented tank profile/calibration before live level copy is allowed.',
] as const;

export const HARDWARE_TELEMETRY_PROVIDER_INVENTORY: HardwareTelemetryProviderInventoryItem[] = [
  {
    id: 'obd2_veepeak',
    label: 'VeePeak OBD2',
    surface: 'vehicle_obd2',
    classification: 'hardware_qa_required',
    productionGate: true,
    currentSourceOfTruth: 'src/vehicle-telemetry/VehicleTelemetryStore.ts snapshot plus unified telemetry bridge',
    knownSafeBehavior: 'Connected adapter without decoded PIDs remains unsupported/unavailable; decoded fresh PID samples can qualify live.',
    blocksPromotion: [
      'Android native live PID evidence matrix is still required per device and vehicle.',
      'No-data ignition/off and disconnect clearing must be field-confirmed.',
    ],
    checklist: [
      'Capture Android scan, connect, ELM327 init, and decoded PID evidence.',
      'Record at least one decoded PID sample such as RPM, speed, coolant, voltage, or fuel.',
      'Verify adapter connected with no decoded PID data is not labeled live.',
      'Verify disconnect clears live telemetry and keeps last-known data stale.',
      'Record VeePeak/V Peak naming, service UUID, and BLE/native transport details.',
    ],
  },
  {
    id: 'ecoflow_ble',
    label: 'EcoFlow BLE',
    surface: 'ecoflow_ble',
    classification: 'partial',
    productionGate: true,
    currentSourceOfTruth: 'BLU power adapters into ECSTelemetryStore power_device readings',
    knownSafeBehavior: 'BLE telemetry may feed normalized power readings only when decoded live values are present.',
    blocksPromotion: [
      'EcoFlow BLE command/session handshakes still need field evidence by model.',
      'Timeout and unavailable copy must be validated on hardware.',
    ],
    checklist: [
      'Capture scan, connect, subscribe/read, decoded SOC/input/output/runtime values, and disconnect.',
      'Confirm BLE unavailable/timeout finalizes without fake values.',
      'Confirm cloud auth/API errors do not erase separate BLE readings.',
      'Record model, firmware, transport, and last sample timestamp.',
    ],
  },
  {
    id: 'ecoflow_cloud_api',
    label: 'EcoFlow Cloud/API',
    surface: 'ecoflow_cloud',
    classification: 'unavailable',
    productionGate: true,
    currentSourceOfTruth: 'EcoFlow provider adapter and provider boundary tests',
    knownSafeBehavior: 'Cloud/API failures remain unavailable/error and must not imply live local telemetry.',
    blocksPromotion: [
      'Credentials, account linking, provider limits, and timeout handling need field qualification.',
      'Cloud data freshness and device identity must be proven per account/device.',
    ],
    checklist: [
      'Capture auth unavailable, timeout, no device, and successful telemetry if available.',
      'Verify provider errors show error/unavailable copy and no fake SOC/runtime.',
      'Verify stale cloud data is timestamped and not live.',
      'Confirm credentials are never persisted or logged in mobile UI evidence.',
    ],
  },
  {
    id: 'mopeka_bluestack_utility_sensor',
    label: 'Mopeka / Bluestack utility sensor',
    surface: 'utility_sensor',
    classification: 'parser_pending_or_manual',
    productionGate: true,
    currentSourceOfTruth: 'src/telemetry/telemetryAdapters.ts utility_sensor bridge and selectors',
    knownSafeBehavior: 'Distance-only readings are not promoted to live tank level; percent requires a decoded level and usable profile/calibration.',
    blocksPromotion: [
      'Tank profile, geometry, and calibration evidence are required before percent can be trusted per model.',
      'Manual/unknown state must remain visible when geometry is missing.',
    ],
    checklist: [
      'Capture advertisement decode, tank profile id, parser status, distance, percent, battery, and read quality.',
      'Verify missing tank profile or calibration remains unknown/unsupported, not live percent.',
      'Verify manual tank state stays distinct from live sensor state.',
      'Record Mopeka model, tank shape/orientation, install height, and calibration method.',
    ],
  },
  {
    id: 'generic_power_manual',
    label: 'Generic/manual power fallback',
    surface: 'power_store',
    classification: 'manual_only',
    productionGate: false,
    currentSourceOfTruth: 'Manual power fallback and normalized PowerTelemetryTruth',
    knownSafeBehavior: 'Manual values may inform UI with manual labels but never become live hardware telemetry.',
    blocksPromotion: [
      'None for manual fallback; it remains user-entered or cached state.',
    ],
    checklist: [
      'Confirm manual SOC/runtime labels display as manual.',
      'Confirm stale cache labels include timestamp context.',
      'Confirm manual values do not unlock hardware/live status.',
    ],
  },
  {
    id: 'mock_power_connector',
    label: 'Mock/demo power connector',
    surface: 'power_store',
    classification: 'mock_demo',
    productionGate: true,
    currentSourceOfTruth: 'Dev/test-only mock connector guards',
    knownSafeBehavior: 'Mock/demo readings are blocked from production live states and confidence improvements.',
    blocksPromotion: [
      'Mock/demo is not production evidence.',
    ],
    checklist: [
      'Confirm mock/demo source is visibly labeled in dev/test.',
      'Confirm production runtime blocks fixture controls.',
      'Confirm mock/demo cannot appear as live, verified, healthy, or earned progress.',
    ],
  },
];

export const DASHBOARD_POWER_TELEMETRY_AUDIT: HardwareTelemetryAuditRow[] = [
  {
    surface: 'dashboard_power_widget',
    currentPath: 'components/dashboard/PowerSystemWidget.tsx reads normalized ECS power telemetry through useECSPowerTelemetryReadings.',
    status: 'mixed',
    note: 'Live copy is gated by normalized truth/isLive; stale/unavailable states remain visible and simulation is blocked unless dev-enabled.',
  },
  {
    surface: 'power_provider_store',
    currentPath: 'src/power/devices/PowerDeviceStore.ts persists safe device metadata only, not provider secrets or tokens.',
    status: 'manual',
    note: 'Known device metadata is not evidence of live telemetry.',
  },
  {
    surface: 'unified_telemetry',
    currentPath: 'src/telemetry/ECSTelemetryStore.ts stores power_device, obd2, and utility_sensor metrics with live/stale/error/unavailable quality.',
    status: 'mixed',
    note: 'Mock events are rejected in production and cloud errors do not overwrite separate BLE telemetry.',
  },
];

export const ACTIVE_TRIP_PACKET_TELEMETRY_AUDIT: HardwareTelemetryAuditRow[] = [
  {
    surface: 'active_trip',
    currentPath: 'app/active-trip.tsx renders stored snapshot confidence/vehicle fields and does not subscribe to live hardware telemetry in this lane.',
    status: 'stale',
    note: 'Recovered trip data must stay labeled recovered/stale/unknown when live context is absent.',
  },
  {
    surface: 'offline_incident_packet',
    currentPath: 'app/offline-incident-packet.tsx renders stored snapshot vehicle/confidence data for local-only packet review.',
    status: 'stale',
    note: 'Packet data is local-only/stale unless a future explicit live telemetry mapping is added.',
  },
  {
    surface: 'route_confidence',
    currentPath: 'lib/routeConfidenceEngine.ts treats telemetry unavailable as visible context without allowing stale/mock telemetry to improve confidence.',
    status: 'unavailable',
    note: 'No scoring change is made by this hardware qualification lane.',
  },
];

function runtimeDevFlag(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

export function isHardwareTelemetryQaHarnessEnabled(runtime: HardwareTelemetryQaRuntime = {}): boolean {
  const dev = runtime.dev ?? runtimeDevFlag();
  const nodeEnv =
    runtime.nodeEnv ??
    (typeof process !== 'undefined' && process?.env ? process.env.NODE_ENV : undefined);
  return dev === true || nodeEnv === 'test';
}

function countDecodedMetrics(metrics: string[] | null | undefined): number {
  return (metrics ?? []).filter((metric) => typeof metric === 'string' && metric.trim().length > 0).length;
}

function stateLabel(dataState: HardwareTelemetryDataState, input: HardwareTelemetryQualificationInput): string {
  switch (dataState) {
    case 'live':
      return 'Live decoded telemetry';
    case 'stale':
      return 'Stale telemetry';
    case 'manual':
      return 'Manual telemetry entry';
    case 'unsupported':
      return input.unsupportedReason
        ? `Unsupported telemetry: ${input.unsupportedReason}`
        : 'Connected; no decoded telemetry';
    case 'mock':
      return 'Mock telemetry ignored';
    case 'demo':
      return 'Demo telemetry ignored';
    case 'error':
      return input.errorReason ? `Provider error: ${input.errorReason}` : 'Provider error';
    case 'unavailable':
      return 'Telemetry unavailable';
    case 'unknown':
    default:
      return 'Telemetry state unknown';
  }
}

function warningFor(dataState: HardwareTelemetryDataState): string {
  switch (dataState) {
    case 'live':
      return 'Fresh decoded telemetry is available from a trusted source.';
    case 'stale':
      return 'Last decoded telemetry is stale and must not be treated as live.';
    case 'manual':
      return 'Manual fallback is visible but does not prove live hardware state.';
    case 'unsupported':
      return 'Hardware link is not enough; decoded supported metrics are required.';
    case 'mock':
    case 'demo':
      return 'Fixture telemetry is blocked from production live confidence.';
    case 'error':
      return 'Provider or transport failed; keep UI in caution/unavailable copy.';
    case 'unavailable':
      return 'No usable hardware/provider reading is available.';
    case 'unknown':
    default:
      return 'Not enough information to qualify telemetry state.';
  }
}

export function qualifyHardwareTelemetrySample(
  input: HardwareTelemetryQualificationInput,
): HardwareTelemetryQualification {
  const now = input.now ?? Date.now();
  const decodedMetricCount = countDecodedMetrics(input.decodedMetrics);
  const freshnessMs =
    typeof input.sampleReceivedAt === 'number' && Number.isFinite(input.sampleReceivedAt)
      ? Math.max(0, now - input.sampleReceivedAt)
      : null;

  let dataState: HardwareTelemetryDataState = 'unknown';

  if (input.source === 'mock') {
    dataState = 'mock';
  } else if (input.source === 'demo') {
    dataState = 'demo';
  } else if (input.source === 'manual') {
    dataState = 'manual';
  } else if (input.errorReason || input.connectionState === 'error' || input.connectionState === 'timeout') {
    dataState = 'error';
  } else if (input.unsupportedReason || input.connectionState === 'unsupported') {
    dataState = 'unsupported';
  } else if (input.source === 'unavailable' || input.connectionState === 'disconnected') {
    dataState = 'unavailable';
  } else if (decodedMetricCount === 0 && (input.connectionState === 'connected' || input.connectionState === 'reading')) {
    dataState = 'unsupported';
  } else if (decodedMetricCount > 0 && input.source === 'trusted_live' && freshnessMs != null) {
    dataState = freshnessMs <= HARDWARE_TELEMETRY_LIVE_MAX_AGE_MS ? 'live' : 'stale';
  } else if (decodedMetricCount > 0 && input.source === 'cache') {
    dataState = 'stale';
  }

  const productionGated = input.productionGated === true || dataState === 'mock' || dataState === 'demo';
  const isLive = dataState === 'live' && !productionGated;

  return {
    providerId: input.providerId,
    providerLabel: input.providerLabel,
    surface: input.surface,
    connectionState: input.connectionState,
    source: input.source,
    dataState,
    isLive,
    productionReady: isLive,
    productionGated,
    decodedMetricCount,
    freshnessMs,
    truthLabel: stateLabel(dataState, input),
    warning: warningFor(dataState),
  };
}

function row(label: string, value: string, state: HardwareTelemetryDataState | 'ok') {
  return { label, value, state };
}

function fixture(
  id: string,
  title: string,
  description: string,
  input: HardwareTelemetryQualificationInput,
): HardwareTelemetryQaFixture {
  const qualification = qualifyHardwareTelemetrySample(input);
  return {
    id,
    title,
    description,
    productionLive: false,
    mutatesProductState: false,
    publishesLocation: false,
    unlocksBadges: false,
    expectedState: qualification.dataState,
    qualification,
    rows: [
      row('Expected state', qualification.dataState, qualification.dataState),
      row('Live production data', 'No', 'ok'),
      row('Provider calls', 'Not called', 'ok'),
      row('Product state', 'Untouched', 'ok'),
      row('Location publish', 'None', 'ok'),
      row('Badge unlocks', 'None', 'ok'),
      row('Truth copy', qualification.truthLabel, qualification.dataState),
    ],
  };
}

const QA_NOW = Date.parse('2026-06-10T18:00:00.000Z');

export const HARDWARE_TELEMETRY_QA_FIXTURES: HardwareTelemetryQaFixture[] = [
  fixture(
    'obd2_live_decoded_pid',
    'OBD2 live decoded PID',
    'Fresh trusted VeePeak OBD2 PID sample qualifies as live only because decoded metrics exist.',
    {
      providerId: 'obd2_veepeak',
      providerLabel: 'VeePeak OBD2',
      surface: 'vehicle_obd2',
      connectionState: 'reading',
      source: 'trusted_live',
      decodedMetrics: ['engine_rpm', 'vehicle_speed'],
      sampleReceivedAt: QA_NOW - 4_000,
      now: QA_NOW,
    },
  ),
  fixture(
    'obd2_connected_no_pid',
    'OBD2 connected, no decoded data',
    'Adapter presence stays unsupported until ECS receives decoded PID data.',
    {
      providerId: 'obd2_veepeak',
      providerLabel: 'VeePeak OBD2',
      surface: 'vehicle_obd2',
      connectionState: 'connected',
      source: 'trusted_live',
      decodedMetrics: [],
      sampleReceivedAt: QA_NOW - 2_000,
      now: QA_NOW,
    },
  ),
  fixture(
    'obd2_stale_last_known',
    'OBD2 stale last-known',
    'Decoded PID data older than the live window remains visible as stale, not live.',
    {
      providerId: 'obd2_veepeak',
      providerLabel: 'VeePeak OBD2',
      surface: 'vehicle_obd2',
      connectionState: 'connected',
      source: 'trusted_live',
      decodedMetrics: ['battery_voltage'],
      sampleReceivedAt: QA_NOW - 120_000,
      now: QA_NOW,
    },
  ),
  fixture(
    'ecoflow_ble_timeout',
    'EcoFlow BLE timeout',
    'BLE timeout finalizes as error/unavailable copy with no fake SOC or runtime.',
    {
      providerId: 'ecoflow_ble',
      providerLabel: 'EcoFlow BLE',
      surface: 'ecoflow_ble',
      connectionState: 'timeout',
      source: 'trusted_live',
      decodedMetrics: [],
      errorReason: 'BLE telemetry timeout before decoded power packet.',
      productionGated: true,
      now: QA_NOW,
    },
  ),
  fixture(
    'ecoflow_cloud_unavailable',
    'EcoFlow Cloud/API unavailable',
    'Cloud provider outage stays unavailable/error and does not imply local BLE state.',
    {
      providerId: 'ecoflow_cloud_api',
      providerLabel: 'EcoFlow Cloud/API',
      surface: 'ecoflow_cloud',
      connectionState: 'error',
      source: 'unavailable',
      decodedMetrics: [],
      errorReason: 'Provider unavailable or credentials not available.',
      productionGated: true,
      now: QA_NOW,
    },
  ),
  fixture(
    'mopeka_missing_tank_profile',
    'Mopeka missing tank profile',
    'Distance or parser state without tank geometry remains unsupported rather than live percent.',
    {
      providerId: 'mopeka_bluestack_utility_sensor',
      providerLabel: 'Mopeka / Bluestack utility sensor',
      surface: 'utility_sensor',
      connectionState: 'connected',
      source: 'trusted_live',
      decodedMetrics: ['level_distance_mm'],
      unsupportedReason: 'Tank profile missing; distance cannot be converted to percent.',
      productionGated: true,
      sampleReceivedAt: QA_NOW,
      now: QA_NOW,
    },
  ),
  fixture(
    'manual_power_fallback',
    'Manual power fallback',
    'User-entered power status remains manual and useful without pretending hardware is live.',
    {
      providerId: 'generic_power_manual',
      providerLabel: 'Manual Power',
      surface: 'power_store',
      connectionState: 'unknown',
      source: 'manual',
      decodedMetrics: ['battery_percent'],
      sampleReceivedAt: QA_NOW,
      now: QA_NOW,
    },
  ),
  fixture(
    'mock_power_ignored',
    'Mock power ignored',
    'Mock connector data remains dev/test-only and cannot become production live telemetry.',
    {
      providerId: 'mock_power_connector',
      providerLabel: 'Mock Power',
      surface: 'power_store',
      connectionState: 'reading',
      source: 'mock',
      decodedMetrics: ['battery_percent'],
      sampleReceivedAt: QA_NOW,
      now: QA_NOW,
    },
  ),
  fixture(
    'demo_utility_sensor_ignored',
    'Demo utility sensor ignored',
    'Demo tank data can render for QA but never becomes production live or earned progress.',
    {
      providerId: 'demo_utility_sensor',
      providerLabel: 'Demo Utility Sensor',
      surface: 'utility_sensor',
      connectionState: 'reading',
      source: 'demo',
      decodedMetrics: ['level_percent'],
      sampleReceivedAt: QA_NOW,
      now: QA_NOW,
    },
  ),
  fixture(
    'unknown_power_state',
    'Unknown power state',
    'No usable power provider/device data stays unknown/unavailable rather than healthy.',
    {
      providerId: 'generic_power_unknown',
      providerLabel: 'Unknown Power',
      surface: 'dashboard_power_widget',
      connectionState: 'unknown',
      source: 'unknown',
      decodedMetrics: [],
      now: QA_NOW,
    },
  ),
];

export function getHardwareTelemetryQaFixtures(
  runtime: HardwareTelemetryQaRuntime = {},
): HardwareTelemetryQaFixture[] {
  if (!isHardwareTelemetryQaHarnessEnabled(runtime)) return [];
  return HARDWARE_TELEMETRY_QA_FIXTURES;
}
