# Bluetooth Unified Scanner Troubleshooting

Use this checklist when Scan produces an empty list even though devices are nearby.

1. Confirm the manual scan path logs `[BT_SCAN] scan_button_pressed`.
2. Check readiness logs before scan start: permissions, adapter state, runtime support, and `[BT_SCAN] scan_started`.
3. Verify each discovery lane reports independently:
   - BLE: raw sightings, normalized devices, and upserts.
   - EcoFlow API: `[BT_SCAN:ECOFLOW]` edge function start, success/failure, device count, and Glacier detection.
   - Classic Bluetooth: paired-device support or an explicit unsupported reason.
   - Mock: disabled unless explicitly enabled.
4. For BLE callbacks, look for `[BT_SCAN] device_raw_seen`, `[BT_SCAN] device_normalized`, and `[BT_SCAN] device_upserted`.
5. If a device is not visible, look for `[BT_SCAN] device_filtered_out` or `[BT_SCAN] device_dropped` and its reason.
6. Unknown or unnamed devices should still appear. A missing hardware id should only be dropped when there is no stable fallback from source, name, manufacturer data, RSSI bucket, or timestamp bucket.
7. Brand matching should improve labels and connection flow only. It must not suppress unknown devices.
8. EcoFlow API failures should show as an API source failure while BLE results remain available.
9. V Peak/Veepeak OBD2 devices should route to telemetry and, once connected and decoded, emit `[OBD2] telemetry_received` and `[OBD2] telemetry_store_updated`.
10. After telemetry is live, confirm vehicle/resource consumers use the live store state before investigating ECS or Dispatch advisory output.
