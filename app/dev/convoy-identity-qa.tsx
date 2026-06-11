import React from 'react';
import { Redirect } from 'expo-router';

import { ConvoyQaIdentityDiagnosticScreen } from '../../components/convoy/ConvoyQaIdentityDiagnosticScreen';
import { isConvoyQaIdentityDiagnosticAllowed } from '../../lib/convoy/convoyQaIdentityPreflight';

export function isConvoyQaIdentityDiagnosticRouteEnabled(): boolean {
  const nodeEnv = typeof process !== 'undefined' && process?.env ? process.env.NODE_ENV : undefined;
  return isConvoyQaIdentityDiagnosticAllowed({
    dev: typeof __DEV__ !== 'undefined' && __DEV__ === true,
    nodeEnv,
  });
}

export default function ConvoyIdentityQaRoute() {
  if (!isConvoyQaIdentityDiagnosticRouteEnabled()) {
    return <Redirect href="/" />;
  }

  return <ConvoyQaIdentityDiagnosticScreen />;
}
