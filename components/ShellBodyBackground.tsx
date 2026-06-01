import React from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';
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
      <ImageBackground
        source={BODY_BG}
        resizeMode="cover"
        imageStyle={styles.image}
        style={styles.imageFrame}
      >
        <View style={[styles.scrim, { backgroundColor: shellChrome.bodyScrim }]} />
      </ImageBackground>
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
    flex: 1,
    width: '100%',
    height: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
  },
});
