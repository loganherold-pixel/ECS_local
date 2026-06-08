import React from 'react';
import { Redirect } from 'expo-router';
import { TripConfidenceFixtureQaScreen } from '../../components/tripBuilder/TripConfidenceFixtureQaScreen';
import { isTripConfidenceQaHarnessEnabled } from '../../lib/tripBuilder/tripConfidenceQaFixtures';

export function isTripConfidenceQaRouteEnabled(): boolean {
  return isTripConfidenceQaHarnessEnabled();
}

export default function TripConfidenceQaRoute() {
  if (!isTripConfidenceQaRouteEnabled()) {
    return <Redirect href="/" />;
  }

  return <TripConfidenceFixtureQaScreen />;
}
