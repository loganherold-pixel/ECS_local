/**
 * Resource Alert Banner
 *
 * Displays low-resource warnings as a compact, dismissable banner.
 * Designed to render at the top of the dashboard and expedition-command screens.
 *
 * Features:
 *   - Shows water and fuel alerts with severity-appropriate colors
 *   - Dismiss button snoozes the alert for 30 minutes
 *   - Plays alert sound on first appearance (optional)
 *   - Stacks multiple alerts vertically
 *   - Animated entrance/exit
 *   - Integrates with resourceAlertStore for state management
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { SafeIcon as Ionicons } from './SafeIcon';
import { TACTICAL } from '../lib/theme';
import {
  resourceAlertStore,
  type ResourceAlert,
  type ResourceAlertState,
  type ResourceAlertType,
} from '../lib/resourceAlertStore';
import { playAlertSound } from '../lib/alertSounds';

// ── Color mapping ──────────────────────────────────────────────
const ALERT_COLORS = {
  water: {
    warning: { bg: 'rgba(80, 180, 220, 0.08)', border: 'rgba(80, 180, 220, 0.35)', text: '#50B4DC', icon: '#50B4DC' },
    critical: { bg: 'rgba(229, 57, 53, 0.08)', border: 'rgba(229, 57, 53, 0.35)', text: '#E53935', icon: '#E53935' },
  },
  fuel: {
    warning: { bg: 'rgba(230, 126, 34, 0.08)', border: 'rgba(230, 126, 34, 0.35)', text: '#E67E22', icon: '#E67E22' },
    critical: { bg: 'rgba(229, 57, 53, 0.08)', border: 'rgba(229, 57, 53, 0.35)', text: '#E53935', icon: '#E53935' },
  },
};

const ALERT_ICONS: Record<ResourceAlertType, string> = {
  water: 'water-outline',
  fuel: 'flame-outline',
};

interface ResourceAlertBannerProps {
  /** Vehicle data to evaluate. Pass null to clear alerts. */
  vehicle: {
    id: string;
    water_capacity_gal?: number | null;
    current_water_gal?: number | null;
    current_fuel_percent?: number | null;
  } | null;
  /** Whether to play alert sounds on new alerts (default: true) */
  enableSound?: boolean;
}

function AlertRow({
  alert,
  onDismiss,
}: {
  alert: ResourceAlert;
  onDismiss: (type: ResourceAlertType) => void;
}) {
  const slideAnim = useRef(new Animated.Value(-20)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const colors = ALERT_COLORS[alert.type][alert.severity];
  const iconName = ALERT_ICONS[alert.type];
  const isCritical = alert.severity === 'critical';

  return (
    <Animated.View
      style={[
        styles.alertRow,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      {/* Severity indicator bar */}
      <View style={[styles.severityBar, { backgroundColor: colors.icon }]} />

      {/* Icon */}
      <View style={[styles.iconWrap, { borderColor: colors.border }]}>
        <Ionicons name={iconName as any} size={16} color={colors.icon} />
      </View>

      {/* Content */}
      <View style={styles.alertContent}>
        <Text style={[styles.alertLabel, { color: colors.text }]}>
          {alert.label}
        </Text>
        <Text style={styles.alertMessage} numberOfLines={2}>

          {alert.message}
        </Text>
      </View>

      {/* Progress bar showing remaining % */}
      <View style={styles.progressWrap}>
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.icon,
                width: `${Math.max(alert.percentRemaining, 2)}%`,
              },
            ]}
          />
        </View>
        <Text style={[styles.progressText, { color: colors.text }]}>
          {alert.percentRemaining}%
        </Text>
      </View>

      {/* Dismiss button */}
      <TouchableOpacity
        style={[styles.dismissBtn, { borderColor: colors.border }]}
        onPress={() => onDismiss(alert.type)}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={14} color={TACTICAL.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function ResourceAlertBanner({
  vehicle,
  enableSound = true,
}: ResourceAlertBannerProps) {
  const [alertState, setAlertState] = useState<ResourceAlertState>(
    resourceAlertStore.getState()
  );
  const soundPlayedRef = useRef<Set<string>>(new Set());
  const prevVehicleIdRef = useRef<string | null>(null);

  // Subscribe to store changes
  useEffect(() => {
    const unsub = resourceAlertStore.subscribe((state) => {
      setAlertState(state);
    });
    return unsub;
  }, []);

  // Evaluate vehicle data whenever it changes
  useEffect(() => {
    if (!vehicle) {
      resourceAlertStore.evaluate(null);
      return;
    }

    // Reset sound tracking on vehicle change
    if (vehicle.id !== prevVehicleIdRef.current) {
      soundPlayedRef.current.clear();
      prevVehicleIdRef.current = vehicle.id;
    }

    const state = resourceAlertStore.evaluate(vehicle);

    // Play alert sound for new alerts
    if (enableSound && state.hasActiveAlerts) {
      for (const alert of state.alerts) {
        const key = `${alert.type}_${alert.severity}`;
        if (!soundPlayedRef.current.has(key)) {
          soundPlayedRef.current.add(key);
          // Use tactical_beep for warnings, klaxon for critical
          const soundId = alert.severity === 'critical' ? 'klaxon' : 'tactical_beep';
          playAlertSound(soundId, alert.severity === 'critical');
          break; // Only play one sound per evaluation cycle
        }
      }
    }
  }, [
    vehicle?.id,
    vehicle?.water_capacity_gal,
    vehicle?.current_water_gal,
    vehicle?.current_fuel_percent,
    enableSound,
  ]);

  const handleDismiss = useCallback((alertType: ResourceAlertType) => {
    if (alertState.vehicleId) {
      resourceAlertStore.dismiss(alertState.vehicleId, alertType);
      // Remove from sound tracking so it can play again after snooze expires
      soundPlayedRef.current.delete(`${alertType}_warning`);
      soundPlayedRef.current.delete(`${alertType}_critical`);
    }
  }, [alertState.vehicleId]);

  // Don't render if no active alerts
  if (!alertState.hasActiveAlerts || alertState.alerts.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {alertState.alerts.map((alert) => (
        <AlertRow
          key={`${alert.type}_${alert.severity}`}
          alert={alert}
          onDismiss={handleDismiss}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    gap: 4,
    marginBottom: 2,
  },

  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    paddingRight: 8,
    paddingLeft: 0,
    gap: 8,
    overflow: 'hidden',
  },

  // Left severity indicator bar
  severityBar: {
    width: 3,
    alignSelf: 'stretch',
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },

  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    marginLeft: 4,
  },

  alertContent: {
    flex: 1,
    gap: 1,
  },

  alertLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  alertMessage: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    lineHeight: 14,
  },

  // Mini progress bar
  progressWrap: {
    alignItems: 'center',
    gap: 2,
    width: 44,
  },

  progressTrack: {
    width: 40,
    height: 3,
    borderRadius: 1.5,
    overflow: 'hidden',
  },

  progressFill: {
    height: 3,
    borderRadius: 1.5,
  },

  progressText: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: 'Courier',
  },

  dismissBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
  },
});



