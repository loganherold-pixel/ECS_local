import React, { memo, useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { POPUP_CONTAINER_BG } from '../lib/chromeAssets';

type TextureRecipe = {
  imageOpacity: number;
  wash: string;
};

function resolveTextureRecipe(effectiveTheme: ReturnType<typeof useTheme>['effectiveTheme']): TextureRecipe {
  switch (effectiveTheme) {
    case 'light':
      return {
        imageOpacity: 0.18,
        wash: 'rgba(250, 245, 236, 0.82)',
      };
    case 'driving':
      return {
        imageOpacity: 0.42,
        wash: 'rgba(20, 25, 30, 0.48)',
      };
    case 'dark':
    default:
      return {
        imageOpacity: 0.54,
        wash: 'rgba(6, 9, 12, 0.36)',
      };
  }
}

function ECSShellTexture() {
  const { effectiveTheme } = useTheme();
  const recipe = useMemo(() => resolveTextureRecipe(effectiveTheme), [effectiveTheme]);

  return (
    <View pointerEvents="none" style={styles.layer}>
      <Image
        source={POPUP_CONTAINER_BG}
        resizeMode="cover"
        style={[styles.image, { opacity: recipe.imageOpacity }]}
      />
      <View style={[styles.wash, { backgroundColor: recipe.wash }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  wash: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default memo(ECSShellTexture);
