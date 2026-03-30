/**
 * Power screens layout — simple Stack navigator.
 * Routes:
 *   /power        → Power Center (index)
 *   /power/devices → Manage Devices (Phase 3F-2: full device list + multi-select)
 *   /power/blu    → BLU Power Sources (Phase 1A: universal power telemetry)
 *   /power/setup  → Power Setup Wizard (Phase 8: guided multi-provider setup)
 *   /power/manage → Power Systems Management (Phase 8: view/edit connected devices)
 */

import React from 'react';
import { Stack } from 'expo-router';

export default function PowerLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        animationDuration: 200,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="devices" />
      <Stack.Screen name="blu" />
      <Stack.Screen name="setup" />
      <Stack.Screen name="manage" />
    </Stack>
  );
}




