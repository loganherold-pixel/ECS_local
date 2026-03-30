/**
 * PowerDevice — provider-agnostic device descriptor for cloud power providers.
 *
 * Phase 3E-1: Multi-device selection support.
 *
 * This is distinct from the `PowerDevice` interface in PowerTelemetry.ts,
 * which represents device identity *within* a telemetry reading.
 * This type represents a discovered/registered device in the cloud catalog
 * that the user can select for monitoring.
 *
 * To avoid naming collisions in the barrel export, this type is re-exported
 * as `CatalogPowerDevice` from `src/power/index.ts`.
 */

// ── Provider identifiers ────────────────────────────────────────────────

/**
 * Canonical provider/vendor identifiers for all supported power-station
 * manufacturers. Used as the partition key in the device selection store.
 */
export type PowerProviderId =
  | "EcoFlow"
  | "Anker"
  | "Bluetti"
  | "Jackery"
  | "RedArc"
  | "GoalZero"
  | "Renogy"
  | "DakotaLithium";


// ── Catalog device descriptor ───────────────────────────────────────────

/**
 * A power device as returned by a cloud provider's device-list API.
 *
 * Provider-agnostic: every cloud provider normalises its device list into
 * this shape before it enters the app.
 */
export type PowerDevice = {
  /** Which cloud provider owns this device. */
  provider: PowerProviderId;

  /**
   * Provider-specific device identifier.
   * For EcoFlow: the `sn` / `deviceId` from the IoT Open API.
   */
  deviceId: string;

  /** Human-readable device name (may be user-assigned). */
  name?: string;

  /** Model name, e.g. "DELTA 2 Max". */
  model?: string;

  /** Product type / category from the provider API. */
  productType?: string;

  /** Hardware serial number (may differ from deviceId). */
  serial?: string;

  /** Epoch-ms when this device was last seen in a device-list response. */
  lastSeenAt?: number;
};

