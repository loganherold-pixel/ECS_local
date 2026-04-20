import React from 'react';
import { StyleProp, Text, TextProps, TextStyle } from 'react-native';

import { ECS_TEXT, type ECSTextVariant } from '../lib/ecsTypographyTokens';

type BaseProps = TextProps & {
  variant?: ECSTextVariant;
  style?: StyleProp<TextStyle>;
};

export function ECSText({ variant = 'body', style, children, ...props }: BaseProps) {
  return (
    <Text {...props} style={[ECS_TEXT[variant], style]}>
      {children}
    </Text>
  );
}

export function ECSSectionTitle(props: Omit<BaseProps, 'variant'>) {
  return <ECSText variant="sectionTitle" {...props} />;
}

export function ECSCardTitle(props: Omit<BaseProps, 'variant'>) {
  return <ECSText variant="cardTitle" {...props} />;
}

export function ECSStatLabel(props: Omit<BaseProps, 'variant'>) {
  return <ECSText variant="statLabel" {...props} />;
}

export function ECSStatValue(props: Omit<BaseProps, 'variant'>) {
  return <ECSText variant="statValue" {...props} />;
}

export function ECSHelperText(props: Omit<BaseProps, 'variant'>) {
  return <ECSText variant="helper" {...props} />;
}
