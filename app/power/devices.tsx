/**
 * EcoFlow Cloud Device Picker — Power Center
 *
 * Fetches EcoFlow devices through the unified power telemetry service catalog path.
 * This is a cloud catalog selector, not a Bluetooth scanner.
 * Displays each device as a selectable card with:
 *   - Device name
 *   - Online / Offline status indicator
 *   - Device ID (monospace, long-press to copy)
 *
 * Single-select: tapping a device stores its ID in persistent storage
 * under 'ecs_ecoflow_selected_device'. The feature power service reads
 * from this key to poll telemetry for the correct device.
 *
 * Includes a refresh button to re-fetch the device list.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';

import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';

import { useTheme } from '../../context/ThemeContext';
import { SPACING, RADIUS, GOLD_RAIL } from '../../lib/theme';
import {
  getEcoFlowPowerDeviceCatalog,
  getPrimaryEcoFlowPowerDevice,
  getPrimaryEcoFlowPowerDeviceName,
  getSelectedEcoFlowPowerDevices,
  setPrimaryEcoFlowPowerDevice,
} from '../../src/features/power/services/powerTelemetryService';

// ── Clipboard helper (safe import) ──────────────────────────────────────
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Clipboard = require('expo-clipboard');
      if (Clipboard?.setStringAsync) {
        await Clipboard.setStringAsync(text);
        return true;
      }
    } catch {
      // expo-clipboard not installed — silent fail
    }
    return false;
  } catch {
    return false;
  }
}

// ── Types ───────────────────────────────────────────────────────────────
type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

interface EcoFlowDevice {
  id: string;
  name: string;
  online: boolean;
  model?: string;
  productType?: string;
}


function normalizeCatalogDevice(input: any): EcoFlowDevice | null {
  const id = String(input?.id || input?.deviceId || '').trim();
  if (!id) return null;
  return {
    id,
    name: String(input?.name || input?.deviceName || id || 'Unknown Device'),
    online: Boolean(input?.online ?? false),
    model: input?.model || input?.productType || undefined,
    productType: input?.productType || undefined,
  };
}

function mergeUniqueDevices(devices: EcoFlowDevice[]): EcoFlowDevice[] {
  const map = new Map<string, EcoFlowDevice>();
  for (const device of devices) {
    if (!device?.id) continue;
    const existing = map.get(device.id);
    if (!existing) {
      map.set(device.id, device);
      continue;
    }
    map.set(device.id, {
      ...existing,
      ...device,
      name: device.name || existing.name,
      model: device.model || existing.model,
      productType: device.productType || existing.productType,
      online: device.online || existing.online,
    });
  }
  return Array.from(map.values());
}

// ── DeviceCard component ────────────────────────────────────────────────
function DeviceCard({
  device,
  isSelected,
  onSelect,
  palette,
}: {
  device: EcoFlowDevice;
  isSelected: boolean;
  onSelect: () => void;
  palette: any;
}) {
  const [copied, setCopied] = useState(false);

  const handleLongPress = useCallback(async () => {
    const ok = await copyToClipboard(device.id);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [device.id]);

  const onlineColor = device.online ? '#34C759' : palette.textMuted;
  const onlineLabel = device.online ? 'ONLINE' : 'OFFLINE';

  return (
    <TouchableOpacity
      style={[
        cardStyles.container,
        {
          backgroundColor: isSelected
            ? palette.amber + '0C'
            : palette.panel,
          borderColor: isSelected
            ? palette.amber + '50'
            : palette.border,
          borderWidth: isSelected ? 1.5 : 1,
        },
      ]}
      onPress={onSelect}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
      delayLongPress={500}
    >
      {/* ── Top row: name + online badge ─────────────────────── */}
      <View style={cardStyles.topRow}>
        {/* Selection radio */}
        <View
          style={[
            cardStyles.radio,
            {
              borderColor: isSelected ? palette.amber : palette.textMuted + '50',
              backgroundColor: isSelected ? palette.amber : 'transparent',
            },
          ]}
        >
          {isSelected && (
            <View style={cardStyles.radioInner} />
          )}
        </View>

        {/* Device icon */}
        <View
          style={[
            cardStyles.iconWrap,
            {
              backgroundColor: isSelected
                ? palette.amber + '15'
                : palette.border + '40',
            },
          ]}
        >
          <Ionicons
            name="battery-charging-outline"
            size={20}
            color={isSelected ? palette.amber : palette.textMuted}
          />
        </View>

        {/* Name + model */}
        <View style={cardStyles.nameBlock}>
          <Text
            style={[cardStyles.name, { color: palette.text }]}
            numberOfLines={1}
          >
            {device.name || device.id}
          </Text>
          {device.model ? (
            <Text
              style={[cardStyles.model, { color: palette.textMuted }]}
              numberOfLines={1}
            >
              {device.model}
            </Text>
          ) : null}
        </View>

        {/* Online/Offline badge */}
        <View
          style={[
            cardStyles.statusBadge,
            {
              backgroundColor: onlineColor + '15',
              borderColor: onlineColor + '30',
            },
          ]}
        >
          <View
            style={[
              cardStyles.statusDot,
              { backgroundColor: onlineColor },
            ]}
          />
          <Text style={[cardStyles.statusText, { color: onlineColor }]}>
            {onlineLabel}
          </Text>
        </View>
      </View>

      {/* ── Bottom row: device ID ────────────────────────────── */}
      <View style={cardStyles.bottomRow}>
        <Ionicons
          name="finger-print-outline"
          size={11}
          color={palette.textMuted}
        />
        <Text
          style={[cardStyles.deviceId, { color: palette.textMuted }]}
          numberOfLines={1}
        >
          {device.id}
        </Text>
        {copied && (
          <Text style={[cardStyles.copiedBadge, { color: '#34C759' }]}>
            COPIED
          </Text>
        )}
        {isSelected && (
          <View
            style={[
              cardStyles.selectedPill,
              {
                backgroundColor: palette.amber + '18',
                borderColor: palette.amber + '35',
              },
            ]}
          >
            <Ionicons name="checkmark" size={10} color={palette.amber} />
            <Text style={[cardStyles.selectedPillText, { color: palette.amber }]}>
              ACTIVE
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#000',
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameBlock: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  model: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 2,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(212,160,23,0.08)',
  },
  deviceId: {
    fontSize: 11,
    fontFamily: 'Courier',
    letterSpacing: 0.5,
    flex: 1,
  },
  copiedBadge: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 2,
  },
  selectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  selectedPillText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 2,
  },
});

// ── Main Screen ─────────────────────────────────────────────────────────
export default function EcoFlowDevicePickerScreen() {
  const router = useRouter();
  const { palette, colors } = useTheme();

  // ── State ───────────────────────────────────────────────────────────
  const [devices, setDevices] = useState<EcoFlowDevice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  // ── Load persisted selection on mount ────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    const persisted = getPrimaryEcoFlowPowerDevice();
    if (persisted) setSelectedId(persisted);
    fetchDevices();
    return () => {
      mountedRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch devices from unified provider catalog ───────────────────────
  const fetchDevices = useCallback(async () => {
    setLoadState('loading');
    setErrorMsg(null);

    try {
      const catalogDevices = await getEcoFlowPowerDeviceCatalog();
      const selectedDeviceIds = await getSelectedEcoFlowPowerDevices();
      const persistedSelection = getPrimaryEcoFlowPowerDevice();

      if (!mountedRef.current) return;

      const normalizedCatalog = catalogDevices
        .map((device: any) => normalizeCatalogDevice(device))
        .filter(Boolean) as EcoFlowDevice[];

      const fallbackDevices: EcoFlowDevice[] = [];
      for (const id of selectedDeviceIds) {
        if (!id) continue;
        fallbackDevices.push({
          id,
          name: id === persistedSelection ? 'Selected EcoFlow Device' : 'Configured EcoFlow Device',
          online: false,
          model: undefined,
          productType: undefined,
        });
      }

      if (persistedSelection && !selectedDeviceIds.includes(persistedSelection)) {
        const matchedCatalog = normalizedCatalog.find((device) => device.id === persistedSelection);
        const persistedName = getPrimaryEcoFlowPowerDeviceName();
        fallbackDevices.push({
          id: persistedSelection,
          name: matchedCatalog?.name || persistedName || 'Active EcoFlow Device',
          online: matchedCatalog?.online ?? false,
          model: matchedCatalog?.model,
          productType: matchedCatalog?.productType,
        });
      }

      const merged = mergeUniqueDevices([...normalizedCatalog, ...fallbackDevices]).sort((a, b) => {
        if (a.id === persistedSelection) return -1;
        if (b.id === persistedSelection) return 1;
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      setDevices(merged);
      setLoadState('loaded');

      if (merged.length === 0) {
        setErrorMsg(null);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setErrorMsg(msg || 'Failed to fetch EcoFlow device catalog.');
      setLoadState('error');
    }
  }, []);

  // ── Refresh handler ─────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDevices();
    setRefreshing(false);
  }, [fetchDevices]);

  // ── Select device ───────────────────────────────────────────────────
  const selectDevice = useCallback((deviceId: string) => {
    const selectedDevice = devices.find((device) => device.id === deviceId) ?? null;
    setSelectedId(deviceId);
    setPrimaryEcoFlowPowerDevice(deviceId, selectedDevice?.name ?? null);
  }, [devices]);

  // ── Derived values ──────────────────────────────────────────────────
  const totalCount = devices.length;
  const onlineCount = devices.filter((d) => d.online).length;
  const hasDevices = totalCount > 0;
  const selectedDevice = devices.find((d) => d.id === selectedId);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* ── Header ──────────────────────────────────────────── */}
      <View style={[styles.header, { backgroundColor: palette.panel }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color={palette.amber} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerLabel, { color: palette.textMuted }]}>
            POWER CENTER
          </Text>
          <Text style={[styles.headerTitle, { color: palette.text }]}>
            ECOFLOW DEVICES
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.refreshBtn,
            refreshing && { opacity: 0.5 },
          ]}
          onPress={handleRefresh}
          activeOpacity={0.7}
          disabled={refreshing || loadState === 'loading'}
        >
          <Ionicons
            name="refresh-outline"
            size={20}
            color={refreshing ? palette.textMuted : palette.amber}
          />
        </TouchableOpacity>
        {/* Gold rail */}
        <View
          style={[styles.goldRail, { backgroundColor: GOLD_RAIL.major }]}
        />
      </View>

      {/* ── Content ─────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Provider header card ──────────────────────────── */}
        <View
          style={[
            styles.providerHeader,
            { backgroundColor: palette.panel, borderColor: palette.border },
          ]}
        >
          <View style={styles.providerRow}>
            <View
              style={[
                styles.providerIcon,
                { backgroundColor: palette.amber + '12' },
              ]}
            >
              <Ionicons name="flash" size={22} color={palette.amber} />
            </View>
            <View style={styles.providerInfo}>
              <Text style={[styles.providerName, { color: palette.text }]}>
                EcoFlow Cloud
              </Text>
              <Text
                style={[styles.providerDesc, { color: palette.textMuted }]}
              >
                Select a device from the unified cloud catalog for live telemetry
              </Text>
            </View>
            <View
              style={[
                styles.providerStatusDot,
                {
                  backgroundColor:
                    loadState === 'loaded' && hasDevices
                      ? '#34C759'
                      : loadState === 'loading'
                        ? palette.amber
                        : palette.textMuted,
                },
              ]}
            />
          </View>

          {/* Summary stats row */}
          {loadState === 'loaded' && hasDevices && (
            <View
              style={[
                styles.summaryRow,
                { borderTopColor: GOLD_RAIL.subsection },
              ]}
            >
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: palette.text }]}>
                  {totalCount}
                </Text>
                <Text style={[styles.summaryLabel, { color: palette.textMuted }]}>
                  DEVICES
                </Text>
              </View>
              <View
                style={[styles.summaryDivider, { backgroundColor: palette.border }]}
              />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: onlineCount > 0 ? '#34C759' : palette.textMuted }]}>
                  {onlineCount}
                </Text>
                <Text style={[styles.summaryLabel, { color: palette.textMuted }]}>
                  ONLINE
                </Text>
              </View>
              <View
                style={[styles.summaryDivider, { backgroundColor: palette.border }]}
              />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: selectedId ? palette.amber : palette.textMuted }]}>
                  {selectedId ? '1' : '0'}
                </Text>
                <Text style={[styles.summaryLabel, { color: palette.textMuted }]}>
                  SELECTED
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Loading state ─────────────────────────────────── */}
        {loadState === 'loading' && (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={palette.amber} />
            <Text
              style={[styles.centerStateText, { color: palette.textMuted }]}
            >
              Fetching EcoFlow device catalog...
            </Text>
          </View>
        )}

        {/* ── Error state ───────────────────────────────────── */}
        {loadState === 'error' && (
          <View
            style={[
              styles.messageCard,
              {
                backgroundColor: '#FF3B30' + '08',
                borderColor: '#FF3B30' + '30',
              },
            ]}
          >
            <Ionicons name="alert-circle-outline" size={28} color="#FF3B30" />
            <Text style={[styles.messageTitle, { color: '#FF3B30' }]}>
              Connection Failed
            </Text>
            <Text style={[styles.messageDesc, { color: palette.textMuted }]}>
              {errorMsg || 'An unexpected error occurred.'}
            </Text>
            <TouchableOpacity
              style={[styles.retryBtn, { borderColor: '#FF3B30' + '40' }]}
              onPress={handleRefresh}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh-outline" size={14} color="#FF3B30" />
              <Text style={[styles.retryBtnText, { color: '#FF3B30' }]}>
                RETRY
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Empty state ───────────────────────────────────── */}
        {loadState === 'loaded' && !hasDevices && (
          <View
            style={[
              styles.messageCard,
              {
                backgroundColor: '#FF9500' + '08',
                borderColor: '#FF9500' + '25',
              },
            ]}
          >
            <View
              style={[
                styles.messageIconWrap,
                { backgroundColor: '#FF9500' + '12' },
              ]}
            >
              <Ionicons name="cube-outline" size={32} color="#FF9500" />
            </View>
            <Text style={[styles.messageTitle, { color: '#FF9500' }]}>
              No Devices Found
            </Text>
            <Text style={[styles.messageDesc, { color: palette.textMuted }]}>
              No EcoFlow devices were returned from the unified cloud catalog. Ensure your devices are registered in the EcoFlow app and visible to the developer account used by ECS.
            </Text>
            <View style={styles.messageHints}>
              {[
                'Verify ECOFLOW_ACCESS_KEY and ECOFLOW_SECRET_KEY in Supabase secrets',
                'Ensure devices are registered in the EcoFlow mobile app',
                'Check that the power-ecoflow-device-list edge function is deployed',
              ].map((hint, idx) => (
                <View key={idx} style={styles.hintRow}>
                  <View
                    style={[
                      styles.hintDot,
                      { backgroundColor: '#FF9500' + '50' },
                    ]}
                  />
                  <Text
                    style={[styles.hintText, { color: palette.textMuted }]}
                  >
                    {hint}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Device list ───────────────────────────────────── */}
        {loadState === 'loaded' && hasDevices && (
          <>
            {/* Section header */}
            <Text
              style={[
                styles.sectionLabel,
                {
                  color: palette.amber,
                  borderBottomColor: GOLD_RAIL.section,
                },
              ]}
            >
              SELECT DEVICE
            </Text>

            <Text
              style={[styles.sectionHint, { color: palette.textMuted }]}
            >
              Tap a device to set it as the active telemetry source. Long-press
              to copy device ID.
            </Text>

            {/* Device cards */}
            {devices.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                isSelected={selectedId === device.id}
                onSelect={() => selectDevice(device.id)}
                palette={palette}
              />
            ))}
          </>
        )}

        {/* ── Selection info card ───────────────────────────── */}
        {loadState === 'loaded' && hasDevices && (
          <View
            style={[
              styles.selectionCard,
              { backgroundColor: palette.panel, borderColor: palette.border },
            ]}
          >
            <View style={styles.selectionRow}>
              <Ionicons
                name="radio-outline"
                size={18}
                color={palette.amber}
              />
              <View style={styles.selectionInfo}>
                <Text
                  style={[styles.selectionTitle, { color: palette.text }]}
                >
                  Telemetry Target
                </Text>
                <Text
                  style={[
                    styles.selectionDesc,
                    { color: palette.textMuted },
                  ]}
                >
                  {selectedDevice
                    ? `Polling: ${selectedDevice.name || selectedDevice.id}`
                    : 'No device selected — ECS will auto-select the first online device.'}
                </Text>
              </View>
            </View>

            {selectedDevice && (
              <View
                style={[
                  styles.selectionDetailRow,
                  { borderTopColor: GOLD_RAIL.subsection },
                ]}
              >
                <View style={styles.selectionDetailItem}>
                  <Text style={[styles.selectionDetailLabel, { color: palette.textMuted }]}>
                    DEVICE
                  </Text>
                  <Text style={[styles.selectionDetailValue, { color: palette.text }]}>
                    {selectedDevice.name}
                  </Text>
                </View>
                <View style={styles.selectionDetailItem}>
                  <Text style={[styles.selectionDetailLabel, { color: palette.textMuted }]}>
                    STATUS
                  </Text>
                  <Text
                    style={[
                      styles.selectionDetailValue,
                      { color: selectedDevice.online ? '#34C759' : palette.textMuted },
                    ]}
                  >
                    {selectedDevice.online ? 'Online' : 'Offline'}
                  </Text>
                </View>
                {selectedDevice.model && (
                  <View style={styles.selectionDetailItem}>
                    <Text style={[styles.selectionDetailLabel, { color: palette.textMuted }]}>
                      MODEL
                    </Text>
                    <Text style={[styles.selectionDetailValue, { color: palette.text }]}>
                      {selectedDevice.model}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Clear selection button */}
            {selectedId && (
              <TouchableOpacity
                style={[
                  styles.clearBtn,
                  {
                    borderColor: palette.border,
                    backgroundColor: palette.border + '20',
                  },
                ]}
                onPress={() => {
                  setSelectedId(null);
                  setPrimaryEcoFlowPowerDevice(null, null);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="close-outline" size={14} color={palette.textMuted} />
                <Text style={[styles.clearBtnText, { color: palette.textMuted }]}>
                  CLEAR SELECTION
                </Text>
              </TouchableOpacity>
            )}

            {/* Auto-select note */}
            {!selectedId && (
              <View
                style={[
                  styles.behaviorNote,
                  {
                    backgroundColor: '#5AC8FA' + '08',
                    borderColor: '#5AC8FA' + '20',
                  },
                ]}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={14}
                  color="#5AC8FA"
                />
                <Text
                  style={[styles.behaviorNoteText, { color: '#5AC8FA' }]}
                >
                  When no device is selected, ECS automatically uses the first
                  online device for telemetry polling.
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Footer bar ──────────────────────────────────────── */}
      <View
        style={[
          styles.footer,
          { backgroundColor: palette.panel, borderTopColor: GOLD_RAIL.major },
        ]}
      >
        <View style={styles.footerLeft}>
          <Ionicons name="hardware-chip-outline" size={16} color={palette.amber} />
          <Text style={[styles.footerText, { color: palette.text }]}>
            {selectedDevice
              ? `Active: ${selectedDevice.name}`
              : 'No device selected'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.footerBtn, { backgroundColor: palette.amber }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Text style={styles.footerBtnText}>DONE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ── Header ────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'web' ? 16 : 54,
    paddingBottom: 14,
    paddingHorizontal: SPACING.lg,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 3,
    marginTop: 2,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  goldRail: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
  },

  // ── Content ───────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 100,
  },

  // ── Provider header ───────────────────────────────────────
  providerHeader: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  providerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  providerDesc: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  providerStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  // ── Summary stats ─────────────────────────────────────────
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
  },
  summaryItem: {
    alignItems: 'center',
    gap: 2,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  summaryLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 3,
  },
  summaryDivider: {
    width: 1,
    height: 28,
    opacity: 0.3,
  },

  // ── Center state (loading) ────────────────────────────────
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  centerStateText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
  },

  // ── Message card (error / empty) ──────────────────────────
  messageCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.xl,
    alignItems: 'center',
    gap: 10,
    marginBottom: SPACING.xl,
  },
  messageIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  messageTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  messageDesc: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  messageHints: {
    width: '100%',
    marginTop: SPACING.md,
    gap: 8,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hintDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  hintText: {
    fontSize: 12,
    fontWeight: '500',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 4,
  },
  retryBtnText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },

  // ── Section header ────────────────────────────────────────
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 4,
    marginBottom: SPACING.md,
    borderBottomWidth: GOLD_RAIL.sectionWidth,
    paddingBottom: 8,
    textTransform: 'uppercase',
  },
  sectionHint: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
    marginBottom: SPACING.lg,
    letterSpacing: 0.3,
  },

  // ── Selection card ────────────────────────────────────────
  selectionCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.lg,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  selectionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  selectionInfo: {
    flex: 1,
  },
  selectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  selectionDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  selectionDetailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
  },
  selectionDetailItem: {
    gap: 2,
  },
  selectionDetailLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  selectionDetailValue: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: SPACING.md,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  clearBtnText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  behaviorNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: SPACING.md,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  behaviorNoteText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },

  // ── Provider cards ────────────────────────────────────────
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.sm,
  },
  providerCardName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  providerStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  providerStatusText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 2,
  },

  // ── Footer ────────────────────────────────────────────────
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    paddingBottom: Platform.OS === 'web' ? SPACING.md : 34,
    borderTopWidth: 1.5,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    flex: 1,
  },
  footerBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  footerBtnText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 3,
  },
});




