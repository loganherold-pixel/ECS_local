/**
 * StabilityStrip — Slim horizontal strip showing vehicle stability status.
 * Displays status badge, tilt margin, and a compact progress bar.
 *
 * Mobile-optimized: responsive gap/padding, compact icon on small screens.
 */
import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS, GOLD_RAIL, TYPO } from '../../lib/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const IS_SMALL = SCREEN_W < 380;

const BASE_LIMIT = 30;
const SAFE_THRESHOLD = 15;
const CAUTION_THRESHOLD = 8;

export interface StabilityResult {
  tiltAngle: number;
  cgPenalty: number;
  effectiveLimit: number;
  tiltMargin: number;
  status: 'SAFE' | 'CAUTION' | 'HIGH RISK';
  statusColor: string;
}

export function computeStability(
  rollDeg: number | null,
  pitchDeg: number | null,
  frontAxlePct: number | null,
  rearAxlePct: number | null,
): StabilityResult | null {
  if (rollDeg == null && pitchDeg == null) return null;

  const absRoll = Math.abs(rollDeg ?? 0);
  const absPitch = Math.abs(pitchDeg ?? 0);
  const tiltAngle = Math.max(absRoll, absPitch);

  const frontRearBias = frontAxlePct != null ? frontAxlePct - 50 : 0;
  const cgPenalty = Math.abs(frontRearBias) * 0.2;

  const effectiveLimit = BASE_LIMIT - cgPenalty;
  const tiltMargin = effectiveLimit - tiltAngle;

  let status: StabilityResult['status'] = 'SAFE';
  let statusColor = '#66BB6A';
  if (tiltMargin < CAUTION_THRESHOLD) {
    status = 'HIGH RISK';
    statusColor = '#EF5350';
  } else if (tiltMargin < SAFE_THRESHOLD) {
    status = 'CAUTION';
    statusColor = '#FFB74D';
  }

  return {
    tiltAngle: Math.round(tiltAngle * 10) / 10,
    cgPenalty: Math.round(cgPenalty * 10) / 10,
    effectiveLimit: Math.round(effectiveLimit * 10) / 10,
    tiltMargin: Math.round(tiltMargin * 10) / 10,
    status,
    statusColor,
  };
}

interface Props {
  stability: StabilityResult;
}

export function StabilityStrip({ stability }: Props) {
  const iconName =
    stability.status === 'SAFE'
      ? 'shield-checkmark-outline'
      : stability.status === 'CAUTION'
      ? 'warning-outline'
      : 'alert-outline';

  const fillPct = Math.max(0, Math.min(100, (stability.tiltMargin / BASE_LIMIT) * 100));

  return (
    <View style={s.container}>
      {/* Left: icon + status */}
      <View style={s.leftGroup}>
        <View style={[s.iconCircle, { borderColor: stability.statusColor }]}>
          <Ionicons name={iconName as any} size={IS_SMALL ? 10 : 12} color={stability.statusColor} />
        </View>
        <View>
          <Text
            style={[s.statusLabel, { color: stability.statusColor }]}
            numberOfLines={1}
          >
            {stability.status}
          </Text>
          <Text style={s.subLabel}>STABILITY</Text>
        </View>
      </View>

      {/* Center: bar */}
      <View style={s.barSection}>
        <View style={s.barTrack}>
          <View
            style={[
              s.barFill,
              { width: `${fillPct}%`, backgroundColor: stability.statusColor },
            ]}
          />
          <View
            style={[s.barThreshold, { left: `${(CAUTION_THRESHOLD / BASE_LIMIT) * 100}%` }]}
          />
          <View
            style={[s.barThreshold, { left: `${(SAFE_THRESHOLD / BASE_LIMIT) * 100}%` }]}
          />
        </View>
        <View style={s.barLabels}>
          <Text style={[s.barLabel, { color: '#EF5350' }]}>RISK</Text>
          <Text style={[s.barLabel, { color: '#FFB74D' }]}>CAUTION</Text>
          <Text style={[s.barLabel, { color: '#66BB6A' }]}>SAFE</Text>
        </View>
      </View>

      {/* Right: margin value */}
      <View style={s.rightGroup}>
        <Text
          style={[s.marginValue, { color: stability.statusColor }]}
          numberOfLines={1}
        >
          {stability.tiltMargin.toFixed(1)}°
        </Text>
        <Text style={s.marginLabel}>MARGIN</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ECS.bgPanel,
    borderWidth: 1,
    borderColor: ECS.stroke,
    borderRadius: ECS.radius,
    paddingVertical: IS_SMALL ? 8 : 10,
    paddingHorizontal: IS_SMALL ? 10 : 14,
    gap: IS_SMALL ? 8 : 12,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: IS_SMALL ? 6 : 8,
  },
  iconCircle: {
    width: IS_SMALL ? 24 : 28,
    height: IS_SMALL ? 24 : 28,
    borderRadius: IS_SMALL ? 12 : 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  statusLabel: {
    fontSize: IS_SMALL ? 8 : 10,
    fontWeight: '800',
    letterSpacing: IS_SMALL ? 2 : 3,
  },
  subLabel: {
    fontSize: 6,
    fontWeight: '600',
    letterSpacing: 2,
    color: ECS.muted,
    marginTop: 1,
  },
  barSection: {
    flex: 1,
    minWidth: 60,
  },
  barTrack: {
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2.5,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    borderRadius: 2.5,
    opacity: 0.85,
  },
  barThreshold: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
    paddingHorizontal: 1,
  },
  barLabel: {
    fontSize: 5,
    fontWeight: '700',
    letterSpacing: 1,
  },
  rightGroup: {
    alignItems: 'flex-end',
  },
  marginValue: {
    fontSize: IS_SMALL ? 14 : 16,
    fontWeight: '800',
    fontFamily: 'Courier',
    letterSpacing: 1,
  },
  marginLabel: {
    fontSize: 6,
    fontWeight: '600',
    letterSpacing: 2,
    color: ECS.muted,
    marginTop: 1,
  },
});



