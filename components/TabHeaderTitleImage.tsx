import React, { useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { TACTICAL } from '../lib/theme';

const TITLE_SIDE_GUTTER = 18;
const TITLE_MAX_FONT_SIZE = 22;
const TITLE_MIN_FONT_SIZE = 17;

const TITLE_TEXT_OVERRIDES: Record<string, string> = {
  dispatch: 'Dispatch',
  'navigation command': 'Navigation Control',
};

type TabHeaderTitleImageProps = {
  title: string;
  subtitle?: string | null;
  edgeSlotWidth: number;
  leftEdgeSlotWidth?: number;
  rightEdgeSlotWidth?: number;
  fontSizeReferenceEdgeSlotWidth?: number;
  horizontalPadding: number;
  maxContainerWidth: number;
  sideGutter?: number;
  minimumFontScale?: number;
  fallback: React.ReactNode;
};

function getBannerTitle(title: string): string {
  const normalized = title.trim();
  return TITLE_TEXT_OVERRIDES[normalized.toLowerCase()] ?? normalized;
}

export default function TabHeaderTitleImage({
  title,
  subtitle,
  edgeSlotWidth,
  leftEdgeSlotWidth,
  rightEdgeSlotWidth,
  fontSizeReferenceEdgeSlotWidth,
  horizontalPadding,
  maxContainerWidth,
  sideGutter = TITLE_SIDE_GUTTER,
  minimumFontScale = 0.82,
  fallback,
}: TabHeaderTitleImageProps) {
  const { width } = useWindowDimensions();
  const bannerTitle = getBannerTitle(title);
  const titleStyle = useMemo(() => {
    const shellWidth = Math.min(width, maxContainerWidth);
    const measuredLeftSlotWidth = leftEdgeSlotWidth ?? edgeSlotWidth;
    const measuredRightSlotWidth = rightEdgeSlotWidth ?? edgeSlotWidth;
    const referenceEdgeSlotWidth = fontSizeReferenceEdgeSlotWidth ?? edgeSlotWidth;
    const availableWidth = Math.max(
      1,
      shellWidth - measuredLeftSlotWidth - measuredRightSlotWidth - horizontalPadding * 2 - sideGutter,
    );
    const referenceAvailableWidth = Math.max(
      1,
      shellWidth - referenceEdgeSlotWidth * 2 - horizontalPadding * 2 - TITLE_SIDE_GUTTER,
    );
    const compactScale = Math.min(1, Math.max(0, (referenceAvailableWidth - 220) / 160));
    const fontSize =
      TITLE_MIN_FONT_SIZE + (TITLE_MAX_FONT_SIZE - TITLE_MIN_FONT_SIZE) * compactScale;

    return {
      maxWidth: availableWidth,
      fontSize,
      lineHeight: Math.ceil(fontSize + 5),
    };
  }, [
    edgeSlotWidth,
    fontSizeReferenceEdgeSlotWidth,
    horizontalPadding,
    leftEdgeSlotWidth,
    maxContainerWidth,
    rightEdgeSlotWidth,
    sideGutter,
    width,
  ]);

  if (!bannerTitle) {
    return <>{fallback}</>;
  }

  return (
    <View style={[styles.titleStack, { maxWidth: titleStyle.maxWidth }]}>
      <Text
        style={[styles.titleText, titleStyle]}
        numberOfLines={1}
        adjustsFontSizeToFit={minimumFontScale < 1}
        minimumFontScale={minimumFontScale}
        ellipsizeMode={minimumFontScale >= 1 ? 'clip' : 'tail'}
        allowFontScaling={false}
        accessibilityRole="header"
      >
        {bannerTitle}
      </Text>
      {subtitle ? (
        <Text
          style={[styles.subtitleText, { width: titleStyle.maxWidth, maxWidth: titleStyle.maxWidth }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          ellipsizeMode="tail"
          allowFontScaling={false}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  titleStack: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    alignSelf: 'center',
    color: TACTICAL.amber,
    fontWeight: '900',
    letterSpacing: 1.1,
    textAlign: 'center',
    textTransform: 'none',
    includeFontPadding: false,
    textShadowColor: 'rgba(0, 0, 0, 0.34)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  subtitleText: {
    marginTop: 0,
    alignSelf: 'center',
    color: TACTICAL.amber,
    opacity: 0.72,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    fontStyle: 'italic',
    letterSpacing: 0,
    textAlign: 'center',
    includeFontPadding: true,
    textShadowColor: 'rgba(0, 0, 0, 0.28)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
