import React from 'react';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type RouteGuidanceProgressRiveProps = {
  progressPercent: number | null | undefined;
  isActive: boolean;
  isOffline?: boolean | null;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  fallback?: ReactNode;
};

export default function RouteGuidanceProgressRive({ fallback }: RouteGuidanceProgressRiveProps) {
  return <>{fallback ?? null}</>;
}
