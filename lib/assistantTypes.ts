/**
 * ═══════════════════════════════════════════════════════════
 * ECS AI EXPEDITION ASSISTANT — Types (Phase 7A + 7B + 7C + 7D)
 * ═══════════════════════════════════════════════════════════
 *
 * Defines the normalized assistant context model, response model,
 * state management types, and diagnostics schema for the ECS
 * AI Expedition Assistant architecture.
 *
 * Phase 7A: Architecture foundation types
 * Phase 7B: Context assembly pipeline + ECS-aware response types
 * Phase 7C: Guided recommendation engine + quick action cards
 * Phase 7D: Expedition session awareness + persistence + delta tracking
 *
 * Context Categories:
 *   - vehicle_profile:       Vehicle specs, type, configuration
 *   - vehicle_health:        Live telemetry, battery, fuel, coolant
 *   - loadout_status:        Loadout readiness, weight, critical items
 *   - power_status:          BLU power telemetry, battery, solar
 *   - connectivity_status:   Network state, cache readiness, freshness
 *   - remoteness_status:     Isolation tier, remoteness score
 *   - risk_status:           Risk evaluation, operational status
 *   - route_context:         Active route, waypoints, distance, elevation
 *   - offline_readiness:     Offline expedition data availability
 *
 * Response Types:
 *   - summary:          Brief overview or status report
 *   - recommendation:   Suggested course of action
 *   - caution:          Warning about a potential issue
 *   - suggested_action: Specific actionable step
 *
 * Confidence Levels:
 *   - high:    Based on live, complete data
 *   - medium:  Based on partial or stale data
 *   - low:     Based on minimal context or defaults
 *
 * Context Basis (7B):
 *   - live:    Response based on current, live ECS data
 *   - partial: Response based on incomplete ECS data
 *   - stale:   Response based on outdated ECS data
 *   - none:    No ECS context available for response
 *
 * Guidance Card Triggers (7C):
 *   - risk_elevated, risk_critical
 *   - load_unbalanced, load_overweight
 *   - power_limited, power_critical
 *   - fuel_low, fuel_critical
 *   - water_low
 *   - connectivity_lost_no_cache
 *   - route_exceeds_capability
 *   - offline_data_missing
 *
 * Session version: 4 (Phase 7D)
 */




// ── Context Category Identifiers ─────────────────────────

export type AssistantContextCategory =
  | 'vehicle_profile'
  | 'vehicle_health'
  | 'loadout_status'
  | 'power_status'
  | 'connectivity_status'
  | 'remoteness_status'
  | 'risk_status'
  | 'route_context'
  | 'offline_readiness';

/**
 * All supported context categories.
 */
export const ASSISTANT_CONTEXT_CATEGORIES: AssistantContextCategory[] = [
  'vehicle_profile',
  'vehicle_health',
  'loadout_status',
  'power_status',
  'connectivity_status',
  'remoteness_status',
  'risk_status',
  'route_context',
  'offline_readiness',
];

/**
 * Display configuration for context categories.
 */
export const CONTEXT_CATEGORY_DISPLAY: Record<AssistantContextCategory, {
  label: string;
  shortLabel: string;
  icon: string;
  color: string;
  description: string;
}> = {
  vehicle_profile: {
    label: 'Vehicle Profile',
    shortLabel: 'VEHICLE',
    icon: 'car-outline',
    color: '#D4A017',
    description: 'Vehicle specs, type, and configuration',
  },
  vehicle_health: {
    label: 'Vehicle Health',
    shortLabel: 'HEALTH',
    icon: 'pulse-outline',
    color: '#4CAF50',
    description: 'Live telemetry, battery, fuel, coolant',
  },
  loadout_status: {
    label: 'Loadout Status',
    shortLabel: 'LOADOUT',
    icon: 'cube-outline',
    color: '#42A5F5',
    description: 'Loadout readiness, weight, critical items',
  },
  power_status: {
    label: 'Power Status',
    shortLabel: 'POWER',
    icon: 'flash-outline',
    color: '#FFB300',
    description: 'BLU power telemetry, battery, solar input',
  },
  connectivity_status: {
    label: 'Connectivity',
    shortLabel: 'CONN',
    icon: 'wifi-outline',
    color: '#5AC8FA',
    description: 'Network state, cache readiness, freshness',
  },
  remoteness_status: {
    label: 'Remoteness',
    shortLabel: 'REMOTE',
    icon: 'locate-outline',
    color: '#E67E22',
    description: 'Isolation tier and remoteness score',
  },
  risk_status: {
    label: 'Risk Status',
    shortLabel: 'RISK',
    icon: 'shield-outline',
    color: '#EF5350',
    description: 'Risk evaluation and operational status',
  },
  route_context: {
    label: 'Route Context',
    shortLabel: 'ROUTE',
    icon: 'map-outline',
    color: '#66BB6A',
    description: 'Active route, waypoints, distance, elevation',
  },
  offline_readiness: {
    label: 'Offline Readiness',
    shortLabel: 'OFFLINE',
    icon: 'cloud-download-outline',
    color: '#78909C',
    description: 'Offline expedition data availability',
  },
};


// ── Context Availability ─────────────────────────────────

/**
 * Availability state for each context category.
 *
 * available:    Data is current and usable
 * stale:        Data exists but may be outdated
 * unavailable:  No data available for this category
 * error:        Data source encountered an error
 */
export type ContextAvailability =
  | 'available'
  | 'stale'
  | 'unavailable'
  | 'error';

/**
 * Display configuration for context availability.
 */
export const CONTEXT_AVAILABILITY_DISPLAY: Record<ContextAvailability, {
  label: string;
  color: string;
  icon: string;
}> = {
  available: { label: 'Available', color: '#4CAF50', icon: 'checkmark-circle-outline' },
  stale: { label: 'Stale', color: '#FFB300', icon: 'time-outline' },
  unavailable: { label: 'Unavailable', color: '#78909C', icon: 'remove-circle-outline' },
  error: { label: 'Error', color: '#EF5350', icon: 'alert-circle-outline' },
};


// ── Normalized Context Snapshots ─────────────────────────

export interface VehicleProfileContext {
  availability: ContextAvailability;
  vehicle_name: string | null;
  vehicle_type: string | null;
  make: string | null;
  model: string | null;
  gvwr_lb: number | null;
  base_weight_lb: number | null;
  fuel_tank_capacity_gal: number | null;
  fuel_type: string | null;
  has_specs: boolean;
}

export interface VehicleHealthContext {
  availability: ContextAvailability;
  has_live_telemetry: boolean;
  engine_status: string;
  battery_voltage: number | null;
  battery_health: string;
  fuel_percent: number | null;
  coolant_temp_f: number | null;
  has_anomaly: boolean;
  anomaly_flags: string[];
  telemetry_freshness: string;
}

export interface LoadoutStatusContext {
  availability: ContextAvailability;
  has_active_loadout: boolean;
  loadout_name: string | null;
  total_items: number;
  packed_items: number;
  critical_items: number;
  critical_missing: number;
  readiness_pct: number;
  total_weight_lbs: number | null;
  payload_margin_lb: number | null;
  is_overweight: boolean;
}

export interface PowerStatusContext {
  availability: ContextAvailability;
  has_blu_telemetry: boolean;
  battery_percent: number | null;
  input_watts: number | null;
  output_watts: number | null;
  runtime_minutes: number | null;
  is_sustainable: boolean;
  device_count: number;
}

export interface ConnectivityStatusContext {
  availability: ContextAvailability;
  connectivity_state: string;
  signal_quality: string;
  internet_reachable: boolean;
  offline_cache_ready: boolean;
  operational_readiness: string;
  freshness: string;
  network_type: string;
}

export interface RemotenessStatusContext {
  availability: ContextAvailability;
  remoteness_score: number | null;
  remoteness_tier: string | null;
  engine_running: boolean;
  cache_ready: boolean;
}

export interface RiskStatusContext {
  availability: ContextAvailability;
  risk_score: number;
  operational_status: string;
  primary_risk_factor: string;
  primary_risk_label: string;
  capability_score: number;
  resource_readiness: number;
  connectivity_risk: number;
  isolation_risk: number;
  summary_line: string;
  is_complete: boolean;
  /** Integration Pass 4: Route difficulty score (0–100) */
  route_difficulty_score: number;
  /** Integration Pass 4: Resource-route balance (0–100) */
  resource_route_balance: number;
  /** Integration Pass 4: Vehicle health score (0–100) */
  health_score: number;
  /** Integration Pass 4: Stabilized status (hysteresis-protected) */
  stabilized_status: string;
}


export interface RouteContextData {
  availability: ContextAvailability;
  has_active_route: boolean;
  route_name: string | null;
  total_distance_mi: number | null;
  elevation_gain_ft: number | null;
  waypoint_count: number;
  segment_count: number;
  source_format: string | null;
}

export interface OfflineReadinessContext {
  availability: ContextAvailability;
  has_offline_data: boolean;
  downloaded_regions: number;
  total_entries: number;
  storage_mb: number;
  covers_current_position: boolean;
  covers_active_route: boolean;
  available_categories: string[];
  all_regions_valid: boolean;
}


// ── Complete Context Snapshot ─────────────────────────────

/**
 * Complete normalized context snapshot assembled from all ECS systems.
 * All categories are always present; availability indicates data quality.
 */
export interface AssistantContextSnapshot {
  vehicle_profile: VehicleProfileContext;
  vehicle_health: VehicleHealthContext;
  loadout_status: LoadoutStatusContext;
  power_status: PowerStatusContext;
  connectivity_status: ConnectivityStatusContext;
  remoteness_status: RemotenessStatusContext;
  risk_status: RiskStatusContext;
  route_context: RouteContextData;
  offline_readiness: OfflineReadinessContext;
  /** ISO timestamp when this snapshot was assembled */
  assembled_at: string;
  /** Number of categories with available data */
  available_count: number;
  /** Total number of context categories */
  total_count: number;
  /** Whether all context categories have data */
  is_complete: boolean;
}


// ── Context Diagnostics ──────────────────────────────────

/**
 * Diagnostics entry for a single context category.
 */
export interface ContextDiagnosticEntry {
  category: AssistantContextCategory;
  availability: ContextAvailability;
  source_module: string;
  last_updated: string | null;
  data_summary: string;
}

/**
 * Complete diagnostics report for the assistant context.
 */
export interface AssistantContextDiagnostics {
  entries: ContextDiagnosticEntry[];
  available_count: number;
  total_count: number;
  completeness_pct: number;
  evaluated_at: string;
}


// ── Response Model ───────────────────────────────────────

/**
 * Response type classification.
 */
export type AssistantResponseType =
  | 'summary'
  | 'recommendation'
  | 'caution'
  | 'suggested_action';

/**
 * Display configuration for response types.
 */
export const RESPONSE_TYPE_DISPLAY: Record<AssistantResponseType, {
  label: string;
  color: string;
  icon: string;
}> = {
  summary: { label: 'Summary', color: '#D4A017', icon: 'information-circle-outline' },
  recommendation: { label: 'Recommendation', color: '#4CAF50', icon: 'bulb-outline' },
  caution: { label: 'Caution', color: '#E67E22', icon: 'warning-outline' },
  suggested_action: { label: 'Suggested Action', color: '#42A5F5', icon: 'arrow-forward-circle-outline' },
};

/**
 * Confidence level for assistant responses.
 */
export type AssistantConfidenceLevel =
  | 'high'
  | 'medium'
  | 'low';

/**
 * Display configuration for confidence levels.
 */
export const CONFIDENCE_DISPLAY: Record<AssistantConfidenceLevel, {
  label: string;
  color: string;
}> = {
  high: { label: 'High Confidence', color: '#4CAF50' },
  medium: { label: 'Medium Confidence', color: '#FFB300' },
  low: { label: 'Low Confidence', color: '#78909C' },
};



// ── Phase 7B: Context Basis ──────────────────────────────

/**
 * Context basis indicates how much live ECS data contributed
 * to a response. Shown as a visible indicator in the UI.
 *
 * Phase 7B addition.
 */
export type ContextBasis =
  | 'live'      // Response based on current, live ECS data
  | 'partial'   // Response based on incomplete ECS data
  | 'stale'     // Response based on outdated ECS data
  | 'none';     // No ECS context available for response

export const CONTEXT_BASIS_DISPLAY: Record<ContextBasis, {
  label: string;
  shortLabel: string;
  color: string;
  icon: string;
  description: string;
}> = {
  live: {
    label: 'Live ECS Data',
    shortLabel: 'LIVE',
    color: '#4CAF50',
    icon: 'radio-outline',
    description: 'Response based on current, live ECS system data',
  },
  partial: {
    label: 'Partial ECS Data',
    shortLabel: 'PARTIAL',
    color: '#FFB300',
    icon: 'ellipsis-horizontal-circle-outline',
    description: 'Response based on incomplete ECS data \u2014 some systems unavailable',
  },
  stale: {
    label: 'Stale ECS Data',
    shortLabel: 'STALE',
    color: '#E67E22',
    icon: 'time-outline',
    description: 'Response based on outdated ECS data \u2014 refresh recommended',
  },
  none: {
    label: 'No ECS Data',
    shortLabel: 'NO DATA',
    color: '#78909C',
    icon: 'cloud-offline-outline',
    description: 'No ECS context available \u2014 generic guidance only',
  },
};


// ── Phase 7B: Query Intent Classification ────────────────

/**
 * Classified intent of a user query. Used by the response
 * builder to route queries to the appropriate handler.
 *
 * Phase 7B addition.
 */
export type QueryIntent =
  | 'readiness_check'       // "Am I ready for this route?"
  | 'vehicle_status'        // "How is my vehicle?"
  | 'power_status'          // "How is my power system?"
  | 'risk_assessment'       // "What is my biggest risk?"
  | 'route_analysis'        // "Tell me about my route"
  | 'offline_readiness'     // "Am I offline-ready?"
  | 'loadout_check'         // "Is my loadout affecting stability?"
  | 'connectivity_check'    // "What is my connectivity status?"
  | 'remoteness_check'      // "How remote am I?"
  | 'expedition_overview'   // "Give me an overview"
  | 'session_status'        // Phase 7D: "How long have I been out?"
  | 'what_changed'          // Phase 7D: "What changed recently?"
  | 'general';              // Fallback for unclassified queries


/**
 * Display configuration for query intents.
 */
export const QUERY_INTENT_DISPLAY: Record<QueryIntent, {
  label: string;
  description: string;
  primary_categories: AssistantContextCategory[];
}> = {
  readiness_check: {
    label: 'Readiness Check',
    description: 'Evaluating expedition readiness across all systems',
    primary_categories: ['vehicle_profile', 'loadout_status', 'power_status', 'route_context', 'offline_readiness', 'risk_status'],
  },
  vehicle_status: {
    label: 'Vehicle Status',
    description: 'Checking vehicle configuration and health',
    primary_categories: ['vehicle_profile', 'vehicle_health'],
  },
  power_status: {
    label: 'Power Status',
    description: 'Checking power system and sustainability',
    primary_categories: ['power_status'],
  },
  risk_assessment: {
    label: 'Risk Assessment',
    description: 'Evaluating current expedition risk factors',
    primary_categories: ['risk_status', 'connectivity_status', 'remoteness_status'],
  },
  route_analysis: {
    label: 'Route Analysis',
    description: 'Analyzing active route details',
    primary_categories: ['route_context', 'offline_readiness'],
  },
  offline_readiness: {
    label: 'Offline Readiness',
    description: 'Checking offline data and cache readiness',
    primary_categories: ['offline_readiness', 'connectivity_status'],
  },
  loadout_check: {
    label: 'Loadout Check',
    description: 'Evaluating loadout status and weight impact',
    primary_categories: ['loadout_status', 'vehicle_profile'],
  },
  connectivity_check: {
    label: 'Connectivity Check',
    description: 'Checking network and connectivity status',
    primary_categories: ['connectivity_status', 'remoteness_status'],
  },
  remoteness_check: {
    label: 'Remoteness Check',
    description: 'Evaluating current remoteness and isolation',
    primary_categories: ['remoteness_status', 'connectivity_status', 'offline_readiness'],
  },
  expedition_overview: {
    label: 'Expedition Overview',
    description: 'Comprehensive expedition status summary',
    primary_categories: ['vehicle_profile', 'vehicle_health', 'loadout_status', 'power_status', 'connectivity_status', 'remoteness_status', 'risk_status', 'route_context', 'offline_readiness'],
  },
  general: {
    label: 'General',
    description: 'General expedition guidance',
    primary_categories: [],
  },
  session_status: {
    label: 'Session Status',
    description: 'Current expedition session information',
    primary_categories: [],
  },
  what_changed: {
    label: 'What Changed',
    description: 'Recent changes during this session',
    primary_categories: [],
  },
};



/**
 * A single structured response block from the assistant.
 */
export interface AssistantResponseBlock {
  /** Unique ID for this response block */
  id: string;
  /** Response type classification */
  type: AssistantResponseType;
  /** Main response text */
  text: string;
  /** Confidence level based on available context */
  confidence: AssistantConfidenceLevel;
  /** Context categories that contributed to this response */
  source_categories: AssistantContextCategory[];
  /** ISO timestamp when this response was generated */
  generated_at: string;
}

/**
 * Complete assistant response to a user query.
 */
export interface AssistantResponse {
  /** Unique response ID */
  id: string;
  /** The user's original query */
  query: string;
  /** Structured response blocks */
  blocks: AssistantResponseBlock[];
  /** Overall confidence level */
  confidence: AssistantConfidenceLevel;
  /** Number of context categories available at response time */
  context_available: number;
  /** Total context categories */
  context_total: number;
  /** Whether the response was generated online or offline */
  mode: 'online' | 'offline' | 'placeholder';
  /** Phase 7B: Context basis \u2014 how much live ECS data contributed */
  context_basis: ContextBasis;
  /** Phase 7B: Classified query intent */
  query_intent: QueryIntent;
  /** ISO timestamp */
  generated_at: string;
}



// ── Conversation Model ───────────────────────────────────

/**
 * A single conversation turn (user query + assistant response).
 */
export interface AssistantConversationTurn {
  /** User's query text */
  query: string;
  /** Assistant's response */
  response: AssistantResponse;
  /** ISO timestamp of the turn */
  timestamp: string;
}


// ── Assistant Summary (UI Use) ───────────────────────────

/**
 * Compact assistant summary for UI badges and quick display.
 */
export interface AssistantSummary {
  /** Whether the assistant is initialized and ready */
  is_ready: boolean;
  /** Number of available context categories */
  context_available: number;
  /** Total context categories */
  context_total: number;
  /** Context completeness percentage */
  completeness_pct: number;
  /** Current operational mode */
  mode: 'online' | 'offline' | 'placeholder';
  /** Number of conversation turns in current session */
  conversation_length: number;
  /** ISO timestamp of last interaction */
  last_interaction_at: string | null;
  /** Whether live assistant generation is available */
  generation_available: boolean;
  /** Phase 7C: Number of active guidance cards */
  active_guidance_count: number;
}


// ══════════════════════════════════════════════════════════
// Phase 7C: Guided Recommendation Engine Types
// ══════════════════════════════════════════════════════════

/**
 * Trigger condition identifiers for guidance cards.
 * Each maps to a specific ECS signal evaluation rule.
 *
 * Phase 7C addition.
 */
export type GuidanceTriggerCondition =
  | 'risk_elevated'                // Risk score > 50
  | 'risk_critical'                // Risk score > 75
  | 'load_unbalanced'              // Payload margin < 10% of GVWR
  | 'load_overweight'              // Vehicle exceeds GVWR
  | 'power_limited'                // Battery < 30%, not sustainable
  | 'power_critical'               // Battery < 15%
  | 'fuel_low'                     // Fuel < 25%
  | 'fuel_critical'                // Fuel < 10%
  | 'water_low'                    // Water reserves approaching threshold
  | 'connectivity_lost_no_cache'   // Offline with no cached data
  | 'route_exceeds_capability'     // Route difficulty > vehicle capability
  | 'offline_data_missing'         // No offline data for active route/area
  | 'critical_loadout_missing'     // Critical loadout items not packed
  | 'vehicle_anomaly'              // Vehicle health anomaly detected
  | 'remoteness_high_unprepared';  // High remoteness without offline cache

/**
 * Display configuration for guidance trigger conditions.
 */
export const GUIDANCE_TRIGGER_DISPLAY: Record<GuidanceTriggerCondition, {
  label: string;
  shortLabel: string;
  icon: string;
  color: string;
  severity: 'info' | 'warning' | 'critical';
}> = {
  risk_elevated: {
    label: 'Elevated Risk',
    shortLabel: 'RISK',
    icon: 'shield-outline',
    color: '#E67E22',
    severity: 'warning',
  },
  risk_critical: {
    label: 'Critical Risk',
    shortLabel: 'RISK',
    icon: 'shield-outline',
    color: '#EF5350',
    severity: 'critical',
  },
  load_unbalanced: {
    label: 'Load Imbalance',
    shortLabel: 'LOAD',
    icon: 'scale-outline',
    color: '#FFB300',
    severity: 'warning',
  },
  load_overweight: {
    label: 'Overweight',
    shortLabel: 'WEIGHT',
    icon: 'scale-outline',
    color: '#EF5350',
    severity: 'critical',
  },
  power_limited: {
    label: 'Power Limited',
    shortLabel: 'POWER',
    icon: 'flash-outline',
    color: '#FFB300',
    severity: 'warning',
  },
  power_critical: {
    label: 'Power Critical',
    shortLabel: 'POWER',
    icon: 'flash-outline',
    color: '#EF5350',
    severity: 'critical',
  },
  fuel_low: {
    label: 'Fuel Low',
    shortLabel: 'FUEL',
    icon: 'speedometer-outline',
    color: '#FFB300',
    severity: 'warning',
  },
  fuel_critical: {
    label: 'Fuel Critical',
    shortLabel: 'FUEL',
    icon: 'speedometer-outline',
    color: '#EF5350',
    severity: 'critical',
  },
  water_low: {
    label: 'Water Low',
    shortLabel: 'WATER',
    icon: 'water-outline',
    color: '#5AC8FA',
    severity: 'warning',
  },
  connectivity_lost_no_cache: {
    label: 'Offline \u2014 No Cache',
    shortLabel: 'CONN',
    icon: 'cloud-offline-outline',
    color: '#E67E22',
    severity: 'warning',
  },
  route_exceeds_capability: {
    label: 'Route Exceeds Capability',
    shortLabel: 'ROUTE',
    icon: 'warning-outline',
    color: '#EF5350',
    severity: 'critical',
  },
  offline_data_missing: {
    label: 'Offline Data Missing',
    shortLabel: 'OFFLINE',
    icon: 'cloud-download-outline',
    color: '#FFB300',
    severity: 'warning',
  },
  critical_loadout_missing: {
    label: 'Critical Gear Missing',
    shortLabel: 'LOADOUT',
    icon: 'cube-outline',
    color: '#EF5350',
    severity: 'critical',
  },
  vehicle_anomaly: {
    label: 'Vehicle Anomaly',
    shortLabel: 'HEALTH',
    icon: 'pulse-outline',
    color: '#EF5350',
    severity: 'critical',
  },
  remoteness_high_unprepared: {
    label: 'Remote \u2014 Unprepared',
    shortLabel: 'REMOTE',
    icon: 'locate-outline',
    color: '#E67E22',
    severity: 'warning',
  },
};

/**
 * Priority display for guidance cards.
 * Lower number = higher priority.
 */
export const GUIDANCE_PRIORITY_DISPLAY: Record<string, {
  label: string;
  color: string;
}> = {
  '1': { label: 'CRITICAL', color: '#EF5350' },
  '2': { label: 'HIGH', color: '#E67E22' },
  '3': { label: 'MEDIUM', color: '#FFB300' },
  '4': { label: 'LOW', color: '#78909C' },
};


/**
 * Quick guidance card for proactive assistant behavior.
 *
 * Phase 7A: Architecture placeholder.
 * Phase 7C: Full implementation with trigger conditions,
 * explanations, suggested actions, auto-dismiss, and
 * context basis tracking.
 */
export interface AssistantGuidanceCard {
  /** Unique card ID */
  id: string;
  /** Card title (concise summary) */
  title: string;
  /** Card body text (brief explanation) */
  body: string;
  /** Expanded explanation (shown on tap) */
  explanation: string;
  /** Specific suggested action text */
  suggested_action: string;
  /** Response type for visual styling */
  type: AssistantResponseType;
  /** Confidence level */
  confidence: AssistantConfidenceLevel;
  /** Priority (1=critical, 2=high, 3=medium, 4=low) */
  priority: number;
  /** The trigger condition that generated this card */
  trigger: GuidanceTriggerCondition;
  /** Context categories that contributed to this card */
  source_categories: AssistantContextCategory[];
  /** Context basis when this card was generated */
  context_basis: ContextBasis;
  /** Whether this card has been dismissed by the user */
  dismissed: boolean;
  /** Whether the triggering condition has resolved */
  resolved: boolean;
  /** Whether the card is expanded in the UI */
  expanded: boolean;
  /** Whether this card was generated from live ECS telemetry */
  from_live_telemetry: boolean;
  /** ISO timestamp when generated */
  generated_at: string;
  /** ISO timestamp when resolved (null if still active) */
  resolved_at: string | null;
}

// ══════════════════════════════════════════════════════════
// Phase 7D: Expedition Session Awareness Types
// ══════════════════════════════════════════════════════════

/**
 * Expedition session trigger — what initiated the assistant session.
 *
 * Phase 7D addition.
 */
export type SessionTrigger =
  | 'expedition_active'    // Expedition mode is active
  | 'route_active'         // An active route is loaded
  | 'manual'               // User manually started a session
  | 'auto_resume';         // Session restored from persistence

/**
 * Expedition session lifecycle state.
 *
 * Phase 7D addition.
 */
export type SessionLifecycleState =
  | 'inactive'     // No active session
  | 'active'       // Session is running
  | 'suspended'    // App backgrounded, session preserved
  | 'ended';       // Session completed or cleared

/**
 * Display configuration for session lifecycle states.
 */
export const SESSION_LIFECYCLE_DISPLAY: Record<SessionLifecycleState, {
  label: string;
  shortLabel: string;
  color: string;
  icon: string;
}> = {
  inactive: {
    label: 'No Session',
    shortLabel: 'IDLE',
    color: '#78909C',
    icon: 'ellipse-outline',
  },
  active: {
    label: 'Session Active',
    shortLabel: 'ACTIVE',
    color: '#4CAF50',
    icon: 'radio-outline',
  },
  suspended: {
    label: 'Session Suspended',
    shortLabel: 'SUSPENDED',
    color: '#FFB300',
    icon: 'pause-circle-outline',
  },
  ended: {
    label: 'Session Ended',
    shortLabel: 'ENDED',
    color: '#78909C',
    icon: 'stop-circle-outline',
  },
};

/**
 * A single context change detected between two snapshots.
 *
 * Phase 7D addition.
 */
export interface ContextChange {
  /** Which context category changed */
  category: AssistantContextCategory;
  /** Human-readable description of the change */
  description: string;
  /** Direction of change (improved, degraded, or neutral) */
  direction: 'improved' | 'degraded' | 'neutral';
  /** ISO timestamp when detected */
  detected_at: string;
}

/**
 * Context delta — differences between two context snapshots.
 *
 * Phase 7D addition.
 */
export interface ContextDelta {
  /** List of detected changes */
  changes: ContextChange[];
  /** Number of categories that improved */
  improved_count: number;
  /** Number of categories that degraded */
  degraded_count: number;
  /** Whether any significant changes were detected */
  has_significant_changes: boolean;
  /** ISO timestamp of the previous snapshot */
  previous_snapshot_at: string;
  /** ISO timestamp of the current snapshot */
  current_snapshot_at: string;
}

/**
 * Tracks previously delivered guidance for duplicate suppression.
 *
 * Phase 7D addition.
 */
export interface GuidanceDeliveryRecord {
  /** Trigger condition */
  trigger: GuidanceTriggerCondition;
  /** Priority when last delivered */
  last_priority: number;
  /** ISO timestamp when last delivered */
  last_delivered_at: string;
  /** Number of times this trigger has fired in this session */
  delivery_count: number;
  /** Whether the condition was resolved at least once */
  was_resolved: boolean;
}

/**
 * Expedition session context — tracks the assistant's awareness
 * of the current expedition or operational session.
 *
 * Phase 7D addition.
 */
export interface ExpeditionSessionContext {
  /** Unique session ID */
  session_id: string;
  /** What triggered this session */
  trigger: SessionTrigger;
  /** Current lifecycle state */
  lifecycle: SessionLifecycleState;
  /** ISO timestamp when session started */
  session_start_time: string;
  /** ISO timestamp when session ended (null if still active) */
  session_end_time: string | null;
  /** Duration in seconds (computed) */
  duration_seconds: number;
  /** Active route name at session start */
  active_route: string | null;
  /** Vehicle profile name at session start */
  vehicle_profile: string | null;
  /** Expedition region (from remoteness or route) */
  expedition_region: string | null;
  /** Whether an ECS expedition is active */
  expedition_mode_active: boolean;
  /** Previous context snapshot for delta computation */
  previous_snapshot: AssistantContextSnapshot | null;
  /** Most recent context delta */
  latest_delta: ContextDelta | null;
  /** History of context deltas (limited) */
  delta_history: ContextDelta[];
  /** Guidance delivery records for duplicate suppression */
  guidance_delivery_log: GuidanceDeliveryRecord[];
  /** Number of guidance evaluations this session */
  guidance_eval_count: number;
  /** Number of queries answered this session */
  query_count: number;
  /** ISO timestamp of last activity */
  last_activity_at: string;
}


// ── Updated Assistant State (Phase 7D) ───────────────────

/**
 * Internal state of the AI Expedition Assistant.
 * Phase 7D: Added expedition session context.
 */
export interface AssistantState {
  /** Whether the assistant has been initialized */
  initialized: boolean;
  /** Whether the assistant is currently processing a query */
  processing: boolean;
  /** Current context snapshot */
  context: AssistantContextSnapshot | null;
  /** Context diagnostics */
  diagnostics: AssistantContextDiagnostics | null;
  /** Conversation history (current session) */
  conversation: AssistantConversationTurn[];
  /** Phase 7C: Active guidance cards */
  guidance_cards: AssistantGuidanceCard[];
  /** Phase 7D: Expedition session context */
  expedition_session: ExpeditionSessionContext | null;
  /** Summary for UI consumption */
  summary: AssistantSummary;
  /** Current operational mode */
  mode: 'online' | 'offline' | 'placeholder';
  /** Whether live generation is available */
  generation_available: boolean;
  /** Error message if last operation failed */
  last_error: string | null;
  /** ISO timestamp of last state update */
  updated_at: string;
}


// ── Updated Session Persistence (Phase 7D) ───────────────

/**
 * Persisted session data for the AI Expedition Assistant.
 * Phase 7D: Added expedition session context.
 */
export interface AssistantSession {
  /** Schema version */
  version: number;
  /** Last conversation history */
  conversation: AssistantConversationTurn[];
  /** Phase 7C: Persisted guidance cards (non-dismissed only) */
  guidance_cards: AssistantGuidanceCard[];
  /** Phase 7D: Expedition session context (if active) */
  expedition_session: ExpeditionSessionContext | null;
  /** Last known summary */
  last_summary: AssistantSummary;
  /** ISO timestamp when session was persisted */
  persisted_at: string;
}

/** Current session schema version (Phase 7D: v4) */
export const ASSISTANT_SESSION_VERSION = 4;


// ── Default Factories ────────────────────────────────────

export function createDefaultAssistantContextSnapshot(): AssistantContextSnapshot {
  return {
    vehicle_profile: {
      availability: 'unavailable',
      vehicle_name: null,
      vehicle_type: null,
      make: null,
      model: null,
      gvwr_lb: null,
      base_weight_lb: null,
      fuel_tank_capacity_gal: null,
      fuel_type: null,
      has_specs: false,
    },
    vehicle_health: {
      availability: 'unavailable',
      has_live_telemetry: false,
      engine_status: 'unknown',
      battery_voltage: null,
      battery_health: 'unknown',
      fuel_percent: null,
      coolant_temp_f: null,
      has_anomaly: false,
      anomaly_flags: [],
      telemetry_freshness: 'disconnected',
    },
    loadout_status: {
      availability: 'unavailable',
      has_active_loadout: false,
      loadout_name: null,
      total_items: 0,
      packed_items: 0,
      critical_items: 0,
      critical_missing: 0,
      readiness_pct: 0,
      total_weight_lbs: null,
      payload_margin_lb: null,
      is_overweight: false,
    },
    power_status: {
      availability: 'unavailable',
      has_blu_telemetry: false,
      battery_percent: null,
      input_watts: null,
      output_watts: null,
      runtime_minutes: null,
      is_sustainable: false,
      device_count: 0,
    },
    connectivity_status: {
      availability: 'unavailable',
      connectivity_state: 'unknown',
      signal_quality: 'unknown',
      internet_reachable: false,
      offline_cache_ready: false,
      operational_readiness: 'offline_unprepared',
      freshness: 'offline',
      network_type: 'unknown',
    },
    remoteness_status: {
      availability: 'unavailable',
      remoteness_score: null,
      remoteness_tier: null,
      engine_running: false,
      cache_ready: false,
    },
    risk_status: {
      availability: 'unavailable',
      risk_score: 0,
      operational_status: 'optimal',
      primary_risk_factor: 'none',
      primary_risk_label: 'No Concerns',
      capability_score: 0,
      resource_readiness: 0,
      connectivity_risk: 0,
      isolation_risk: 0,
      summary_line: 'Awaiting data\u2026',
      is_complete: false,
      route_difficulty_score: 0,
      resource_route_balance: 100,
      health_score: 0,
      stabilized_status: 'optimal',
    },

    route_context: {
      availability: 'unavailable',
      has_active_route: false,
      route_name: null,
      total_distance_mi: null,
      elevation_gain_ft: null,
      waypoint_count: 0,
      segment_count: 0,
      source_format: null,
    },
    offline_readiness: {
      availability: 'unavailable',
      has_offline_data: false,
      downloaded_regions: 0,
      total_entries: 0,
      storage_mb: 0,
      covers_current_position: false,
      covers_active_route: false,
      available_categories: [],
      all_regions_valid: false,
    },
    assembled_at: new Date().toISOString(),
    available_count: 0,
    total_count: 9,
    is_complete: false,
  };
}

export function createDefaultAssistantSummary(): AssistantSummary {
  return {
    is_ready: false,
    context_available: 0,
    context_total: 9,
    completeness_pct: 0,
    mode: 'placeholder',
    conversation_length: 0,
    last_interaction_at: null,
    generation_available: false,
    active_guidance_count: 0,
  };
}

export function createDefaultAssistantState(): AssistantState {
  return {
    initialized: false,
    processing: false,
    context: null,
    diagnostics: null,
    conversation: [],
    guidance_cards: [],
    expedition_session: null,
    summary: createDefaultAssistantSummary(),
    mode: 'placeholder',
    generation_available: false,
    last_error: null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Create a new expedition session context.
 * Phase 7D addition.
 */
export function createExpeditionSession(
  trigger: SessionTrigger,
  opts?: {
    route_name?: string | null;
    vehicle_name?: string | null;
    region?: string | null;
    expedition_active?: boolean;
  },
): ExpeditionSessionContext {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  const id = (c && c.randomUUID) ? c.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
      const r = (Math.random() * 16) | 0;
      const v = ch === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });

  const now = new Date().toISOString();
  return {
    session_id: id,
    trigger,
    lifecycle: 'active',
    session_start_time: now,
    session_end_time: null,
    duration_seconds: 0,
    active_route: opts?.route_name ?? null,
    vehicle_profile: opts?.vehicle_name ?? null,
    expedition_region: opts?.region ?? null,
    expedition_mode_active: opts?.expedition_active ?? false,
    previous_snapshot: null,
    latest_delta: null,
    delta_history: [],
    guidance_delivery_log: [],
    guidance_eval_count: 0,
    query_count: 0,
    last_activity_at: now,
  };
}

