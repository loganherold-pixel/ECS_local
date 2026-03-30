/**
 * BlePermissions — runtime permission helper for BLE power-system connectivity.
 *
 * Phase 2A — scaffold only. No UI wiring, no connector code.
 *
 * Android 12+ (API 31+):
 *   BLUETOOTH_SCAN and BLUETOOTH_CONNECT are runtime permissions.
 *   ACCESS_FINE_LOCATION is still needed on older Android for BLE scanning.
 *
 * iOS:
 *   The system prompts for Bluetooth access on first BLE usage; no explicit
 *   runtime request is needed. We return { ok: true, missing: [] } on iOS
 *   to keep the API surface consistent.
 *
 * Web:
 *   BLE is not supported. Returns { ok: false, missing: ["platform"] }.
 */

import { Platform } from "react-native";

// ── Result type ─────────────────────────────────────────────────────────
export interface BlePermissionResult {
  /** `true` if all required permissions are granted (or not applicable). */
  ok: boolean;
  /** List of permission identifiers that were denied or unavailable. */
  missing: string[];
}

// ── Android permission constants ────────────────────────────────────────
// Defined inline to avoid importing PermissionsAndroid at module scope on
// platforms where it doesn't exist (web).
const ANDROID_BLE_PERMISSIONS = {
  BLUETOOTH_SCAN: "android.permission.BLUETOOTH_SCAN",
  BLUETOOTH_CONNECT: "android.permission.BLUETOOTH_CONNECT",
  ACCESS_FINE_LOCATION: "android.permission.ACCESS_FINE_LOCATION",
} as const;

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Determine the Android API level at runtime.
 * Returns 0 on non-Android platforms or when the value is unavailable.
 */
function getAndroidApiLevel(): number {
  if (Platform.OS !== "android") return 0;
  // Platform.Version is a number on Android (API level).
  return typeof Platform.Version === "number" ? Platform.Version : 0;
}

// ── Main export ─────────────────────────────────────────────────────────

/**
 * Ensure all BLE-related runtime permissions are granted.
 *
 * Call this before attempting any BLE scan or connection. The function is
 * safe to call on any platform — it returns immediately on iOS/web.
 *
 * @returns A promise resolving to `{ ok, missing }`.
 */
export async function ensureBlePermissions(): Promise<BlePermissionResult> {
  // ── Web — BLE not supported ───────────────────────────────────────
  if (Platform.OS === "web") {
    return { ok: false, missing: ["platform"] };
  }

  // ── iOS — system handles Bluetooth prompts automatically ──────────
  if (Platform.OS === "ios") {
    return { ok: true, missing: [] };
  }

  // ── Android — request runtime permissions ─────────────────────────
  if (Platform.OS === "android") {
    try {
      // Dynamic import so the module is never resolved on web/iOS bundles.
      const { PermissionsAndroid } = require("react-native") as typeof import("react-native");

      const apiLevel = getAndroidApiLevel();
      const missing: string[] = [];

      if (apiLevel >= 31) {
        // ── Android 12+ (API 31): BLUETOOTH_SCAN + BLUETOOTH_CONNECT ──
        const results = await PermissionsAndroid.requestMultiple([
          ANDROID_BLE_PERMISSIONS.BLUETOOTH_SCAN as any,
          ANDROID_BLE_PERMISSIONS.BLUETOOTH_CONNECT as any,
        ]);

        if (
          results[ANDROID_BLE_PERMISSIONS.BLUETOOTH_SCAN] !==
          PermissionsAndroid.RESULTS.GRANTED
        ) {
          missing.push(ANDROID_BLE_PERMISSIONS.BLUETOOTH_SCAN);
        }

        if (
          results[ANDROID_BLE_PERMISSIONS.BLUETOOTH_CONNECT] !==
          PermissionsAndroid.RESULTS.GRANTED
        ) {
          missing.push(ANDROID_BLE_PERMISSIONS.BLUETOOTH_CONNECT);
        }
      } else {
        // ── Android < 12: ACCESS_FINE_LOCATION required for BLE scan ──
        const granted = await PermissionsAndroid.request(
          ANDROID_BLE_PERMISSIONS.ACCESS_FINE_LOCATION as any,
          {
            title: "Location Permission",
            message:
              "ECS needs location access to scan for nearby Bluetooth power devices.",
            buttonPositive: "Allow",
            buttonNegative: "Deny",
            buttonNeutral: "Later",
          }
        );

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          missing.push(ANDROID_BLE_PERMISSIONS.ACCESS_FINE_LOCATION);
        }
      }

      return { ok: missing.length === 0, missing };
    } catch (err) {
      console.warn("[BlePermissions] Android permission request failed:", err);
      return { ok: false, missing: ["android.permission.UNKNOWN_ERROR"] };
    }
  }

  // ── Fallback for unknown platforms ────────────────────────────────
  return { ok: false, missing: ["platform"] };
}

/**
 * Quick check: are BLE permissions already granted (no prompts)?
 *
 * Useful for UI indicators that show permission state without triggering
 * the system dialog.
 */
export async function checkBlePermissions(): Promise<BlePermissionResult> {
  if (Platform.OS === "web") {
    return { ok: false, missing: ["platform"] };
  }

  if (Platform.OS === "ios") {
    // iOS doesn't expose a pre-check for Bluetooth permission state
    // without triggering the prompt, so we optimistically return ok.
    return { ok: true, missing: [] };
  }

  if (Platform.OS === "android") {
    try {
      const { PermissionsAndroid } = require("react-native") as typeof import("react-native");

      const apiLevel = getAndroidApiLevel();
      const missing: string[] = [];

      if (apiLevel >= 31) {
        const scanGranted = await PermissionsAndroid.check(
          ANDROID_BLE_PERMISSIONS.BLUETOOTH_SCAN as any
        );
        const connectGranted = await PermissionsAndroid.check(
          ANDROID_BLE_PERMISSIONS.BLUETOOTH_CONNECT as any
        );

        if (!scanGranted) missing.push(ANDROID_BLE_PERMISSIONS.BLUETOOTH_SCAN);
        if (!connectGranted) missing.push(ANDROID_BLE_PERMISSIONS.BLUETOOTH_CONNECT);
      } else {
        const locationGranted = await PermissionsAndroid.check(
          ANDROID_BLE_PERMISSIONS.ACCESS_FINE_LOCATION as any
        );

        if (!locationGranted) missing.push(ANDROID_BLE_PERMISSIONS.ACCESS_FINE_LOCATION);
      }

      return { ok: missing.length === 0, missing };
    } catch (err) {
      console.warn("[BlePermissions] Android permission check failed:", err);
      return { ok: false, missing: ["android.permission.UNKNOWN_ERROR"] };
    }
  }

  return { ok: false, missing: ["platform"] };
}

