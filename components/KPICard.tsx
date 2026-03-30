/**
 * KPICard — Key Performance Indicator display card
 *
 * UI Consistency Pass:
 *   • Typography: TYPO tokens (T4, K1, K2, B2, U2)
 *   • Density: DENSITY tokens (Comfortable)
 *   • Card: ECS.radius for border radius, DENSITY.cardPad for padding
 *   • Icon box: ICON_BOX.sm for consistent sizing
 *   • Spacing: DENSITY.titleBodyGap, DENSITY.kpiLabelGap
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from './SafeIcon';

import { COLORS, SPACING, RADIUS, SHADOWS, TYPO, DENSITY, ECS } from '../lib/theme';
import { ICON_BOX } from '../lib/uiConstants';

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  color?: string;
  alert?: boolean;
  small?: boolean;
}

export default function KPICard({ title, value, subtitle, icon, color = COLORS.gold, alert, small }: KPICardProps) {
  return (
    <View style={[
      styles.card,
      alert && styles.alertCard,
      small && styles.smallCard,
    ]}>
      {icon && (
        <View style={[styles.iconWrap, { backgroundColor: `${color}15` }]}>
          <Ionicons name={icon} size={small ? ICON_BOX.sm.iconSize : ICON_BOX.md.iconSize} color={color} />
        </View>
      )}
      {/* T4 Label */}
      <Text style={[styles.title, small && styles.smallTitle]}>{title}</Text>
      {/* K1 KPI Large / K2 KPI Standard */}
      <Text style={[styles.value, { color }, small && styles.smallValue]}>{value}</Text>
      {/* B2 Secondary */}
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {alert && (
        <View style={styles.alertBadge}>
          <Ionicons name="warning" size={10} color={COLORS.danger} />
          <Text style={styles.alertText}>ALERT</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: ECS.radius,
    padding: DENSITY.cardPad,
    borderWidth: DENSITY.borderDefault,
    borderColor: COLORS.border,
    minWidth: 140,
    ...SHADOWS.card,
  },
  alertCard: {
    borderColor: 'rgba(255,59,48,0.4)',
    backgroundColor: 'rgba(255,59,48,0.05)',
  },
  smallCard: {
    minWidth: 100,
    padding: SPACING.sm,
  },
  iconWrap: {
    width: ICON_BOX.sm.size,
    height: ICON_BOX.sm.size,
    borderRadius: ICON_BOX.sm.radius,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: DENSITY.titleBodyGap,
  },
  // T4 Label
  title: {
    ...TYPO.T4,
    color: COLORS.textMuted,
    marginBottom: DENSITY.kpiLabelGap,
  },
  smallTitle: {
    fontSize: 12,
  },
  // K1 KPI Large
  value: {
    ...TYPO.K1,
    fontSize: 26,
  },
  // K2 KPI Standard (small)
  smallValue: {
    ...TYPO.K2,
    fontSize: 22,
  },

  // B2 Secondary
  subtitle: {
    ...TYPO.B2,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: DENSITY.titleBodyGap,
    backgroundColor: 'rgba(255,59,48,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  // U2 Chip/Badge
  alertText: {
    ...TYPO.U2,
    fontSize: 11,
    color: COLORS.danger,
  },
});



