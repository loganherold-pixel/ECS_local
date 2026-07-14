/**
 * Debrief & AAR Store
 *
 * Phase 2: Expedition Intelligence
 * Manages debrief wizard state and AAR report data.
 * Persists locally and syncs to Supabase via edge function.
 *
 * Phase 2.5: AI-Powered Analysis
 * Adds AI analysis generation via analyze-expedition edge function.
 *
 * Phase 3: Cross-Expedition Trends
 * Aggregates analytics across all completed expeditions.
 */

import { isDeployedEdgeFunction, supabase } from './supabase';
import { Platform } from 'react-native';
import type { ECSFeatureVisibilityContext } from './features/featureVisibilityRegistry';
import {
  createECSAIInputFingerprint,
  ECS_AI_POLICY_VERSION,
  inspectECSAIProviderOutput,
  resolveECSAIExecutionPolicy,
} from './ai/aiPolicyBoundary';
import { ecsAIRequestCoordinator } from './ai/aiRequestCoordinator';
import {
  evaluateLegacyDebriefAnalysisOwnership,
  evaluateLegacyTrendSynthesisOwnership,
  isPolicyValidatedDebriefTrace,
  stripUnvalidatedAARAI,
} from './ai/debriefAIContract';

// ── Types ────────────────────────────────────────────────────

export type DebriefOutcome = 'SUCCESS' | 'MODIFIED' | 'ABORTED';

export interface DebriefData {
  expedition_id: string;
  outcome: DebriefOutcome;
  outcome_reason: string | null;
  fuel_delta_pct: number;
  water_delta_pct: number;
  power_delta_pct: number;
  consumables_matched_plan: boolean;
  vehicle_performed_expected: boolean;
  route_matched_expected: boolean;
  went_well: string;
  went_wrong: string;
  change_next_time: string;
  created_by?: string | null;
  created_at?: string;
}

export interface AARPerformanceSummary {
  outcome: DebriefOutcome;
  outcome_reason: string | null;
  fuel_delta_pct: number;
  water_delta_pct: number;
  power_delta_pct: number;
  consumables_matched_plan: boolean;
  vehicle_performed_expected: boolean;
  route_matched_expected: boolean;
}

export interface AARRiskSummary {
  total_events: number;
  type_counts: Record<string, number>;
  severity_counts: Record<string, number>;
  critical_count: number;
  high_count: number;
  critical_highlights: Array<{
    type: string;
    severity: string;
    details: string;
    time: string;
  }>;
}

// ── AI Analysis Types ────────────────────────────────────────

export interface AIPatternItem {
  title: string;
  detail: string;
  severity: 'LOW' | 'MED' | 'HIGH' | 'CRITICAL';
}

export interface AIRiskTrend {
  title: string;
  detail: string;
  trend: 'IMPROVING' | 'STABLE' | 'WORSENING';
}

export interface AIResourceOpt {
  title: string;
  detail: string;
}

export interface AIRouteImprovement {
  title: string;
  detail: string;
}

export interface AIAnalysis {
  pattern_analysis: AIPatternItem[];
  risk_trends: AIRiskTrend[];
  resource_optimization: AIResourceOpt[];
  route_improvements: AIRouteImprovement[];
  critical_insights: string[];
  overall_risk_score: number;
  expedition_grade: string;
  summary: string;
  generated_at: string;
  model: string;
  event_count: number;
  has_debrief: boolean;
  ecs_trace?: ECSAIStoreTrace;
}

export type ECSAIStoreTrace = {
  policyVersion: typeof ECS_AI_POLICY_VERSION;
  featureId: 'debrief_synthesis';
  inputFingerprint: string;
  deterministicSource: 'debrief_aar' | 'cross_expedition_trends';
};

export type ECSAIStoreExecutionOptions = {
  visibilityContext?: ECSFeatureVisibilityContext | null;
  signal?: AbortSignal | null;
  timeoutMs?: number;
  maxRetries?: number;
};

// ── AAR Report ───────────────────────────────────────────────

export interface AARReport {
  id: string;
  expedition_id: string;
  performance_summary: AARPerformanceSummary;
  risk_summary: AARRiskSummary;
  recommendations: string[];
  ai_analysis?: AIAnalysis | null;
  generated_at: string;
  created_at: string;
  updated_at: string;
}

// ── Outcome Reason Options ───────────────────────────────────

export const OUTCOME_REASONS = [
  'Weather conditions',
  'Vehicle mechanical issue',
  'Route impassable',
  'Medical emergency',
  'Supply shortage',
  'Time constraint',
  'Safety concern',
  'Other',
] as const;

// ── Storage ──────────────────────────────────────────────────

const DEBRIEF_KEY = 'ecs_debrief_cache';
const AAR_KEY = 'ecs_aar_cache';
const AI_ANALYSIS_KEY = 'ecs_ai_analysis_cache';

function loadCache<T>(key: string): Record<string, T> {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return {};
}

function saveCache<T>(key: string, data: Record<string, T>): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(data));
    }
  } catch {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasBoundedText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 2_000;
}

function hasBoundedObjectArray(value: unknown, requiredKeys: string[]): boolean {
  return Array.isArray(value) && value.length <= 50 && value.every(item => {
    if (!isRecord(item)) return false;
    return requiredKeys.every(key => hasBoundedText(item[key]));
  });
}

function validateAIAnalysis(value: unknown): value is AIAnalysis {
  if (!isRecord(value)) return false;
  return (
    hasBoundedObjectArray(value.pattern_analysis, ['title', 'detail', 'severity']) &&
    hasBoundedObjectArray(value.risk_trends, ['title', 'detail', 'trend']) &&
    hasBoundedObjectArray(value.resource_optimization, ['title', 'detail']) &&
    hasBoundedObjectArray(value.route_improvements, ['title', 'detail']) &&
    Array.isArray(value.critical_insights) &&
    value.critical_insights.length <= 50 &&
    value.critical_insights.every(hasBoundedText) &&
    typeof value.overall_risk_score === 'number' && Number.isFinite(value.overall_risk_score) &&
    hasBoundedText(value.expedition_grade) &&
    hasBoundedText(value.summary) &&
    hasBoundedText(value.generated_at) &&
    hasBoundedText(value.model) &&
    typeof value.event_count === 'number' && Number.isFinite(value.event_count) &&
    typeof value.has_debrief === 'boolean'
  );
}

function isPolicyValidatedAIAnalysis(value: unknown): value is AIAnalysis {
  if (!validateAIAnalysis(value)) return false;
  return isPolicyValidatedDebriefTrace(value.ecs_trace, 'debrief_aar');
}

// ── Store ────────────────────────────────────────────────────

type Listener = () => void;

class DebriefStore {
  private debriefs: Record<string, DebriefData> = {};
  private aars: Record<string, AARReport> = {};
  private aiAnalyses: Record<string, AIAnalysis> = {};
  private listeners: Set<Listener> = new Set();

  constructor() {
    this.debriefs = loadCache<DebriefData>(DEBRIEF_KEY);
    this.aars = loadCache<AARReport>(AAR_KEY);
    this.aiAnalyses = loadCache<AIAnalysis>(AI_ANALYSIS_KEY);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }

  private persistDebriefs() {
    saveCache(DEBRIEF_KEY, this.debriefs);
  }

  private persistAARs() {
    saveCache(AAR_KEY, this.aars);
  }

  private persistAIAnalyses() {
    saveCache(AI_ANALYSIS_KEY, this.aiAnalyses);
  }

  // ── Debrief ──────────────────────────────────────────────

  getDebrief(expeditionId: string): DebriefData | null {
    return this.debriefs[expeditionId] || null;
  }

  async loadDebrief(expeditionId: string): Promise<DebriefData | null> {
    if (!isDeployedEdgeFunction('expedition-events')) {
      return this.debriefs[expeditionId] || null;
    }
    try {
      const { data, error } = await supabase.functions.invoke('expedition-events', {
        body: { action: 'get_debrief', expedition_id: expeditionId },
      });

      if (error || !data?.debrief) {
        return this.debriefs[expeditionId] || null;
      }

      this.debriefs[expeditionId] = data.debrief;
      this.persistDebriefs();
      this.notify();
      return data.debrief;
    } catch {
      return this.debriefs[expeditionId] || null;
    }
  }

  async saveDebrief(
    debrief: DebriefData,
    onFail?: (msg: string) => void,
  ): Promise<{ success: boolean; statusUpdated?: boolean }> {
    // Save locally first
    this.debriefs[debrief.expedition_id] = debrief;
    this.persistDebriefs();
    this.notify();

    if (!isDeployedEdgeFunction('expedition-events')) {
      if (onFail) onFail('Debrief saved locally. Cloud sync unavailable in this ECS backend.');
      return { success: false };
    }

    try {
      const { data, error } = await supabase.functions.invoke('expedition-events', {
        body: {
          action: 'save_debrief',
          ...debrief,
        },
      });

      if (error || !data?.debrief) {
        throw new Error(error?.message || data?.error || 'Failed to save debrief');
      }

      this.debriefs[debrief.expedition_id] = data.debrief;
      this.persistDebriefs();
      this.notify();

      return { success: true, statusUpdated: data.status_updated };
    } catch (err: any) {
      console.warn('[DebriefStore] Save failed:', err.message);
      if (onFail) onFail('Debrief saved locally. Sync failed.');
      return { success: false };
    }
  }

  // ── AAR ──────────────────────────────────────────────────

  getAAR(expeditionId: string): AARReport | null {
    const aar = this.aars[expeditionId] || null;
    if (aar) {
      aar.ai_analysis = isPolicyValidatedAIAnalysis(this.aiAnalyses[expeditionId])
        ? this.aiAnalyses[expeditionId]
        : null;
    }
    return aar;
  }

  async loadAAR(expeditionId: string): Promise<AARReport | null> {
    if (!isDeployedEdgeFunction('expedition-events')) {
      return this.getAAR(expeditionId);
    }
    try {
      const { data, error } = await supabase.functions.invoke('expedition-events', {
        body: { action: 'get_aar', expedition_id: expeditionId },
      });

      if (error || !data?.aar) {
        return this.getAAR(expeditionId);
      }

      this.aars[expeditionId] = stripUnvalidatedAARAI(data.aar) as unknown as AARReport;
      this.persistAARs();
      this.notify();
      return this.getAAR(expeditionId);
    } catch {
      return this.getAAR(expeditionId);
    }
  }

  async generateAAR(
    expeditionId: string,
    onFail?: (msg: string) => void,
  ): Promise<AARReport | null> {
    if (!isDeployedEdgeFunction('expedition-events')) {
      if (onFail) onFail('AAR generation unavailable in this ECS backend.');
      return this.aars[expeditionId] || null;
    }
    try {
      const { data, error } = await supabase.functions.invoke('expedition-events', {
        body: { action: 'generate_aar', expedition_id: expeditionId },
      });

      if (error || !data?.aar) {
        throw new Error(error?.message || data?.error || 'Failed to generate AAR');
      }

      this.aars[expeditionId] = data.aar;
      this.persistAARs();
      this.notify();
      return data.aar;
    } catch (err: any) {
      console.warn('[DebriefStore] AAR generation failed:', err.message);
      if (onFail) onFail('AAR generation failed. Try again.');
      return null;
    }
  }

  // ── Close Expedition + Generate AAR (single RPC) ─────────
  // Calls the database function close_expedition_and_generate_aar
  // which atomically: closes the expedition, sets end_time, generates AAR.
  // Falls back to edge-function generateAAR if RPC is unavailable.

  async closeAndGenerateAAR(
    expeditionId: string,
    onFail?: (msg: string) => void,
  ): Promise<AARReport | null> {
    try {
      // Call the RPC — single atomic transaction
      const { error: rpcError } = await supabase.rpc(
        'close_expedition_and_generate_aar',
        { p_expedition_id: expeditionId },
      );

      if (rpcError) {
        throw new Error(rpcError.message || 'RPC close_expedition_and_generate_aar failed');
      }

      // RPC succeeded — now fetch the generated AAR
      const aar = await this.loadAAR(expeditionId);
      if (aar) {
        return aar;
      }

      // If loadAAR via edge function didn't return data, try direct query
      try {
        const { data: aarData, error: aarError } = await supabase
          .from('aar_reports')
          .select('*')
          .eq('expedition_id', expeditionId)
          .maybeSingle();


        if (!aarError && aarData) {
          // Parse JSON fields if they come as strings
          const report: AARReport = {
            id: aarData.id,
            expedition_id: aarData.expedition_id,
            performance_summary: typeof aarData.performance_summary === 'string'
              ? JSON.parse(aarData.performance_summary) : aarData.performance_summary,
            risk_summary: typeof aarData.risk_summary === 'string'
              ? JSON.parse(aarData.risk_summary) : aarData.risk_summary,
            recommendations: typeof aarData.recommendations === 'string'
              ? JSON.parse(aarData.recommendations) : (aarData.recommendations || []),
            ai_analysis: null,
            generated_at: aarData.generated_at || aarData.created_at,
            created_at: aarData.created_at,
            updated_at: aarData.updated_at,
          };

          this.aars[expeditionId] = report;
          this.persistAARs();
          this.notify();
          return report;
        }
      } catch {
        // Direct query fallback failed — still return null gracefully
      }

      return null;
    } catch (err: any) {
      console.warn('[DebriefStore] closeAndGenerateAAR failed:', err.message);

      // Fallback: try the edge-function approach
      console.warn('[DebriefStore] Falling back to edge-function generateAAR');
      try {
        const aar = await this.generateAAR(expeditionId, onFail);
        return aar;
      } catch {
        if (onFail) onFail(`Close & AAR failed: ${err.message}`);
        return null;
      }
    }
  }


  // ── AI Analysis ──────────────────────────────────────────

  getAIAnalysis(expeditionId: string): AIAnalysis | null {
    const value = this.aiAnalyses[expeditionId];
    return isPolicyValidatedAIAnalysis(value) ? value : null;
  }

  async generateAIAnalysis(
    expeditionId: string,
    onProgress?: (msg: string) => void,
    onFail?: (msg: string) => void,
    execution: ECSAIStoreExecutionOptions = {},
  ): Promise<AIAnalysis | null> {
    const policyDecision = resolveECSAIExecutionPolicy('debrief_synthesis', execution.visibilityContext);
    if (!policyDecision.allowed) {
      if (onFail) onFail(policyDecision.fallbackCopy);
      return this.getAIAnalysis(expeditionId);
    }
    if (!isDeployedEdgeFunction('analyze-expedition')) {
      if (onFail) onFail('ECS analysis unavailable in this backend.');
      return this.getAIAnalysis(expeditionId);
    }
    try {
      if (onProgress) onProgress('Analyzing expedition data...');
      const inputFingerprint = createECSAIInputFingerprint('debrief_synthesis', {
        expeditionId,
        debrief: this.debriefs[expeditionId] ?? null,
        aar: this.aars[expeditionId]
          ? {
              performance_summary: this.aars[expeditionId].performance_summary,
              risk_summary: this.aars[expeditionId].risk_summary,
              recommendations: this.aars[expeditionId].recommendations,
            }
          : null,
      });
      const trace: ECSAIStoreTrace = {
        policyVersion: ECS_AI_POLICY_VERSION,
        featureId: 'debrief_synthesis',
        inputFingerprint,
        deterministicSource: 'debrief_aar',
      };
      const outcome = await ecsAIRequestCoordinator.execute<AIAnalysis>({
        featureId: 'debrief_synthesis',
        executionDecision: policyDecision,
        fingerprint: inputFingerprint,
        signal: execution.signal,
        timeoutMs: execution.timeoutMs,
        maxRetries: execution.maxRetries,
        invoke: async () => {
          const { data, error } = await supabase.functions.invoke('analyze-expedition', {
            body: { expedition_id: expeditionId },
          });
          if (error) throw error;
          return {
            output: data?.analysis ?? null,
            usage: data?.usage ?? null,
          };
        },
        validate: (value) => {
          if (!validateAIAnalysis(value)) {
            return { accepted: false, reasons: ['invalid_output_schema'], classification: 'invalid_output' };
          }
          const ownership = evaluateLegacyDebriefAnalysisOwnership(value);
          if (!ownership.accepted) {
            return {
              accepted: false,
              reasons: ownership.reasons,
              classification: 'policy_rejected',
            };
          }
          const policyIssues = inspectECSAIProviderOutput('debrief_synthesis', value, {
            hasLiveSource: false,
            supportsLegalClaims: false,
            supportsWeatherClaims: false,
          });
          if (policyIssues.length > 0) {
            return {
              accepted: false,
              reasons: policyIssues.map(item => item.code),
              classification: 'policy_rejected',
            };
          }
          return {
            accepted: true,
            value: { ...value, ecs_trace: trace },
            reasons: [],
          };
        },
      });
      const analysis = outcome.value;
      if (!analysis) {
        if (onFail) onFail(`AI explanation unavailable; deterministic debrief remains available (${outcome.status}).`);
        return this.getAIAnalysis(expeditionId);
      }

      // Cache locally
      this.aiAnalyses[expeditionId] = analysis;
      this.persistAIAnalyses();

      // Also update the AAR in cache if it exists
      if (this.aars[expeditionId]) {
        this.aars[expeditionId] = {
          ...this.aars[expeditionId],
          ai_analysis: analysis,
        };
        this.persistAARs();
      }

      this.notify();
      return analysis;
    } catch (err: any) {
      console.warn('[DebriefStore] ECS analysis failed:', err.message);
      if (onFail) onFail(`ECS analysis failed: ${err.message}`);
      return null;
    }
  }

  hasDebrief(expeditionId: string): boolean {
    return !!this.debriefs[expeditionId];
  }

  hasAAR(expeditionId: string): boolean {
    return !!this.aars[expeditionId];
  }

  hasAIAnalysis(expeditionId: string): boolean {
    return this.getAIAnalysis(expeditionId) != null;
  }
}

export const debriefStore = new DebriefStore();

// ══════════════════════════════════════════════════════════════
// CROSS-EXPEDITION TRENDS TYPES
// ══════════════════════════════════════════════════════════════

export interface ResourceTrendPoint {
  expedition_id: string;
  title: string;
  date: string;
  fuel_delta: number;
  water_delta: number;
  power_delta: number;
  outcome: string;
}

export interface GradeHistoryPoint {
  expedition_id: string;
  title: string;
  date: string;
  grade: string;
  risk_score: number;
}

export interface LessonLearned {
  expedition_id: string;
  title: string;
  date: string;
  went_well: string;
  went_wrong: string;
  change_next_time: string;
}

export interface RiskCategory {
  type: string;
  count: number;
  critical: number;
  high: number;
  risk_weight: number;
}

export interface ExpeditionTimelineItem {
  id: string;
  title: string;
  date: string;
  end_date: string | null;
  status: string;
  event_count: number;
  outcome: string | null;
  grade: string | null;
  risk_score: number | null;
  has_debrief: boolean;
  has_aar: boolean;
}

export interface CrossExpeditionTrends {
  expedition_count: number;
  event_count: number;
  debrief_count: number;
  event_type_totals: Record<string, number>;
  severity_totals: Record<string, number>;
  resource_trends: ResourceTrendPoint[];
  grade_history: GradeHistoryPoint[];
  lessons_learned: LessonLearned[];
  expedition_timeline: ExpeditionTimelineItem[];
  top_risk_categories: RiskCategory[];
  outcome_distribution: Record<string, number>;
  avg_resource_deltas: { fuel: number; water: number; power: number };
  system_check_rates: { consumables: number; vehicle: number; route: number };
}

export interface AITrendPattern {
  title: string;
  detail: string;
  severity: string;
  expeditions_affected: number;
}

export interface AITrendDirection {
  title: string;
  detail: string;
  direction: 'IMPROVING' | 'STABLE' | 'DECLINING';
  metric: string;
}

export interface AIOperationalRec {
  title: string;
  detail: string;
  priority: string;
}

export interface AIResourceInsight {
  title: string;
  detail: string;
}

export interface AIImprovementTrack {
  title: string;
  detail: string;
  status: 'APPLIED' | 'PARTIAL' | 'NOT_APPLIED' | 'UNKNOWN';
}

export interface CrossExpeditionAIInsights {
  cross_patterns: AITrendPattern[];
  trend_analysis: AITrendDirection[];
  operational_recommendations: AIOperationalRec[];
  resource_insights: AIResourceInsight[];
  improvement_tracking: AIImprovementTrack[];
  fleet_health_score: number;
  readiness_grade: string;
  summary: string;
  generated_at: string;
  model: string;
  expeditions_analyzed: number;
  ecs_trace?: ECSAIStoreTrace;
}

function validateCrossExpeditionAIInsights(value: unknown): value is CrossExpeditionAIInsights {
  if (!isRecord(value)) return false;
  return (
    hasBoundedObjectArray(value.cross_patterns, ['title', 'detail', 'severity']) &&
    hasBoundedObjectArray(value.trend_analysis, ['title', 'detail', 'direction', 'metric']) &&
    hasBoundedObjectArray(value.operational_recommendations, ['title', 'detail', 'priority']) &&
    hasBoundedObjectArray(value.resource_insights, ['title', 'detail']) &&
    hasBoundedObjectArray(value.improvement_tracking, ['title', 'detail', 'status']) &&
    typeof value.fleet_health_score === 'number' && Number.isFinite(value.fleet_health_score) &&
    hasBoundedText(value.readiness_grade) &&
    hasBoundedText(value.summary) &&
    hasBoundedText(value.generated_at) &&
    hasBoundedText(value.model) &&
    typeof value.expeditions_analyzed === 'number' && Number.isFinite(value.expeditions_analyzed)
  );
}

function isPolicyValidatedCrossExpeditionAIInsights(
  value: unknown,
): value is CrossExpeditionAIInsights {
  if (!validateCrossExpeditionAIInsights(value)) return false;
  return isPolicyValidatedDebriefTrace(value.ecs_trace, 'cross_expedition_trends');
}

// ══════════════════════════════════════════════════════════════
// TRENDS STORE (singleton)
// ══════════════════════════════════════════════════════════════

const TRENDS_KEY = 'ecs_trends_cache';
const TRENDS_AI_KEY = 'ecs_trends_ai_cache';

function loadSingleCache<T>(key: string): T | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return null;
}

function saveSingleCache<T>(key: string, data: T): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(data));
    }
  } catch {}
}

class TrendsStore {
  private trends: CrossExpeditionTrends | null = null;
  private aiInsights: CrossExpeditionAIInsights | null = null;
  private listeners: Set<Listener> = new Set();

  constructor() {
    this.trends = loadSingleCache<CrossExpeditionTrends>(TRENDS_KEY);
    const cachedInsights = loadSingleCache<CrossExpeditionAIInsights>(TRENDS_AI_KEY);
    this.aiInsights = isPolicyValidatedCrossExpeditionAIInsights(cachedInsights)
      ? cachedInsights
      : null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }

  getTrends(): CrossExpeditionTrends | null {
    return this.trends;
  }

  getAIInsights(): CrossExpeditionAIInsights | null {
    return this.aiInsights;
  }

  async loadTrends(
    includeAI: boolean = false,
    onFail?: (msg: string) => void,
    execution: ECSAIStoreExecutionOptions = {},
  ): Promise<{ trends: CrossExpeditionTrends | null; ai_insights: CrossExpeditionAIInsights | null }> {
    if (!isDeployedEdgeFunction('cross-expedition-trends')) {
      if (onFail) onFail('Cross-expedition trends unavailable in this ECS backend.');
      return { trends: this.trends, ai_insights: this.aiInsights };
    }
    try {
      const { data, error } = await supabase.functions.invoke('cross-expedition-trends', {
        body: { action: 'aggregate', include_ai: false },
      });

      if (error) {
        throw new Error(error?.message || 'Failed to load trends');
      }

      if (data?.trends) {
        this.trends = data.trends;
        saveSingleCache(TRENDS_KEY, this.trends);
      }

      this.notify();
      if (includeAI) {
        await this.generateAIInsights(onFail, execution);
      }
      return { trends: this.trends, ai_insights: this.aiInsights };
    } catch (err: any) {
      console.warn('[TrendsStore] Load failed:', err.message);
      if (onFail) onFail(`Trends load failed: ${err.message}`);
      return { trends: this.trends, ai_insights: this.aiInsights };
    }
  }

  async generateAIInsights(
    onFail?: (msg: string) => void,
    execution: ECSAIStoreExecutionOptions = {},
  ): Promise<CrossExpeditionAIInsights | null> {
    const policyDecision = resolveECSAIExecutionPolicy('debrief_synthesis', execution.visibilityContext);
    if (!policyDecision.allowed) {
      if (onFail) onFail(policyDecision.fallbackCopy);
      return this.aiInsights;
    }
    if (!isDeployedEdgeFunction('cross-expedition-trends')) {
      if (onFail) onFail('ECS trend analysis unavailable in this backend.');
      return this.aiInsights;
    }
    try {
      const inputFingerprint = createECSAIInputFingerprint('debrief_synthesis', {
        deterministicSource: 'cross_expedition_trends',
        trends: this.trends,
      });
      const trace: ECSAIStoreTrace = {
        policyVersion: ECS_AI_POLICY_VERSION,
        featureId: 'debrief_synthesis',
        inputFingerprint,
        deterministicSource: 'cross_expedition_trends',
      };
      let refreshedTrends: CrossExpeditionTrends | null = null;
      const outcome = await ecsAIRequestCoordinator.execute<CrossExpeditionAIInsights>({
        featureId: 'debrief_synthesis',
        executionDecision: policyDecision,
        fingerprint: inputFingerprint,
        signal: execution.signal,
        timeoutMs: execution.timeoutMs,
        maxRetries: execution.maxRetries,
        invoke: async () => {
          const { data, error } = await supabase.functions.invoke('cross-expedition-trends', {
            body: { action: 'aggregate', include_ai: true },
          });
          if (error) throw error;
          refreshedTrends = data?.trends ?? null;
          return {
            output: data?.ai_insights ?? null,
            usage: data?.usage ?? null,
          };
        },
        validate: (value) => {
          if (!validateCrossExpeditionAIInsights(value)) {
            return { accepted: false, reasons: ['invalid_output_schema'], classification: 'invalid_output' };
          }
          const ownership = evaluateLegacyTrendSynthesisOwnership(value);
          if (!ownership.accepted) {
            return {
              accepted: false,
              reasons: ownership.reasons,
              classification: 'policy_rejected',
            };
          }
          const policyIssues = inspectECSAIProviderOutput('debrief_synthesis', value, {
            hasLiveSource: false,
            supportsLegalClaims: false,
            supportsWeatherClaims: false,
          });
          if (policyIssues.length > 0) {
            return {
              accepted: false,
              reasons: policyIssues.map(item => item.code),
              classification: 'policy_rejected',
            };
          }
          return {
            accepted: true,
            value: { ...value, ecs_trace: trace },
            reasons: [],
          };
        },
      });

      if (refreshedTrends) {
        this.trends = refreshedTrends;
        saveSingleCache(TRENDS_KEY, this.trends);
      }

      if (outcome.value) {
        this.aiInsights = outcome.value;
        saveSingleCache(TRENDS_AI_KEY, this.aiInsights);
      } else if (onFail) {
        onFail(`AI trend synthesis unavailable; deterministic trends remain available (${outcome.status}).`);
      }

      this.notify();
      return this.aiInsights;
    } catch (err: any) {
      console.warn('[TrendsStore] ECS trend analysis failed:', err.message);
      if (onFail) onFail(`ECS analysis failed: ${err.message}`);
      return null;
    }
  }

  hasTrends(): boolean {
    return !!this.trends && this.trends.expedition_count > 0;
  }

  hasAIInsights(): boolean {
    return !!this.aiInsights;
  }
}

export const trendsStore = new TrendsStore();

