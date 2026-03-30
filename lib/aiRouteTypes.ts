// ============================================================
// AI ROUTE TYPES — Type definitions for AI-generated routes
// ============================================================
// Defines the data structures for AI-generated expedition
// route suggestions in the ECS Discovery tab.
// ============================================================

import type { ExpeditionOpportunity } from './discoverEngine';

// ── AI Route Confidence Levels ───────────────────────────────
export type AIRouteConfidence = 'high' | 'good' | 'explore';

// ── AI Route Suggested Labels ────────────────────────────────
export type AIRouteSuggestedLabel =
  | 'AI Suggested'
  | 'AI Suggested Route'
  | 'Expedition Idea'
  | 'Hidden Gem Candidate'
  | 'Remote Trip Option';

// ── AI-Generated Route ───────────────────────────────────────
// Extends ExpeditionOpportunity with AI-specific fields.
export interface AIGeneratedRoute extends ExpeditionOpportunity {
  /** Always true for AI-generated routes */
  isAIGenerated: true;
  /** Confidence level of the route suggestion */
  confidence: AIRouteConfidence;
  /** Display label for the card badge */
  suggestedLabel: AIRouteSuggestedLabel;
  /** Extended expedition summary (longer than description) */
  expeditionSummary: string;
  /** Caution notes for limited-confidence routes */
  cautionNotes: string;
  /** Camp suitability description */
  campSuitability: string;
  /** ISO timestamp when the route was generated */
  generatedAt: string;
  /** Popularity score (5-80, lower = less known) */
  popularityScore?: number;
}


// ── AI Route Request Parameters ──────────────────────────────
export interface AIRouteRequestParams {
  latitude: number;
  longitude: number;
  category: string;
  radiusMiles: number;
  vehicleType: string;
  vehicleBuild: string;
  count: number;
  existingRouteNames: string[];
}

// ── AI Route Response ────────────────────────────────────────
export interface AIRouteResponse {
  routes: AIGeneratedRoute[];
  category: string;
  radiusMiles: number;
  generatedAt: string;
  error?: string;
}

// ── AI Route State ───────────────────────────────────────────
export interface AIRouteState {
  /** Routes keyed by category */
  routesByCategory: Record<string, AIGeneratedRoute[]>;
  /** Loading state per category */
  loadingByCategory: Record<string, boolean>;
  /** Error state per category */
  errorByCategory: Record<string, string | null>;
  /** Last fetch timestamp per category */
  lastFetchByCategory: Record<string, number>;
  /** Whether AI suggestions are enabled globally */
  enabled: boolean;
}

// ── Confidence Display Helpers ───────────────────────────────

export function getConfidenceLabel(confidence: AIRouteConfidence): string {
  switch (confidence) {
    case 'high': return 'HIGH CONFIDENCE';
    case 'good': return 'GOOD CANDIDATE';
    case 'explore': return 'WORTH SCOUTING';
    default: return 'EXPLORE FURTHER';
  }
}

export function getConfidenceColor(confidence: AIRouteConfidence): string {
  switch (confidence) {
    case 'high': return '#66BB6A';
    case 'good': return '#D4A017';
    case 'explore': return '#E67E22';
    default: return '#8B949E';
  }
}

export function getConfidenceIcon(confidence: AIRouteConfidence): string {
  switch (confidence) {
    case 'high': return 'checkmark-circle-outline';
    case 'good': return 'star-outline';
    case 'explore': return 'search-outline';
    default: return 'help-circle-outline';
  }
}

export function getSuggestedLabelColor(label: AIRouteSuggestedLabel): string {
  switch (label) {
    case 'AI Suggested Route': return '#66BB6A';
    case 'AI Suggested': return '#5AC8FA';
    case 'Expedition Idea': return '#D4A017';
    case 'Hidden Gem Candidate': return '#E67E22';
    case 'Remote Trip Option': return '#C87850';
    default: return '#5AC8FA';
  }
}

/** Check if an ExpeditionOpportunity is AI-generated */
export function isAIRoute(op: ExpeditionOpportunity): op is AIGeneratedRoute {
  return (op as any).isAIGenerated === true;
}

