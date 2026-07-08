import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { BODY_BG } from '../lib/chromeAssets';
import { useTheme } from '../context/ThemeContext';
import { resolveShellChromeTheme } from '../lib/ui/shellChromeTheme';

export default function ShellBodyBackground({
  topInset,
  bottomInset,
}: {
  topInset: number;
  bottomInset: number;
}) {
  const { palette, colors, effectiveTheme } = useTheme();
  const shellChrome = resolveShellChromeTheme({ effectiveTheme, palette, colors });

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
      <Image
        source={BODY_BG}
        contentFit="cover"
        cachePolicy="memory-disk"
        priority="high"
        transition={0}
        recyclingKey="ecs-shell-body-background"
        style={styles.imageFrame}
      />
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
