/**
 * VehicleBanner — Compact dashboard vehicle display
 *
 * If a vehicle is configured: shows vehicle name, type icon, make/model/year, zone count
 * If no vehicle configured: shows "VEHICLE CONFIGURE" button
 *
 * Tapping configured vehicle navigates to Vehicle Config.
 * Compact height to maximize widget grid space.
 */
import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { vehicleStore } from '../../lib/vehicleStore';
import { getVehicleIcon, getVehicleTypeKey, getVehicleIconInfo } from '../../lib/vehicleIcons';
import type { Vehicle } from '../../lib/types';

interface VehicleBannerProps {
  userId?: string | null;
}

export default function VehicleBanner({ userId }: VehicleBannerProps) {
  const router = useRouter();
  const [configuredVehicle, setConfiguredVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const result = await vehicleStore.getAll(userId || null);
          if (cancelled) return;
          // Find the first configured vehicle
          const configured = result.vehicles.find((v: any) => v.wizard_config);
          setConfiguredVehicle(configured || null);
        } catch (err) {
          console.warn('[VehicleBanner] fetch error:', err);
        }
        if (!cancelled) setLoading(false);
      })();
      return () => { cancelled = true; };
    }, [userId])
  );

  if (loading) return null;

  // ── Configured Vehicle Display ──────────────────────
  if (configuredVehicle) {
    const vIcon = getVehicleIcon(configuredVehicle, true);
    const typeKey = getVehicleTypeKey(configuredVehicle);
    const iconInfo = getVehicleIconInfo(typeKey);
    const zones = (configuredVehicle as any).zones;
    const zoneCount = Array.isArray(zones) ? zones.length : 0;
    const totalSlots = Array.isArray(zones)
      ? zones.reduce((s: number, z: any) => s + (z.slotCount || 0), 0)
      : 0;
    const meta = [configuredVehicle.year, configuredVehicle.make, configuredVehicle.model]
      .filter(Boolean)
      .join(' ');

    return (

      <TouchableOpacity
        style={styles.configuredBanner}
        onPress={() => router.push({
          pathname: '/(tabs)/vehicle-config',
          params: { vehicleId: configuredVehicle.id, startAtStep: 'accessoryConfiguration', referrer: 'dashboard' },
        } as any)}
        activeOpacity={0.8}
      >


        {/* Vehicle Icon */}
        <View style={[styles.iconBox, { borderColor: `${iconInfo.color}55` }]}>
          <Ionicons name={vIcon as any} size={18} color={iconInfo.color} />
        </View>

        {/* Vehicle Info */}
        <View style={styles.infoCol}>
          <Text style={styles.vehicleName}>
            {configuredVehicle.name}
          </Text>
          <Text style={styles.vehicleMeta}>
            {meta || iconInfo.label}
          </Text>

        </View>

        {/* Stats */}
        <View style={styles.statsCol}>
          <View style={styles.statRow}>
            <Ionicons name="grid-outline" size={9} color={TACTICAL.textMuted} />
            <Text style={styles.statText}>{zoneCount} zones</Text>
          </View>
          <View style={styles.statRow}>
            <Ionicons name="cube-outline" size={9} color={TACTICAL.textMuted} />
            <Text style={styles.statText}>{totalSlots} slots</Text>
          </View>
        </View>

        {/* Configured badge + chevron */}
        <View style={styles.rightCol}>
          <View style={styles.configBadge}>
            <Ionicons name="checkmark-circle" size={10} color="#66BB6A" />
          </View>
          <Ionicons name="chevron-forward" size={14} color={TACTICAL.textMuted} />
        </View>
      </TouchableOpacity>
    );
  }

  // ── No Vehicle — Show Configure Button ──────────────
  return (
    <TouchableOpacity
      style={styles.unconfiguredBanner}
      onPress={() => router.push('/(tabs)/vehicle-config' as any)}
      activeOpacity={0.85}
    >
      <View style={styles.unconfiguredIcon}>
        <Ionicons name="car-sport-outline" size={16} color={TACTICAL.amber} />
      </View>
      <View style={styles.unconfiguredInfo}>
        <Text style={styles.unconfiguredTitle}>VEHICLE CONFIGURE</Text>
        <Text style={styles.unconfiguredSub}>Configure expedition framework & loadout zones</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={TACTICAL.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // ── Configured Vehicle ─────────────────────────────
  configuredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.35)',
    gap: 8,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  infoCol: {
    flex: 1,
    minWidth: 0,
  },
  vehicleName: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.3,
  },
  vehicleMeta: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    marginTop: 1,
  },
  statsCol: {
    gap: 2,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  rightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  configBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(76,175,80,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Unconfigured — Configure Button ────────────────
  unconfiguredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.45)',
    backgroundColor: 'rgba(196,138,44,0.06)',
    gap: 8,
  },
  unconfiguredIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(196,138,44,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.3)',
  },
  unconfiguredInfo: {
    flex: 1,
  },
  unconfiguredTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.4,
  },
  unconfiguredSub: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },
});



