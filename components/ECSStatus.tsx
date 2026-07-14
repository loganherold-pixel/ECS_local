import React from 'react';
import { StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';

import { SafeIcon as Ionicons } from './SafeIcon';
import { ECSText } from './ECSText';
import { ECS_ICON, ECS_STATUS, type ECSIconTier, type ECSStatusTone } from '../lib/ecsStatusTokens';
import { ECS_TEXT } from '../lib/ecsTypographyTokens';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ACCESSIBLE_TONE_LABEL: Record<ECSStatusTone, string> = {
  active: 'Active',
  ready: 'Ready',
  live: 'Live',
  warning: 'Warning',
  unavailable: 'Unavailable',
  info: 'Information',
  category: 'Category',
  selected: 'Selected',
};

export function ECSIcon({
  name,
  tier = 'action',
  tone = 'info',
  color,
  style,
  accessibilityLabel,
}: {
  name: IconName;
  tier?: ECSIconTier;
  tone?: ECSStatusTone;
  color?: string;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}) {
  const resolved = ECS_STATUS.tone[tone];
  return (
    <Ionicons
      name={name}
      size={ECS_ICON.size[tier]}
      color={color ?? resolved.icon}
      style={style as any}
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'auto' : 'no'}
    />
  );
}

export function ECSStatusDot({
  tone = 'info',
  compact = false,
  style,
  accessibilityLabel,
}: {
  tone?: ECSStatusTone;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const resolved = ECS_STATUS.tone[tone];
  const size = compact ? ECS_STATUS.dot.compactSize : ECS_STATUS.dot.size;
  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'text' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'auto' : 'no'}
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: resolved.dot,
        },
        style,
      ]}
    />
  );
}

export function ECSBadge({
  label,
  tone = 'info',
  icon,
  compact = false,
  style,
  textStyle,
  colorOverride,
  accessibilityLabel,
}: {
  label: string;
  tone?: ECSStatusTone;
  icon?: IconName;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  colorOverride?: string;
  accessibilityLabel?: string;
}) {
  const base = ECS_STATUS.tone[tone];
  const textColor = colorOverride ?? base.text;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? `${ACCESSIBLE_TONE_LABEL[tone]} status: ${label}`}
      style={[
        styles.badge,
        {
          paddingHorizontal: compact ? ECS_STATUS.padding.compactBadgeX : ECS_STATUS.padding.badgeX,
          paddingVertical: compact ? ECS_STATUS.padding.compactBadgeY : ECS_STATUS.padding.badgeY,
          backgroundColor: colorOverride ? `${colorOverride}12` : base.background,
          borderColor: colorOverride ? `${colorOverride}2E` : base.border,
        },
        style,
      ]}
    >
      {icon ? <ECSIcon name={icon} tier={compact ? 'compact' : 'action'} tone={tone} color={textColor} /> : null}
      <ECSText
        variant="chip"
        style={[styles.badgeText, { color: textColor }, textStyle]}
        numberOfLines={2}
        maxFontSizeMultiplier={1.6}
      >
        {label}
      </ECSText>
    </View>
  );
}

export function ECSStatusPill(props: React.ComponentProps<typeof ECSBadge>) {
  return <ECSBadge {...props} />;
}

export function ECSStateIndicator({
  label,
  tone = 'info',
  icon,
  compact = false,
  style,
  accessibilityLabel,
}: {
  label: string;
  tone?: ECSStatusTone;
  icon?: IconName;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const base = ECS_STATUS.tone[tone];
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? `${ACCESSIBLE_TONE_LABEL[tone]} status: ${label}`}
      style={[styles.inline, style]}
    >
      {icon ? (
        <ECSIcon name={icon} tier={compact ? 'compact' : 'action'} tone={tone} />
      ) : (
        <ECSStatusDot tone={tone} compact={compact} />
      )}
      <ECSText
        variant="helper"
        style={[styles.inlineText, { color: base.text }]}
        numberOfLines={2}
        maxFontSizeMultiplier={1.6}
      >
        {label}
      </ECSText>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {},
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: ECS_STATUS.gap.icon,
    borderRadius: ECS_STATUS.radius.badge,
    borderWidth: 1,
    maxWidth: '100%',
  },
  badgeText: {
    ...ECS_TEXT.chip,
    maxWidth: '100%',
  } as TextStyle,
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ECS_STATUS.gap.dot,
    minWidth: 0,
  },
  inlineText: {
    flexShrink: 1,
  },
});
