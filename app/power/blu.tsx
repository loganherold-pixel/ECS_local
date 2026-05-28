import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { useTheme } from '../../context/ThemeContext';
import { hapticCommand, hapticMicro } from '../../lib/haptics';
import { GOLD_RAIL, RADIUS, SPACING } from '../../lib/theme';
import { ecsLog } from '../../lib/ecsLogger';
import {
  type ECSConnectionActionKind,
  type ECSConnectionStatus,
  type ECSDeviceConnectionModel,
  useUnifiedDeviceConnections,
} from '../../lib/unifiedScanner';
import {
  getBluestackConnectionPolicy,
  getBluestackVisibleDeviceListLabel,
  isBluestackReleaseDeviceModel,
} from '../../lib/bluestack';

type StatusTone = 'neutral' | 'active' | 'sync' | 'warning' | 'danger';

type CompatibilitySystem = {
  name: string;
  detail: string;
  badge: string;
  tone: StatusTone;
  icon: React.ComponentProps<typeof Ionicons>['name'];
};

const VERIFIED_BLUESTACK_SYSTEMS: CompatibilitySystem[] = [
  {
    name: 'EcoFlow cloud/API',
    detail: 'DELTA, RIVER, GLACIER, WAVE, and Alternator Charger telemetry when the EcoFlow account authorizes the device.',
    badge: 'Live ready',
    tone: 'active',
    icon: 'flash-outline',
  },
  {
    name: 'Native BLE power systems',
    detail: 'BLUETTI/Blue Eddy, Anker SOLIX, Jackery, Goal Zero, Renogy, REDARC, Dakota Lithium, and Victron can attempt live Bluetooth telemetry and promote only decoded hardware readings.',
    badge: 'Live ready',
    tone: 'active',
    icon: 'battery-charging-outline',
  },
  {
    name: 'OBD2 ELM327 telemetry',
    detail: 'Veepeak/V Peak BLE reference path plus ELM327-compatible OBD2 adapters after the PID handshake succeeds.',
    badge: 'Live ready',
    tone: 'active',
    icon: 'speedometer-outline',
  },
  {
    name: 'Utility tank sensors',
    detail: 'Mopeka propane plus SeeLevel/water monitor profiles can link over native BLE and promote only decoded tank level readings.',
    badge: 'Live ready',
    tone: 'active',
    icon: 'hardware-chip-outline',
  },
];

const RECOGNIZED_BLUESTACK_SYSTEMS: CompatibilitySystem[] = [];

function isVisibleReleaseDevice(device: ECSDeviceConnectionModel): boolean {
  return isBluestackReleaseDeviceModel(device);
}

function getVisibleDeviceListLabel(devices: ECSDeviceConnectionModel[]): string {
  return getBluestackVisibleDeviceListLabel(devices);
}

function getStatusTone(status: ECSConnectionStatus): StatusTone {
  switch (status) {
    case 'live':
      return 'active';
    case 'connected':
      return 'neutral';
    case 'disconnecting':
    case 'connecting':
    case 'selected':
    case 'discoverable':
      return 'sync';
    case 'stale':
    case 'partial':
    case 'remembered':
      return 'warning';
    case 'unsupported':
    case 'failed':
    default:
      return 'danger';
  }
}

function getToneColors(tone: StatusTone) {
  switch (tone) {
    case 'active':
      return { text: '#4CAF50', border: '#4CAF5040', background: '#4CAF5010' };
    case 'sync':
      return { text: '#5AC8FA', border: '#5AC8FA40', background: '#5AC8FA12' };
    case 'warning':
      return { text: '#D6A04B', border: '#D6A04B40', background: '#D6A04B12' };
    case 'danger':
      return { text: '#FF6B6B', border: '#FF6B6B40', background: '#FF6B6B12' };
    case 'neutral':
    default:
      return { text: '#A99362', border: '#A9936240', background: '#A9936212' };
  }
}

function getStatusPillTone(label: string, fallback: StatusTone): StatusTone {
  switch (label) {
    case 'Live':
      return 'active';
    case 'Connecting':
    case 'Cloud Polling':
    case 'Discovered':
      return 'sync';
    case 'Awaiting Data':
    case 'Stale':
    case 'Mock':
      return 'warning';
    case 'Timeout':
    case 'Auth Required':
    case 'Unsupported':
    case 'Failed':
      return 'danger';
    case 'Connected':
    case 'Disconnected':
    default:
      return fallback;
  }
}

function getSourceTone(label: string): StatusTone {
  switch (label) {
    case 'Local BLE':
    case 'OBD2':
      return 'sync';
    case 'Cloud API':
    case 'Hybrid':
      return 'neutral';
    case 'Mock':
      return 'warning';
    default:
      return 'neutral';
  }
}

function formatLastTelemetryLabel(timestamp: number | null): string {
  if (!timestamp || timestamp <= 0) return 'Last telemetry --';
  const ageMs = Date.now() - timestamp;
  if (ageMs >= 0 && ageMs < 5_000) return 'Last telemetry just now';
  if (ageMs >= 0 && ageMs < 60_000) return `Last telemetry ${Math.max(1, Math.floor(ageMs / 1000))}s ago`;
  if (ageMs >= 0 && ageMs < 3_600_000) return `Last telemetry ${Math.floor(ageMs / 60_000)}m ago`;
  try {
    return `Last telemetry ${new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return 'Last telemetry --';
  }
}

function shouldShowDiagnosticReason(device: ECSDeviceConnectionModel): boolean {
  if (!device.diagnosticReason) return false;
  return (
    device.statusPillLabel === 'Awaiting Data' ||
    device.statusPillLabel === 'Stale' ||
    device.statusPillLabel === 'Timeout' ||
    device.statusPillLabel === 'Auth Required' ||
    device.statusPillLabel === 'Unsupported' ||
    device.statusPillLabel === 'Failed' ||
    device.telemetryUnsupported
  );
}

function getDeviceIcon(device: ECSDeviceConnectionModel): React.ComponentProps<typeof Ionicons>['name'] {
  if (device.kind === 'telemetry') return 'speedometer-outline';
  if (device.deviceCategory === 'propane_monitor' || device.providerId === 'propane_monitor') return 'flame-outline';
  if (device.deviceCategory === 'water_tank_monitor' || device.providerId === 'water_monitor') return 'water-outline';
  if (device.kind === 'sensor') return 'hardware-chip-outline';
  if (device.kind === 'generic') return 'bluetooth-outline';

  switch (device.providerId) {
    case 'ecoflow':
      return 'flash-outline';
    case 'bluetti':
      return 'cube-outline';
    case 'anker_solix':
      return 'battery-charging-outline';
    case 'jackery':
      return 'sunny-outline';
    case 'goal_zero':
      return 'compass-outline';
    case 'renogy':
      return 'hardware-chip-outline';
    case 'redarc':
      return 'car-sport-outline';
    case 'dakota_lithium':
      return 'shield-outline';
    default:
      return 'bluetooth-outline';
  }
}

function getPrimaryActionLabel(device: ECSDeviceConnectionModel): string {
  const policy = getBluestackConnectionPolicy(device);
  switch (device.actionKind) {
    case 'disconnect':
      return device.actionLabel;
    case 'disconnecting':
      return 'Disconnecting...';
    case 'retry':
      return 'Retry';
    case 'connecting':
      return 'Connecting...';
    case 'connect':
      return policy.primaryActionLabel;
    case 'connected':
      return 'Connected';
    case 'selected':
      return 'Selected';
    case 'none':
    default:
      return device.actionLabel || 'Unavailable';
  }
}

function getDeviceEyebrow(device: ECSDeviceConnectionModel): string {
  const parts = [device.provider, device.category].filter(Boolean);
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  return unique.join(' • ');
}

function getDeviceModelLabel(device: ECSDeviceConnectionModel): string | null {
  if (!device.subtype) return null;
  if (device.subtype.trim().toLowerCase() === device.name.trim().toLowerCase()) return null;
  return device.subtype;
}

function getTruthChip(device: ECSDeviceConnectionModel): { label: string; tone: StatusTone } | null {
  const policy = getBluestackConnectionPolicy(device);
  if (device.kind === 'sensor' || device.kind === 'generic') {
    if (device.isConnected) {
      return {
        label: policy.telemetryTruthLabel,
        tone: policy.lane === 'live_telemetry' ? 'active' : 'warning',
      };
    }
    if (policy.lane === 'native_ble_required') {
      return {
        label: policy.telemetryTruthLabel,
        tone: 'sync',
      };
    }
    return null;
  }

  if (device.isLive) {
    return {
      label: device.telemetrySourceLabel || (device.kind === 'telemetry' ? 'Live Bluetooth' : 'Live Bluetooth'),
      tone: 'active',
    };
  }
  if (device.telemetrySource === 'provider_cloud') {
    return {
      label: device.telemetrySourceLabel || policy.telemetryTruthLabel || 'Provider Cloud',
      tone: 'sync',
    };
  }
  if (device.telemetryUnsupported) {
    return {
      label: policy.telemetryTruthLabel || 'Parser Pending',
      tone: 'warning',
    };
  }
  if (device.status === 'stale') {
    return {
      label: device.telemetrySourceLabel || 'Last Known',
      tone: 'warning',
    };
  }
  if (device.isConnected) {
    return {
      label: policy.telemetryTruthLabel || (device.telemetrySourceLabel === 'Unavailable' ? 'Data Pending' : device.telemetrySourceLabel),
      tone: policy.lane === 'linked_no_parser' || policy.lane === 'pending_protocol' ? 'warning' : 'neutral',
    };
  }
  return null;
}

function getFooterLabel(device: ECSDeviceConnectionModel): string {
  const metaParts = [
    formatLastTelemetryLabel(device.lastTelemetryAt),
    device.sourceBadges.length > 0 ? `Source ${device.sourceBadges.join('+')}` : null,
    device.lastSeenAt
      ? `Last seen ${new Date(device.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : null,
    typeof device.signalStrength === 'number' ? `${device.signalStrength} dBm` : null,
  ].filter(Boolean);

  if (metaParts.length > 0) {
    return metaParts.join(' • ');
  }

  if (device.status === 'connecting') return 'Establishing device session';
  if (device.isConnected && !device.isLive) return `Source: ${device.telemetrySourceLabel}`;
  if (device.isDiscoverable) return 'Visible during the current scan';
  return 'Awaiting device activity';
}

function DeviceStatePill({
  label,
  tone,
}: {
  label: string;
  tone: StatusTone;
}) {
  const colors = getToneColors(tone);

  return (
    <View
      style={[
        styles.statePill,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
        },
      ]}
    >
      <Text style={[styles.statePillText, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

function SummaryStat({
  label,
  value,
  color,
  mutedColor,
}: {
  label: string;
  value: number;
  color: string;
  mutedColor: string;
}) {
  return (
    <View style={styles.summaryStat}>
      <Text style={[styles.summaryStatValue, { color }]}>{value}</Text>
      <Text style={[styles.summaryStatLabel, { color: mutedColor }]}>{label}</Text>
    </View>
  );
}

function EmptySection({
  title,
  body,
  onRescan,
  actionLabel,
  actionDisabled = false,
  palette,
}: {
  title: string;
  body: string;
  onRescan?: () => void;
  actionLabel?: string;
  actionDisabled?: boolean;
  palette: any;
}) {
  return (
    <View
      style={[
        styles.emptyState,
        {
          backgroundColor: palette.border + '18',
          borderColor: palette.border,
        },
      ]}
    >
      <Ionicons name="bluetooth-outline" size={20} color={palette.amber} />
      <View style={styles.emptyCopy}>
        <Text style={[styles.emptyTitle, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.emptyBody, { color: palette.textMuted }]}>{body}</Text>
      </View>
      {onRescan && actionLabel ? (
        <TouchableOpacity
          style={[
            styles.inlineActionBtn,
            {
              borderColor: palette.amber + '40',
              backgroundColor: palette.amber + '10',
            },
          ]}
          onPress={() => {
            if (actionDisabled) return;
            onRescan();
          }}
          disabled={actionDisabled}
          accessibilityState={{ disabled: actionDisabled }}
          activeOpacity={0.78}
        >
          <Text style={[styles.inlineActionBtnText, { color: palette.amber }]} numberOfLines={2}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function DeviceRow({
  device,
  onToggleSelection,
  onPrimaryAction,
  actionBusy,
  globalBusy,
  palette,
}: {
  device: ECSDeviceConnectionModel;
  onToggleSelection: (deviceId: string) => void;
  onPrimaryAction: (device: ECSDeviceConnectionModel) => void;
  actionBusy: boolean;
  globalBusy: boolean;
  palette: any;
}) {
  const tone = getStatusTone(device.status);
  const toneColors = getToneColors(tone);
  const connectionPolicy = getBluestackConnectionPolicy(device);
  const truthChip = getTruthChip(device);
  const selectionEnabled =
    !device.isConnected &&
    !device.isConnecting &&
    connectionPolicy.canAttemptConnection &&
    (device.actionKind === 'connect' || device.actionKind === 'retry');
  const showSelectionToggle = selectionEnabled || device.isSelected;
  const showPrimaryAction = actionBusy || device.actionKind !== 'none';
  const modelLabel = getDeviceModelLabel(device);
  const showDiagnosticReason = shouldShowDiagnosticReason(device);

  const actionDisabled =
    globalBusy ||
    device.actionKind === 'none' ||
    device.actionKind === 'connected' ||
    device.actionKind === 'selected' ||
    device.actionKind === 'disconnecting' ||
    device.actionKind === 'connecting' ||
    (!connectionPolicy.canAttemptConnection && !device.isConnected);

  const handlePress = useCallback(() => {
    if (actionDisabled) return;
    void hapticCommand();
    onPrimaryAction(device);
  }, [actionDisabled, device, onPrimaryAction]);

  const handleToggleSelection = useCallback(() => {
    if (!selectionEnabled) return;
    void hapticMicro();
    onToggleSelection(device.id);
  }, [device.id, onToggleSelection, selectionEnabled]);

  return (
    <View
      style={[
        styles.deviceRow,
        {
          backgroundColor: palette.panel,
          borderColor: device.isSelected
            ? palette.amber + '4A'
            : device.isLive
              ? toneColors.border
              : palette.border,
        },
      ]}
    >
      <View style={styles.deviceRowTop}>
        {showSelectionToggle ? (
          <TouchableOpacity
            style={[
              styles.selectionToggle,
              {
                borderColor: selectionEnabled ? palette.amber + '66' : palette.border,
                backgroundColor: device.isSelected ? palette.amber : 'transparent',
                opacity: selectionEnabled ? 1 : 0.7,
              },
            ]}
            onPress={handleToggleSelection}
            activeOpacity={0.78}
            disabled={!selectionEnabled}
          >
            {device.isSelected ? (
              <Ionicons name="checkmark" size={12} color="#111" />
            ) : (
              <View style={styles.selectionInner} />
            )}
          </TouchableOpacity>
        ) : (
          <View style={[styles.selectionMarker, { backgroundColor: toneColors.text + '88' }]} />
        )}

        <View
          style={[
            styles.deviceIconWrap,
            { backgroundColor: toneColors.background, borderColor: toneColors.border },
          ]}
        >
          <Ionicons name={getDeviceIcon(device)} size={18} color={toneColors.text} />
        </View>

        <View style={styles.deviceMain}>
          <Text style={[styles.deviceEyebrow, { color: palette.textMuted }]} numberOfLines={1}>
            {getDeviceEyebrow(device)}
          </Text>

          <View style={styles.deviceTitleRow}>
            <Text style={[styles.deviceName, { color: palette.text }]} numberOfLines={1}>
              {device.name}
            </Text>
          </View>

          {modelLabel ? (
            <Text style={[styles.deviceModel, { color: palette.textMuted }]} numberOfLines={1}>
              {modelLabel}
            </Text>
          ) : null}
        </View>

        {showPrimaryAction ? (
          <TouchableOpacity
            style={[
              styles.primaryActionBtn,
              {
                backgroundColor: actionDisabled ? palette.border + '22' : toneColors.background,
                borderColor: actionDisabled ? palette.border : toneColors.border,
              },
            ]}
            onPress={handlePress}
            activeOpacity={0.8}
            disabled={actionDisabled}
          >
            {actionBusy || device.actionKind === 'connecting' || device.actionKind === 'disconnecting' ? (
              <View style={styles.actionBusyRow}>
                <ActivityIndicator size={12} color={toneColors.text} />
                <Text style={[styles.primaryActionText, { color: toneColors.text }]}>
                  {getPrimaryActionLabel(device)}
                </Text>
              </View>
            ) : (
              <Text
                style={[
                  styles.primaryActionText,
                  { color: actionDisabled ? palette.textMuted : toneColors.text },
                ]}
              >
                {getPrimaryActionLabel(device)}
              </Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.devicePillsRow}>
        <DeviceStatePill
          label={device.statusPillLabel}
          tone={getStatusPillTone(device.statusPillLabel, tone)}
        />
        <DeviceStatePill label={device.connectionSourceLabel} tone={getSourceTone(device.connectionSourceLabel)} />
        <DeviceStatePill
          label={connectionPolicy.statusLabel}
          tone={
            connectionPolicy.lane === 'live_telemetry'
              ? 'active'
              : connectionPolicy.lane === 'unsupported' || connectionPolicy.lane === 'cloud_authorization_needed'
                ? 'danger'
                : connectionPolicy.lane === 'cloud_authorized'
                  ? 'sync'
                  : 'warning'
          }
        />
        {truthChip ? <DeviceStatePill label={truthChip.label} tone={truthChip.tone} /> : null}
        {device.isSelected ? <DeviceStatePill label="Selected" tone="sync" /> : null}
        {device.supportLevel !== 'verified' && device.supportLevel !== 'telemetry' && device.status !== 'partial' && device.status !== 'unsupported' ? (
          <DeviceStatePill
            label={device.supportLabel}
            tone={device.supportLevel === 'ui_only' ? 'danger' : 'warning'}
          />
        ) : null}
      </View>

      <Text style={[styles.deviceDetail, { color: palette.textMuted }]}>
        {device.detailLabel || connectionPolicy.statusDetail}
      </Text>

      {device.telemetryFields.length > 0 ? (
        <View style={styles.telemetryGrid}>
          {device.telemetryFields.map((field) => (
            <View
              key={field.key}
              style={[
                styles.telemetryCell,
                {
                  backgroundColor: palette.border + '16',
                  borderColor: palette.border,
                },
              ]}
            >
              <Text style={[styles.telemetryCellLabel, { color: palette.textMuted }]} numberOfLines={1}>
                {field.label}
              </Text>
              <Text style={[styles.telemetryCellValue, { color: palette.text }]} numberOfLines={1}>
                {field.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {showDiagnosticReason ? (
        <View
          style={[
            styles.diagnosticReasonBox,
            {
              backgroundColor: getToneColors(getStatusPillTone(device.statusPillLabel, tone)).background,
              borderColor: getToneColors(getStatusPillTone(device.statusPillLabel, tone)).border,
            },
          ]}
        >
          <Text
            style={[
              styles.diagnosticReasonLabel,
              { color: getToneColors(getStatusPillTone(device.statusPillLabel, tone)).text },
            ]}
          >
            Reason
          </Text>
          <Text style={[styles.diagnosticReasonText, { color: palette.text }]} numberOfLines={3}>
            {device.diagnosticReason}
          </Text>
        </View>
      ) : null}

      <View style={[styles.deviceFooter, { borderTopColor: GOLD_RAIL.subsection }]}>
        <Text style={[styles.deviceFooterText, { color: palette.textMuted }]}>
          {getFooterLabel(device)}
        </Text>

        {device.affectsMultipleDevices ? (
          <Text style={[styles.deviceImpactText, { color: palette.textMuted }]}>
            Disconnecting this provider may end more than one active power session.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function SectionBlock({
  title,
  subtitle,
  count,
  children,
  palette,
}: {
  title: string;
  subtitle: string;
  count: number;
  children: React.ReactNode;
  palette: any;
}) {
  return (
    <View
      style={[
        styles.sectionCard,
        {
          backgroundColor: palette.panel,
          borderColor: palette.border,
        },
      ]}
    >
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderCopy}>
          <Text style={[styles.sectionTitle, { color: palette.amber }]}>{title}</Text>
          <Text style={[styles.sectionSubtitle, { color: palette.textMuted }]}>{subtitle}</Text>
        </View>
        <View
          style={[
            styles.sectionCountPill,
            {
              backgroundColor: palette.border + '22',
              borderColor: palette.border,
            },
          ]}
        >
          <Text style={[styles.sectionCountText, { color: palette.textMuted }]}>{count}</Text>
        </View>
      </View>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function CompatibilitySystemRow({
  system,
  palette,
}: {
  system: CompatibilitySystem;
  palette: any;
}) {
  const toneColors = getToneColors(system.tone);

  return (
    <View
      style={[
        styles.compatibilityRow,
        {
          backgroundColor: palette.border + '14',
          borderColor: palette.border,
        },
      ]}
    >
      <View
        style={[
          styles.compatibilityIconWrap,
          {
            backgroundColor: toneColors.background,
            borderColor: toneColors.border,
          },
        ]}
      >
        <Ionicons name={system.icon} size={16} color={toneColors.text} />
      </View>
      <View style={styles.compatibilityCopy}>
        <View style={styles.compatibilityTitleRow}>
          <Text style={[styles.compatibilityName, { color: palette.text }]} numberOfLines={1}>
            {system.name}
          </Text>
          <View
            style={[
              styles.compatibilityBadge,
              {
                backgroundColor: toneColors.background,
                borderColor: toneColors.border,
              },
            ]}
          >
            <Text style={[styles.compatibilityBadgeText, { color: toneColors.text }]}>{system.badge}</Text>
          </View>
        </View>
        <Text style={[styles.compatibilityDetail, { color: palette.textMuted }]}>
          {system.detail}
        </Text>
      </View>
    </View>
  );
}

function CompatibilitySystemGroup({
  label,
  systems,
  palette,
}: {
  label: string;
  systems: CompatibilitySystem[];
  palette: any;
}) {
  return (
    <View style={styles.compatibilityGroup}>
      <Text style={[styles.compatibilityGroupLabel, { color: palette.textMuted }]}>{label}</Text>
      {systems.map((system) => (
        <CompatibilitySystemRow key={system.name} system={system} palette={palette} />
      ))}
    </View>
  );
}

function BluestackCompatibilityCard({ palette }: { palette: any }) {
  return (
    <View
      style={[
        styles.compatibilityCard,
        {
          backgroundColor: palette.panel,
          borderColor: palette.border,
        },
      ]}
    >
      <View style={styles.compatibilityHeader}>
        <Ionicons name="checkmark-done-circle-outline" size={18} color={palette.amber} />
        <View style={styles.compatibilityHeaderCopy}>
          <Text style={[styles.compatibilityCardTitle, { color: palette.text }]}>Verified Connection Set</Text>
          <Text style={[styles.compatibilityCardBody, { color: palette.textMuted }]}>
            ECS only marks systems as live-ready when a working telemetry path exists. Recognized systems can appear in scans without being presented as verified live data.
          </Text>
        </View>
      </View>
      <CompatibilitySystemGroup
        label="Tested live telemetry"
        systems={VERIFIED_BLUESTACK_SYSTEMS}
        palette={palette}
      />
      {RECOGNIZED_BLUESTACK_SYSTEMS.length > 0 ? (
        <CompatibilitySystemGroup
          label="Detected, not yet live-ready"
          systems={RECOGNIZED_BLUESTACK_SYSTEMS}
          palette={palette}
        />
      ) : null}
    </View>
  );
}

export default function BluPowerSourcesScreen() {
  const router = useRouter();
  const { palette, colors } = useTheme();
  const connections = useUnifiedDeviceConnections();
  const stopScanning = connections.stopScanning;
  const [showRememberedDevices, setShowRememberedDevices] = useState(false);
  const connectedReleaseDevices = useMemo(() => {
    const byId = new Map<string, ECSDeviceConnectionModel>();
    for (const device of connections.connectedDevices) {
      if (isVisibleReleaseDevice(device)) {
        byId.set(device.id, device);
      }
    }
    return Array.from(byId.values());
  }, [connections.connectedDevices]);
  const visibleReleaseDevices = useMemo(() => {
    const byId = new Map<string, ECSDeviceConnectionModel>();
    const availableScannerDevices = [
      ...connections.nearbyDevices,
      ...connections.attentionDevices,
    ];
    const availableScannerDeviceIds = new Set(availableScannerDevices.map((device) => device.id));
    for (const device of connections.devices) {
      if (!availableScannerDeviceIds.has(device.id)) continue;
      if (isVisibleReleaseDevice(device)) {
        byId.set(device.id, device);
      }
    }
    return Array.from(byId.values());
  }, [connections.devices, connections.nearbyDevices, connections.attentionDevices]);
  const rememberedReleaseDevices = useMemo(() => {
    const byId = new Map<string, ECSDeviceConnectionModel>();
    for (const device of connections.knownDevices) {
      if (isVisibleReleaseDevice(device)) {
        byId.set(device.id, device);
      }
    }
    return Array.from(byId.values());
  }, [connections.knownDevices]);

  useEffect(() => {
    if (rememberedReleaseDevices.length === 0 && showRememberedDevices) {
      setShowRememberedDevices(false);
    }
  }, [rememberedReleaseDevices.length, showRememberedDevices]);

  useEffect(() => {
    if (__DEV__) {
      ecsLog.debug('TELEMETRY', '[BT_SOURCE] active_device_connections_route', {
        route: '/power/blu',
        file: 'app/power/blu.tsx',
        hook: 'lib/useUnifiedDeviceConnections.ts',
        buttonText: 'Scan for Device Connections',
      });
    }
  }, []);

  useEffect(() => {
    if (!connections.routeIntent) return;
    connections.consumeRouteIntent(connections.routeIntent.id);
  }, [connections]);

  useFocusEffect(
    useCallback(() => (
      () => {
        void stopScanning('screen_blur');
      }
    ), [stopScanning]),
  );

  const handlePrimaryAction = useCallback(async (device: ECSDeviceConnectionModel) => {
    if (device.isConnected) {
      await connections.disconnectDevice(device.id);
      return;
    }

    if (device.actionKind === 'retry') {
      await connections.retryDevice(device.id, 'user_retry');
      return;
    }

    await connections.connectDevice(device.id, 'user_device_action');
  }, [connections]);

  const handleBackPress = useCallback(() => {
    void hapticMicro();
    router.back();
  }, [router]);

  const handleRescanPress = useCallback(() => {
    void hapticCommand();
    void connections.rescan();
  }, [connections]);

  const handleConnectSelectedPress = useCallback(() => {
    void hapticCommand();
    void connections.connectSelected('user_selected_batch');
  }, [connections]);

  const handleClearSelectionPress = useCallback(() => {
    void hapticMicro();
    connections.clearSelection();
  }, [connections]);

  const handleRememberedDevicesPress = useCallback(() => {
    void hapticMicro();
    setShowRememberedDevices((current) => !current);
  }, []);

  const nearbyPowerScanState =
    connections.scanAreaState === 'results' && visibleReleaseDevices.length === 0
      ? 'empty'
      : connections.scanAreaState;
  const nearbyEmptyTitle = (() => {
    if (connectedReleaseDevices.length > 0 && nearbyPowerScanState === 'empty') {
      return 'No additional devices';
    }
    switch (nearbyPowerScanState) {
      case 'checking':
        return 'Checking Bluetooth';
      case 'permission_denied':
        return 'Permission needed';
      case 'bluetooth_unavailable':
        return 'Bluetooth off';
      case 'runtime_unsupported':
        return 'Runtime unsupported';
      case 'api_failed':
        return 'Scanner source failed';
      case 'ble_failed':
        return 'BLE discovery failed';
      case 'classic_unsupported':
        return 'Classic Bluetooth unsupported';
      case 'scan_failed':
        return 'Scan failed';
      case 'scanning':
        return 'Scanning nearby devices';
      case 'empty':
        return 'No Bluestack devices found';
      case 'idle':
      default:
        return 'Ready to scan';
    }
  })();
  const nearbyEmptyBody = (() => {
    if (connectedReleaseDevices.length > 0 && nearbyPowerScanState === 'empty') {
      return 'Connected devices are listed above. Scan again when you want to add another OBD2, power, propane, or water device.';
    }
    switch (nearbyPowerScanState) {
      case 'runtime_unsupported':
        return 'Native Bluetooth scanning is unavailable in this runtime. Open ECS in an installed app or Expo development build to scan real power, OBD2, propane, and water devices.';
      case 'permission_denied':
        return 'Bluetooth permissions are required before ECS can scan nearby power, OBD2, propane, and water advertisements.';
      case 'bluetooth_unavailable':
        return 'Turn Bluetooth on, then scan again for nearby power, OBD2, propane, and water advertisements.';
      case 'empty':
        return 'No nearby Bluestack-compatible advertisements were found. Make sure the device is on, nearby, and advertising over Bluetooth.';
      default:
        return connections.scanAreaMessage;
    }
  })();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: palette.panel }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBackPress}
          activeOpacity={0.75}
        >
          <Ionicons name="chevron-back" size={22} color={palette.amber} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerLabel, { color: palette.textMuted }]}>ECS BLUESTACK</Text>
          <Text style={[styles.headerTitle, { color: palette.text }]}>Bluestack Scanner</Text>
        </View>

        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View
            style={[
              styles.heroCard,
              {
                backgroundColor: palette.panel,
                borderColor: palette.border,
              },
            ]}
          >
            <View style={styles.heroTop}>
              <View
                style={[
                  styles.heroIconWrap,
                  {
                    backgroundColor: palette.amber + '10',
                    borderColor: palette.amber + '30',
                  },
                ]}
              >
                <Ionicons name="bluetooth-outline" size={22} color={palette.amber} />
              </View>

              <View style={styles.heroCopy}>
                <Text style={[styles.heroEyebrow, { color: palette.textMuted }]}>BLUESTACK UNIFIED SCANNER</Text>
                <Text style={[styles.heroTitle, { color: palette.text }]}>{connections.globalSummaryLabel}</Text>
                <Text style={[styles.heroBody, { color: palette.textMuted }]}>
                  Scan for supported OBD2, power, propane, and water monitor connections. Cloud/API power devices stay selectable when native Bluetooth is unavailable, while consumer Bluetooth noise stays hidden.
                </Text>
              </View>
            </View>

            <View style={styles.heroStatsRow}>
              <SummaryStat
                label="Available"
                value={connections.bluestackSummary.availableCount}
                color={palette.text}
                mutedColor={palette.textMuted}
              />
              <SummaryStat
                label="Live"
                value={connections.bluestackSummary.liveCount}
                color="#4CAF50"
                mutedColor={palette.textMuted}
              />
              <SummaryStat
                label="Selected"
                value={connections.bluestackSummary.selectedCount}
                color={palette.amber}
                mutedColor={palette.textMuted}
              />
            </View>

            <View style={styles.heroStatsRow}>
              <SummaryStat
                label="Cloud/API"
                value={connections.bluestackSummary.cloudApiCount}
                color="#5AC8FA"
                mutedColor={palette.textMuted}
              />
              <SummaryStat
                label="Parser Pend"
                value={connections.bluestackSummary.parserPendingCount}
                color="#D6A04B"
                mutedColor={palette.textMuted}
              />
              <SummaryStat
                label="Native Build"
                value={connections.bluestackSummary.nativeBuildRequiredCount}
                color={palette.text}
                mutedColor={palette.textMuted}
              />
            </View>

            {connections.isDegraded && connections.degradedMessage ? (
              <View
                style={[
                  styles.banner,
                  {
                    backgroundColor: '#D6A04B12',
                    borderColor: '#D6A04B40',
                  },
                ]}
              >
                <Ionicons name="warning-outline" size={16} color="#D6A04B" />
                <Text style={[styles.bannerText, { color: palette.text }]}>
                  {connections.degradedMessage}
                </Text>
              </View>
            ) : null}

            {connections.infoMessage ? (
              <View
                style={[
                  styles.banner,
                  {
                    backgroundColor: palette.amber + '10',
                    borderColor: palette.amber + '30',
                  },
                ]}
              >
                <Ionicons name="information-circle-outline" size={16} color={palette.amber} />
                <Text style={[styles.bannerText, { color: palette.text }]}>
                  {connections.infoMessage}
                </Text>
              </View>
            ) : null}

            <View style={styles.heroActionRow}>
              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  {
                    borderColor: palette.border,
                    backgroundColor: palette.border + '1C',
                  },
                ]}
                onPress={handleRescanPress}
                activeOpacity={0.8}
                disabled={connections.isScanning}
                accessibilityState={{ disabled: connections.isScanning }}
              >
                {connections.isScanning ? (
                  <ActivityIndicator size={13} color={palette.textMuted} />
                ) : (
                  <Ionicons name="refresh-outline" size={15} color={palette.textMuted} />
                )}
                <Text style={[styles.secondaryBtnText, { color: palette.textMuted }]} numberOfLines={2}>
                  {connections.isCheckingScanReadiness
                    ? 'Checking...'
                    : connections.isScanning
                      ? 'Scanning...'
                      : 'Scan for Device Connections'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  {
                    backgroundColor: connections.canConnectSelected ? palette.amber : palette.border + '20',
                    borderColor: connections.canConnectSelected ? palette.amber : palette.border,
                  },
                ]}
                onPress={handleConnectSelectedPress}
                activeOpacity={0.82}
                disabled={!connections.canConnectSelected || connections.isBusy}
              >
                {connections.isBusy ? (
                  <ActivityIndicator size={13} color={connections.canConnectSelected ? '#121212' : palette.textMuted} />
                ) : (
                  <Ionicons
                    name="flash-outline"
                    size={15}
                    color={connections.canConnectSelected ? '#121212' : palette.textMuted}
                  />
                )}
                <Text
                  style={[
                    styles.primaryBtnText,
                    { color: connections.canConnectSelected ? '#121212' : palette.textMuted },
                  ]}
                >
                  Connect Selected
                </Text>
              </TouchableOpacity>

              {connections.selectedCount > 0 ? (
                <TouchableOpacity
                  style={[
                    styles.secondaryBtn,
                    {
                      borderColor: palette.border,
                      backgroundColor: palette.border + '1C',
                    },
                  ]}
                  onPress={handleClearSelectionPress}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close-outline" size={15} color={palette.textMuted} />
                  <Text style={[styles.secondaryBtnText, { color: palette.textMuted }]}>Clear Selection</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  {
                    borderColor: showRememberedDevices ? palette.amber + '50' : palette.border,
                    backgroundColor: showRememberedDevices ? palette.amber + '12' : palette.border + '1C',
                    opacity: rememberedReleaseDevices.length > 0 ? 1 : 0.62,
                  },
                ]}
                onPress={handleRememberedDevicesPress}
                activeOpacity={0.8}
                disabled={rememberedReleaseDevices.length === 0}
                accessibilityState={{
                  disabled: rememberedReleaseDevices.length === 0,
                  selected: showRememberedDevices,
                }}
              >
                <Ionicons
                  name="time-outline"
                  size={15}
                  color={showRememberedDevices ? palette.amber : palette.textMuted}
                />
                <Text
                  style={[
                    styles.secondaryBtnText,
                    { color: showRememberedDevices ? palette.amber : palette.textMuted },
                  ]}
                  numberOfLines={2}
                >
                  Remembered Devices ({rememberedReleaseDevices.length})
                </Text>
              </TouchableOpacity>
            </View>

          </View>

          {connectedReleaseDevices.length > 0 ? (
            <SectionBlock
              title="Connected devices"
              subtitle="Live and attached Bluestack devices. Use each device row to inspect fields or disconnect that device."
              count={connectedReleaseDevices.length}
              palette={palette}
            >
              {connectedReleaseDevices.map((device) => (
                <DeviceRow
                  key={device.id}
                  device={device}
                  onToggleSelection={connections.toggleSelection}
                  onPrimaryAction={handlePrimaryAction}
                  actionBusy={device.isConnecting}
                  globalBusy={connections.isBatchBusy}
                  palette={palette}
                />
              ))}
            </SectionBlock>
          ) : null}

          {showRememberedDevices ? (
            <SectionBlock
              title="Remembered devices"
              subtitle="Previously successful Bluestack connections. Retry a remembered device to reconnect it without waiting for a fresh scan result when the platform supports it."
              count={rememberedReleaseDevices.length}
              palette={palette}
            >
              {rememberedReleaseDevices.length === 0 ? (
                <EmptySection
                  title="No remembered devices"
                  body="Devices appear here after ECS completes a successful power, OBD2, propane, or water connection."
                  palette={palette}
                />
              ) : (
                rememberedReleaseDevices.map((device) => (
                  <DeviceRow
                    key={device.id}
                    device={device}
                    onToggleSelection={connections.toggleSelection}
                    onPrimaryAction={handlePrimaryAction}
                    actionBusy={device.isConnecting}
                    globalBusy={connections.isBatchBusy}
                    palette={palette}
                  />
                ))
              )}
            </SectionBlock>
          ) : null}

          <SectionBlock
            title="Available devices"
            subtitle={getVisibleDeviceListLabel(visibleReleaseDevices)}
            count={visibleReleaseDevices.length}
            palette={palette}
          >
            {visibleReleaseDevices.length === 0 ? (
              <EmptySection
                title={nearbyEmptyTitle}
                body={nearbyEmptyBody}
                palette={palette}
              />
            ) : (
              visibleReleaseDevices.map((device) => (
                <DeviceRow
                  key={device.id}
                  device={device}
                  onToggleSelection={connections.toggleSelection}
                  onPrimaryAction={handlePrimaryAction}
                  actionBusy={device.isConnecting}
                  globalBusy={connections.isBatchBusy}
                  palette={palette}
                />
              ))
            )}
          </SectionBlock>

          <BluestackCompatibilityCard palette={palette} />

          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: palette.panel,
                borderColor: palette.border,
              },
            ]}
          >
            <Ionicons name="shield-checkmark-outline" size={18} color={palette.amber} />
            <View style={styles.infoCopy}>
              <Text style={[styles.infoTitle, { color: palette.text }]}>Connection Truth</Text>
              <Text style={[styles.infoBody, { color: palette.textMuted }]}>
                Bluestack lists available EcoFlow cloud/API devices plus currently discovered nearby power, OBD2, propane, and water monitor advertisements. EcoFlow cloud authorization problems do not create Bluetooth failure rows.
              </Text>
              <Text style={[styles.infoBody, { color: palette.textMuted }]}>
                Generic Bluetooth accessories, TVs, headsets, and other consumer devices are suppressed unless ECS can classify them as OBD2, power, propane, or water candidates.
              </Text>
            </View>
          </View>

          <View style={{ height: 72 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'web' ? 16 : 54,
    paddingBottom: 14,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: GOLD_RAIL.sectionWidth,
    borderBottomColor: GOLD_RAIL.section,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerRight: {
    width: 44,
    height: 44,
  },
  headerLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2.8,
    textTransform: 'uppercase',
  },
  headerTitle: {
    marginTop: 3,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  heroCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: {
    flex: 1,
    gap: 4,
  },
  heroEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2.8,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  heroBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  heroStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryStat: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  summaryStatValue: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
  },
  summaryStatLabel: {
    marginTop: 3,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  bannerText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 18,
  },
  heroActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  secondaryBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  secondaryBtnText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
    flexShrink: 1,
  },
  primaryBtn: {
    minHeight: 40,
    paddingHorizontal: 15,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  primaryBtnText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.25,
    textTransform: 'uppercase',
  },
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  sectionHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  sectionSubtitle: {
    fontSize: 12,
    lineHeight: 18,
  },
  sectionCountPill: {
    minWidth: 34,
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCountText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  sectionContent: {
    gap: 12,
  },
  scanSummaryCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  scanSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  scanSummaryCopy: {
    flex: 1,
    gap: 4,
  },
  scanSummaryTitle: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  scanSummaryBody: {
    fontSize: 12,
    lineHeight: 18,
  },
  debugToggle: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  debugToggleText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  scanSummaryStats: {
    flexDirection: 'row',
    gap: 10,
  },
  sourceStatusList: {
    gap: 8,
  },
  sourceStatusRow: {
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sourceStatusCopy: {
    flex: 1,
    gap: 3,
  },
  sourceStatusLabel: {
    fontSize: 12,
    fontWeight: '900',
  },
  sourceStatusDetail: {
    fontSize: 11,
    lineHeight: 16,
  },
  sourceStatusRight: {
    alignItems: 'flex-end',
    gap: 2,
    maxWidth: 116,
  },
  sourceStatusCount: {
    fontSize: 15,
    fontWeight: '900',
  },
  sourceStatusText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    textAlign: 'right',
  },
  diagnosticBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 7,
  },
  diagnosticHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  diagnosticTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  copyDiagnosticsButton: {
    minHeight: 28,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyDiagnosticsText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  diagnosticRow: {
    minHeight: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 7,
  },
  diagnosticLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  diagnosticValue: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'right',
  },
  diagnosticSubsection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 8,
    gap: 4,
  },
  diagnosticSubhead: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  diagnosticEventLine: {
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '700',
  },
  scanReasonBox: {
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    paddingTop: 10,
    gap: 4,
  },
  scanReasonLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  scanReasonText: {
    fontSize: 12,
    lineHeight: 18,
  },
  emptyState: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emptyCopy: {
    flex: 1,
    gap: 3,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  emptyBody: {
    fontSize: 12,
    lineHeight: 18,
  },
  inlineActionBtn: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineActionBtnText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    textAlign: 'center',
    flexShrink: 1,
  },
  deviceRow: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  deviceRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  selectionToggle: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  selectionInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  selectionMarker: {
    width: 8,
    height: 8,
    borderRadius: 999,
    marginTop: 9,
    marginHorizontal: 8,
  },
  deviceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceMain: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  deviceEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.25,
    textTransform: 'uppercase',
  },
  deviceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  deviceName: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 19,
  },
  deviceModel: {
    fontSize: 12,
    lineHeight: 17,
  },
  primaryActionBtn: {
    minWidth: 104,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  actionBusyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryActionText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.15,
    textTransform: 'uppercase',
  },
  devicePillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  statePill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  statePillText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.05,
    textTransform: 'uppercase',
  },
  deviceDetail: {
    fontSize: 12,
    lineHeight: 18,
  },
  telemetryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  telemetryCell: {
    minWidth: 76,
    flexGrow: 1,
    flexBasis: '30%',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  telemetryCellLabel: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  telemetryCellValue: {
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 16,
  },
  diagnosticReasonBox: {
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 9,
    gap: 4,
  },
  diagnosticReasonLabel: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  diagnosticReasonText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  deviceFooter: {
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    paddingTop: 10,
    gap: 5,
  },
  deviceFooterText: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 15,
  },
  deviceImpactText: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 15,
  },
  compatibilityCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: SPACING.lg,
    gap: 14,
  },
  compatibilityHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  compatibilityHeaderCopy: {
    flex: 1,
    gap: 5,
  },
  compatibilityCardTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  compatibilityCardBody: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  compatibilityGroup: {
    gap: 8,
  },
  compatibilityGroupLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  compatibilityRow: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  compatibilityIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compatibilityCopy: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  compatibilityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compatibilityName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '900',
  },
  compatibilityBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  compatibilityBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  compatibilityDetail: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  infoCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoCopy: {
    flex: 1,
    gap: 6,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  infoBody: {
    fontSize: 12,
    lineHeight: 18,
  },
});
