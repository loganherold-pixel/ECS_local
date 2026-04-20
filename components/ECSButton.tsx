import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';

import { ECS, TYPO } from '../lib/theme';
import { ECS_BUTTON_COLORS, ECS_INTERACTION } from '../lib/ecsInteractionTokens';
import { ECS_TEXT } from '../lib/ecsTypographyTokens';
import { ECSIcon } from './ECSStatus';

export type ECSButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive' | 'active';
export type ECSButtonSize = 'large' | 'medium' | 'compact';

type IconName = React.ComponentProps<typeof ECSIcon>['name'];

interface ECSButtonProps {
  label: string;
  onPress?: (event?: any) => void;
  icon?: IconName;
  variant?: ECSButtonVariant;
  size?: ECSButtonSize;
  disabled?: boolean;
  loading?: boolean;
  grow?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  numberOfLines?: number;
}

interface ECSIconButtonProps {
  icon: IconName;
  onPress?: (event?: any) => void;
  variant?: ECSButtonVariant;
  size?: 'medium' | 'compact';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const SIZE_MAP: Record<ECSButtonSize, { height: number; radius: number; horizontalPadding: number; fontSize: number; letterSpacing: number; iconSize: number }> = {
  large: {
    height: ECS_INTERACTION.height.large,
    radius: ECS_INTERACTION.radius.button,
    horizontalPadding: ECS_INTERACTION.padding.largeHorizontal,
    fontSize: 11,
    letterSpacing: 1.2,
    iconSize: 16,
  },
  medium: {
    height: ECS_INTERACTION.height.medium,
    radius: ECS_INTERACTION.radius.button,
    horizontalPadding: ECS_INTERACTION.padding.mediumHorizontal,
    fontSize: 10,
    letterSpacing: 1,
    iconSize: 14,
  },
  compact: {
    height: ECS_INTERACTION.height.compact,
    radius: ECS_INTERACTION.radius.compactButton,
    horizontalPadding: ECS_INTERACTION.padding.compactHorizontal,
    fontSize: 9,
    letterSpacing: 0.9,
    iconSize: 13,
  },
};

const ICON_SIZE_MAP = {
  medium: {
    height: ECS_INTERACTION.height.iconMedium,
    radius: ECS_INTERACTION.radius.button,
    iconSize: 16,
  },
  compact: {
    height: ECS_INTERACTION.height.iconCompact,
    radius: ECS_INTERACTION.radius.compactButton,
    iconSize: 14,
  },
} as const;

function resolveColors(variant: ECSButtonVariant, disabled: boolean) {
  if (disabled && variant !== 'active') return ECS_BUTTON_COLORS.disabled;
  return ECS_BUTTON_COLORS[variant];
}

export function ECSButton({
  label,
  onPress,
  icon,
  variant = 'secondary',
  size = 'medium',
  disabled = false,
  loading = false,
  grow = false,
  style,
  textStyle,
  accessibilityLabel,
  numberOfLines = 1,
}: ECSButtonProps) {
  const sizeConfig = SIZE_MAP[size];
  const isDisabled = disabled || loading;
  const colors = resolveColors(variant, isDisabled);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.base,
        {
          minHeight: sizeConfig.height,
          borderRadius: sizeConfig.radius,
          paddingHorizontal: sizeConfig.horizontalPadding,
          backgroundColor: colors.background,
          borderColor: colors.border,
        },
        grow && styles.grow,
        isDisabled && variant !== 'active' && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.text} />
      ) : icon ? (
        <ECSIcon name={icon} tier={size === 'compact' ? 'compact' : 'action'} color={colors.text} />
      ) : null}
      <Text
        numberOfLines={numberOfLines}
        style={[
          styles.label,
          {
            color: colors.text,
            fontSize: sizeConfig.fontSize,
            letterSpacing: sizeConfig.letterSpacing,
          },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function ECSIconButton({
  icon,
  onPress,
  variant = 'tertiary',
  size = 'compact',
  disabled = false,
  style,
  accessibilityLabel,
}: ECSIconButtonProps) {
  const sizeConfig = ICON_SIZE_MAP[size];
  const colors = resolveColors(variant, disabled);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.iconButton,
        {
          minHeight: sizeConfig.height,
          minWidth: sizeConfig.height,
          borderRadius: sizeConfig.radius,
          backgroundColor: colors.background,
          borderColor: colors.border,
        },
        disabled && variant !== 'active' && styles.disabled,
        style,
      ]}
    >
      <ECSIcon name={icon} tier={size === 'compact' ? 'compact' : 'action'} color={colors.text} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ECS_INTERACTION.gap.icon,
  },
  grow: {
    flex: 1,
  },
  disabled: {
    opacity: 0.72,
  },
  label: {
    ...ECS_TEXT.button,
    textAlign: 'center',
  } as TextStyle,
  iconButton: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ECS.bgElev,
  },
});
