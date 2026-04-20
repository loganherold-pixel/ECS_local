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
}

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
    // Merge cached AI analysis if available
    if (aar && !aar.ai_analysis && this.aiAnalyses[expeditionId]) {
      aar.ai_analysis = this.aiAnalyses[expeditionId];
    }
    return aar;
  }

  async loadAAR(expeditionId: string): Promise<AARReport | null> {
    if (!isDeployedEdgeFunction('expedition-events')) {
      return this.aars[expeditionId] || null;
    }
    try {
      const { data, error } = await supabase.functions.invoke('expedition-events', {
        body: { action: 'get_aar', expedition_id: expeditionId },
      });

      if (error || !data?.aar) {
        return this.aars[expeditionId] || null;
      }

      // If the server AAR has ai_analysis, cache it separately too
      if (data.aar.ai_analysis) {
        this.aiAnalyses[expeditionId] = data.aar.ai_analysis;
        this.persistAIAnalyses();
      }

      this.aars[expeditionId] = data.aar;
      this.persistAARs();
      this.notify();
      return data.aar;
    } catch {
      return this.aars[expeditionId] || null;
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
            ai_analysis: aarData.ai_analysis || null,
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
    return this.aiAnalyses[expeditionId] || null;
  }

  async generateAIAnalysis(
    expeditionId: string,
    onProgress?: (msg: string) => void,
    onFail?: (msg: string) => void,
  ): Promise<AIAnalysis | null> {
    if (!isDeployedEdgeFunction('analyze-expedition')) {
      if (onFail) onFail('ECS analysis unavailable in this backend.');
      return this.aiAnalyses[expeditionId] || null;
    }
    try {
      if (onProgress) onProgress('Analyzing expedition data...');

      const { data, error } = await supabase.functions.invoke('analyze-expedition', {
        body: { expedition_id: expeditionId },
      });

      if (error) {
        throw new Error(error?.message || 'ECS analysis request failed');
      }

      // Handle both direct analysis and fallback
      const analysis: AIAnalysis = data?.analysis;

      if (!analysis) {
        throw new Error(data?.error || 'No analysis returned');
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
    return !!this.aiAnalyses[expeditionId];
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
    this.aiInsights = loadSingleCache<CrossExpeditionAIInsights>(TRENDS_AI_KEY);
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
  ): Promise<{ trends: CrossExpeditionTrends | null; ai_insights: CrossExpeditionAIInsights | null }> {
    if (!isDeployedEdgeFunction('cross-expedition-trends')) {
      if (onFail) onFail('Cross-expedition trends unavailable in this ECS backend.');
      return { trends: this.trends, ai_insights: this.aiInsights };
    }
    try {
      const { data, error } = await supabase.functions.invoke('cross-expedition-trends', {
        body: { action: 'aggregate', include_ai: includeAI },
      });

      if (error) {
        throw new Error(error?.message || 'Failed to load trends');
      }

      if (data?.trends) {
        this.trends = data.trends;
        saveSingleCache(TRENDS_KEY, this.trends);
      }

      if (data?.ai_insights) {
        this.aiInsights = data.ai_insights;
        saveSingleCache(TRENDS_AI_KEY, this.aiInsights);
      }

      this.notify();
      return { trends: this.trends, ai_insights: this.aiInsights };
    } catch (err: any) {
      console.warn('[TrendsStore] Load failed:', err.message);
      if (onFail) onFail(`Trends load failed: ${err.message}`);
      return { trends: this.trends, ai_insights: this.aiInsights };
    }
  }

  async generateAIInsights(
    onFail?: (msg: string) => void,
  ): Promise<CrossExpeditionAIInsights | null> {
    if (!isDeployedEdgeFunction('cross-expedition-trends')) {
      if (onFail) onFail('ECS trend analysis unavailable in this backend.');
      return this.aiInsights;
    }
    try {
      const { data, error } = await supabase.functions.invoke('cross-expedition-trends', {
        body: { action: 'aggregate', include_ai: true },
      });

      if (error) {
        throw new Error(error?.message || 'ECS trend analysis failed');
      }

      if (data?.trends) {
        this.trends = data.trends;
        saveSingleCache(TRENDS_KEY, this.trends);
      }

      if (data?.ai_insights) {
        this.aiInsights = data.ai_insights;
        saveSingleCache(TRENDS_AI_KEY, this.aiInsights);
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

