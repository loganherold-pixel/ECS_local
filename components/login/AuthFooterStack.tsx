import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { AUTH_VISUAL_SPEC } from '../../lib/auth/authVisualSpec';

type AuthFooterStackProps = {
  children?: React.ReactNode;
  version?: string;
  withDivider?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

export default function AuthFooterStack({
  children,
  version,
  withDivider = false,
  containerStyle,
}: AuthFooterStackProps) {
  return (
    <View style={[styles.container, withDivider ? styles.containerWithDivider : null, containerStyle]}>
      {children}
      {version ? <Text style={styles.versionText}>v{version}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    gap: AUTH_VISUAL_SPEC.spacing.footerInternalGap,
    paddingHorizontal: AUTH_VISUAL_SPEC.spacing.footerPaddingX,
  },
  containerWithDivider: {
    paddingTop: AUTH_VISUAL_SPEC.spacing.footerDividerPaddingTop,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  versionText: {
    marginTop: AUTH_VISUAL_SPEC.spacing.footerVersionGap,
    fontSize: AUTH_VISUAL_SPEC.typography.footerVersion.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.footerVersion.lineHeight,
    fontWeight: AUTH_VISUAL_SPEC.typography.footerVersion.fontWeight,
    letterSpacing: AUTH_VISUAL_SPEC.typography.footerVersion.letterSpacing,
    color: 'rgba(230,237,243,0.36)',
  },
});
