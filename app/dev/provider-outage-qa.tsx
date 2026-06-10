import React from 'react';
import { Redirect } from 'expo-router';

import { ProviderOutageFixtureQaScreen } from '../../components/qa/ProviderOutageFixtureQaScreen';
import { isProviderOutageQaHarnessEnabled } from '../../lib/qa/providerOutageNoResultsFixtures';

export function isProviderOutageQaRouteEnabled(): boolean {
  return isProviderOutageQaHarnessEnabled();
}

export default function ProviderOutageQaRoute() {
  if (!isProviderOutageQaRouteEnabled()) {
    return <Redirect href="/" />;
  }

  return <ProviderOutageFixtureQaScreen />;
}
