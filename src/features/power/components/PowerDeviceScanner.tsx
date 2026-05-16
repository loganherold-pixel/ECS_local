import React from "react";
import { Text, View } from "react-native";
import type { UnifiedScannerDevice } from "../../../../lib/unifiedScanner";

export function PowerDeviceScanner({
  devices,
}: {
  devices: UnifiedScannerDevice[];
}) {
  return (
    <View>
      <Text>Unified scanner power devices</Text>
      {devices.map((device) => (
        <Text key={`${device.provider}:${device.id}`}>
          {device.name}
        </Text>
      ))}
    </View>
  );
}
