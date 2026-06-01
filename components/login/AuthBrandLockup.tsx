import React, { memo, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { AUTH_COPY } from '../../lib/auth/authCopy';
import { AUTH_VISUAL_SPEC } from '../../lib/auth/authVisualSpec';
import { TACTICAL } from '../../lib/theme';
import AnimatedShield from './AnimatedShield';

type AuthBrandLockupVariant = 'hero' | 'state';

type AuthBrandLockupProps = {
  title: string;
  supporting?: string | null;
  variant?: AuthBrandLockupVariant;
  showBrandLabel?: boolean;
  animateShield?: boolean;
  badgeWidth?: number;
  maxWidth?: number;
  containerStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  supportingStyle?: StyleProp<TextStyle>;
  accentColor?: string;
  textColor?: string;
  mutedColor?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function AuthBrandLockup({
  title,
  supporting,
  variant = 'hero',
  showBrandLabel = true,
  animateShield = true,
  badgeWidth,
  maxWidth,
  containerStyle,
  titleStyle,
  supportingStyle,
  accentColor = TACTICAL.amber,
  textColor = TACTICAL.text,
  mutedColor = TACTICAL.textMuted,
}: AuthBrandLockupProps) {
  const { width, height } = useWindowDimensions();
  const isCompactHeight = height < 760;
  const isTablet = width >= 768;

  const metrics = useMemo(() => {
    if (variant === 'state') {
      const resolvedBadgeWidth =
        badgeWidth ??
        clamp(
          width *
            (isTablet
              ? AUTH_VISUAL_SPEC.crest.state.tabletFactor
              : isCompactHeight
                ? AUTH_VISUAL_SPEC.crest.state.compactFactor
                : AUTH_VISUAL_SPEC.crest.state.phoneFactor),
          AUTH_VISUAL_SPEC.crest.state.min,
          isTablet ? AUTH_VISUAL_SPEC.crest.state.tabletMax : AUTH_VISUAL_SPEC.crest.state.phoneMax,
        );

      return {
        badgeWidth: resolvedBadgeWidth,
        brandMarginTop: AUTH_VISUAL_SPEC.spacing.headerBrandLabelGap.state,
        titleMarginTop: AUTH_VISUAL_SPEC.spacing.headerTitleGap.state,
        supportingMarginTop: AUTH_VISUAL_SPEC.spacing.headerSupportingGap.state,
        titleFontSize: isCompactHeight
          ? AUTH_VISUAL_SPEC.typography.stateTitle.compactSize
          : AUTH_VISUAL_SPEC.typography.stateTitle.standardSize,
        titleLineHeight: isCompactHeight
          ? AUTH_VISUAL_SPEC.typography.stateTitle.compactLineHeight
          : AUTH_VISUAL_SPEC.typography.stateTitle.standardLineHeight,
        supportingFontSize: AUTH_VISUAL_SPEC.typography.stateSupporting.fontSize,
        supportingLineHeight: AUTH_VISUAL_SPEC.typography.stateSupporting.lineHeight,
        supportingMaxWidth:
          maxWidth ??
          (isTablet
            ? AUTH_VISUAL_SPEC.widths.stateSupportingTabletMax
            : AUTH_VISUAL_SPEC.widths.stateSupportingPhoneMax),
      };
    }

    const resolvedBadgeWidth =
      badgeWidth ??
      clamp(
        width *
          (isTablet
            ? AUTH_VISUAL_SPEC.crest.hero.tabletFactor
            : isCompactHeight
              ? AUTH_VISUAL_SPEC.crest.hero.compactFactor
              : AUTH_VISUAL_SPEC.crest.hero.phoneFactor),
        AUTH_VISUAL_SPEC.crest.hero.min,
        isTablet ? AUTH_VISUAL_SPEC.crest.hero.tabletMax : AUTH_VISUAL_SPEC.crest.hero.phoneMax,
      );

    return {
      badgeWidth: resolvedBadgeWidth,
      brandMarginTop: AUTH_VISUAL_SPEC.spacing.headerBrandLabelGap.hero,
      titleMarginTop: isCompactHeight
        ? AUTH_VISUAL_SPEC.spacing.headerTitleGap.heroCompact
        : AUTH_VISUAL_SPEC.spacing.headerTitleGap.heroStandard,
      supportingMarginTop: AUTH_VISUAL_SPEC.spacing.headerSupportingGap.hero,
      titleFontSize: isCompactHeight
        ? AUTH_VISUAL_SPEC.typography.heroTitle.compactSize
        : AUTH_VISUAL_SPEC.typography.heroTitle.standardSize,
      titleLineHeight: isCompactHeight
        ? AUTH_VISUAL_SPEC.typography.heroTitle.compactLineHeight
        : AUTH_VISUAL_SPEC.typography.heroTitle.standardLineHeight,
      supportingFontSize: AUTH_VISUAL_SPEC.typography.heroSupporting.fontSize,
      supportingLineHeight: AUTH_VISUAL_SPEC.typography.heroSupporting.lineHeight,
      supportingMaxWidth:
        maxWidth ??
        (isTablet
          ? AUTH_VISUAL_SPEC.widths.heroSupportingTabletMax
          : AUTH_VISUAL_SPEC.widths.heroSupportingPhoneMax),
    };
  }, [badgeWidth, isCompactHeight, isTablet, maxWidth, variant, width]);

  return (
    <View style={[styles.container, containerStyle]}>
      <AnimatedShield badgeWidth={metrics.badgeWidth} animated={animateShield} />
      {showBrandLabel ? (
        <Text
          style={[
            styles.brandLabel,
            {
              marginTop: metrics.brandMarginTop,
              color: accentColor,
            },
          ]}
          accessibilityRole="text"
        >
          {AUTH_COPY.brand}
        </Text>
      ) : null}
      <Text
        style={[
          styles.title,
          {
            marginTop: showBrandLabel ? metrics.titleMarginTop : metrics.brandMarginTop,
            fontSize: metrics.titleFontSize,
            lineHeight: metrics.titleLineHeight,
            color: textColor,
          },
          titleStyle,
        ]}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {supporting ? (
        <Text
          style={[
            styles.supporting,
            {
              marginTop: metrics.supportingMarginTop,
              maxWidth: metrics.supportingMaxWidth,
              fontSize: metrics.supportingFontSize,
              lineHeight: metrics.supportingLineHeight,
              color: mutedColor,
            },
            supportingStyle,
          ]}
          accessibilityRole="text"
        >
          {supporting}
        </Text>
      ) : null}
    </View>
  );
}

export default memo(AuthBrandLockup);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  brandLabel: {
    fontSize: AUTH_VISUAL_SPEC.typography.brandLabel.fontSize,
    fontWeight: AUTH_VISUAL_SPEC.typography.brandLabel.fontWeight,
    letterSpacing: AUTH_VISUAL_SPEC.typography.brandLabel.letterSpacing,
    textTransform: 'uppercase',
  },
  title: {
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  supporting: {
    textAlign: 'center',
  },
});
