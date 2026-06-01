import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { SafeIcon as Ionicons } from './SafeIcon';
import { TACTICAL, ECS } from '../lib/theme';
import { ECSButton } from './ECSButton';
import { ECSHelperText, ECSText } from './ECSText';
import { ECS_TEXT_SPACING } from '../lib/ecsTypographyTokens';

type ECSStateVariant =
  | 'standard'
  | 'selection_required'
  | 'partial_data'
  | 'warning'
  | 'compact';

type BaseProps = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  helper?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  iconAsset?: number;
  variant?: ECSStateVariant;
  align?: 'left' | 'center';
};

export function ECSStateMessage({
  title,
  message,
  actionLabel,
  onAction,
  helper,
  icon = 'information-circle-outline',
  iconAsset,
  variant = 'standard',
  align = 'center',
}: BaseProps) {
  const tone = getVariantTone(variant);
  const centered = align === 'center';

  return (
    <View
      style={[
        styles.card,
        centered ? styles.cardCentered : styles.cardLeft,
        variant === 'compact' && styles.cardCompact,
        { borderColor: `${tone}2C`, backgroundColor: `${tone}10` },
      ]}
    >
      <View style={[styles.iconWrap, { borderColor: `${tone}38`, backgroundColor: `${tone}14` }]}>
        {iconAsset ? (
          <Image
            source={iconAsset}
            style={[styles.iconAsset, variant === 'compact' && styles.iconAssetCompact]}
            contentFit="contain"
            transition={0}
          />
        ) : (
          <Ionicons name={icon} size={variant === 'compact' ? 15 : 18} color={tone} />
        )}
      </View>
      <ECSText variant="dialogTitle" style={[styles.title, centered ? styles.textCentered : styles.textLeft]}>{title}</ECSText>
      <ECSText variant="dialogBody" style={[styles.message, centered ? styles.textCentered : styles.textLeft]}>{message}</ECSText>
      {helper ? (
        <ECSHelperText style={[styles.helper, centered ? styles.textCentered : styles.textLeft]}>{helper}</ECSHelperText>
      ) : null}
      {actionLabel && onAction ? (
        <ECSButton
          label={actionLabel}
          onPress={onAction}
          variant="secondary"
          size="medium"
        />
      ) : null}
    </View>
  );
}

export function ECSInlineHelper({
  text,
  variant = 'standard',
  icon,
}: {
  text: string;
  variant?: Exclude<ECSStateVariant, 'compact'>;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}) {
  const tone = getVariantTone(variant);
  return (
    <View style={[styles.inlineHelper, { borderColor: `${tone}22`, backgroundColor: `${tone}0C` }]}>
      <Ionicons name={icon ?? getInlineIcon(variant)} size={13} color={tone} />
      <ECSHelperText style={styles.inlineHelperText}>{text}</ECSHelperText>
    </View>
  );
}

export function ECSWidgetFallback({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.widgetFallback}>
      <ECSText variant="cardTitle" style={styles.widgetTitle}>{title}</ECSText>
      <ECSHelperText style={styles.widgetMessage}>{message}</ECSHelperText>
      {actionLabel && onAction ? (
        <ECSButton
          label={actionLabel}
          onPress={onAction}
          variant="secondary"
          size="compact"
        />
      ) : null}
    </View>
  );
}

function getVariantTone(variant: ECSStateVariant): string {
  switch (variant) {
    case 'selection_required':
      return '#5AC8FA';
    case 'partial_data':
      return '#B79B5B';
    case 'warning':
      return TACTICAL.danger;
    case 'compact':
      return TACTICAL.textMuted;
    default:
      return TACTICAL.amber;
  }
}

function getInlineIcon(variant: Exclude<ECSStateVariant, 'compact'>): React.ComponentProps<typeof Ionicons>['name'] {
  switch (variant) {
    case 'selection_required':
      return 'radio-button-on-outline';
    case 'partial_data':
      return 'layers-outline';
    case 'warning':
      return 'warning-outline';
    default:
      return 'information-circle-outline';
  }
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: ECS.radius,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  cardCentered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLeft: {
    alignItems: 'flex-start',
  },
  cardCompact: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconAsset: {
    width: 22,
    height: 22,
  },
  iconAssetCompact: {
    width: 18,
    height: 18,
  },
  title: {
    marginTop: ECS_TEXT_SPACING.emptyTitleToBody - 2,
  },
  message: {
    marginTop: ECS_TEXT_SPACING.emptyTitleToBody - 4,
  },
  helper: {
    opacity: 0.9,
  },
  textCentered: {
    textAlign: 'center',
  },
  textLeft: {
    textAlign: 'left',
  },
  inlineHelper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  inlineHelperText: {
    flex: 1,
  },
  widgetFallback: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  widgetTitle: {
    textAlign: 'center',
  },
  widgetMessage: {
    textAlign: 'center',
  },
});
