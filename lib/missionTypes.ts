// ============================================================
// ECS MISSION MODE — TYPE DEFINITIONS
// ============================================================
// Operational data models for active expeditions.
// These are separate from planning/builder types.
// ============================================================

import type { TerrainProfile } from './terrainProfile';


export type MissionStatus = 'draft' | 'staged' | 'active' | 'completed' | 'archived';
export type ExpeditionItemStatus = 'missing' | 'packed' | 'deployed' | 'consumed' | 'lost';
export type ExpeditionEventType =
  | 'EXPEDITION_LAUNCHED'
  | 'ITEM_USED'
  | 'ITEM_CONSUMED'
  | 'ITEM_LOST'
  | 'ITEM_DEPLOYED'
  | 'NOTE_ADDED'
  | 'CHECKPOINT'
  | 'INCIDENT'
  | 'WATER_USED'
  | 'FUEL_USED'
  | 'FUEL_LOGGED'
  | 'POWER_UPDATED'
  | 'POWER_CONFIGURED'
  | 'STATUS_CHANGED'
  | 'MISSION_COMPLETED'
  | 'MISSION_ARCHIVED';

// ── Telemetry Config (per expedition) ────────────────────────
export interface TelemetryConfig {
  expeditionId: string;
  // Fuel
  fuelCapacityGal: number | null;
  fuelRemainingGal: number | null;
  fuelMpg: number | null;
  // Water
  waterCapacityL: number | null;
  waterRemainingL: number | null;
  waterDailyBurnL: number | null;
  // Power
  powerCapacityWh: number | null;
  powerRemainingWh: number | null;
  powerAvgDrawW: number | null;
  powerConfigured: boolean;
  // Distance
  distanceTraveledMi: number;
  // Timestamps
  lastFuelUpdate: string | null;
  lastWaterUpdate: string | null;
  lastPowerUpdate: string | null;
  lastUpdate: string | null;
  updatedAt: string;
}

export type TelemetryState = 'LIVE' | 'PARTIAL' | 'ATTENTION';

export type BufferLevel = 'LOW' | 'MED' | 'HIGH';

export interface TelemetryReadout {
  state: TelemetryState;
  // Fuel
  fuelRangeMi: number | null;
  fuelSafeRangeMi: number | null;
  fuelRemainingGal: number | null;
  fuelPercent: number | null;
  fuelConfigured: boolean;
  // Water
  waterAutonomyDays: number | null;
  waterRemainingL: number | null;
  waterDailyBurnL: number | null;
  waterConfigured: boolean;
  // Power
  powerPercent: number | null;
  powerRemainingWh: number | null;
  powerEstHours: number | null;
  powerAvgDrawW: number | null;
  powerConfigured: boolean;
  // Buffer
  bufferLevel: BufferLevel;
  bufferPercent: number;
  bufferLimiter: 'fuel' | 'water' | 'power' | 'none';
  // Ops
  distanceMi: number;
  durationStr: string;
  lastUpdateStr: string;
  // Criticals
  criticals: string[];
}


// ── Expedition (Operational Instance) ────────────────────────
export interface MissionExpedition {
  id: string;
  name: string;
  status: MissionStatus;
  vehicleId: string;
  vehicleName: string;
  sourceLoadoutId: string;
  snapshotId: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
  /** Phase 6A: Terrain profile for risk-aware scoring */
  terrainProfile?: TerrainProfile;
}


// ── Expedition Snapshot (Immutable) ──────────────────────────
export interface ExpeditionSnapshot {
  id: string;
  expeditionId: string;
  sourceLoadoutId: string;
  snapshotVersion: number;
  snapshotJson: SnapshotData;
  createdAt: string;
}

export interface SnapshotData {
  vehicle: {
    id: string;
    name: string;
    frameworkType: string | null;
  };
  zones: SnapshotZone[];
  categories: string[];
  items: SnapshotItem[];
  profile: {
    operatingProfile: string | null;
    peopleCount: number;
    tripLengthDays: number | null;
  };
}

export interface SnapshotZone {
  id: string;
  name: string;
  zoneType: string;
  slotCount: number;
}

export interface SnapshotItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  isCritical: boolean;
  isPacked: boolean;
  storageLocation: string | null;
  weightLbs: number | null;
  notes: string | null;
}

// ── Expedition Items (Operational Ledger) ────────────────────
export interface ExpeditionItem {
  id: string;
  expeditionId: string;
  snapshotItemId: string;
  name: string;
  categoryKey: string;
  zoneId: string | null;
  qtyPlanned: number;
  qtyPacked: number;
  qtyUsed: number;
  critical: boolean;
  status: ExpeditionItemStatus;
  lastChangedAt: string;
}

// ── Expedition Events (Timeline) ─────────────────────────────
export interface ExpeditionEvent {
  id: string;
  expeditionId: string;
  type: ExpeditionEventType;
  payload: Record<string, any>;
  createdAt: string;
}

// ── Expedition Notes ─────────────────────────────────────────
export interface ExpeditionNote {
  id: string;
  expeditionId: string;
  text: string;
  tag: string | null;
  createdAt: string;
}

// ── Expedition Checkpoints ───────────────────────────────────
export interface ExpeditionCheckpoint {
  id: string;
  expeditionId: string;
  label: string;
  lat: number | null;
  lng: number | null;
  timestamp: string;
  meta: Record<string, any> | null;
}

// ── Quick Action Types ───────────────────────────────────────
export interface QuickActionPayload {
  type: 'note' | 'checkpoint' | 'water_used' | 'item_used';
  text?: string;
  itemId?: string;
  quantity?: number;
  label?: string;
}

// ── Mission Summary Stats ────────────────────────────────────
export interface MissionStats {
  totalItems: number;
  packedItems: number;
  usedItems: number;
  consumedItems: number;
  lostItems: number;
  criticalItems: number;
  criticalMissing: number;
  eventCount: number;
  noteCount: number;
  checkpointCount: number;
  waterUsedLiters: number;
  elapsedHours: number;
}

