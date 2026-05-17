import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AUTH_SURFACE } from '../../lib/auth/authSurface';

type AuthFormSurfaceProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  showCornerAccents?: boolean;
  showTopRule?: boolean;
};

export default function AuthFormSurface({
  children,
  style,
  showCornerAccents = true,
  showTopRule = true,
}: AuthFormSurfaceProps) {
  return (
    <View style={[styles.surface, style]}>
      <View pointerEvents="none" style={styles.insetWash} />
      {showTopRule ? <View pointerEvents="none" style={styles.topRule} /> : null}
      {showCornerAccents ? <View pointerEvents="none" style={styles.cornerAccentLeft} /> : null}
      {showCornerAccents ? <View pointerEvents="none" style={styles.cornerAccentRight} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: AUTH_SURFACE.panelBackground,
    borderColor: AUTH_SURFACE.panelBorder,
    borderWidth: 1,
    borderRadius: AUTH_SURFACE.panelRadius,
    paddingHorizontal: AUTH_SURFACE.panelPaddingX,
    paddingTop: AUTH_SURFACE.panelPaddingTop,
    paddingBottom: AUTH_SURFACE.panelPaddingBottom,
    shadowColor: AUTH_SURFACE.panelShadowColor,
    shadowOffset: AUTH_SURFACE.panelShadowOffset,
    shadowOpacity: AUTH_SURFACE.panelShadowOpacity,
    shadowRadius: AUTH_SURFACE.panelShadowRadius,
    elevation: AUTH_SURFACE.panelElevation,
  },
  insetWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: AUTH_SURFACE.panelInsetWash,
  },
  topRule: {
    position: 'absolute',
    top: 0,
    left: AUTH_SURFACE.panelTopRuleInset,
    right: AUTH_SURFACE.panelTopRuleInset,
    height: 1,
    backgroundColor: AUTH_SURFACE.panelTopRule,
  },
  cornerAccentLeft: {
    position: 'absolute',
    top: AUTH_SURFACE.panelCornerAccentTop,
    left: AUTH_SURFACE.panelCornerAccentInset,
    width: AUTH_SURFACE.panelCornerAccentWidth,
    height: 1,
    backgroundColor: AUTH_SURFACE.panelCornerAccent,
  },
  cornerAccentRight: {
    position: 'absolute',
    top: AUTH_SURFACE.panelCornerAccentTop,
    right: AUTH_SURFACE.panelCornerAccentInset,
    width: AUTH_SURFACE.panelCornerAccentWidth,
    height: 1,
    backgroundColor: AUTH_SURFACE.panelCornerAccent,
  },
});
