export {
  useUnifiedDeviceConnections,
  type ECSConnectionActionKind,
  type ECSConnectionRouteIntent,
  type ECSConnectionScanAreaState,
  type ECSConnectionSection,
  type ECSConnectionStatus,
  type ECSDeviceConnectionModel,
  type ECSDiscoverySourceSummary,
  type ECSDiscoverySourceUiStatus,
  type ECSScanSummary,
  type UnifiedDeviceConnectionsResult,
} from './useUnifiedDeviceConnections';

export {
  useUnifiedOBD2Scanner,
  type UnifiedOBD2ScannerHookResult,
  type OBD2AdapterState,
  type OBD2DiscoveredDevice,
  type OBD2ScanDiagnostics,
} from './useUnifiedOBD2Scanner';

export {
  createUnifiedScannerSnapshot,
  mapConnectionStatusToScannerState,
  mapScanAreaStateToScannerState,
  normalizeUnifiedScannerDevice,
  type UnifiedScannerAdvertisedIdentifiers,
  type UnifiedScannerConnectionState,
  type UnifiedScannerDevice,
  type UnifiedScannerDeviceCategory,
  type UnifiedScannerErrorSource,
  type UnifiedScannerProvider,
  type UnifiedScannerSnapshot,
  type UnifiedScannerTelemetryState,
  type UnifiedScannerTransport,
} from './unifiedScannerContract';
