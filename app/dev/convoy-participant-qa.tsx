import React from 'react';
import { Redirect } from 'expo-router';

import { ConvoyParticipantFixtureQaScreen } from '../../components/convoy/ConvoyParticipantFixtureQaScreen';
import { isConvoyParticipantQaHarnessEnabled } from '../../lib/convoy/convoyParticipantQaFixtures';

export function isConvoyParticipantQaRouteEnabled(): boolean {
  return isConvoyParticipantQaHarnessEnabled();
}

export default function ConvoyParticipantQaRoute() {
  if (!isConvoyParticipantQaRouteEnabled()) {
    return <Redirect href="/" />;
  }

  return <ConvoyParticipantFixtureQaScreen />;
}
