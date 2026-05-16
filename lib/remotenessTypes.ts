/**
 * ECS Remoteness Index Engine — Type Definitions
 *
 * Comprehensive type system for the multi-factor remoteness scoring engine.
 * Supports current location scoring, route-ahead forecasting, and
 * expedition intelligence integration.
 */

import type { ECSConfidenceResult } from './ai/confidenceTypes';
import type { ECSPriorityResult } from './ai/priorityTypes';

// ══════════════════════════════════════════════════════════
// REMOTENESS LEVELS
// ══════════════════════════════════════════════════════════

export type RemotenessLevel = 'Low' | 'Moderate' | 'Remote' | 'Extreme';

export const REMOTENESS_LEVELS: {
  level: RemotenessLevel;
  min: number;
  max: number;
  color: string;
  label: string;
  description: string;
}[] = [
  { level: 'Low',      min: 0,  max: 25,  color: '#4CAF50', label: 'LOW',      description: 'Near town and major roads' },
  { level: 'Moderate', min: 26, max: 50,  color: '#FFB300', label: 'MODERATE', description: 'Forest access road, some services nearby' },
  { level: 'Remote',   min: 51, max: 75,  color: '#E67E22', label: 'REMOTE',   description: 'Deep backcountry with sparse roads and services' },
  { level: 'Extreme',  min: 76, max: 100, color: '#C0392B', label: 'EXTREME',  description: 'Far from services, likely no connectivity' },
];

// ══════════════════════════════════════════════════════════
// REMOTENESS INPUT FACTORS
// ══════════════════════════════════════════════════════════

/** Individual factor contribution to the remoteness score */
export interface RemotenessFactor {
  /** Factor identifier */
  id: string;
  /** Human-readable label */
  label: string;
  /** Raw score contribution (0-100 scale within its weight) */
  rawScore: number;
  /** Weighted score contribution to final score */
  weightedScore: number;
  /** Weight used for this factor (0-1) */
  weight: number;
  /** Whether this factor has valid data */
  available: boolean;
  /** Optional detail string */
  detail?: string;
}

/** Distance-based proximity estimate */
export interface ProximityEstimate {
  /** Estimated distance in miles (null if unknown) */
  distanceMi: number | null;
  /** Confidence: 'high' | 'medium' | 'low' | 'estimated' */
  confidence: 'high' | 'medium' | 'low' | 'estimated';
  /** Source of the estimate */
  source: string;
  /** Human-readable destination label when the source provides one */
  label?: string | null;
  /** Destination latitude when routable coordinates are known */
  latitude?: number | null;
  /** Destination longitude when routable coordinates are known */
  longitude?: number | null;
  /** Truthful freshness/source class for this destination estimate */
  sourceState?: 'live' | 'cache' | 'unavailable';
  /** Timestamp when this estimate was resolved */
  updatedAt?: string;
}

export type RemotenessDestinationType = 'town' | 'fuel' | 'road';

export interface RemotenessDestination {
  type: RemotenessDestinationType;
  label: string;
  distanceMiles?: number;
  latitude: number;
  longitude: number;
  source: 'live' | 'cache' | 'unavailable';
  updatedAt?: string;
}

/** All proximity estimates for the current location */
export interface InfrastructureProximity {
  nearestPavedRoad: ProximityEstimate;
  nearestTown: ProximityEstimate;
  nearestFuelStation: ProximityEstimate;
  nearestEmergencyServices: ProximityEstimate;
  nearestServices: ProximityEstimate;
}

// ══════════════════════════════════════════════════════════
// CONNECTIVITY SIGNAL
// ══════════════════════════════════════════════════════════

export type ConnectivitySignal =
  | 'strong'
  | 'moderate'
  | 'weak'
  | 'intermittent'
  | 'no_signal'
  | 'offline'
  | 'unknown';

export interface ConnectivityAssessment {
  signal: ConnectivitySignal;
  /** Whether cellular data is available */
  hasCellular: boolean;
  /** Whether WiFi is available */
  hasWifi: boolean;
  /** Whether the device is in airplane mode or similar */
  isOffline: boolean;
  /** Estimated signal quality 0-100 */
  qualityScore: number;
}

// ══════════════════════════════════════════════════════════
// TERRAIN CONTEXT
// ══════════════════════════════════════════════════════════

export interface TerrainContext {
  /** Elevation in feet */
  elevationFt: number | null;
  /** Terrain complexity from elevation analysis */
  complexity: 'low' | 'medium' | 'high' | null;
  /** Whether on public land / backcountry */
  isBackcountry: boolean;
  /** Route isolation score (0-100) */
  routeIsolation: number;
  /** Elevation complexity score contribution */
  complexityScore: number;
}

// ══════════════════════════════════════════════════════════
// FORWARD REMOTENESS FORECAST
// ══════════════════════════════════════════════════════════

export interface ForwardForecastSegment {
  /** Distance ahead in miles */
  distanceAheadMi: number;
  /** Estimated time ahead in minutes */
  timeAheadMin: number;
  /** Predicted remoteness score */
  score: number;
  /** Predicted remoteness level */
  level: RemotenessLevel;
  /** Color for the level */
  color: string;
  /** Key change description */
  changeDescription: string | null;
}

export interface ForwardRemotenessForcast {
  /** Whether forecast data is available */
  available: boolean;
  /** Forecast segments (next 5-20 miles) */
  segments: ForwardForecastSegment[];
  /** Peak remoteness score in the forecast window */
  peakScore: number;
  /** Peak remoteness level */
  peakLevel: RemotenessLevel;
  /** Distance to peak remoteness */
  peakDistanceMi: number;
  /** Summary advisory message */
  advisory: string | null;
  /** Whether remoteness is increasing ahead */
  isIncreasing: boolean;
}

// ══════════════════════════════════════════════════════════
// INTELLIGENCE ADVISORIES
// ══════════════════════════════════════════════════════════

export type AdvisorySeverity = 'info' | 'caution' | 'warning' | 'critical';

export interface RemotenessAdvisory {
  id: string;
  severity: AdvisorySeverity;
  message: string;
  /** Factor that triggered this advisory */
  factor: string;
  /** Timestamp when generated */
  timestamp: number;
}

// ══════════════════════════════════════════════════════════
// FULL REMOTENESS OUTPUT
// ══════════════════════════════════════════════════════════

export interface RemotenessIndexOutput {
  // ── Core Score ──
  /** Smoothed remoteness score (0-100) */
  score: number;
  /** Raw unsmoothed score */
  rawScore: number;
  /** Remoteness level classification */
  level: RemotenessLevel;
  /** Color for the current level */
  levelColor: string;
  /** Human-readable reason line */
  reason: string;
  /** Detailed description of current conditions */
  description: string;
  /** Shared ECS confidence result for the remoteness assessment */
  confidence: ECSConfidenceResult;
  /** Shared ECS priority result for operational escalation */
  priority: ECSPriorityResult;
  /** Shared operator-facing explanation */
  explanation?: import('./ai/recommendationExplanationTypes').ECSExplanationResult | null;

  // ── Factor Breakdown ──
  /** Individual factor contributions */
  factors: RemotenessFactor[];
  /** Total number of available factors */
  availableFactorCount: number;
  /** Total number of factors evaluated */
  totalFactorCount: number;

  // ── Infrastructure Proximity ──
  proximity: InfrastructureProximity;

  // ── Connectivity ──
  connectivity: ConnectivityAssessment;

  // ── Terrain ──
  terrain: TerrainContext;

  // ── Forward Forecast ──
  forecast: ForwardRemotenessForcast;

  // ── Intelligence Advisories ──
  advisories: RemotenessAdvisory[];

  // ── Metadata ──
  /** Whether the engine is actively computing */
  isActive: boolean;
  /** Last computation timestamp */
  lastComputedAt: number;
  /** GPS position used for computation */
  gpsLat: number | null;
  gpsLon: number | null;
  /** Speed in mph */
  speedMph: number | null;
}

// ══════════════════════════════════════════════════════════
// SCORING WEIGHTS
// ══════════════════════════════════════════════════════════

export interface ScoringWeights {
  serviceDistance: number;
  infrastructureDistance: number;
  signalAvailability: number;
  routeIsolation: number;
  populationDensity: number;
  terrainComplexity: number;
  elevationFactor: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  serviceDistance: 0.22,
  infrastructureDistance: 0.18,
  signalAvailability: 0.20,
  routeIsolation: 0.15,
  populationDensity: 0.10,
  terrainComplexity: 0.10,
  elevationFactor: 0.05,
};

// ══════════════════════════════════════════════════════════
// ROUTE CLASSIFICATION
// ══════════════════════════════════════════════════════════

export type RouteRemotenessClass =
  | 'urban'
  | 'suburban'
  | 'rural'
  | 'backcountry'
  | 'wilderness';

export interface RouteRemotenessProfile {
  /** Overall route remoteness class */
  routeClass: RouteRemotenessClass;
  /** Average remoteness score across route */
  averageScore: number;
  /** Peak remoteness score on route */
  peakScore: number;
  /** Percentage of route in remote/extreme conditions */
  remotePercentage: number;
  /** Whether this route is suitable for day trips */
  isDayTripSuitable: boolean;
  /** Whether this route requires expedition preparation */
  requiresExpeditionPrep: boolean;
}

