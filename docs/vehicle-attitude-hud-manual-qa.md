# Vehicle Attitude HUD Manual QA

Use this checklist after changes to `VehicleAttitudeStage`, Attitude Monitor, or Attitude Command.

## Widget Composition

- Confirm the 2x1 Attitude Monitor image is centered in its widget container.
- Confirm the 2x2 Attitude Command image is centered in its widget container.
- Confirm both widgets use the selected vehicle image from the 21-image manifest.
- Confirm the full composite image is visible with no cropping or stretching.
- Confirm the baked orange brackets, teal tick tracks, background, vehicle glow, side profile, and rear profile are not redrawn or altered.
- Confirm the side profile remains on the left.
- Confirm the rear profile remains on the right.
- Confirm pitch remains assigned to the left side-profile panel.
- Confirm roll remains assigned to the right rear-profile panel.

## Readouts And Zero

- Confirm Pitch appears below the left side profile.
- Confirm Roll appears below the right rear profile.
- Confirm readout values use one decimal place and a degree symbol.
- Confirm invalid telemetry is shown as `0.0°`, not `NaN` or `Infinity`.
- Confirm out-of-range telemetry still shows the actual readout value while only the visual hash travel clamps.
- Confirm Zero sits bottom-center between the inner brackets.
- Confirm Zero is nudged slightly right of exact mathematical center.
- Confirm Zero remains clickable in both Attitude Monitor and Attitude Command.

## Live Hash Indicators

- Confirm four glowing ECS tactical hash indicators are visible.
- Confirm pitch moves only the two side-profile hash indicators.
- Confirm roll moves only the two rear-profile hash indicators.
- Confirm each paired side moves opposite its partner to show tilt direction.
- Confirm hash indicators ride on the baked teal tick tracks.
- Confirm hash indicators clamp at the configured max pitch and roll limits.
- Confirm hash indicators stay aligned during portrait and landscape rotation.
- Confirm the vehicle image remains static while only readouts and hash indicators update.

## Controls And Pointer Safety

- Confirm existing Attitude Command controls remain visible.
- Confirm existing Attitude Command controls remain clickable.
- Confirm passive image, SVG/hash, and readout layers do not block controls.
- Confirm widget-specific child controls render above the passive attitude layers.
- Confirm Zero tap calls the existing zero/calibration behavior.
- Confirm Zero long-press resets calibration where that behavior is available.

## Rotation Checks

- Rotate from portrait to landscape and confirm the image remains centered.
- Rotate from landscape back to portrait and confirm the image remains centered.
- Confirm screen/device-frame pitch and roll do not swap or invert incorrectly after rotation.
- Confirm vehicle-frame telemetry remains stable and unmodified by screen orientation.
- Confirm pitch still controls the side profile after rotation.
- Confirm roll still controls the rear profile after rotation.
