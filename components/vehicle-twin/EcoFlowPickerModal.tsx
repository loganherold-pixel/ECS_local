/**
 * EcoFlowPickerModal — Inline device picker for the Vehicle Twin screen.
 *
 * Fetches EcoFlow devices from the "ecoflow" Supabase edge function,
 * displays them as selectable cards, and persists the selected device ID.
 *
 * Shown as a modal overlay on the Vehicle Twin screen when the user
 * taps "Connect EcoFlow" in the POWER SYSTEM panel.
 *
 * On device selection:
 *   1. Saves deviceId to persistent storage via setSelectedEcoFlowDevice()
 *   2. Calls onDeviceSelected() callback so the parent can trigger refresh()
 *   3. Closes the modal
 *
 * Uses useSheetLayout for responsive height + safe-area padding.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS, GOLD_RAIL } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import {
  getSelectedEcoFlowDevice,
  setSelectedEcoFlowDevice,
} from '../../lib/useEcoFlowLive';
import { useSheetLayout } from '../../lib/useSheetLayout';

const { width: SCREEN_W } = Dimensions.get('window');
const IS_SMALL = SCREEN_W < 380;

// ── Types ───────────────────────────────────────────────────────────────

interface EcoFlowDevice {
  id: string;
  name: string;
  online: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onDeviceSelected: (deviceId: string) => void;
}

// ── Component ───────────────────────────────────────────────────────────

export default function EcoFlowPickerModal({ visible, onClose, onDeviceSelected }: Props) {
  const [devices, setDevices] = useState<EcoFlowDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // ── Safe sheet layout for responsive height + safe-area padding ──
  const { sheetMaxHeight, contentBottomPadding, safeBottom } = useSheetLayout({
    maxFraction: 0.84,
    minFraction: 0.40,
  });

  // Load persisted selection + fetch devices when modal opens
  useEffect(() => {
    mountedRef.current = true;
    if (visible) {
      const persisted = getSelectedEcoFlowDevice();
      setSelectedId(persisted);
      fetchDevices();
    }
    return () => { mountedRef.current = false; };
  }, [visible]);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('ecoflow', {
        body: { action: 'devices' },
      });

      if (!mountedRef.current) return;

      // V1.3: Handle both new always-200 pattern and legacy non-2xx pattern
      const responseOk = data?.ok === true;
      const errorCode = data?.code;
      const errorMessage = data?.message;

      if (fnErr || !responseOk) {
        // V1.3: Map structured error codes to user-friendly messages
        if (errorCode === 'MISSING_ECOFLOW_CREDENTIALS' || errorCode === 'NOT_CONFIGURED') {
          setError('EcoFlow API keys not configured.\nAdd ECOFLOW_ACCESS_KEY and ECOFLOW_SECRET_KEY to Supabase secrets.');
        } else if (errorCode === 'ECOFLOW_AUTH_FAILED' || errorCode === 'UNAUTHORIZED') {
          setError(errorMessage || 'EcoFlow API keys are invalid or expired.\nVerify your developer API credentials.');
        } else if (errorCode === 'ECOFLOW_RATE_LIMIT' || errorCode === 'RATE_LIMIT') {
          setError('EcoFlow API rate limit exceeded.\nPlease wait a few minutes and try again.');
        } else if (errorMessage) {
          // Use the structured message from the backend
          setError(errorMessage);
        } else if (fnErr?.message && !fnErr.message.includes('non-2xx')) {
          // Use the Supabase error message only if it's not the generic "non-2xx" message
          setError(fnErr.message);
        } else {
          setError('Failed to fetch EcoFlow devices. Please try again.');
        }
        setLoading(false);
        return;
      }

      const rawDevices = data.devices || [];
      const mapped: EcoFlowDevice[] = rawDevices.map((d: any) => ({
        id: d.id || '',
        name: d.name || d.id || 'Unknown Device',
        online: d.online ?? false,
      }));

      setDevices(mapped);
      setLoading(false);

      // Auto-select if only one device
      if (mapped.length === 1 && !selectedId) {
        handleSelect(mapped[0].id);
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      setError(err?.message || 'Unexpected error');
      setLoading(false);
    }
  }, []);


  const handleSelect = useCallback((deviceId: string) => {
    setSelectedId(deviceId);
    setSelectedEcoFlowDevice(deviceId);
    onDeviceSelected(deviceId);
    onClose();
  }, [onDeviceSelected, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <View style={[s.modal, { maxHeight: sheetMaxHeight }]}>
          {/* ── Header ──────────────────────────────────────── */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <Ionicons name="flash" size={16} color={ECS.accent} />
              <Text style={s.headerTitle}>ECOFLOW DEVICES</Text>
            </View>
            <TouchableOpacity
              style={s.closeBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={18} color={ECS.muted} />
            </TouchableOpacity>
          </View>

          <View style={s.headerDivider} />

          {/* ── Content ─────────────────────────────────────── */}
          <ScrollView
            style={s.content}
            contentContainerStyle={[s.contentInner, { paddingBottom: contentBottomPadding }]}
            showsVerticalScrollIndicator={false}
            bounces={true}
          >
            {/* Loading */}
            {loading && (
              <View style={s.centerState}>
                <ActivityIndicator size="small" color={ECS.accent} />
                <Text style={s.centerText}>Fetching devices...</Text>
              </View>
            )}

            {/* Error */}
            {!loading && error && (
              <View style={s.errorCard}>
                <Ionicons name="alert-circle-outline" size={22} color="#FF3B30" />
                <Text style={s.errorText}>{error}</Text>
                <TouchableOpacity
                  style={s.retryBtn}
                  onPress={fetchDevices}
                  activeOpacity={0.7}
                >
                  <Ionicons name="refresh-outline" size={12} color={ECS.accent} />
                  <Text style={s.retryText}>RETRY</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Empty */}
            {!loading && !error && devices.length === 0 && (
              <View style={s.emptyCard}>
                <Ionicons name="cube-outline" size={28} color={ECS.muted} />
                <Text style={s.emptyTitle}>No Devices Found</Text>
                <Text style={s.emptyDesc}>
                  Ensure your EcoFlow devices are registered in the EcoFlow app
                  and bound to your developer account.
                </Text>
              </View>
            )}

            {/* Device list */}
            {!loading && !error && devices.length > 0 && (
              <>
                <Text style={s.hint}>
                  Tap a device to connect it for live telemetry.
                </Text>
                {devices.map((device) => {
                  const isSelected = selectedId === device.id;
                  const onlineColor = device.online ? '#34C759' : ECS.muted;
                  return (
                    <TouchableOpacity
                      key={device.id}
                      style={[
                        s.deviceCard,
                        isSelected && s.deviceCardSelected,
                      ]}
                      onPress={() => handleSelect(device.id)}
                      activeOpacity={0.7}
                    >
                      {/* Radio indicator */}
                      <View
                        style={[
                          s.radio,
                          isSelected && s.radioSelected,
                        ]}
                      >
                        {isSelected && <View style={s.radioInner} />}
                      </View>

                      {/* Device icon */}
                      <View
                        style={[
                          s.deviceIcon,
                          isSelected && { backgroundColor: ECS.accentSoft },
                        ]}
                      >
                        <Ionicons
                          name="battery-charging-outline"
                          size={18}
                          color={isSelected ? ECS.accent : ECS.muted}
                        />
                      </View>

                      {/* Name + ID */}
                      <View style={s.deviceInfo}>
                        <Text
                          style={[s.deviceName, isSelected && { color: ECS.accent }]}
                          numberOfLines={1}
                        >
                          {device.name}
                        </Text>
                        <Text style={s.deviceId} numberOfLines={1}>
                          {device.id}
                        </Text>
                      </View>

                      {/* Online badge */}
                      <View style={[s.onlineBadge, { borderColor: onlineColor + '40' }]}>
                        <View style={[s.onlineDot, { backgroundColor: onlineColor }]} />
                        <Text style={[s.onlineText, { color: onlineColor }]}>
                          {device.online ? 'ON' : 'OFF'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </ScrollView>

          {/* ── Footer ──────────────────────────────────────── */}
          <View style={[s.footer, { paddingBottom: 10 + safeBottom }]}>
            <Text style={s.footerHint}>
              {selectedId
                ? `Selected: ${devices.find(d => d.id === selectedId)?.name || selectedId}`
                : 'No device selected'}
            </Text>
            <TouchableOpacity
              style={s.cancelBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={s.cancelText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 400,
    // maxHeight is now set dynamically via useSheetLayout
    backgroundColor: ECS.bgPanel,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: ECS.stroke,
    overflow: 'hidden',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: IS_SMALL ? 10 : 11,
    fontWeight: '700',
    letterSpacing: 3,
    color: ECS.accent,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: ECS.bgElev,
  },
  headerDivider: {
    height: 1,
    backgroundColor: GOLD_RAIL.subsection,
  },

  // Content
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 14,
    // paddingBottom is now set dynamically via useSheetLayout
  },

  // Center states
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  centerText: {
    fontSize: 12,
    fontWeight: '600',
    color: ECS.muted,
    letterSpacing: 1,
  },

  // Error
  errorCard: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  errorText: {
    fontSize: 12,
    color: ECS.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: ECS.accent + '40',
    marginTop: 4,
  },
  retryText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    color: ECS.accent,
  },

  // Empty
  emptyCard: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 30,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: ECS.text,
  },
  emptyDesc: {
    fontSize: 12,
    color: ECS.muted,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 10,
  },

  // Hint
  hint: {
    fontSize: 11,
    color: ECS.muted,
    marginBottom: 10,
    letterSpacing: 0.3,
  },

  // Device card
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgPrimary,
    marginBottom: 8,
  },
  deviceCardSelected: {
    borderColor: ECS.accent + '50',
    backgroundColor: ECS.accent + '08',
  },

  // Radio
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: ECS.muted + '50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: ECS.accent,
    backgroundColor: ECS.accent,
  },
  radioInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#000',
  },

  // Device icon
  deviceIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ECS.bgElev,
  },

  // Device info
  deviceInfo: {
    flex: 1,
    gap: 2,
  },
  deviceName: {
    fontSize: 13,
    fontWeight: '700',
    color: ECS.text,
    letterSpacing: 0.5,
  },
  deviceId: {
    fontSize: 9,
    fontFamily: 'Courier',
    color: ECS.muted,
    letterSpacing: 0.5,
  },

  // Online badge
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  onlineDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  onlineText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.subsection,
  },
  footerHint: {
    fontSize: 10,
    color: ECS.muted,
    flex: 1,
    letterSpacing: 0.3,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 5,
    backgroundColor: ECS.bgElev,
    borderWidth: 1,
    borderColor: ECS.stroke,
  },
  cancelText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    color: ECS.muted,
  },
});



