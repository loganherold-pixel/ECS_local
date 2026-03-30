// ============================================================
// ROUTE RECOMMENDATION EXPLANATION ENGINE
// ============================================================
// Phase 11: Generates human-readable contextual explanations
// showing why ECS recommends specific routes for the user.
//
// SIGNAL ANALYSIS
//   Evaluates ranking signals from the Discovery scoring system:
//     - Vehicle capability match (rig compatibility score)
//     - Remoteness score (isolation and solitude)
//     - Camping potential (dispersed camping availability)
//     - Route length (trail distance suitability)
//     - Proximity to user (distance from current location)
//     - Offline readiness (self-sufficiency for remote travel)
//     - Weekend suitability (overnight-capable route length)
//
// EXPLANATION GENERATION
//   Converts ranking signals into short, human-readable phrases.
//   Limits displayed reasons to the top 3 strongest signals.
//   Avoids duplicating metrics already shown on the card
//   (e.g., won't repeat "100 MI" if trail length is displayed).
//
// CATEGORY AWARENESS
//   Explanations adapt to the route's category context:
//     - Weekend Adventures: emphasizes camping + remoteness
//     - Quiet Exploration: emphasizes solitude + proximity
//     - Expedition Routes: emphasizes vehicle match + offline readiness
//
// FALLBACK
//   Routes with incomplete metadata receive generic explanations
//   based on available signals. Never returns an empty array.
//
// INTEGRATION
//   - Used by OpportunityCard for contextual explanation display
//   - Works with all Discovery categories
//   - Supports offline cached routes
//   - Provides simplified summaries for Android Auto / CarPlay
//
// PERFORMANCE
//   - Pure function, no side effects
//   - O(1) per route (fixed signal count)
//   - No external API calls
//   - Safe for use in FlatList/ScrollView render paths
// ============================================================

import type { ExpeditionOpportunity } from './discoverEngine';
import type { CompatibilityResult } from './rigCompatibilityEngine';

const TAG = '[RECOMMEND]';

// ── Explanation Types ────────────────────────────────────────

export interface RecommendationSignal {
  /** Signal identifier */
  id: string;
  /** Signal strength 0–100 (higher = stronger reason) */
  strength: number;
  /** Human-readable explanation phrase */
  phrase: string;
  /** Ionicons icon name for optional display */
  icon: string;
  /** Signal category for deduplication */
  category: 'vehicle' | 'terrain' | 'camping' | 'distance' | 'remoteness' | 'duration' | 'offline' | 'general';
}

export interface RouteExplanation {
  /** Top 3 explanation phrases (strongest signals) */
  reasons: string[];
  /** All evaluated signals (sorted by strength) */
  signals: RecommendationSignal[];
  /** Simplified one-line summary for vehicle displays */
  simplifiedSummary: string;
  /** Whether the explanation uses complete data */
  isComplete: boolean;
}

// ── Signal Thresholds ────────────────────────────────────────

const VEHICLE_STRONG_THRESHOLD = 80;
const VEHICLE_GOOD_THRESHOLD = 60;
const REMOTENESS_HIGH_THRESHOLD = 7;
const REMOTENESS_MODERATE_THRESHOLD = 5;
const CAMPING_STRONG_THRESHOLD = 70;
const CAMPING_GOOD_THRESHOLD = 50;
const PROXIMITY_CLOSE_THRESHOLD = 100;  // miles
const PROXIMITY_MEDIUM_THRESHOLD = 200; // miles
const WEEKEND_MIN_DAYS = 1;
const WEEKEND_MAX_DAYS = 3;
const WEEKEND_MIN_MILES = 40;
const WEEKEND_MAX_MILES = 120;

// ============================================================
// MAIN EXPLANATION GENERATOR
// ============================================================

/**
 * Generate a contextual recommendation explanation for a route.
 *
 * @param opportunity   The expedition opportunity to explain
 * @param compatResult  Optional vehicle compatibility result
 * @param options       Optional configuration
 * @returns RouteExplanation with top 3 reasons and metadata
 */
export function generateRouteExplanation(
  opportunity: ExpeditionOpportunity,
  compatResult: CompatibilityResult | null = null,
  options: {
    hasVehicle?: boolean;
    maxReasons?: number;
    categoryHint?: 'weekend' | 'quiet' | 'expedition' | null;
  } = {},
): RouteExplanation {
  const { hasVehicle = false, maxReasons = 3, categoryHint = null } = options;
  const signals: RecommendationSignal[] = [];

  // ── 1. Vehicle Capability Match ────────────────────────────
  if (hasVehicle && compatResult) {
    const score = compatResult.score;
    if (score >= VEHICLE_STRONG_THRESHOLD) {
      signals.push({
        id: 'vehicle-strong',
        strength: score,
        phrase: 'Strong match for your rig\'s capability',
        icon: 'car-sport-outline',
        category: 'vehicle',
      });
    } else if (score >= VEHICLE_GOOD_THRESHOLD) {
      signals.push({
        id: 'vehicle-good',
        strength: score * 0.85,
        phrase: 'Good fit for your vehicle setup',
        icon: 'car-outline',
        category: 'vehicle',
      });
    } else if (score >= 40) {
      signals.push({
        id: 'vehicle-moderate',
        strength: score * 0.6,
        phrase: 'Manageable with your current setup',
        icon: 'car-outline',
        category: 'vehicle',
      });
    }

    // Terrain-specific vehicle match
    const terrainMatch = compatResult.factors?.terrainMatch ?? 0;
    if (terrainMatch >= 85) {
      signals.push({
        id: 'terrain-match',
        strength: terrainMatch * 0.75,
        phrase: `Your rig excels on ${_simplifyTerrain(opportunity.terrainType)} terrain`,
        icon: 'trail-sign-outline',
        category: 'terrain',
      });
    }
  }

  // ── 2. Remoteness / Solitude ───────────────────────────────
  const remoteness = opportunity.remotenessScore ?? 0;
  if (remoteness >= REMOTENESS_HIGH_THRESHOLD) {
    const strength = remoteness * 10;
    signals.push({
      id: 'remoteness-high',
      strength: Math.min(strength, 95),
      phrase: remoteness >= 9
        ? 'Extreme isolation far from populated areas'
        : 'High remoteness offers genuine solitude',
      icon: 'radio-outline',
      category: 'remoteness',
    });
  } else if (remoteness >= REMOTENESS_MODERATE_THRESHOLD) {
    signals.push({
      id: 'remoteness-moderate',
      strength: remoteness * 8,
      phrase: 'Moderate remoteness with backcountry character',
      icon: 'radio-outline',
      category: 'remoteness',
    });
  }

  // ── 3. Camping Potential ───────────────────────────────────
  const campingScore = opportunity.campingPotentialScore ?? 0;
  const suggestedCamps = opportunity.suggestedCamps ?? 0;
  if (campingScore >= CAMPING_STRONG_THRESHOLD) {
    signals.push({
      id: 'camping-strong',
      strength: campingScore * 0.9,
      phrase: suggestedCamps >= 3
        ? `${suggestedCamps} dispersed camp zones along the route`
        : 'Strong dispersed camping availability',
      icon: 'bonfire-outline',
      category: 'camping',
    });
  } else if (campingScore >= CAMPING_GOOD_THRESHOLD || suggestedCamps >= 2) {
    signals.push({
      id: 'camping-good',
      strength: Math.max(campingScore * 0.7, suggestedCamps * 20),
      phrase: 'Good camping potential with viable camp zones',
      icon: 'bonfire-outline',
      category: 'camping',
    });
  }

  // ── 4. Proximity to User ───────────────────────────────────
  const userDist = opportunity.distanceFromUserMiles;
  if (userDist != null) {
    if (userDist <= PROXIMITY_CLOSE_THRESHOLD) {
      signals.push({
        id: 'proximity-close',
        strength: Math.max(70, 90 - userDist * 0.2),
        phrase: userDist <= 50
          ? 'Very close to your current location'
          : 'Within easy driving distance',
        icon: 'navigate-outline',
        category: 'distance',
      });
    } else if (userDist <= PROXIMITY_MEDIUM_THRESHOLD) {
      signals.push({
        id: 'proximity-medium',
        strength: Math.max(40, 65 - (userDist - 100) * 0.25),
        phrase: 'Reachable for a day-trip departure',
        icon: 'navigate-outline',
        category: 'distance',
      });
    }
  }

  // ── 5. Weekend Suitability ─────────────────────────────────
  const days = opportunity.estimatedDays ?? 0;
  const trailMiles = opportunity.distanceMiles ?? 0;
  const isWeekendSuitable =
    days >= WEEKEND_MIN_DAYS &&
    days <= WEEKEND_MAX_DAYS &&
    trailMiles >= WEEKEND_MIN_MILES &&
    trailMiles <= WEEKEND_MAX_MILES;

  if (isWeekendSuitable) {
    signals.push({
      id: 'weekend-suitable',
      strength: 65 + (remoteness * 2),
      phrase: days <= 1
        ? 'Ideal length for a day trip with overnight option'
        : days <= 2
        ? 'Perfect for a weekend overnight adventure'
        : 'Well-suited for a full weekend expedition',
      icon: 'moon-outline',
      category: 'duration',
    });
  } else if (days > 3 && trailMiles > 120) {
    signals.push({
      id: 'multi-day',
      strength: 55 + Math.min(days * 3, 20),
      phrase: `${days}-day expedition through extended backcountry`,
      icon: 'calendar-outline',
      category: 'duration',
    });
  }

  // ── 6. Offline Readiness / Self-Sufficiency ────────────────
  if (remoteness >= 7 && trailMiles >= 60) {
    signals.push({
      id: 'offline-ready',
      strength: 50 + remoteness * 4,
      phrase: 'Route supports full offline navigation',
      icon: 'cloud-offline-outline',
      category: 'offline',
    });
  }

  // ── 7. Scenic / Highlight-Based Signals ────────────────────
  const highlights = opportunity.highlights ?? [];
  const highlightText = highlights.join(' ').toLowerCase();

  if (/overlook|panoram|view|vista|canyon|cliff/.test(highlightText)) {
    signals.push({
      id: 'scenic-views',
      strength: 55 + (remoteness * 3),
      phrase: 'Scenic overlooks and dramatic viewpoints',
      icon: 'eye-outline',
      category: 'general',
    });
  }

  if (/river|creek|lake|spring|water|falls/.test(highlightText)) {
    signals.push({
      id: 'water-features',
      strength: 50 + (remoteness * 2),
      phrase: 'Water features along the route corridor',
      icon: 'water-outline',
      category: 'general',
    });
  }

  // ── 8. Elevation / Challenge Signal ────────────────────────
  const elevGain = opportunity.elevationGainFt ?? 0;
  if (elevGain >= 8000) {
    signals.push({
      id: 'high-elevation',
      strength: 55 + Math.min(elevGain / 200, 25),
      phrase: `${(elevGain / 1000).toFixed(1)}k ft elevation gain through high country`,
      icon: 'trending-up-outline',
      category: 'terrain',
    });
  }

  // ── 9. Permit-Free Signal ──────────────────────────────────
  if (!opportunity.permitRequired) {
    signals.push({
      id: 'no-permit',
      strength: 40,
      phrase: 'No permits required for access',
      icon: 'checkmark-circle-outline',
      category: 'general',
    });
  }

  // ── Category Boost ─────────────────────────────────────────
  // Boost signals that align with the route's category context
  if (categoryHint) {
    for (const signal of signals) {
      if (categoryHint === 'weekend' && (signal.category === 'camping' || signal.category === 'duration')) {
        signal.strength = Math.min(100, signal.strength * 1.15);
      }
      if (categoryHint === 'quiet' && (signal.category === 'remoteness' || signal.category === 'distance')) {
        signal.strength = Math.min(100, signal.strength * 1.15);
      }
      if (categoryHint === 'expedition' && (signal.category === 'vehicle' || signal.category === 'offline')) {
        signal.strength = Math.min(100, signal.strength * 1.15);
      }
    }
  }

  // ── Sort by strength (descending) ──────────────────────────
  signals.sort((a, b) => b.strength - a.strength);

  // ── Deduplicate by category ────────────────────────────────
  // Only keep the strongest signal per category to avoid redundancy
  const seenCategories = new Set<string>();
  const deduped: RecommendationSignal[] = [];
  for (const signal of signals) {
    if (!seenCategories.has(signal.category)) {
      seenCategories.add(signal.category);
      deduped.push(signal);
    }
  }

  // ── Select top N reasons ───────────────────────────────────
  const topSignals = deduped.slice(0, maxReasons);
  const reasons = topSignals.map(s => s.phrase);

  // ── Fallback: ensure at least one reason ───────────────────
  if (reasons.length === 0) {
    reasons.push(_generateFallbackReason(opportunity));
    console.log(TAG, `Fallback explanation for "${opportunity.name}"`);
  }

  // ── Simplified summary for vehicle displays ────────────────
  const simplifiedSummary = _buildSimplifiedSummary(topSignals, opportunity);

  // ── Completeness check ─────────────────────────────────────
  const isComplete = !!(
    opportunity.remotenessScore != null &&
    opportunity.distanceMiles != null &&
    opportunity.estimatedDays != null &&
    (opportunity.distanceFromUserMiles != null)
  );

  console.log(
    TAG,
    `Explanation for "${opportunity.name}": ${reasons.length} reasons ` +
    `(${signals.length} signals evaluated, ${isComplete ? 'complete' : 'partial'} data)`,
  );

  return {
    reasons,
    signals: deduped,
    simplifiedSummary,
    isComplete,
  };
}

// ============================================================
// BATCH EXPLANATION
// ============================================================

/**
 * Generate explanations for multiple routes.
 * Returns a map of route ID → RouteExplanation.
 */
export function generateExplanationBatch(
  opportunities: ExpeditionOpportunity[],
  compatResults: Map<string, CompatibilityResult>,
  options: {
    hasVehicle?: boolean;
    categoryHint?: 'weekend' | 'quiet' | 'expedition' | null;
  } = {},
): Map<string, RouteExplanation> {
  const results = new Map<string, RouteExplanation>();

  for (const op of opportunities) {
    const compat = compatResults.get(op.id) ?? null;
    results.set(op.id, generateRouteExplanation(op, compat, options));
  }

  console.log(TAG, `Batch generated ${results.size} explanations`);
  return results;
}

// ============================================================
// SIMPLIFIED VEHICLE DISPLAY (Android Auto / CarPlay)
// ============================================================

/**
 * Get a simplified recommendation summary for vehicle displays.
 * Returns a short string suitable for Android Auto or CarPlay.
 */
export function getSimplifiedExplanation(
  opportunity: ExpeditionOpportunity,
  compatResult: CompatibilityResult | null = null,
  hasVehicle: boolean = false,
): string {
  const explanation = generateRouteExplanation(opportunity, compatResult, {
    hasVehicle,
    maxReasons: 1,
  });
  return explanation.simplifiedSummary;
}

// ============================================================
// DISPLAY HELPERS
// ============================================================

/** Get explanation text color (muted to avoid visual clutter) */
export function getExplanationTextColor(): string {
  return '#6B7280';  // muted gray, readable in dark mode
}

/** Get explanation icon color */
export function getExplanationIconColor(): string {
  return '#555D68';  // slightly darker muted
}

/** Maximum number of explanation lines to display on a card */
export const MAX_DISPLAY_REASONS = 3;

/**
 * Format reasons for display with bullet prefix.
 * Returns array of formatted strings.
 */
export function formatReasonsForDisplay(reasons: string[]): string[] {
  return reasons.slice(0, MAX_DISPLAY_REASONS);
}

// ============================================================
// OFFLINE COMPATIBILITY
// ============================================================

/**
 * Check if recommendation explanations can be generated offline.
 * Explanations are derived from route metadata, so they are
 * always available when route data is cached.
 */
export function isExplanationAvailableOffline(): boolean {
  return true;
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

/**
 * Simplify terrain type string for use in explanation phrases.
 */
function _simplifyTerrain(terrainType: string): string {
  const t = terrainType.toLowerCase();
  if (t.includes('desert') && t.includes('sand')) return 'desert sand';
  if (t.includes('desert') && t.includes('canyon')) return 'desert canyon';
  if (t.includes('alpine') && t.includes('mountain')) return 'alpine';
  if (t.includes('alpine') && t.includes('rock')) return 'alpine rock';
  if (t.includes('forest') && t.includes('mountain')) return 'forest mountain';
  if (t.includes('forest') && t.includes('rock')) return 'forest rock';
  if (t.includes('mixed') && t.includes('gravel')) return 'mixed gravel';
  if (t.includes('desert')) return 'desert';
  if (t.includes('alpine')) return 'alpine';
  if (t.includes('forest')) return 'forest';
  if (t.includes('mountain')) return 'mountain';
  if (t.includes('rock')) return 'rock';
  return 'off-road';
}

/**
 * Generate a fallback reason when no strong signals are detected.
 */
function _generateFallbackReason(opportunity: ExpeditionOpportunity): string {
  const days = opportunity.estimatedDays ?? 1;
  const miles = opportunity.distanceMiles ?? 0;

  if (days <= 1 && miles <= 50) {
    return 'Accessible route for a short exploration';
  }
  if (days <= 2) {
    return 'Suitable route for weekend exploration';
  }
  if (miles >= 100) {
    return 'Extended backcountry route for multi-day travel';
  }
  return 'Expedition opportunity in your search area';
}

/**
 * Build a simplified one-line summary for vehicle displays.
 */
function _buildSimplifiedSummary(
  topSignals: RecommendationSignal[],
  opportunity: ExpeditionOpportunity,
): string {
  if (topSignals.length === 0) {
    return `${opportunity.distanceMiles ?? 0} mi route`;
  }

  // Use the strongest signal's category to build a summary
  const strongest = topSignals[0];
  switch (strongest.category) {
    case 'vehicle':
      return `Good rig match · ${opportunity.distanceMiles ?? 0} mi`;
    case 'remoteness':
      return `Remote · ${opportunity.remotenessScore ?? 0}/10 isolation`;
    case 'camping':
      return `${opportunity.suggestedCamps ?? 0} camp zones · ${opportunity.distanceMiles ?? 0} mi`;
    case 'distance':
      return `${opportunity.distanceFromUserMiles ?? '?'} mi away · ${opportunity.estimatedDays ?? 1}d trip`;
    case 'duration':
      return `${opportunity.estimatedDays ?? 1}-day route · ${opportunity.distanceMiles ?? 0} mi`;
    case 'offline':
      return `Offline-ready · ${opportunity.distanceMiles ?? 0} mi remote`;
    case 'terrain':
      return `${_simplifyTerrain(opportunity.terrainType)} · ${opportunity.distanceMiles ?? 0} mi`;
    default:
      return `${opportunity.distanceMiles ?? 0} mi · ${opportunity.estimatedDays ?? 1} day${(opportunity.estimatedDays ?? 1) !== 1 ? 's' : ''}`;
  }
}

