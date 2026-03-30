/**
 * Power Systems Management — View and manage all connected power devices.
 *
 * Features:
 *   - List all managed devices with status
 *   - Edit device name, role, vehicle assignment
 *   - Set primary device
 *   - Disconnect / remove devices
 *   - Connection health monitoring
 *   - Empty state with "Add Power System" CTA
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';

import { useTheme } from '../../context/ThemeContext';
import { SPACING, RADIUS, GOLD_RAIL } from '../../lib/theme';
import {
  powerSetupStore,
  PROVIDER_DISPLAY,
  DEVICE_ROLE_LABELS,
  type ManagedPowerDevice,
  type ConnectionState,
  type DeviceRole,
} from '../../lib/powerSetupStore';

// ── Connection state config ─────────────────────────────────────────────
const CONNECTION_CONFIG: Record<ConnectionState, { label: string; color: string; icon: string }> = {
  connected: { label: 'CONNECTED', color: '#34C759', icon: 'checkmark-circle' },
  reconnecting: { label: 'RECONNECTING', color: '#FF9500', icon: 'refresh-outline' },
  disconnected: { label: 'DISCONNECTED', color: '#FF3B30', icon: 'alert-circle-outline' },
  unavailable: { label: 'UNAVAILABLE', color: '#8B949E', icon: 'close-circle-outline' },
};

// ── Device Card ─────────────────────────────────────────────────────────
function DeviceCard({
  device,
  palette,
  onSetPrimary,
  onDisconnect,
  onRemove,
  onEdit,
}: {
  device: ManagedPowerDevice;
  palette: any;
  onSetPrimary: () => void;
  onDisconnect: () => void;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const display = PROVIDER_DISPLAY[device.provider];
  const connConfig = CONNECTION_CONFIG[device.connectionState];
  const socPct = device.lastSocPct;

  const socColor =
    socPct === null
      ? palette.textMuted
      : socPct >= 60
        ? '#34C759'
        : socPct >= 30
          ? '#FFB800'
          : socPct >= 15
            ? '#FF9500'
            : '#FF3B30';

  return (
    <View style={[styles.deviceCard, { backgroundColor: palette.panel, borderColor: device.isPrimary ? palette.amber + '40' : palette.border }]}>
      {/* Primary indicator */}
      {device.isPrimary && (
        <View style={[styles.primaryStrip, { backgroundColor: palette.amber }]} />
      )}

      {/* Header row */}
      <View style={styles.deviceHeader}>
        <View style={[styles.deviceIcon, { backgroundColor: display.color + '12' }]}>
          <Ionicons name={display.icon} size={22} color={display.color} />
        </View>
        <View style={styles.deviceInfo}>
          <View style={styles.deviceNameRow}>
            <Text style={[styles.deviceName, { color: palette.text }]} numberOfLines={1}>
              {device.customName}
            </Text>
            {device.isPrimary && (
              <View style={[styles.primaryBadge, { backgroundColor: palette.amber + '15', borderColor: palette.amber + '30' }]}>
                <Ionicons name="star" size={8} color={palette.amber} />
                <Text style={[styles.primaryBadgeText, { color: palette.amber }]}>PRIMARY</Text>
              </View>
            )}
          </View>
          <View style={styles.deviceSubRow}>
            <Text style={[styles.deviceBrand, { color: display.color }]}>{display.label}</Text>
            <Text style={[styles.deviceModel, { color: palette.textMuted }]}>{device.model}</Text>
          </View>
        </View>

        {/* Connection badge */}
        <View style={[styles.connBadge, { backgroundColor: connConfig.color + '12', borderColor: connConfig.color + '25' }]}>
          <View style={[styles.connDot, { backgroundColor: connConfig.color }]} />
          <Text style={[styles.connText, { color: connConfig.color }]}>{connConfig.label}</Text>
        </View>
      </View>

      {/* Telemetry row */}
      <View style={[styles.telemetryRow, { borderTopColor: GOLD_RAIL.subsection }]}>
        {/* Battery */}
        <View style={styles.telemetryItem}>
          <Ionicons name="battery-half-outline" size={14} color={socColor} />
          <Text style={[styles.telemetryValue, { color: socColor }]}>
            {socPct !== null ? `${socPct}%` : '--'}
          </Text>
          <Text style={[styles.telemetryLabel, { color: palette.textMuted }]}>SOC</Text>
        </View>

        {/* Input */}
        <View style={styles.telemetryItem}>
          <Ionicons name="arrow-down-outline" size={14} color={device.lastWattsIn && device.lastWattsIn > 0 ? '#34C759' : palette.textMuted} />
          <Text style={[styles.telemetryValue, { color: palette.text }]}>
            {device.lastWattsIn !== null ? `${device.lastWattsIn}W` : '--'}
          </Text>
          <Text style={[styles.telemetryLabel, { color: palette.textMuted }]}>IN</Text>
        </View>

        {/* Output */}
        <View style={styles.telemetryItem}>
          <Ionicons name="arrow-up-outline" size={14} color={device.lastWattsOut && device.lastWattsOut > 0 ? '#FF9500' : palette.textMuted} />
          <Text style={[styles.telemetryValue, { color: palette.text }]}>
            {device.lastWattsOut !== null ? `${device.lastWattsOut}W` : '--'}
          </Text>
          <Text style={[styles.telemetryLabel, { color: palette.textMuted }]}>OUT</Text>
        </View>

        {/* Role */}
        <View style={styles.telemetryItem}>
          <Ionicons name="shield-outline" size={14} color={palette.amber} />
          <Text style={[styles.telemetryValue, { color: palette.text, fontSize: 10 }]} numberOfLines={1}>
            {DEVICE_ROLE_LABELS[device.role].split(' ')[0]}
          </Text>
          <Text style={[styles.telemetryLabel, { color: palette.textMuted }]}>ROLE</Text>
        </View>
      </View>

      {/* Actions row */}
      <View style={[styles.actionsRow, { borderTopColor: GOLD_RAIL.subsection }]}>
        {!device.isPrimary && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: palette.amber + '0C', borderColor: palette.amber + '25' }]}
            onPress={onSetPrimary}
            activeOpacity={0.7}
          >
            <Ionicons name="star-outline" size={12} color={palette.amber} />
            <Text style={[styles.actionText, { color: palette.amber }]}>SET PRIMARY</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: palette.border }]}
          onPress={onEdit}
          activeOpacity={0.7}
        >
          <Ionicons name="pencil-outline" size={12} color={palette.textMuted} />
          <Text style={[styles.actionText, { color: palette.textMuted }]}>EDIT</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: '#FF3B30' + '30' }]}
          onPress={onDisconnect}
          activeOpacity={0.7}
        >
          <Ionicons name="close-circle-outline" size={12} color="#FF3B30" />

          <Text style={[styles.actionText, { color: '#FF3B30' }]}>
            {device.connectionState === 'disconnected' ? 'RECONNECT' : 'DISCONNECT'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: '#FF3B30' + '30' }]}
          onPress={onRemove}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={12} color="#FF3B30" />
        </TouchableOpacity>
      </View>

      {/* Last seen */}
      <View style={styles.lastSeenRow}>
        <Ionicons name="time-outline" size={10} color={palette.textMuted} />
        <Text style={[styles.lastSeenText, { color: palette.textMuted }]}>
          Last seen: {new Date(device.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

// ── Edit Modal (inline) ─────────────────────────────────────────────────
function EditPanel({
  device,
  palette,
  onSave,
  onCancel,
}: {
  device: ManagedPowerDevice;
  palette: any;
  onSave: (name: string, role: DeviceRole) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(device.customName);
  const [role, setRole] = useState<DeviceRole>(device.role);
  const display = PROVIDER_DISPLAY[device.provider];

  const ROLES: DeviceRole[] = ['primary_house', 'portable', 'auxiliary', 'solar_source', 'unassigned'];

  return (
    <View style={[styles.editPanel, { backgroundColor: palette.panel, borderColor: palette.amber + '40' }]}>
      <View style={styles.editHeader}>
        <Ionicons name="pencil" size={16} color={palette.amber} />
        <Text style={[styles.editTitle, { color: palette.text }]}>Edit Device</Text>
      </View>

      <Text style={[styles.editLabel, { color: palette.textMuted }]}>DEVICE NAME</Text>
      <View style={[styles.editInput, { borderColor: palette.border, backgroundColor: palette.panel }]}>
        <TextInput
          style={[styles.editInputText, { color: palette.text }]}
          value={name}
          onChangeText={setName}
          placeholder="Device name"
          placeholderTextColor={palette.textMuted + '60'}
        />
      </View>

      <Text style={[styles.editLabel, { color: palette.textMuted, marginTop: 12 }]}>ROLE</Text>
      {ROLES.map((r) => (
        <TouchableOpacity
          key={r}
          style={[
            styles.editRoleRow,
            {
              backgroundColor: role === r ? palette.amber + '0C' : 'transparent',
              borderColor: role === r ? palette.amber + '30' : palette.border,
            },
          ]}
          onPress={() => setRole(r)}
          activeOpacity={0.7}
        >
          <Text style={[styles.editRoleText, { color: role === r ? palette.text : palette.textMuted }]}>
            {DEVICE_ROLE_LABELS[r]}
          </Text>
          {role === r && <Ionicons name="checkmark" size={14} color={palette.amber} />}
        </TouchableOpacity>
      ))}

      <View style={styles.editActions}>
        <TouchableOpacity
          style={[styles.editSaveBtn, { backgroundColor: palette.amber }]}
          onPress={() => onSave(name, role)}
          activeOpacity={0.7}
        >
          <Text style={styles.editSaveBtnText}>SAVE</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.editCancelBtn, { borderColor: palette.border }]}
          onPress={onCancel}
          activeOpacity={0.7}
        >
          <Text style={[styles.editCancelBtnText, { color: palette.textMuted }]}>CANCEL</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────
export default function PowerManageScreen() {
  const router = useRouter();
  const { palette, colors } = useTheme();
  const [devices, setDevices] = useState<ManagedPowerDevice[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadDevices = useCallback(() => {
    setDevices(powerSetupStore.getAll());
  }, []);

  useEffect(() => {
    loadDevices();
    const unsub = powerSetupStore.subscribe(setDevices);
    return unsub;
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDevices();
    setTimeout(() => setRefreshing(false), 500);
  }, [loadDevices]);

  const handleSetPrimary = useCallback(async (id: string) => {
    await powerSetupStore.setPrimary(id);
  }, []);

  const handleDisconnect = useCallback(async (device: ManagedPowerDevice) => {
    if (device.connectionState === 'disconnected') {
      await powerSetupStore.setConnectionState(device.id, 'reconnecting');
      // Simulate reconnection
      setTimeout(async () => {
        await powerSetupStore.setConnectionState(device.id, 'connected');
      }, 2000);
    } else {
      await powerSetupStore.setConnectionState(device.id, 'disconnected');
    }
  }, []);

  const handleRemove = useCallback(async (device: ManagedPowerDevice) => {
    if (Platform.OS === 'web') {
      if (confirm(`Remove ${device.customName}? This will disconnect the device from ECS.`)) {
        await powerSetupStore.hardDelete(device.id);
      }
    } else {
      Alert.alert(
        'Remove Device',
        `Remove ${device.customName}? This will disconnect the device from ECS.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => powerSetupStore.hardDelete(device.id),
          },
        ]
      );
    }
  }, []);

  const handleEditSave = useCallback(async (id: string, name: string, role: DeviceRole) => {
    await powerSetupStore.update(id, { customName: name, role });
    setEditingId(null);
  }, []);

  const connectedCount = devices.filter((d) => d.connectionState === 'connected').length;
  const totalCount = devices.length;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: palette.panel }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={palette.amber} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerLabel, { color: palette.textMuted }]}>ECS POWER</Text>
          <Text style={[styles.headerTitle, { color: palette.text }]}>MANAGE SYSTEMS</Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtnSmall, { backgroundColor: palette.amber }]}
          onPress={() => router.push('/power/setup')}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={18} color="#000" />
        </TouchableOpacity>
        <View style={[styles.goldRail, { backgroundColor: GOLD_RAIL.major }]} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.amber} colors={[palette.amber]} />
        }
      >
        {/* Summary */}
        {totalCount > 0 && (
          <View style={[styles.summaryCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: palette.text }]}>{totalCount}</Text>
                <Text style={[styles.summaryLabel, { color: palette.textMuted }]}>TOTAL</Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: palette.border }]} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: connectedCount > 0 ? '#34C759' : palette.textMuted }]}>{connectedCount}</Text>
                <Text style={[styles.summaryLabel, { color: palette.textMuted }]}>CONNECTED</Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: palette.border }]} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: palette.amber }]}>
                  {devices.filter((d) => d.isPrimary).length}
                </Text>
                <Text style={[styles.summaryLabel, { color: palette.textMuted }]}>PRIMARY</Text>
              </View>
            </View>
          </View>
        )}

        {/* Device list */}
        {devices.map((device) => (
          <View key={device.id}>
            {editingId === device.id ? (
              <EditPanel
                device={device}
                palette={palette}
                onSave={(name, role) => handleEditSave(device.id, name, role)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <DeviceCard
                device={device}
                palette={palette}
                onSetPrimary={() => handleSetPrimary(device.id)}
                onDisconnect={() => handleDisconnect(device)}
                onRemove={() => handleRemove(device)}
                onEdit={() => setEditingId(device.id)}
              />
            )}
          </View>
        ))}

        {/* Empty state */}
        {totalCount === 0 && (
          <View style={[styles.emptyCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: palette.amber + '10' }]}>
              <Ionicons name="battery-dead-outline" size={40} color={palette.amber} />
            </View>
            <Text style={[styles.emptyTitle, { color: palette.text }]}>
              No Power Systems Connected
            </Text>
            <Text style={[styles.emptyDesc, { color: palette.textMuted }]}>
              Add a supported battery system to monitor expedition power usage.
            </Text>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: palette.amber }]}
              onPress={() => router.push('/power/setup')}
              activeOpacity={0.7}
            >
              <Ionicons name="add-outline" size={18} color="#000" />
              <Text style={styles.addBtnText}>ADD POWER SYSTEM</Text>
            </TouchableOpacity>

            {/* Supported brands */}
            <View style={styles.brandsRow}>
              {(['EcoFlow', 'Bluetti', 'AnkerSolix', 'Jackery', 'GoalZero', 'Renogy'] as const).map((p) => {
                const d = PROVIDER_DISPLAY[p];
                return (
                  <View key={p} style={[styles.brandChip, { backgroundColor: d.color + '10' }]}>
                    <Ionicons name={d.icon} size={10} color={d.color} />
                    <Text style={[styles.brandChipText, { color: d.color }]}>{d.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Add button (when devices exist) */}
        {totalCount > 0 && (
          <TouchableOpacity
            style={[styles.addMoreBtn, { borderColor: palette.amber + '40' }]}
            onPress={() => router.push('/power/setup')}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={18} color={palette.amber} />
            <Text style={[styles.addMoreText, { color: palette.amber }]}>ADD POWER SYSTEM</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: Platform.OS === 'web' ? 16 : 54, paddingBottom: 14, paddingHorizontal: SPACING.lg },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerLabel: { fontSize: 9, fontWeight: '600', letterSpacing: 3, textTransform: 'uppercase' },
  headerTitle: { fontSize: 16, fontWeight: '800', letterSpacing: 3, marginTop: 2 },
  addBtnSmall: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  goldRail: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 1.5 },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.lg },

  // Summary
  summaryCard: { borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACING.lg, marginBottom: SPACING.xl },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  summaryItem: { alignItems: 'center', gap: 2 },
  summaryValue: { fontSize: 22, fontWeight: '900', fontFamily: 'Courier' },
  summaryLabel: { fontSize: 8, fontWeight: '700', letterSpacing: 3 },
  summaryDivider: { width: 1, height: 30, opacity: 0.3 },

  // Device card
  deviceCard: { borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACING.lg, marginBottom: SPACING.md, overflow: 'hidden' },
  primaryStrip: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, borderTopLeftRadius: RADIUS.lg, borderBottomLeftRadius: RADIUS.lg },
  deviceHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  deviceIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deviceInfo: { flex: 1, gap: 2 },
  deviceNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deviceName: { fontSize: 15, fontWeight: '800', letterSpacing: 0.5, flex: 1 },
  primaryBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  primaryBadgeText: { fontSize: 7, fontWeight: '800', letterSpacing: 2 },
  deviceSubRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deviceBrand: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  deviceModel: { fontSize: 11, fontWeight: '500' },
  connBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 1 },
  connDot: { width: 5, height: 5, borderRadius: 3 },
  connText: { fontSize: 7, fontWeight: '800', letterSpacing: 2 },

  // Telemetry
  telemetryRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 0.75 },
  telemetryItem: { alignItems: 'center', gap: 3 },
  telemetryValue: { fontSize: 13, fontWeight: '800', fontFamily: 'Courier' },
  telemetryLabel: { fontSize: 7, fontWeight: '700', letterSpacing: 2 },

  // Actions
  actionsRow: { flexDirection: 'row', gap: 6, marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 0.75, flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  actionText: { fontSize: 8, fontWeight: '800', letterSpacing: 1 },

  // Last seen
  lastSeenRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  lastSeenText: { fontSize: 10, fontFamily: 'Courier' },

  // Edit panel
  editPanel: { borderRadius: RADIUS.lg, borderWidth: 1.5, padding: SPACING.lg, marginBottom: SPACING.md },
  editHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  editTitle: { fontSize: 15, fontWeight: '800' },
  editLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 },
  editInput: { borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 10 },
  editInputText: { fontSize: 14, fontWeight: '600' },
  editRoleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, borderWidth: 1, marginBottom: 4 },
  editRoleText: { fontSize: 12, fontWeight: '600' },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  editSaveBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8 },
  editSaveBtnText: { color: '#000', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  editCancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  editCancelBtnText: { fontSize: 12, fontWeight: '700', letterSpacing: 2 },

  // Empty state
  emptyCard: { borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACING.xl, alignItems: 'center', gap: 12 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  emptyDesc: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 24, borderRadius: RADIUS.md, marginTop: 4 },
  addBtnText: { color: '#000', fontSize: 13, fontWeight: '800', letterSpacing: 3 },
  brandsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 8 },
  brandChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  brandChipText: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },

  // Add more
  addMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: RADIUS.md, borderWidth: 1, borderStyle: 'dashed', marginTop: SPACING.sm },
  addMoreText: { fontSize: 12, fontWeight: '700', letterSpacing: 2 },
});




