import React from 'react';

import PowerModuleRiveWidget from './PowerModuleRiveWidget';
import type { BluPowerModuleRiveProps } from './BluPowerModuleFallback';

export default function BluPowerModuleRive({
  batteryPercent,
  inputWatts,
  outputWatts,
  isOnline,
  style,
  testID,
}: BluPowerModuleRiveProps) {
  return (
    <PowerModuleRiveWidget
      hasEcsData={isOnline}
      batteryPercent={batteryPercent}
      inputWatts={inputWatts}
      outputWatts={outputWatts}
      style={style}
      testID={testID}
    />
  );
}
