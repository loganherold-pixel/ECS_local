import React from 'react';
import { StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';

import { SafeIcon as Ionicons } from './SafeIcon';
import { ECSText } from './ECSText';
import { ECS_ICON, ECS_STATUS, type ECSIconTier, type ECSStatusTone } from '../lib/ecsStatusTokens';
import { ECS_TEXT } from '../lib/ecsTypographyTokens';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function ECSIcon({
  name,
  tier = 'action',
  tone = 'info',
  color,
  style,
}: {
  name: IconName;
  tier?: ECSIconTier;
  tone?: ECSStatusTone;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  const resolved = ECS_STATUS.tone[tone];
  return (
    <Ionicons
      name={name}
      size={ECS_ICON.size[tier]}
      color={color ?? resolved.icon}
      style={style as any}
    />
  );
}

export function ECSStatusDot({
  tone = 'info',
  compact = false,
  style,
}: {
  tone?: ECSStatusTone;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const resolved = ECS_STATUS.tone[tone];
  const size = compact ? ECS_STATUS.dot.compactSize : ECS_STATUS.dot.size;
  return (
    <View
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
}: {
  label: string;
  tone?: ECSStatusTone;
  icon?: IconName;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  colorOverride?: string;
}) {
  const base = ECS_STATUS.tone[tone];
  const textColor = colorOverride ?? base.text;
  return (
    <View
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
      <ECSText variant="chip" style={[styles.badgeText, { color: textColor }, textStyle]} numberOfLines={1}>
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
}: {
  label: string;
  tone?: ECSStatusTone;
  icon?: IconName;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const base = ECS_STATUS.tone[tone];
  return (
    <View style={[styles.inline, style]}>
      {icon ? (
        <ECSIcon name={icon} tier={compact ? 'compact' : 'action'} tone={tone} />
      ) : (
        <ECSStatusDot tone={tone} compact={compact} />
      )}
      <ECSText variant="helper" style={[styles.inlineText, { color: base.text }]} numberOfLines={1}>
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
