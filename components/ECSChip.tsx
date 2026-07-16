import React from 'react';
import {
  type AccessibilityRole,
  type AccessibilityState,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

import { ECS_BUTTON_COLORS, ECS_INTERACTION } from '../lib/ecsInteractionTokens';
import { ECS_TEXT } from '../lib/ecsTypographyTokens';
import { ECSIcon } from './ECSStatus';

type IconName = React.ComponentProps<typeof ECSIcon>['name'];

export interface ECSChipProps {
  label?: string;
  icon?: IconName;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  grow?: boolean;
  badge?: string | number | null;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  children?: React.ReactNode;
  compact?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
}

function resolveHitSlop(height: number) {
  const inset = Math.max(0, Math.ceil((44 - height) / 2));
  return inset > 0 ? { top: inset, bottom: inset, left: inset, right: inset } : undefined;
}

export function ECSChip({
  label,
  icon,
  selected,
  disabled = false,
  onPress,
  grow = false,
  badge,
  style,
  textStyle,
  children,
  compact = false,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
}: ECSChipProps) {
  const isSelected = selected === true;
  const palette = disabled
    ? ECS_BUTTON_COLORS.disabled
    : isSelected
      ? ECS_BUTTON_COLORS.chipSelected
      : ECS_BUTTON_COLORS.chipDefault;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      disabled={disabled}
      accessibilityRole={accessibilityRole ?? (onPress ? 'button' : undefined)}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        ...accessibilityState,
        disabled,
        selected: selected ?? accessibilityState?.selected,
      }}
      hitSlop={resolveHitSlop(compact ? 32 : ECS_INTERACTION.height.chip)}
      style={[
        styles.chip,
        compact && styles.chipCompact,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
        },
        grow && styles.grow,
        disabled && styles.disabled,
        style,
      ]}
    >
      {children ? (
        children
      ) : (
        <>
          {icon ? <ECSIcon name={icon} tier={compact ? 'compact' : 'action'} color={palette.text} /> : null}
          {label ? (
            <Text
              numberOfLines={2}
              maxFontSizeMultiplier={1.6}
              style={[styles.label, compact && styles.labelCompact, { color: palette.text }, textStyle]}
            >
              {label}
            </Text>
          ) : null}
          {badge != null ? (
            <View style={[styles.badge, { borderColor: `${palette.text}22`, backgroundColor: `${palette.text}12` }]}>
              <Text maxFontSizeMultiplier={1.6} style={[styles.badgeText, { color: palette.text }]}>{badge}</Text>
            </View>
          ) : null}
        </>
      )}
    </TouchableOpacity>
  );
}

interface SegmentOption {
  key: string;
  label: string;
  icon?: IconName;
  badge?: string | number | null;
  disabled?: boolean;
}

interface ECSSegmentedControlProps {
  options: SegmentOption[];
  value: string;
  onChange: (key: string) => void;
  style?: StyleProp<ViewStyle>;
}

export function ECSSegmentedControl({
  options,
  value,
  onChange,
  style,
}: ECSSegmentedControlProps) {
  return (
    <View
      accessible={false}
      accessibilityRole={'tablist' as AccessibilityRole}
      style={[styles.segmented, style]}
    >
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <ECSChip
            key={option.key}
            label={option.label}
            icon={option.icon}
            badge={option.badge}
            selected={selected}
            disabled={option.disabled}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, disabled: option.disabled }}
            onPress={() => {
              if (!selected && !option.disabled) onChange(option.key);
            }}
            grow
            compact
            style={styles.segmentChip}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: ECS_INTERACTION.height.chip,
    borderRadius: ECS_INTERACTION.radius.chip,
    borderWidth: 1,
    paddingHorizontal: ECS_INTERACTION.padding.chipHorizontal,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  chipCompact: {
    minHeight: 32,
    paddingHorizontal: 9,
    paddingVertical: 5,
    gap: 5,
  },
  grow: {
    flex: 1,
  },
  disabled: {
    opacity: 0.74,
  },
  label: {
    ...ECS_TEXT.chip,
    fontSize: 9,
    textAlign: 'center',
    flexShrink: 1,
  } as TextStyle,
  labelCompact: {
    fontSize: 8,
  } as TextStyle,
  badge: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    ...ECS_TEXT.chip,
    fontSize: 7,
  } as TextStyle,
  segmented: {
    flexDirection: 'row',
    gap: ECS_INTERACTION.gap.compactRow,
  },
  segmentChip: {
    minWidth: 0,
  },
});
