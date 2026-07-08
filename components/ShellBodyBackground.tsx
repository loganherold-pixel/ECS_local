import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { BODY_BG, BODY_BG_MOBILE } from '../lib/chromeAssets';
import { useTheme } from '../context/ThemeContext';
import { resolveShellChromeTheme } from '../lib/ui/shellChromeTheme';

export default function ShellBodyBackground({
  topInset,
  bottomInset,
  deferImage = false,
  useLightweightImage = false,
}: {
  topInset: number;
  bottomInset: number;
  deferImage?: boolean;
  useLightweightImage?: boolean;
}) {
  const { palette, colors, effectiveTheme } = useTheme();
  const shellChrome = resolveShellChromeTheme({ effectiveTheme, palette, colors });
  const backgroundSource = useLightweightImage ? BODY_BG_MOBILE : BODY_BG;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.clipFrame,
        {
          top: topInset,
          bottom: bottomInset,
        },
      ]}
    >
      {deferImage ? (
        <View style={[styles.imageFrame, { backgroundColor: colors.bgElevated }]} />
      ) : (
        <Image
          source={backgroundSource}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority="high"
          transition={0}
          recyclingKey={useLightweightImage ? 'ecs-shell-body-background-mobile' : 'ecs-shell-body-background'}
          style={styles.imageFrame}
        />
      )}
      <View style={[styles.scrim, { backgroundColor: shellChrome.bodyScrim }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  clipFrame: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  imageFrame: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
  },
});
