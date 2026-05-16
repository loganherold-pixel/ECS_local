import React from 'react';
import { Redirect } from 'expo-router';
import { CampOpsVisualQaScreen } from '../../components/campops/CampOpsVisualQaScreen';

export function isCampOpsVisualQaRouteEnabled(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

export default function CampOpsVisualQaRoute() {
  if (!isCampOpsVisualQaRouteEnabled()) {
    return <Redirect href="/" />;
  }

  return <CampOpsVisualQaScreen />;
}
