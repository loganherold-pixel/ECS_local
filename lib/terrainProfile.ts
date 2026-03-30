// ============================================================
// ECS TERRAIN PROFILE — Phase 6A
// ============================================================
// Lightweight terrain profile model captured during Expedition
// setup (or derived from current route) that drives risk scoring.
//
// Acquisition rules:
//   1. If user selects terrain in Expedition Wizard → use that
//   2. If not selected → default to "mixed" with "moderate" assumptions
//
// Every active mission MUST have a terrainProfile at runtime.
// ============================================================

import { Platform } from 'react-native';
import type { EcsTerrain } from './expeditionTypes';

// ── Core Terrain Profile Types ──────────────────────────────

export type TerrainType =
  | 'highway'
  | 'graded_dirt'
  | 'forest_road'
  | 'rocky'
  | 'sand'
  | 'snow_ice'
  | 'mud'
  | 'mixed';

export type GradeLevel = 'low' | 'moderate' | 'high';
export type SideSlopeRisk = 'low' | 'moderate' | 'high';
export type WaterCrossingRisk = 'none' | 'possible' | 'likely';
export type TractionLevel = 'good' | 'variable' | 'poor';
export type RemotenessLevel = 'low' | 'moderate' | 'high';

/** Per-mission terrain profile — drives risk scoring */
export interface TerrainProfile {
  terrainType: TerrainType;
  steepGrade: GradeLevel;
  sideSlopeRisk: SideSlopeRisk;
  waterCrossings: WaterCrossingRisk;
  traction: TractionLevel;
  remoteness: RemotenessLevel;
}

// ── Default Profile ─────────────────────────────────────────

/** Default terrain profile: mixed terrain with moderate assumptions */
export const DEFAULT_TERRAIN_PROFILE: Readonly<TerrainProfile> = {
  terrainType: 'mixed',
  steepGrade: 'moderate',
  sideSlopeRisk: 'moderate',
  waterCrossings: 'possible',
  traction: 'variable',
  remoteness: 'moderate',
};

/** Create a fresh default terrain profile (mutable copy) */
export function createDefaultTerrainProfile(): TerrainProfile {
  return { ...DEFAULT_TERRAIN_PROFILE };
}

// ── Derivation from EcsTerrain ──────────────────────────────
// Maps the existing expedition wizard terrain selection (EcsTerrain)
// into a full TerrainProfile with sensible defaults per biome.

const TERRAIN_DERIVATION_MAP: Record<EcsTerrain, TerrainProfile> = {
  mountain: {
    terrainType: 'rocky',
    steepGrade: 'high',
    sideSlopeRisk: 'high',
    waterCrossings: 'possible',
    traction: 'variable',
    remoteness: 'high',
  },
  desert: {
    terrainType: 'sand',
    steepGrade: 'low',
    sideSlopeRisk: 'low',
    waterCrossings: 'none',
    traction: 'poor',
    remoteness: 'high',
  },
  forest: {
    terrainType: 'forest_road',
    steepGrade: 'moderate',
    sideSlopeRisk: 'moderate',
    waterCrossings: 'possible',
    traction: 'variable',
    remoteness: 'moderate',
  },
  snow: {
    terrainType: 'snow_ice',
    steepGrade: 'moderate',
    sideSlopeRisk: 'moderate',
    waterCrossings: 'none',
    traction: 'poor',
    remoteness: 'moderate',
  },
  mixed: {
    terrainType: 'mixed',
    steepGrade: 'moderate',
    sideSlopeRisk: 'moderate',
    waterCrossings: 'possible',
    traction: 'variable',
    remoteness: 'moderate',
  },
  coastal: {
    terrainType: 'sand',
    steepGrade: 'low',
    sideSlopeRisk: 'low',
    waterCrossings: 'possible',
    traction: 'variable',
    remoteness: 'low',
  },
};

/**
 * Derive a full TerrainProfile from an EcsTerrain biome selection.
 * Returns a mutable copy that can be further customized by the user.
 */
export function deriveTerrainProfile(ecsTerrain: EcsTerrain | null): TerrainProfile {
  if (!ecsTerrain || !TERRAIN_DERIVATION_MAP[ecsTerrain]) {
    return createDefaultTerrainProfile();
  }
  return { ...TERRAIN_DERIVATION_MAP[ecsTerrain] };
}

// ── Persistence ─────────────────────────────────────────────
// Terrain profiles are stored per-expedition in localStorage/memory.

const TAG = '[TERRAIN_PROFILE]';
const STORAGE_PREFIX = 'ecs_terrain_profile_';
const mem: Record<string, string> = {};

function sGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return mem[key] || null;
  } catch { return mem[key] || null; }
}

function sSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    mem[key] = value;
  } catch { mem[key] = value; }
}

function sRemove(key: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
    delete mem[key];
  } catch { delete mem[key]; }
}

/** Terrain profile persistence store — per expedition */
export const terrainProfileStore = {
  /**
   * Save a terrain profile for an expedition.
   * Also stores in expedition meta for cloud sync.
   */
  save(expeditionId: string, profile: TerrainProfile): void {
    const key = STORAGE_PREFIX + expeditionId;
    sSet(key, JSON.stringify(profile));
    console.log(TAG, `Saved terrain profile for expedition ${expeditionId}`);
  },

  /**
   * Load a terrain profile for an expedition.
   * Returns null if none stored (caller should use default).
   */
  load(expeditionId: string): TerrainProfile | null {
    try {
      const key = STORAGE_PREFIX + expeditionId;
      const raw = sGet(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return validateTerrainProfile(parsed);
    } catch {
      return null;
    }
  },

  /**
   * Load terrain profile with fallback to default.
   * Guarantees a valid profile is always returned.
   */
  loadOrDefault(expeditionId: string): TerrainProfile {
    return this.load(expeditionId) || createDefaultTerrainProfile();
  },

  /**
   * Remove stored terrain profile for an expedition.
   */
  remove(expeditionId: string): void {
    const key = STORAGE_PREFIX + expeditionId;
    sRemove(key);
  },
};

// ── Validation ──────────────────────────────────────────────

const VALID_TERRAIN_TYPES: TerrainType[] = [
  'highway', 'graded_dirt', 'forest_road', 'rocky', 'sand', 'snow_ice', 'mud', 'mixed',
];
const VALID_GRADE_LEVELS: GradeLevel[] = ['low', 'moderate', 'high'];
const VALID_SIDE_SLOPE: SideSlopeRisk[] = ['low', 'moderate', 'high'];
const VALID_WATER_CROSSINGS: WaterCrossingRisk[] = ['none', 'possible', 'likely'];
const VALID_TRACTION: TractionLevel[] = ['good', 'variable', 'poor'];
const VALID_REMOTENESS: RemotenessLevel[] = ['low', 'moderate', 'high'];

/**
 * Validate and sanitize a terrain profile object.
 * Returns a valid profile or null if unrecoverable.
 */
export function validateTerrainProfile(obj: any): TerrainProfile | null {
  if (!obj || typeof obj !== 'object') return null;

  const profile: TerrainProfile = {
    terrainType: VALID_TERRAIN_TYPES.includes(obj.terrainType)
      ? obj.terrainType : 'mixed',
    steepGrade: VALID_GRADE_LEVELS.includes(obj.steepGrade)
      ? obj.steepGrade : 'moderate',
    sideSlopeRisk: VALID_SIDE_SLOPE.includes(obj.sideSlopeRisk)
      ? obj.sideSlopeRisk : 'moderate',
    waterCrossings: VALID_WATER_CROSSINGS.includes(obj.waterCrossings)
      ? obj.waterCrossings : 'possible',
    traction: VALID_TRACTION.includes(obj.traction)
      ? obj.traction : 'variable',
    remoteness: VALID_REMOTENESS.includes(obj.remoteness)
      ? obj.remoteness : 'moderate',
  };

  return profile;
}

// ── Display Metadata ────────────────────────────────────────
// Used by the Expedition Wizard terrain segment UI.

export interface TerrainOptionMeta {
  value: string;
  label: string;
  icon: string;
  color: string;
}

/** Terrain type display options */
export const TERRAIN_TYPE_OPTIONS: TerrainOptionMeta[] = [
  { value: 'highway',      label: 'HIGHWAY',     icon: 'speedometer-outline', color: '#78909C' },
  { value: 'graded_dirt',  label: 'GRADED DIRT',  icon: 'trail-sign-outline',  color: '#A1887F' },
  { value: 'forest_road',  label: 'FOREST ROAD',  icon: 'leaf-outline',        color: '#66BB6A' },
  { value: 'rocky',        label: 'ROCKY',        icon: 'triangle-outline',    color: '#90A4AE' },
  { value: 'sand',         label: 'SAND',         icon: 'sunny-outline',       color: '#FFB74D' },
  { value: 'snow_ice',     label: 'SNOW / ICE',   icon: 'snow-outline',        color: '#81D4FA' },
  { value: 'mud',          label: 'MUD',          icon: 'water-outline',       color: '#8D6E63' },
  { value: 'mixed',        label: 'MIXED',        icon: 'layers-outline',      color: '#CE93D8' },
];

/** Three-level option sets for grade, slope, traction, remoteness */
export const THREE_LEVEL_OPTIONS: TerrainOptionMeta[] = [
  { value: 'low',      label: 'LOW',      icon: 'remove-outline',     color: '#66BB6A' },
  { value: 'moderate', label: 'MODERATE',  icon: 'remove-outline',     color: '#FFB74D' },
  { value: 'high',     label: 'HIGH',      icon: 'alert-outline',      color: '#EF5350' },
];

/** Traction level options */
export const TRACTION_OPTIONS: TerrainOptionMeta[] = [
  { value: 'good',     label: 'GOOD',      icon: 'checkmark-outline',  color: '#66BB6A' },
  { value: 'variable', label: 'VARIABLE',   icon: 'swap-horizontal-outline', color: '#FFB74D' },
  { value: 'poor',     label: 'POOR',       icon: 'warning-outline',    color: '#EF5350' },
];

/** Water crossing risk options */
export const WATER_CROSSING_OPTIONS: TerrainOptionMeta[] = [
  { value: 'none',     label: 'NONE',      icon: 'close-outline',      color: '#78909C' },
  { value: 'possible', label: 'POSSIBLE',   icon: 'help-outline',       color: '#FFB74D' },
  { value: 'likely',   label: 'LIKELY',     icon: 'water-outline',      color: '#4FC3F7' },
];

/** All terrain profile field definitions for dynamic UI rendering */
export interface TerrainFieldDef {
  key: keyof TerrainProfile;
  label: string;
  icon: string;
  options: TerrainOptionMeta[];
}

export const TERRAIN_PROFILE_FIELDS: TerrainFieldDef[] = [
  {
    key: 'terrainType',
    label: 'SURFACE TYPE',
    icon: 'map-outline',
    options: TERRAIN_TYPE_OPTIONS,
  },
  {
    key: 'steepGrade',
    label: 'STEEP GRADE',
    icon: 'trending-up-outline',
    options: THREE_LEVEL_OPTIONS,
  },
  {
    key: 'sideSlopeRisk',
    label: 'SIDE SLOPE RISK',
    icon: 'git-commit-outline',
    options: THREE_LEVEL_OPTIONS,
  },
  {
    key: 'waterCrossings',
    label: 'WATER CROSSINGS',
    icon: 'water-outline',
    options: WATER_CROSSING_OPTIONS,
  },
  {
    key: 'traction',
    label: 'TRACTION',
    icon: 'disc-outline',
    options: TRACTION_OPTIONS,
  },
  {
    key: 'remoteness',
    label: 'REMOTENESS',
    icon: 'compass-outline',
    options: THREE_LEVEL_OPTIONS,
  },
];

// ── Computed Risk Helpers ────────────────────────────────────
// Pure functions for downstream risk scoring (Phase 6B+).

/** Numeric severity mapping: low=1, moderate=2, high=3 */
export function levelToNumeric(level: 'low' | 'moderate' | 'high'): number {
  switch (level) {
    case 'low': return 1;
    case 'moderate': return 2;
    case 'high': return 3;
    default: return 2;
  }
}

/** Traction severity: good=1, variable=2, poor=3 */
export function tractionToNumeric(traction: TractionLevel): number {
  switch (traction) {
    case 'good': return 1;
    case 'variable': return 2;
    case 'poor': return 3;
    default: return 2;
  }
}

/** Water crossing severity: none=0, possible=1, likely=2 */
export function waterCrossingToNumeric(wc: WaterCrossingRisk): number {
  switch (wc) {
    case 'none': return 0;
    case 'possible': return 1;
    case 'likely': return 2;
    default: return 1;
  }
}

/**
 * Compute a composite terrain difficulty score (0–100).
 * Higher = more difficult terrain.
 * Used by downstream risk scoring engines.
 */
export function computeTerrainDifficulty(profile: TerrainProfile): number {
  // Terrain type base difficulty
  const typeScores: Record<TerrainType, number> = {
    highway: 5,
    graded_dirt: 20,
    forest_road: 30,
    rocky: 55,
    sand: 50,
    snow_ice: 60,
    mud: 65,
    mixed: 40,
  };

  const base = typeScores[profile.terrainType] ?? 40;
  const gradeAdj = (levelToNumeric(profile.steepGrade) - 1) * 8;      // 0, 8, 16
  const slopeAdj = (levelToNumeric(profile.sideSlopeRisk) - 1) * 6;   // 0, 6, 12
  const waterAdj = waterCrossingToNumeric(profile.waterCrossings) * 4; // 0, 4, 8
  const tractionAdj = (tractionToNumeric(profile.traction) - 1) * 5;  // 0, 5, 10
  const remotenessAdj = (levelToNumeric(profile.remoteness) - 1) * 3;  // 0, 3, 6

  const raw = base + gradeAdj + slopeAdj + waterAdj + tractionAdj + remotenessAdj;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/**
 * Get a human-readable difficulty label from score.
 */
export function getDifficultyLabel(score: number): string {
  if (score <= 20) return 'EASY';
  if (score <= 40) return 'MODERATE';
  if (score <= 60) return 'CHALLENGING';
  if (score <= 80) return 'DIFFICULT';
  return 'EXTREME';
}

/**
 * Get difficulty color from score.
 */
export function getDifficultyColor(score: number): string {
  if (score <= 20) return '#66BB6A';
  if (score <= 40) return '#FFB74D';
  if (score <= 60) return '#FFA726';
  if (score <= 80) return '#EF5350';
  return '#D32F2F';
}

