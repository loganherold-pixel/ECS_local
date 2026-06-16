import React from 'react';
import { Redirect } from 'expo-router';

import { RouteOverlayFixtureQaScreen } from '../../components/navigate/RouteOverlayFixtureQaScreen';
import { isRouteOverlayQaHarnessEnabled } from '../../lib/map/routeOverlayQaFixtures';

export function isRouteOverlayQaRouteEnabled(): boolean {
  return isRouteOverlayQaHarnessEnabled();
}

export default function RouteOverlayQaRoute() {
  if (!isRouteOverlayQaRouteEnabled()) {
    return <Redirect href="/dashboard" />;
  }

  return <RouteOverlayFixtureQaScreen />;
}

