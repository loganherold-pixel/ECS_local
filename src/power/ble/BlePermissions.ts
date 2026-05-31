/**
 * BlePermissions — runtime permission helper for BLE power-system connectivity.
 *
 * Phase 2A — scaffold only. No UI wiring, no connector code.
 *
 * Android 12+ (API 31+):
 *   BLUETOOTH_SCAN and BLUETOOTH_CONNECT are runtime permissions.
 *   ACCESS_FINE_LOCATION is still requested because some BLE stacks/OEM builds
 *   suppress scan callbacks when location remains denied.
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

const ANDROID_PERMISSION_REQUEST_TIMEOUT_MS = 8_000;
const ANDROID_PERMISSION_REQUEST_TIMEOUT = "android.permission.REQUEST_TIMEOUT";
const ANDROID_PERMISSION_UNKNOWN_ERROR = "android.permission.UNKNOWN_ERROR";

type PermissionsAndroidModule = typeof import("react-native")["PermissionsAndroid"];

let androidPermissionRequestInFlight: Promise<BlePermissionResult> | null = null;

export function formatBlePermissionDeniedMessage(missing: string[] = []): string {
  if (missing.includes("platform")) {
    return "Bluetooth scanning is not available in web preview. Open ECS on a mobile device to scan and connect.";
  }

  const requiresLocation = missing.includes(ANDROID_BLE_PERMISSIONS.ACCESS_FINE_LOCATION);
  if (requiresLocation) {
    return "Bluetooth permission is required to scan. Android also requires location permission for nearby Bluetooth discovery.";
  }

  return "Bluetooth permission is required to scan.";
}

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

function logBlePermissionEvent(event: string, details: Record<string, unknown>): void {
  try {
    console.log("[BLU_SCAN]", event, details);
  } catch {
    // Best effort diagnostic logging only.
  }
}

function getRequestedAndroidBlePermissions(apiLevel: number): string[] {
  if (apiLevel >= 31) {
    return [
      ANDROID_BLE_PERMISSIONS.BLUETOOTH_SCAN,
      ANDROID_BLE_PERMISSIONS.BLUETOOTH_CONNECT,
      ANDROID_BLE_PERMISSIONS.ACCESS_FINE_LOCATION,
    ];
  }
  return [ANDROID_BLE_PERMISSIONS.ACCESS_FINE_LOCATION];
}

async function withPermissionTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  eventDetails: Record<string, unknown>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      timer = null;
      logBlePermissionEvent("ble_permission_request_timeout", {
        ...eventDetails,
        timeoutMs,
      });
      const timeoutError = new Error(ANDROID_PERMISSION_REQUEST_TIMEOUT);
      (timeoutError as any).permission = eventDetails.permission;
      reject(timeoutError);
    }, timeoutMs);

    promise.then(
      (value) => {
        if (timer) clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (timer) clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function checkAndroidBlePermissions(
  PermissionsAndroid: PermissionsAndroidModule,
  apiLevel: number,
): Promise<BlePermissionResult> {
  const missing: string[] = [];

  if (apiLevel >= 31) {
    const scanGranted = await PermissionsAndroid.check(
      ANDROID_BLE_PERMISSIONS.BLUETOOTH_SCAN as any
    );
    const connectGranted = await PermissionsAndroid.check(
      ANDROID_BLE_PERMISSIONS.BLUETOOTH_CONNECT as any
    );
    const locationGranted = await PermissionsAndroid.check(
      ANDROID_BLE_PERMISSIONS.ACCESS_FINE_LOCATION as any
    );

    if (!scanGranted) missing.push(ANDROID_BLE_PERMISSIONS.BLUETOOTH_SCAN);
    if (!connectGranted) missing.push(ANDROID_BLE_PERMISSIONS.BLUETOOTH_CONNECT);
    if (!locationGranted) missing.push(ANDROID_BLE_PERMISSIONS.ACCESS_FINE_LOCATION);
  } else {
    const locationGranted = await PermissionsAndroid.check(
      ANDROID_BLE_PERMISSIONS.ACCESS_FINE_LOCATION as any
    );

    if (!locationGranted) missing.push(ANDROID_BLE_PERMISSIONS.ACCESS_FINE_LOCATION);
  }

  return { ok: missing.length === 0, missing };
}

async function requestAndroidBlePermissions(
  PermissionsAndroid: PermissionsAndroidModule,
  apiLevel: number,
): Promise<BlePermissionResult> {
  const missing: string[] = [];
  const requested = getRequestedAndroidBlePermissions(apiLevel);
  const eventDetails = {
    platform: Platform.OS,
    apiLevel,
    requested,
  };

  logBlePermissionEvent("ble_permission_request_start", eventDetails);

  if (apiLevel >= 31) {
    // ── Android 12+ (API 31): BLUETOOTH_SCAN + BLUETOOTH_CONNECT ──
    // Request individually so a hung platform/RN request identifies the
    // exact permission instead of trapping the whole requestMultiple batch.
    for (const permission of requested) {
      logBlePermissionEvent("ble_permission_request_item_start", {
        ...eventDetails,
        permission,
      });
      const granted = await withPermissionTimeout(
        PermissionsAndroid.request(permission as any),
        ANDROID_PERMISSION_REQUEST_TIMEOUT_MS,
        { ...eventDetails, permission },
      );
      logBlePermissionEvent("ble_permission_request_item_result", {
        ...eventDetails,
        permission,
        granted,
      });

      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        missing.push(permission);
      }
    }
  } else {
    // ── Android < 12: ACCESS_FINE_LOCATION required for BLE scan ──
    const granted = await withPermissionTimeout(
      PermissionsAndroid.request(
        ANDROID_BLE_PERMISSIONS.ACCESS_FINE_LOCATION as any,
        {
          title: "Location Permission",
          message:
            "ECS needs location access to scan for nearby Bluetooth power devices.",
          buttonPositive: "Allow",
          buttonNegative: "Deny",
          buttonNeutral: "Later",
        }
      ),
      ANDROID_PERMISSION_REQUEST_TIMEOUT_MS,
      eventDetails,
    );

    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      missing.push(ANDROID_BLE_PERMISSIONS.ACCESS_FINE_LOCATION);
    }
  }

  const result = { ok: missing.length === 0, missing };
  logBlePermissionEvent("ble_permission_request_result", {
    ...eventDetails,
    ok: result.ok,
    missing: result.missing,
  });
  return result;
}

async function runAndroidBlePermissionRequest(): Promise<BlePermissionResult> {
  // Dynamic import so the module is never resolved on web/iOS bundles.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PermissionsAndroid } = require("react-native") as typeof import("react-native");

  const apiLevel = getAndroidApiLevel();
  const precheck = await checkAndroidBlePermissions(PermissionsAndroid, apiLevel);
  logBlePermissionEvent("ble_permission_precheck_result", {
    platform: Platform.OS,
    apiLevel,
    ok: precheck.ok,
    missing: precheck.missing,
  });

  if (precheck.ok) {
    return precheck;
  }

  return requestAndroidBlePermissions(PermissionsAndroid, apiLevel);
}

async function ensureAndroidBlePermissions(): Promise<BlePermissionResult> {
  if (androidPermissionRequestInFlight) {
    logBlePermissionEvent("ble_permission_request_joined", {
      platform: Platform.OS,
      apiLevel: getAndroidApiLevel(),
    });
    return androidPermissionRequestInFlight;
  }

  androidPermissionRequestInFlight = runAndroidBlePermissionRequest()
    .catch((err) => {
      const message = String((err as any)?.message ?? err ?? "unknown");
      const apiLevel = getAndroidApiLevel();
      const timedOutPermission = String((err as any)?.permission ?? "");
      const bluetoothPermissionTimedOut =
        message.includes(ANDROID_PERMISSION_REQUEST_TIMEOUT) &&
        apiLevel >= 31 &&
        (
          timedOutPermission === ANDROID_BLE_PERMISSIONS.BLUETOOTH_SCAN ||
          timedOutPermission === ANDROID_BLE_PERMISSIONS.BLUETOOTH_CONNECT ||
          timedOutPermission.length === 0
        );

      if (bluetoothPermissionTimedOut) {
        logBlePermissionEvent("ble_permission_request_timeout_bypass", {
          platform: Platform.OS,
          apiLevel,
          permission: timedOutPermission || null,
          reason: "android_bluetooth_permission_api_timeout",
          message,
        });
        return { ok: true, missing: [] };
      }

      const missing = message.includes(ANDROID_PERMISSION_REQUEST_TIMEOUT)
        ? [ANDROID_PERMISSION_REQUEST_TIMEOUT]
        : [ANDROID_PERMISSION_UNKNOWN_ERROR];
      logBlePermissionEvent("ble_permission_request_failed", {
        platform: Platform.OS,
        apiLevel,
        message,
        missing,
      });
      return { ok: false, missing };
    })
    .finally(() => {
      androidPermissionRequestInFlight = null;
    });

  return androidPermissionRequestInFlight;
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
    return ensureAndroidBlePermissions();
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
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PermissionsAndroid } = require("react-native") as typeof import("react-native");

      const apiLevel = getAndroidApiLevel();
      return checkAndroidBlePermissions(PermissionsAndroid, apiLevel);
    } catch (err) {
      console.warn("[BlePermissions] Android permission check failed:", err);
      return { ok: false, missing: [ANDROID_PERMISSION_UNKNOWN_ERROR] };
    }
  }

  return { ok: false, missing: ["platform"] };
}

