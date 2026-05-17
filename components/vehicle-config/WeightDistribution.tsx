/**
 * WeightDistribution — Collapsible weight distribution panel
 *
 * Default state: COLLAPSED
 *   Shows: TOTAL LOAD, FRONT %, REAR %
 *   Small expand chevron
 *
 * Expanded state:
 *   Axle breakdown
 *   CG height
 *   Stability margin bar
 *
 * Uses ZONE_ACCENT color hierarchy for accent colors.
 * Avoids bright red except true overload conditions.
 * No silhouette. No vehicle graphics.
 * Tactical numeric emphasis.
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  LayoutAnimation,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, ZONE_ACCENT_SOLID } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import type { CGResult } from '../../lib/weightEngine';
import { enableLegacyAndroidLayoutAnimation } from '../../lib/layoutAnimationCompat';

enableLegacyAndroidLayoutAnimation();

interface Props {
  cgResult: CGResult;
}

// Use zone-consistent accent colors instead of arbitrary bright colors.
// Only use TACTICAL.danger for true overload (>75%).
function getAxleColor(percent: number): string {
  if (percent > 75) return TACTICAL.danger;       // True overload — red allowed
  if (percent > 65) return ZONE_ACCENT_SOLID.RACK; // muted amber
  return '#D4AF37';                                 // default gold
}

function getStabilityLabel(stability: CGResult['stability']): string {
  switch (stability) {
    case 'balanced': return 'BALANCED';
    case 'moderate_rear': return 'REAR BIASED';
    case 'extreme_rear': return 'EXTREME REAR';
    default: return 'UNKNOWN';
  }
}

function getStabilityColor(stability: CGResult['stability']): string {
  switch (stability) {
    case 'balanced': return '#D4AF37';
    case 'moderate_rear': return ZONE_ACCENT_SOLID.RACK;  // muted amber
    case 'extreme_rear': return TACTICAL.danger;           // true overload
    default: return '#D4AF37';
  }
}

// Map module labels to zone accent colors
function getModuleAccentColor(label: string, intensity: string): string {
  if (intensity === 'excessive') return TACTICAL.danger;
  const lc = label.toLowerCase();
  if (lc.includes('cab') && !lc.includes('rack')) return ZONE_ACCENT_SOLID.CAB;
  if (lc.includes('rack') || lc.includes('roof')) return ZONE_ACCENT_SOLID.RACK;
  if (lc.includes('bed') || lc.includes('cargo')) return ZONE_ACCENT_SOLID.BED;
  if (lc.includes('drawer')) return ZONE_ACCENT_SOLID.DRAWER;
  if (lc.includes('hitch') || lc.includes('trailer')) return ZONE_ACCENT_SOLID.HITCH;
  if (lc.includes('power') || lc.includes('battery') || lc.includes('solar')) return ZONE_ACCENT_SOLID.POWER;
  if (lc.includes('water')) return ZONE_ACCENT_SOLID.WATER;
  if (intensity === 'heavy') return ZONE_ACCENT_SOLID.RACK;
  return '#D4AF37';
}

export default function WeightDistribution({ cgResult }: Props) {
  const [expanded, setExpanded] = useState(false);
  const chevronAnim = useRef(new Animated.Value(0)).current;

  const toggle = useCallback(() => {
    hapticMicro();
    LayoutAnimation.configureNext({
      duration: 200,
      update: { type: LayoutAnimation.Types.easeOut },
    });
    setExpanded(prev => {
      const next = !prev;
      Animated.timing(chevronAnim, {
        toValue: next ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      return next;
    });
  }, [chevronAnim]);

  if (cgResult.totalMass === 0) return null;

  const chevronRotate = chevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const stabilityColor = getStabilityColor(cgResult.stability);
  const stabilityLabel = getStabilityLabel(cgResult.stability);

  // Stability margin (0-100): 100 = perfectly balanced, 0 = extreme rear
  const marginPct = Math.max(0, Math.min(100, 100 - Math.abs(cgResult.rearAxlePercent - 50) * 2));

  return (
    <View style={styles.container}>
      {/* Collapsed Header — Always visible */}
      <TouchableOpacity
        style={styles.header}
        onPress={toggle}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <View style={[styles.accentDot, { backgroundColor: stabilityColor }]} />
          <Text style={styles.headerLabel}>WEIGHT</Text>
        </View>

        {/* Collapsed metrics */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCell}>
            <Text style={styles.metricValue}>
              {cgResult.totalMass.toLocaleString()}
            </Text>
            <Text style={styles.metricUnit}>LBS</Text>
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.metricCell}>
            <Text style={[styles.metricValue, { color: getAxleColor(cgResult.frontAxlePercent) }]}>
              {cgResult.frontAxlePercent}%
            </Text>
            <Text style={styles.metricUnit}>FRONT</Text>
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.metricCell}>
            <Text style={[styles.metricValue, { color: getAxleColor(cgResult.rearAxlePercent) }]}>
              {cgResult.rearAxlePercent}%
            </Text>
            <Text style={styles.metricUnit}>REAR</Text>
          </View>
        </View>

        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <Ionicons name="chevron-down" size={14} color="rgba(138,138,138,0.4)" />
        </Animated.View>
      </TouchableOpacity>

      {/* Expanded Detail */}
      {expanded && (
        <View style={styles.expandedContent}>
          {/* Stability Margin Bar */}
          <View style={styles.marginSection}>
            <View style={styles.marginLabelRow}>
              <Text style={styles.marginLabel}>STABILITY MARGIN</Text>
              <Text style={[styles.marginValue, { color: stabilityColor }]}>
                {stabilityLabel}
              </Text>
            </View>
            <View style={styles.marginBarTrack}>
              <View
                style={[
                  styles.marginBarFill,
                  {
                    width: `${marginPct}%`,
                    backgroundColor: stabilityColor,
                  },
                ]}
              />
              {/* Center mark */}
              <View style={styles.marginBarCenter} />
            </View>
            <View style={styles.marginBarLabels}>
              <Text style={styles.marginBarEndLabel}>REAR</Text>
              <Text style={styles.marginBarEndLabel}>BALANCED</Text>
              <Text style={styles.marginBarEndLabel}>FRONT</Text>
            </View>
          </View>

          {/* Axle Breakdown */}
          <View style={styles.axleGrid}>
            <View style={styles.axleItem}>
              <Text style={styles.axleLabel}>FRONT AXLE LOAD</Text>
              <Text style={[styles.axleValue, { color: getAxleColor(cgResult.frontAxlePercent) }]}>
                {Math.round(cgResult.totalMass * cgResult.frontAxlePercent / 100).toLocaleString()} LBS
              </Text>
              <View style={styles.axleBarTrack}>
                <View style={[styles.axleBarFill, {
                  width: `${cgResult.frontAxlePercent}%`,
                  backgroundColor: getAxleColor(cgResult.frontAxlePercent),
                }]} />
              </View>
            </View>

            <View style={styles.axleItem}>
              <Text style={styles.axleLabel}>REAR AXLE LOAD</Text>
              <Text style={[styles.axleValue, { color: getAxleColor(cgResult.rearAxlePercent) }]}>
                {Math.round(cgResult.totalMass * cgResult.rearAxlePercent / 100).toLocaleString()} LBS
              </Text>
              <View style={styles.axleBarTrack}>
                <View style={[styles.axleBarFill, {
                  width: `${cgResult.rearAxlePercent}%`,
                  backgroundColor: getAxleColor(cgResult.rearAxlePercent),
                }]} />
              </View>
            </View>
          </View>

          {/* CG Position */}
          <View style={styles.cgRow}>
            <View style={styles.cgItem}>
              <Text style={styles.cgLabel}>CG LONGITUDINAL</Text>
              <Text style={styles.cgValue}>{(cgResult.xCG * 100).toFixed(1)}%</Text>
            </View>
            <View style={styles.cgDivider} />
            <View style={styles.cgItem}>
              <Text style={styles.cgLabel}>CG HEIGHT</Text>
              <Text style={styles.cgValue}>{(cgResult.zCG * 100).toFixed(1)}%</Text>
            </View>
            <View style={styles.cgDivider} />
            <View style={styles.cgItem}>
              <Text style={styles.cgLabel}>MODULES</Text>
              <Text style={styles.cgValue}>{cgResult.modules.length}</Text>
            </View>
          </View>

          {/* Module Breakdown — uses zone accent colors */}
          {cgResult.modules.length > 0 && (
            <View style={styles.moduleList}>
              <Text style={styles.moduleListTitle}>WEIGHT MODULES</Text>
              {cgResult.modules.map((mod, idx) => (
                <View key={`${mod.id}-${idx}`} style={styles.moduleRow}>
                  <View style={[styles.moduleAccent, {
                    backgroundColor: getModuleAccentColor(mod.label, mod.intensity),
                  }]} />
                  <Text style={styles.moduleName}>{mod.label}</Text>
                  <Text style={styles.moduleMass}>
                    {mod.mass > 0 ? `${mod.mass.toLocaleString()} lbs` : '—'}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(18, 24, 29, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.25)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accentDot: {
    width: 5,
    height: 5,
  },
  headerLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: 'rgba(138, 138, 138, 0.45)',
    letterSpacing: 1.5,
  },
  metricsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  metricCell: {
    alignItems: 'center',
    minWidth: 44,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#D4AF37',
    letterSpacing: 0.5,
  },
  metricUnit: {
    fontSize: 6,
    fontWeight: '800',
    color: 'rgba(138, 138, 138, 0.4)',
    letterSpacing: 1,
    marginTop: 1,
  },
  metricDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(62, 79, 60, 0.25)',
  },

  // Expanded
  expandedContent: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.15)',
  },

  // Stability Margin
  marginSection: {
    paddingTop: 10,
    gap: 6,
  },
  marginLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  marginLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: 'rgba(138, 138, 138, 0.5)',
    letterSpacing: 1.2,
  },
  marginValue: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  marginBarTrack: {
    height: 6,
    backgroundColor: 'rgba(138, 138, 138, 0.08)',
    position: 'relative',
    overflow: 'hidden',
  },
  marginBarFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    opacity: 0.35,
  },
  marginBarCenter: {
    position: 'absolute',
    left: '50%',
    top: 0,
    width: 1,
    height: 6,
    backgroundColor: 'rgba(138, 138, 138, 0.25)',
  },
  marginBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  marginBarEndLabel: {
    fontSize: 6,
    fontWeight: '800',
    color: 'rgba(138, 138, 138, 0.3)',
    letterSpacing: 0.8,
  },

  // Axle Grid
  axleGrid: {
    gap: 8,
  },
  axleItem: {
    gap: 3,
  },
  axleLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: 'rgba(138, 138, 138, 0.45)',
    letterSpacing: 1.2,
  },
  axleValue: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  axleBarTrack: {
    height: 4,
    backgroundColor: 'rgba(138, 138, 138, 0.08)',
    overflow: 'hidden',
  },
  axleBarFill: {
    height: '100%',
    opacity: 0.45,
  },

  // CG Row
  cgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: 'rgba(62, 79, 60, 0.08)',
    paddingHorizontal: 8,
  },
  cgItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  cgLabel: {
    fontSize: 6,
    fontWeight: '800',
    color: 'rgba(138, 138, 138, 0.4)',
    letterSpacing: 1,
  },
  cgValue: {
    fontSize: 12,
    fontWeight: '900',
    color: '#D4AF37',
    letterSpacing: 0.5,
  },
  cgDivider: {
    width: 1,
    height: 22,
    backgroundColor: 'rgba(62, 79, 60, 0.25)',
  },

  // Module List
  moduleList: {
    gap: 4,
  },
  moduleListTitle: {
    fontSize: 7,
    fontWeight: '900',
    color: 'rgba(138, 138, 138, 0.4)',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  moduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
  },
  moduleAccent: {
    width: 3,
    height: 12,
  },
  moduleName: {
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(138, 138, 138, 0.6)',
    letterSpacing: 0.3,
  },
  moduleMass: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(212, 175, 55, 0.6)',
    letterSpacing: 0.3,
  },
});



