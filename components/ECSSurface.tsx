import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { ECS, TACTICAL } from '../lib/theme';
import { ECS_SURFACE } from '../lib/ecsSurfaceTokens';
import { ECSHelperText, ECSSectionTitle, ECSStatLabel, ECSStatValue } from './ECSText';
import { ECS_TEXT_SPACING } from '../lib/ecsTypographyTokens';
import { ECSBadge, ECSIcon } from './ECSStatus';

export type ECSSurfaceVariant = 'primary' | 'secondary' | 'compact' | 'quiet' | 'warning';

interface ECSCardProps {
  children: React.ReactNode;
  variant?: ECSSurfaceVariant;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}

interface ECSSectionProps {
  children: React.ReactNode;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

interface ECSSectionHeaderProps {
  title: string;
  subtitle?: string | null;
  icon?: React.ComponentProps<typeof ECSIcon>['name'];
  accentColor?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

interface ECSListRowProps {
  label: string;
  value?: string;
  children?: React.ReactNode;
  noDivider?: boolean;
  style?: StyleProp<ViewStyle>;
}

function resolveSurfaceStyle(variant: ECSSurfaceVariant, selected: boolean) {
  if (selected) {
    return {
      borderColor: ECS_SURFACE.border.selected,
      backgroundColor: ECS_SURFACE.background.selected,
      borderRadius: ECS_SURFACE.radius.primary,
      padding: ECS_SURFACE.padding.primary,
    };
  }

  switch (variant) {
    case 'secondary':
      return {
        borderColor: ECS_SURFACE.border.strong,
        backgroundColor: ECS_SURFACE.background.secondary,
        borderRadius: ECS_SURFACE.radius.secondary,
        padding: ECS_SURFACE.padding.secondary,
      };
    case 'compact':
      return {
        borderColor: ECS_SURFACE.border.quiet,
        backgroundColor: ECS_SURFACE.background.compact,
        borderRadius: ECS_SURFACE.radius.compact,
        padding: ECS_SURFACE.padding.compact,
      };
    case 'quiet':
      return {
        borderColor: ECS_SURFACE.border.quiet,
        backgroundColor: ECS_SURFACE.background.quiet,
        borderRadius: ECS_SURFACE.radius.secondary,
        padding: ECS_SURFACE.padding.secondary,
      };
    case 'warning':
      return {
        borderColor: ECS_SURFACE.border.warning,
        backgroundColor: ECS_SURFACE.background.warning,
        borderRadius: ECS_SURFACE.radius.secondary,
        padding: ECS_SURFACE.padding.secondary,
      };
    case 'primary':
    default:
      return {
        borderColor: ECS_SURFACE.border.default,
        backgroundColor: ECS_SURFACE.background.primary,
        borderRadius: ECS_SURFACE.radius.primary,
        padding: ECS_SURFACE.padding.primary,
      };
  }
}

export function ECSCard({
  children,
  variant = 'primary',
  selected = false,
  style,
}: ECSCardProps) {
  const surfaceStyle = resolveSurfaceStyle(variant, selected);
  return <View style={[styles.cardBase, surfaceStyle, style]}>{children}</View>;
}

export function ECSPanel({
  children,
  variant = 'secondary',
  selected = false,
  style,
}: ECSCardProps) {
  return (
    <ECSCard variant={variant} selected={selected} style={style}>
      {children}
    </ECSCard>
  );
}

export function ECSCardFooter({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.footer, style]}>{children}</View>;
}

export function ECSSection({ children, compact = false, style }: ECSSectionProps) {
  return <View style={[compact ? styles.sectionCompact : styles.section, style]}>{children}</View>;
}

export function ECSSectionHeader({
  title,
  subtitle,
  icon,
  accentColor = ECS_SURFACE.headerAccent,
  badge,
  action,
  style,
}: ECSSectionHeaderProps) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionHeaderLeft}>
        {icon ? <ECSIcon name={icon} tier="compact" color={accentColor} /> : null}
        <View style={styles.sectionHeaderCopy}>
          <ECSSectionTitle style={[styles.sectionTitle, { color: accentColor }]} numberOfLines={1}>
            {title}
          </ECSSectionTitle>
          {subtitle ? (
            <ECSHelperText style={styles.sectionSubtitle} numberOfLines={2}>
              {subtitle}
            </ECSHelperText>
          ) : null}
        </View>
      </View>
      {action ?? badge ? <View style={styles.sectionHeaderRight}>{action ?? badge}</View> : null}
    </View>
  );
}

export function ECSSectionBadge({
  label,
  color = TACTICAL.amber,
}: {
  label: string;
  color?: string;
}) {
  return <ECSBadge label={label} tone="category" compact colorOverride={color} />;
}

export function ECSListRow({
  label,
  value,
  children,
  noDivider = false,
  style,
}: ECSListRowProps) {
  return (
    <View style={[styles.listRow, !noDivider && styles.listRowDivider, style]}>
      <ECSStatLabel style={styles.listLabel}>{label}</ECSStatLabel>
      {children ?? <ECSStatValue style={styles.listValue}>{value}</ECSStatValue>}
    </View>
  );
}

const styles = StyleSheet.create({
  cardBase: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  footer: {
    marginTop: ECS_SURFACE.gap.group,
    paddingTop: ECS_SURFACE.gap.group,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.14)',
  },
  section: {
    marginBottom: ECS_SURFACE.gap.section,
    gap: ECS_SURFACE.gap.group,
  },
  sectionCompact: {
    marginBottom: ECS_SURFACE.gap.stack,
    gap: ECS_SURFACE.gap.group,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  sectionHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: ECS_TEXT_SPACING.titleToSubtitle - 2,
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
  },
  sectionSubtitle: {
  },
  listRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 7,
  },
  listRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.10)',
  },
  listLabel: {
    flex: 1,
  },
  listValue: {
    textAlign: 'right',
  },
});
