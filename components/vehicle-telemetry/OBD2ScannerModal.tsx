import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import TacticalPopupShell from '../TacticalPopupShell';
import BluetoothScannerDeviceRow from './BluetoothScannerDeviceRow';
import { TACTICAL } from '../../lib/theme';
import { classifyBluetoothDevice } from '../../lib/bluetoothDevicePresentation';
import { useUnifiedOBD2Scanner, type OBD2AdapterState, type OBD2DiscoveredDevice } from '../../lib/unifiedScanner';

// OBD-only telemetry settings modal. The active Device Connections route is app/power/blu.tsx.
interface OBD2ScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onConnected?: (deviceId: string, deviceName: string) => void;
}

type DeviceUiMode = 'idle' | 'connecting' | 'connected' | 'failed';

type DeviceUiState = {
  mode: Extract<DeviceUiMode, 'connecting' | 'failed'>;
  reason?: string;
};

type ScannerTone = 'active' | 'warning' | 'error' | 'neutral';

function getFriendlyDeviceName(device: OBD2DiscoveredDevice): string {
  const trimmed = device.name.trim();
  return trimmed.length > 0 ? trimmed : `Bluetooth ${device.id.slice(-4)}`;
}

function getScannerTone(state: OBD2AdapterState, hasError: boolean): ScannerTone {
  if (hasError) return 'error';
  if (state === 'scanning' || state === 'requesting_permissions' || state === 'connecting') {
    return 'active';
  }
  if (state === 'connected' || state === 'reconnecting') return 'warning';
  return 'neutral';
}

function getToneColors(tone: ScannerTone) {
  switch (tone) {
    case 'active':
      return {
        text: '#4CAF50',
        border: 'rgba(76,175,80,0.24)',
        background: 'rgba(76,175,80,0.12)',
      };
    case 'warning':
      return {
        text: TACTICAL.amber,
        border: `${TACTICAL.amber}33`,
        background: `${TACTICAL.amber}12`,
      };
    case 'error':
      return {
        text: '#EF5350',
        border: 'rgba(239,83,80,0.24)',
        background: 'rgba(239,83,80,0.12)',
      };
    case 'neutral':
    default:
      return {
        text: TACTICAL.textMuted,
        border: 'rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.04)',
      };
  }
}

function getScanStateLabel(state: OBD2AdapterState, isConnected: boolean, isConnecting: boolean, hasError: boolean): string {
  if (hasError) return 'Attention Needed';
  if (state === 'requesting_permissions') return 'Preparing Bluetooth';
  if (state === 'scanning') return 'Scanning...';
  if (state === 'reconnecting') return 'Reconnecting';
  if (isConnecting) return 'Connecting...';
  if (isConnected) return 'Connected';
  return 'Scan Paused';
}

function getHeaderSubtitle(
  state: OBD2AdapterState,
  hasError: boolean,
  deviceCount: number,
  connectedDeviceName: string | null,
): string {
  if (hasError) return 'Bluetooth scanner needs attention before reconnecting.';
  if (state === 'requesting_permissions') return 'Preparing Bluetooth access for the scanner.';
  if (state === 'scanning') {
    return deviceCount > 0
      ? `${deviceCount} nearby device${deviceCount === 1 ? '' : 's'} visible right now.`
      : 'Scanning nearby adapters and tactical peripherals.';
  }
  if (state === 'connecting') return 'Scan paused while ECS connects to the selected adapter.';
  if (state === 'reconnecting') return 'Restoring the last known OBD-II session.';
  if (state === 'connected') {
    return connectedDeviceName
      ? `${connectedDeviceName} is connected to vehicle telemetry.`
      : 'A Bluetooth adapter is connected to vehicle telemetry.';
  }
  return deviceCount > 0
    ? `${deviceCount} saved result${deviceCount === 1 ? '' : 's'} ready to connect.`
    : 'Tap Scan to find nearby Bluetooth OBD-II adapters.';
}

function isPermissionIssue(error: string | null | undefined): boolean {
  return /permission|permissions|denied|required|not granted/i.test(error ?? '');
}

function ScannerStatusChip({
  label,
  tone,
}: {
  label: string;
  tone: ScannerTone;
}) {
  const colors = getToneColors(tone);

  return (
    <View
      style={[
        styles.statusChip,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
        },
      ]}
    >
      <Text style={[styles.statusChipText, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

function ScannerBanner({
  icon,
  body,
  tone,
  actionLabel,
  onAction,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  body: string;
  tone: ScannerTone;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const colors = getToneColors(tone);

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
        },
      ]}
    >
      <Ionicons name={icon} size={16} color={colors.text} />
      <Text style={[styles.bannerText, { color: tone === 'neutral' ? TACTICAL.text : colors.text }]}>
        {body}
      </Text>
      {actionLabel && onAction ? (
        <TouchableOpacity
          style={[
            styles.bannerAction,
            {
              borderColor: colors.border,
              backgroundColor: colors.background,
            },
          ]}
          onPress={onAction}
          activeOpacity={0.8}
        >
          <Text style={[styles.bannerActionText, { color: colors.text }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name={icon} size={24} color={TACTICAL.amber} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity style={styles.emptyActionBtn} onPress={onAction} activeOpacity={0.8}>
          <Text style={styles.emptyActionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}


export default function OBD2ScannerModal({
  visible,
  onClose,
  onConnected,
}: OBD2ScannerModalProps) {
  const {
    state,
    isScanning,
    isConnected,
    isConnecting,
    isReconnecting,
    devices,
    deviceCount,
    connectedDeviceId,
    connectedDeviceName,
    error,
    reconnectAttempt,
    connectionJustSucceeded,
    startScan,
    stopScan,
    connectToDevice,
    disconnect,
  } = useUnifiedOBD2Scanner();

  const [deviceUiState, setDeviceUiState] = useState<Record<string, DeviceUiState>>({});
  const activeConnectTokenRef = useRef(0);
  const mountedRef = useRef(false);
  const visibleRef = useRef(visible);
  const latestErrorRef = useRef<string | null>(error);
  const stableOrderRef = useRef<Map<string, number>>(new Map());
  const stableOrderSeedRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    latestErrorRef.current = error;
  }, [error]);

  useEffect(() => {
    if (!visible) {
      activeConnectTokenRef.current += 1;
      stableOrderRef.current = new Map();
      stableOrderSeedRef.current = 0;
      setDeviceUiState({});
      void stopScan();
    }
  }, [visible, stopScan]);

  useEffect(() => {
    return () => {
      activeConnectTokenRef.current += 1;
      void stopScan();
    };
  }, [stopScan]);

  useEffect(() => {
    if (connectionJustSucceeded && connectedDeviceId && connectedDeviceName) {
      onConnected?.(connectedDeviceId, connectedDeviceName);
    }
  }, [onConnected, connectionJustSucceeded, connectedDeviceId, connectedDeviceName]);

  const scannerTone = getScannerTone(state, Boolean(error));
  const scanStateLabel = getScanStateLabel(state, isConnected, isConnecting, Boolean(error));
  const headerSubtitle = getHeaderSubtitle(state, Boolean(error), deviceCount, connectedDeviceName);

  useEffect(() => {
    if (!visible) return;

    devices.forEach((device) => {
      if (!stableOrderRef.current.has(device.id)) {
        stableOrderRef.current.set(device.id, stableOrderSeedRef.current);
        stableOrderSeedRef.current += 1;
      }
    });
  }, [devices, visible]);

  const orderedDevices = useMemo(() => {
    return [...devices].sort((left, right) => {
      if (isConnected && connectedDeviceId === left.id && connectedDeviceId !== right.id) return -1;
      if (isConnected && connectedDeviceId === right.id && connectedDeviceId !== left.id) return 1;
      if (left.isLikelyOBD && !right.isLikelyOBD) return -1;
      if (!left.isLikelyOBD && right.isLikelyOBD) return 1;

      const leftOrder = stableOrderRef.current.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = stableOrderRef.current.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return left.id.localeCompare(right.id);
    });
  }, [connectedDeviceId, devices, isConnected]);

  const getDeviceMode = useCallback((device: OBD2DiscoveredDevice): DeviceUiMode => {
    if (isConnected && connectedDeviceId === device.id) return 'connected';
    return deviceUiState[device.id]?.mode ?? 'idle';
  }, [connectedDeviceId, deviceUiState, isConnected]);

  const getDeviceFailureReason = useCallback((device: OBD2DiscoveredDevice) => {
    return deviceUiState[device.id]?.reason;
  }, [deviceUiState]);

  const handleRescan = useCallback(async () => {
    activeConnectTokenRef.current += 1;
    stableOrderRef.current = new Map();
    stableOrderSeedRef.current = 0;
    setDeviceUiState((previous) => {
      const next: Record<string, DeviceUiState> = {};
      Object.entries(previous).forEach(([deviceId, entry]) => {
        if (entry.mode === 'connecting') return;
        next[deviceId] = entry;
      });
      return next;
    });

    if (isScanning) {
      await stopScan();
      return;
    }

    await startScan(15000);
  }, [isScanning, startScan, stopScan]);

  const handleDismiss = useCallback(() => {
    activeConnectTokenRef.current += 1;
    stableOrderRef.current = new Map();
    stableOrderSeedRef.current = 0;
    setDeviceUiState({});
    void stopScan();
    onClose();
  }, [onClose, stopScan]);

  const handleDisconnect = useCallback(async () => {
    activeConnectTokenRef.current += 1;
    setDeviceUiState({});
    await disconnect();
  }, [disconnect]);

  const handleSelectDevice = useCallback(async (device: OBD2DiscoveredDevice) => {
    if (!visibleRef.current) return;
    if (isConnected && connectedDeviceId !== device.id) return;
    if (deviceUiState[device.id]?.mode === 'connecting') return;

    const requestToken = activeConnectTokenRef.current + 1;
    activeConnectTokenRef.current = requestToken;

    setDeviceUiState((previous) => {
      const next: Record<string, DeviceUiState> = {};
      Object.entries(previous).forEach(([deviceId, entry]) => {
        if (entry.mode === 'failed') {
          next[deviceId] = entry;
        }
      });
      next[device.id] = { mode: 'connecting' };
      return next;
    });

    await stopScan();
    const success = await connectToDevice(device.id, getFriendlyDeviceName(device));

    if (!mountedRef.current || !visibleRef.current || activeConnectTokenRef.current !== requestToken) {
      return;
    }

    if (success) {
      setDeviceUiState((previous) => {
        if (!previous[device.id]) return previous;
        const next = { ...previous };
        delete next[device.id];
        return next;
      });
      return;
    }

    const fallbackReason = latestErrorRef.current ?? 'Connection failed';
    setDeviceUiState((previous) => ({
      ...previous,
      [device.id]: {
        mode: 'failed',
        reason: fallbackReason,
      },
    }));
  }, [connectToDevice, connectedDeviceId, deviceUiState, isConnected, stopScan]);

  const handleSelectDeviceById = useCallback((deviceId: string) => {
    const targetDevice = orderedDevices.find((entry) => entry.id === deviceId);
    if (!targetDevice) return;
    void handleSelectDevice(targetDevice);
  }, [handleSelectDevice, orderedDevices]);

  const renderDevice = useCallback(({ item }: { item: OBD2DiscoveredDevice }) => {
    const uiMode = getDeviceMode(item);
    const connectLocked = Boolean(isConnected && connectedDeviceId && connectedDeviceId !== item.id);
    const presentation = classifyBluetoothDevice(item);

    return (
      <BluetoothScannerDeviceRow
        deviceId={item.id}
        displayName={presentation.displayName}
        secondaryLabel={presentation.secondaryLabel}
        providerBadge={presentation.providerBadge}
        categoryHint={presentation.categoryHint}
        signal={presentation.signal}
        state={uiMode}
        failureReason={getDeviceFailureReason(item)}
        connectLocked={connectLocked}
        iconName={item.isLikelyOBD ? 'car-outline' : 'bluetooth-outline'}
        onPress={handleSelectDeviceById}
      />
    );
  }, [connectedDeviceId, getDeviceFailureReason, getDeviceMode, handleSelectDeviceById, isConnected]);

  const keyExtractor = useCallback((item: OBD2DiscoveredDevice) => item.id, []);

  const listHeader = useMemo(() => (
    <View style={styles.listHeader}>
      <View style={styles.scanStatusCard}>
        <View style={styles.scanStatusTop}>
          <ScannerStatusChip label={scanStateLabel} tone={scannerTone} />
          <Text style={styles.scanStatusText}>{headerSubtitle}</Text>
        </View>

        <View style={styles.controlRow}>
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={handleRescan}
            activeOpacity={0.82}
          >
            {isScanning ? (
              <Ionicons name="pause-outline" size={14} color={TACTICAL.amber} />
            ) : (
              <Ionicons name="refresh-outline" size={14} color={TACTICAL.amber} />
            )}
            <Text style={styles.controlBtnText}>{isScanning ? 'Pause Scan' : 'Scan'}</Text>
          </TouchableOpacity>

          <View style={styles.countPill}>
            <Text style={styles.countPillText}>
              {deviceCount} device{deviceCount === 1 ? '' : 's'}
            </Text>
          </View>
        </View>
      </View>

      {connectionJustSucceeded && connectedDeviceName ? (
        <ScannerBanner
          icon="checkmark-circle"
          tone="active"
          body={`Connected to ${connectedDeviceName}. Live vehicle telemetry is ready.`}
        />
      ) : null}

      {error ? (
        <ScannerBanner
          icon="alert-circle"
          tone="error"
          body={error}
          actionLabel="Retry"
          onAction={() => {
            void handleRescan();
          }}
        />
      ) : null}

      {isReconnecting ? (
        <ScannerBanner
          icon="sync-outline"
          tone="warning"
          body={`Reconnecting to the last known adapter${reconnectAttempt > 0 ? ` (attempt ${reconnectAttempt})` : ''}.`}
        />
      ) : null}

      {isConnected && connectedDeviceName ? (
        <View style={styles.connectedCard}>
          <View style={styles.connectedCardTop}>
            <View style={styles.connectedIconWrap}>
              <Ionicons name="car-sport-outline" size={20} color={TACTICAL.amber} />
            </View>
            <View style={styles.connectedCopy}>
              <Text style={styles.connectedEyebrow}>ACTIVE OBD-II SESSION</Text>
              <Text style={styles.connectedName}>{connectedDeviceName}</Text>
              <Text style={styles.connectedBody}>
                ECS is actively using this Bluetooth adapter for live vehicle telemetry. Disconnect here before switching to another adapter.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.disconnectBtn}
            onPress={() => {
              void handleDisconnect();
            }}
            activeOpacity={0.82}
          >
            <Ionicons name="power-outline" size={14} color="#EF5350" />
            <Text style={styles.disconnectBtnText}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionEyebrow}>NEARBY BLUETOOTH DEVICES</Text>
        <Text style={styles.sectionBody}>
          Discoverable adapters stay in a stable list while ECS scans or reconnects in the background.
        </Text>
      </View>
    </View>
  ), [
    connectionJustSucceeded,
    connectedDeviceName,
    deviceCount,
    error,
    handleDisconnect,
    handleRescan,
    headerSubtitle,
    isConnected,
    isReconnecting,
    isScanning,
    reconnectAttempt,
    scanStateLabel,
    scannerTone,
  ]);

  const listEmptyComponent = useMemo(() => {
    if (state === 'requesting_permissions') {
      return (
        <EmptyState
          icon="bluetooth-outline"
          title="Preparing Bluetooth access"
          body="ECS is checking Bluetooth permissions for the scan you started."
        />
      );
    }

    if (isScanning) {
      return (
        <EmptyState
          icon="search-outline"
          title="Scanning for nearby devices..."
          body="Keep your OBD-II adapter powered and nearby. ECS will populate this panel as soon as it sees a broadcast."
          actionLabel="Pause Scan"
          onAction={() => {
            void handleRescan();
          }}
        />
      );
    }

    if (error) {
      const permissionIssue = isPermissionIssue(error);
      return (
        <EmptyState
          icon="warning-outline"
          title={permissionIssue ? 'Bluetooth permission required' : 'Bluetooth scanner needs attention'}
          body={
            permissionIssue
              ? error
              : 'Bluetooth may be unavailable, blocked, or temporarily denied. Check device Bluetooth state, then retry the scan.'
          }
          actionLabel="Retry Scan"
          onAction={() => {
            void handleRescan();
          }}
        />
      );
    }

    return (
      <EmptyState
        icon="bluetooth-outline"
        title="No Bluetooth devices found yet"
        body="Pull closer to the adapter, make sure the vehicle ignition is on, and start a scan when the device is broadcasting."
        actionLabel="Scan"
        onAction={() => {
          void handleRescan();
        }}
      />
    );
  }, [error, handleRescan, isScanning, state]);

  const listFooter = useMemo(() => (
    <View style={styles.footerCard}>
      <Text style={styles.footerTitle}>FIELD CHECKS</Text>
      <View style={styles.tipRow}>
        <Ionicons name="checkmark-outline" size={12} color={TACTICAL.amber} />
        <Text style={styles.tipText}>OBD-II adapter plugged into the vehicle diagnostics port</Text>
      </View>
      <View style={styles.tipRow}>
        <Ionicons name="checkmark-outline" size={12} color={TACTICAL.amber} />
        <Text style={styles.tipText}>Vehicle ignition on so the adapter is fully powered</Text>
      </View>
      <View style={styles.tipRow}>
        <Ionicons name="checkmark-outline" size={12} color={TACTICAL.amber} />
        <Text style={styles.tipText}>Phone Bluetooth enabled and the adapter close enough to pair</Text>
      </View>
    </View>
  ), []);

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={handleDismiss}
      title="Bluetooth Devices"
      icon="bluetooth-outline"
      eyebrow="Vehicle Telemetry"
      subtitle={headerSubtitle}
      overlayClass="editor"
      maxWidth={760}
      maxHeightFraction={0.76}
      minHeightFraction={0.54}
      scrollable={false}
      allowSwipeDismiss
      dismissOnBackdrop
      showHandle
    >
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={orderedDevices}
        renderItem={renderDevice}
        keyExtractor={keyExtractor}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmptyComponent}
        ListFooterComponent={listFooter}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </TacticalPopupShell>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    flexGrow: 1,
    gap: 10,
  },
  listHeader: {
    gap: 10,
    paddingBottom: 10,
  },
  scanStatusCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 14,
    gap: 12,
  },
  scanStatusTop: {
    gap: 9,
  },
  statusChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusChipText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  scanStatusText: {
    fontSize: 12,
    lineHeight: 18,
    color: TACTICAL.textMuted,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  controlBtn: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}33`,
    backgroundColor: `${TACTICAL.amber}12`,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  controlBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  countPill: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  bannerText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
  },
  bannerAction: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerActionText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  connectedCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}30`,
    backgroundColor: `${TACTICAL.amber}10`,
    padding: 14,
    gap: 12,
  },
  connectedCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  connectedIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}35`,
    backgroundColor: `${TACTICAL.amber}16`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectedCopy: {
    flex: 1,
    gap: 4,
  },
  connectedEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  connectedName: {
    fontSize: 15,
    fontWeight: '800',
    color: TACTICAL.text,
  },
  connectedBody: {
    fontSize: 11,
    lineHeight: 17,
    color: TACTICAL.textMuted,
  },
  disconnectBtn: {
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.24)',
    backgroundColor: 'rgba(239,83,80,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  disconnectBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#EF5350',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionHeader: {
    gap: 4,
  },
  sectionEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  sectionBody: {
    fontSize: 11,
    lineHeight: 16,
    color: TACTICAL.textMuted,
  },
  emptyState: {
    flex: 1,
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 10,
  },
  emptyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}26`,
    backgroundColor: `${TACTICAL.amber}10`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: TACTICAL.text,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 12,
    lineHeight: 18,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
  emptyActionBtn: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}33`,
    backgroundColor: `${TACTICAL.amber}14`,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  emptyActionText: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  footerCard: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 14,
    gap: 10,
  },
  footerTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: TACTICAL.textMuted,
  },
});
