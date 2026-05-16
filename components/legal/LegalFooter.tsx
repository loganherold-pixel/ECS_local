import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { COMPACT_LEGAL_LINES, SHORT_LEGAL_FOOTER } from '../../lib/legal';

type LegalFooterVariant = 'compact' | 'minimal';

interface LegalFooterProps {
  variant?: LegalFooterVariant;
  style?: StyleProp<ViewStyle>;
}

export default function LegalFooter({ variant = 'compact', style }: LegalFooterProps) {
  const lines = variant === 'minimal' ? [SHORT_LEGAL_FOOTER] : COMPACT_LEGAL_LINES;

  return (
    <View style={[styles.footer, variant === 'minimal' ? styles.footerMinimal : null, style]}>
      {lines.map((line) => (
        <Text key={line} style={[styles.footerText, variant === 'minimal' ? styles.footerTextMinimal : null]}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    width: '100%',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 10,
  },
  footerMinimal: {
    paddingHorizontal: 14,
  },
  footerText: {
    color: 'rgba(230,237,243,0.46)',
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  footerTextMinimal: {
    color: 'rgba(230,237,243,0.42)',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
