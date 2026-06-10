import React from 'react';
import { Redirect } from 'expo-router';

import { HardwareTelemetryQualificationQaScreen } from '../../components/qa/HardwareTelemetryQualificationQaScreen';
import { isHardwareTelemetryQaHarnessEnabled } from '../../src/telemetry/hardwareTelemetryQualification';

export function isHardwareTelemetryQaRouteEnabled(): boolean {
  return isHardwareTelemetryQaHarnessEnabled();
}

export default function HardwareTelemetryQaRoute() {
  if (!isHardwareTelemetryQaRouteEnabled()) {
    return <Redirect href="/" />;
  }

  return <HardwareTelemetryQualificationQaScreen />;
}
