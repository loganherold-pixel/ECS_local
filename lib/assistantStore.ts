/**
 * ═══════════════════════════════════════════════════════════
 * ECS AI EXPEDITION ASSISTANT — State Store (Phase 7A–7D)
 * ═══════════════════════════════════════════════════════════
 *
 * Manages the AI Expedition Assistant state including:
 *   - Context snapshot assembly and caching
 *   - Conversation history (current session)
 *   - ECS-aware response generation (Phase 7B)
 *   - Guided recommendation cards (Phase 7C)
 *   - Expedition session lifecycle (Phase 7D)
 *   - Context delta tracking (Phase 7D)
 *   - Duplicate guidance suppression (Phase 7D)
 *   - Session persistence and restoration
 *   - Summary computation for UI consumption
 *
 * Phase 7A: Architecture foundation with placeholder responses.
 * Phase 7B: Context assembly pipeline + ECS-aware response builder.
 * Phase 7C: Guided recommendation engine + quick action cards.
 * Phase 7D: Expedition session awareness + persistence + delta tracking.
 *
 * Session version: 4 (Phase 7D — backward compatible)
 */

import { Platform } from 'react-native';
import type {
  AssistantState,
  AssistantContextSnapshot,
  AssistantContextDiagnostics,
  AssistantConversationTurn,
  AssistantResponse,
  AssistantSummary,
  AssistantSession,
  AssistantGuidanceCard,
  ExpeditionSessionContext,
  GuidanceDeliveryRecord,
  ContextDelta,
  GuidanceTriggerCondition,
} from './assistantTypes';
import {
  createDefaultAssistantState,
  createDefaultAssistantSummary,
  createExpeditionSession,
  ASSISTANT_SESSION_VERSION,
} from './assistantTypes';
import {
  assembleContextSnapshot,
  buildContextDiagnostics,
  computeContextDelta,
  summarizeRecentChanges,
} from './assistantContextEngine';
import {
  buildResponse,
  computeContextBasis,
} from './assistantResponseBuilder';
import {
  evaluateGuidance,
  countActiveGuidance,
  getGuidanceSummaryForCompanion,
} from './guidedRecommendationEngine';

const TAG = '[AI-ASSISTANT]';

// ── Storage helpers ──────────────────────────────────────
const memoryStore: Record<string, string> = {};

function lsGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return memoryStore[key] || null;
}

function lsSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {}
  memoryStore[key] = value;
}

function generateId(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const LS_SESSION_KEY = 'ecs_assistant_session';
const MAX_CONVERSATION_LENGTH = 50;
const MAX_GUIDANCE_CARDS = 20;
const MAX_DELTA_HISTORY = 20;
const MAX_DELIVERY_LOG = 30;

// Phase 7C: Guidance evaluation interval (30 seconds)
const GUIDANCE_EVAL_INTERVAL_MS = 30_000;

// Phase 7D: Session check interval (15 seconds)
const SESSION_CHECK_INTERVAL_MS = 15_000;

// Phase 7D: Duplicate suppression cooldown (5 minutes)
const DUPLICATE_COOLDOWN_MS = 5 * 60_000;


// ── Internal State ───────────────────────────────────────

let _state: AssistantState = createDefaultAssistantState();
let _contextCacheTimestamp = 0;
const CONTEXT_CACHE_TTL_MS = 10_000; // 10 seconds

// Phase 7C: Guidance evaluation timer
let _guidanceEvalTimer: ReturnType<typeof setInterval> | null = null;

// Phase 7D: Session check timer
let _sessionCheckTimer: ReturnType<typeof setInterval> | null = null;

// Phase 7D: Expedition state subscription cleanup
let _expeditionUnsub: (() => void) | null = null;

// ── Listeners ────────────────────────────────────────────
type Listener = () => void;
const _listeners = new Set<Listener>();

function _notify(): void {
  _state.updated_at = new Date().toISOString();
  _listeners.forEach(fn => { try { fn(); } catch {} });
}

function _updateSummary(): void {
  _state.summary = {
    is_ready: _state.initialized,
    context_available: _state.context?.available_count ?? 0,
    context_total: _state.context?.total_count ?? 9,
    completeness_pct: _state.context
      ? Math.round((_state.context.available_count / _state.context.total_count) * 100)
      : 0,
    mode: _state.mode,
    conversation_length: _state.conversation.length,
    last_interaction_at: _state.conversation.length > 0
      ? _state.conversation[_state.conversation.length - 1].timestamp
      : null,
    generation_available: _state.generation_available,
    active_guidance_count: countActiveGuidance(_state.guidance_cards),
  };
}


// ── Session Persistence ──────────────────────────────────

function _persistSession(): void {
  try {
    // Phase 7C: Persist guidance cards (non-dismissed, max 10)
    const cardsToSave = _state.guidance_cards
      .filter(c => !c.dismissed)
      .slice(0, 10);

    // Phase 7D: Prepare expedition session for persistence
    let sessionToSave: ExpeditionSessionContext | null = null;
    if (_state.expedition_session && _state.expedition_session.lifecycle === 'active') {
      // Strip previous_snapshot to reduce storage size
      sessionToSave = {
        ..._state.expedition_session,
        previous_snapshot: null,
        delta_history: _state.expedition_session.delta_history.slice(-5),
      };
    }

    const session: AssistantSession = {
      version: ASSISTANT_SESSION_VERSION,
      conversation: _state.conversation.slice(-20), // Keep last 20 turns
      guidance_cards: cardsToSave,
      expedition_session: sessionToSave,
      last_summary: _state.summary,
      persisted_at: new Date().toISOString(),
    };
    lsSet(LS_SESSION_KEY, JSON.stringify(session));
    console.log(TAG, `Session persisted (${session.conversation.length} turns, ${cardsToSave.length} cards, session: ${sessionToSave ? 'active' : 'none'})`);
  } catch (e) {
    console.warn(TAG, 'Session persistence failed:', e);
  }
}

function _restoreSession(): void {
  try {
    const raw = lsGet(LS_SESSION_KEY);
    if (!raw) {
      console.log(TAG, 'No session to restore');
      return;
    }

    const session: AssistantSession = JSON.parse(raw);
    if (!session) {
      console.log(TAG, 'Invalid session data, starting fresh');
      return;
    }

    // Phase 7D: Accept v1, v2, v3, and v4 sessions with backward compatibility
    if (session.version !== ASSISTANT_SESSION_VERSION &&
        session.version !== 3 && session.version !== 2 && session.version !== 1) {
      console.log(TAG, 'Session version mismatch, starting fresh');
      return;
    }

    if (session.conversation && Array.isArray(session.conversation)) {
      // Phase 7B/7C: Ensure restored turns have context_basis and query_intent
      _state.conversation = session.conversation.map(turn => ({
        ...turn,
        response: {
          ...turn.response,
          context_basis: turn.response.context_basis || 'none',
          query_intent: turn.response.query_intent || 'general',
        },
      }));
      console.log(TAG, `Session restored (${session.conversation.length} turns)`);
    }

    // Phase 7C: Restore guidance cards
    if (session.guidance_cards && Array.isArray(session.guidance_cards)) {
      _state.guidance_cards = session.guidance_cards.map(card => ({
        ...card,
        explanation: card.explanation || card.body || '',
        suggested_action: card.suggested_action || '',
        trigger: card.trigger || 'risk_elevated',
        source_categories: card.source_categories || [],
        context_basis: card.context_basis || 'none',
        resolved: card.resolved || false,
        expanded: false, // Always start collapsed
        from_live_telemetry: card.from_live_telemetry || false,
        resolved_at: card.resolved_at || null,
      }));
      console.log(TAG, `Guidance cards restored (${_state.guidance_cards.length} cards)`);
    }

    // Phase 7D: Restore expedition session
    if (session.version >= 4 && session.expedition_session) {
      const es = session.expedition_session;
      // Only restore if session was active and not too old (< 24 hours)
      const sessionAge = Date.now() - new Date(es.last_activity_at).getTime();
      if (es.lifecycle === 'active' && sessionAge < 24 * 60 * 60_000) {
        _state.expedition_session = {
          ...es,
          lifecycle: 'active', // Resume as active
          previous_snapshot: null, // Will be rebuilt
          duration_seconds: Math.round(
            (Date.now() - new Date(es.session_start_time).getTime()) / 1000
          ),
          last_activity_at: new Date().toISOString(),
        };
        console.log(TAG, `Expedition session restored: ${es.session_id} (trigger: ${es.trigger}, age: ${Math.round(sessionAge / 60000)}m)`);
      } else {
        console.log(TAG, `Expedition session expired or ended, not restoring`);
      }
    }
  } catch (e) {
    console.warn(TAG, 'Session restore failed:', e);
  }
}


// ── Phase 7C: Guidance Evaluation ────────────────────────

function _evaluateGuidanceCards(): void {
  if (!_state.context) return;

  try {
    const updated = evaluateGuidance(_state.context, _state.guidance_cards);

    // Phase 7D: Apply duplicate suppression from session delivery log
    const session = _state.expedition_session;
    let finalCards = updated;
    if (session) {
      finalCards = _applyDuplicateSuppression(updated, session);
      session.guidance_eval_count++;
    }

    // Trim to max cards
    _state.guidance_cards = finalCards.slice(0, MAX_GUIDANCE_CARDS);
    _updateSummary();
    _notify();
  } catch (e) {
    console.warn(TAG, 'Guidance evaluation error:', e);
  }
}

/**
 * Phase 7D: Suppress duplicate guidance cards unless conditions worsen.
 */
function _applyDuplicateSuppression(
  cards: AssistantGuidanceCard[],
  session: ExpeditionSessionContext,
): AssistantGuidanceCard[] {
  const now = Date.now();
  const deliveryMap = new Map<GuidanceTriggerCondition, GuidanceDeliveryRecord>();
  for (const rec of session.guidance_delivery_log) {
    deliveryMap.set(rec.trigger, rec);
  }

  const result: AssistantGuidanceCard[] = [];

  for (const card of cards) {
    if (card.dismissed || card.resolved) {
      result.push(card);
      continue;
    }

    const prev = deliveryMap.get(card.trigger);
    if (prev) {
      const timeSince = now - new Date(prev.last_delivered_at).getTime();

      // Allow if: condition worsened (priority decreased = more severe)
      if (card.priority < prev.last_priority) {
        // Condition worsened — allow and update record
        prev.last_priority = card.priority;
        prev.last_delivered_at = new Date().toISOString();
        prev.delivery_count++;
        result.push(card);
        continue;
      }

      // Suppress if within cooldown and same or lower severity
      if (timeSince < DUPLICATE_COOLDOWN_MS && !prev.was_resolved) {
        // Suppress — don't add to result (keep existing card if present)
        const existing = _state.guidance_cards.find(
          c => c.trigger === card.trigger && !c.dismissed
        );
        if (existing) result.push(existing);
        continue;
      }

      // Cooldown expired — allow
      prev.last_delivered_at = new Date().toISOString();
      prev.delivery_count++;
      if (card.resolved) prev.was_resolved = true;
      result.push(card);
    } else {
      // First time seeing this trigger in this session
      session.guidance_delivery_log.push({
        trigger: card.trigger,
        last_priority: card.priority,
        last_delivered_at: new Date().toISOString(),
        delivery_count: 1,
        was_resolved: false,
      });

      // Trim delivery log
      if (session.guidance_delivery_log.length > MAX_DELIVERY_LOG) {
        session.guidance_delivery_log = session.guidance_delivery_log.slice(-MAX_DELIVERY_LOG);
      }

      result.push(card);
    }
  }

  return result;
}

function _startGuidanceEvaluation(): void {
  if (_guidanceEvalTimer) return;

  _guidanceEvalTimer = setInterval(() => {
    try {
      const prevSnapshot = _state.context;
      _state.context = assembleContextSnapshot();
      _state.diagnostics = buildContextDiagnostics(_state.context);
      _contextCacheTimestamp = Date.now();

      // Phase 7D: Compute context delta if session is active
      if (_state.expedition_session && _state.expedition_session.lifecycle === 'active' && prevSnapshot) {
        _updateSessionDelta(prevSnapshot, _state.context);
      }

      _evaluateGuidanceCards();
    } catch (e) {
      console.warn(TAG, 'Periodic guidance evaluation error:', e);
    }
  }, GUIDANCE_EVAL_INTERVAL_MS);

  console.log(TAG, `Guidance evaluation started (every ${GUIDANCE_EVAL_INTERVAL_MS / 1000}s)`);
}

function _stopGuidanceEvaluation(): void {
  if (_guidanceEvalTimer) {
    clearInterval(_guidanceEvalTimer);
    _guidanceEvalTimer = null;
    console.log(TAG, 'Guidance evaluation stopped');
  }
}


// ══════════════════════════════════════════════════════════
// Phase 7D: Expedition Session Lifecycle
// ══════════════════════════════════════════════════════════

/**
 * Check if an expedition session should be started or ended
 * based on current ECS system state.
 */
function _checkSessionTriggers(): void {
  try {
    const currentSession = _state.expedition_session;

    // Check expedition state
    let expeditionActive = false;
    try {
      const { expeditionStateStore } = require('./expeditionStateStore');
      expeditionActive = expeditionStateStore.getState() === 'active';
    } catch {}

    // Check route state
    let routeActive = false;
    let routeName: string | null = null;
    try {
      const { routeStore } = require('./routeStore');
      const active = routeStore.getActive();
      if (active) {
        routeActive = true;
        routeName = active.name || null;
      }
    } catch {}

    // Check vehicle
    let vehicleName: string | null = null;
    try {
      const { vehicleStore } = require('./vehicleStore');
      const v = vehicleStore.getActive?.() || vehicleStore.get?.();
      vehicleName = v?.name || v?.label || null;
    } catch {}

    // Check remoteness for region
    let region: string | null = null;
    try {
      const { remotenessStore } = require('./remotenessStore');
      if (remotenessStore.isRunning()) {
        const output = remotenessStore.get();
        region = output?.tier || null;
      }
    } catch {}

    // ── Session start logic ──────────────────────────────
    if (!currentSession || currentSession.lifecycle === 'ended' || currentSession.lifecycle === 'inactive') {
      if (expeditionActive) {
        _startSession('expedition_active', { routeName, vehicleName, region, expeditionActive });
      } else if (routeActive) {
        _startSession('route_active', { routeName, vehicleName, region, expeditionActive });
      }
      return;
    }

    // ── Session update logic ─────────────────────────────
    if (currentSession.lifecycle === 'active') {
      // Update duration
      currentSession.duration_seconds = Math.round(
        (Date.now() - new Date(currentSession.session_start_time).getTime()) / 1000
      );
      currentSession.last_activity_at = new Date().toISOString();

      // Update expedition mode flag
      currentSession.expedition_mode_active = expeditionActive;

      // Check for session end conditions
      if (!expeditionActive && !routeActive) {
        // Both triggers are gone — end session
        _endSession();
      }
    }
  } catch (e) {
    console.warn(TAG, 'Session trigger check error:', e);
  }
}

function _startSession(
  trigger: 'expedition_active' | 'route_active' | 'manual' | 'auto_resume',
  opts: { routeName?: string | null; vehicleName?: string | null; region?: string | null; expeditionActive?: boolean },
): void {
  const session = createExpeditionSession(trigger, {
    route_name: opts.routeName,
    vehicle_name: opts.vehicleName,
    region: opts.region,
    expedition_active: opts.expeditionActive,
  });

  _state.expedition_session = session;
  _persistSession();
  _notify();

  console.log(TAG, `Session started: ${session.session_id} (trigger: ${trigger}, vehicle: ${opts.vehicleName || 'none'}, route: ${opts.routeName || 'none'})`);
}

function _endSession(): void {
  const session = _state.expedition_session;
  if (!session) return;

  session.lifecycle = 'ended';
  session.session_end_time = new Date().toISOString();
  session.duration_seconds = Math.round(
    (Date.now() - new Date(session.session_start_time).getTime()) / 1000
  );

  console.log(TAG, `Session ended: ${session.session_id} (duration: ${session.duration_seconds}s, queries: ${session.query_count}, evals: ${session.guidance_eval_count})`);

  // Clear expired session data after a brief delay
  setTimeout(() => {
    if (_state.expedition_session?.session_id === session.session_id &&
        _state.expedition_session?.lifecycle === 'ended') {
      _state.expedition_session = null;
      _persistSession();
      _notify();
      console.log(TAG, 'Ended session cleared');
    }
  }, 30_000); // Keep ended session visible for 30s

  _persistSession();
  _notify();
}

/**
 * Phase 7D: Update session with context delta.
 */
function _updateSessionDelta(
  prevSnapshot: AssistantContextSnapshot,
  currentSnapshot: AssistantContextSnapshot,
): void {
  const session = _state.expedition_session;
  if (!session || session.lifecycle !== 'active') return;

  try {
    const delta = computeContextDelta(prevSnapshot, currentSnapshot);

    if (delta.has_significant_changes) {
      session.latest_delta = delta;
      session.delta_history.push(delta);

      // Trim delta history
      if (session.delta_history.length > MAX_DELTA_HISTORY) {
        session.delta_history = session.delta_history.slice(-MAX_DELTA_HISTORY);
      }

      // Update delivery log for resolved conditions
      for (const card of _state.guidance_cards) {
        if (card.resolved) {
          const rec = session.guidance_delivery_log.find(r => r.trigger === card.trigger);
          if (rec) rec.was_resolved = true;
        }
      }
    }

    session.previous_snapshot = currentSnapshot;
  } catch (e) {
    console.warn(TAG, 'Session delta update error:', e);
  }
}

function _startSessionChecks(): void {
  if (_sessionCheckTimer) return;

  _sessionCheckTimer = setInterval(() => {
    _checkSessionTriggers();
  }, SESSION_CHECK_INTERVAL_MS);

  // Also subscribe to expedition state changes for immediate response
  try {
    const { expeditionStateStore } = require('./expeditionStateStore');
    _expeditionUnsub = expeditionStateStore.subscribe((state: string) => {
      console.log(TAG, `Expedition state changed: ${state}`);
      // Immediate session check on expedition state change
      setTimeout(() => _checkSessionTriggers(), 500);
    });
  } catch {}

  console.log(TAG, `Session checks started (every ${SESSION_CHECK_INTERVAL_MS / 1000}s)`);
}

function _stopSessionChecks(): void {
  if (_sessionCheckTimer) {
    clearInterval(_sessionCheckTimer);
    _sessionCheckTimer = null;
  }
  if (_expeditionUnsub) {
    _expeditionUnsub();
    _expeditionUnsub = null;
  }
  console.log(TAG, 'Session checks stopped');
}


// ══════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════

export const assistantStore = {

  // ── Initialization ─────────────────────────────────────

  /**
   * Initialize the assistant store.
   * Restores previous session and assembles initial context.
   * Phase 7C: Starts periodic guidance evaluation.
   * Phase 7D: Starts session lifecycle management.
   */
  initialize(): void {
    if (_state.initialized) return;
    console.log(TAG, 'Initializing (Phase 7D)...');

    _restoreSession();

    // Assemble initial context (deferred to avoid blocking startup)
    setTimeout(() => {
      try {
        _state.context = assembleContextSnapshot();
        _state.diagnostics = buildContextDiagnostics(_state.context);
        _updateSummary();
        _notify();

        const basis = computeContextBasis(_state.context);
        console.log(TAG, `Initial context: ${_state.context.available_count}/${_state.context.total_count} available, basis: ${basis}`);

        // Phase 7C: Initial guidance evaluation
        _evaluateGuidanceCards();

        // Phase 7C: Start periodic guidance evaluation
        _startGuidanceEvaluation();

        // Phase 7D: Start session lifecycle checks
        _startSessionChecks();

        // Phase 7D: Initial session check
        _checkSessionTriggers();

        // Phase 7D: Set initial previous snapshot for delta tracking
        if (_state.expedition_session && _state.expedition_session.lifecycle === 'active') {
          _state.expedition_session.previous_snapshot = _state.context;
        }
      } catch (e) {
        console.warn(TAG, 'Initial context assembly failed:', e);
      }
    }, 2000);

    _state.initialized = true;
    _state.mode = 'placeholder';
    _state.generation_available = false;
    _updateSummary();
    _notify();

    console.log(TAG, 'Initialized (Phase 7D \u2014 session awareness active)');
  },

  /**
   * Whether the assistant is initialized.
   */
  isInitialized(): boolean {
    return _state.initialized;
  },


  // ── Context ────────────────────────────────────────────

  /**
   * Refresh the context snapshot from all ECS systems.
   * Phase 7C: Also triggers guidance re-evaluation.
   * Phase 7D: Also computes context delta.
   */
  refreshContext(force?: boolean): AssistantContextSnapshot {
    const now = Date.now();
    if (!force && _state.context && (now - _contextCacheTimestamp) < CONTEXT_CACHE_TTL_MS) {
      return _state.context;
    }

    try {
      const prevSnapshot = _state.context;
      _state.context = assembleContextSnapshot();
      _state.diagnostics = buildContextDiagnostics(_state.context);
      _contextCacheTimestamp = now;

      // Phase 7D: Compute delta if session active
      if (prevSnapshot && _state.expedition_session?.lifecycle === 'active') {
        _updateSessionDelta(prevSnapshot, _state.context);
      }

      // Phase 7C: Re-evaluate guidance on context refresh
      _evaluateGuidanceCards();

      _updateSummary();
      _notify();
    } catch (e) {
      console.warn(TAG, 'Context refresh failed:', e);
      _state.last_error = `Context refresh failed: ${e}`;
    }

    return _state.context || assembleContextSnapshot();
  },

  /**
   * Get the current context snapshot.
   */
  getContext(): AssistantContextSnapshot | null {
    return _state.context;
  },

  /**
   * Get the current context diagnostics.
   */
  getDiagnostics(): AssistantContextDiagnostics | null {
    return _state.diagnostics;
  },


  // ── Query Processing ───────────────────────────────────

  /**
   * Submit a query to the assistant.
   *
   * Phase 7B: Generates ECS-context-aware structured responses
   * Phase 7C: Also refreshes guidance cards after query
   * Phase 7D: Includes session context and recent changes
   */
  async submitQuery(query: string): Promise<AssistantResponse> {
    if (!_state.initialized) {
      assistantStore.initialize();
    }

    console.log(TAG, `Query submitted: "${query.substring(0, 60)}..."`);
    _state.processing = true;
    _state.last_error = null;
    _notify();

    try {
      // Force-refresh context before responding (bypass cache for queries)
      const snapshot = assistantStore.refreshContext(true);

      // Phase 7B: Use the intelligent response builder
      const response = buildResponse(query, snapshot);

      // Phase 7D: Inject session-aware context into response
      if (_state.expedition_session?.lifecycle === 'active') {
        const session = _state.expedition_session;
        session.query_count++;
        session.last_activity_at = new Date().toISOString();

        // Add recent changes block if available
        if (session.delta_history.length > 0) {
          const changesSummary = summarizeRecentChanges(session.delta_history, 3);
          if (changesSummary) {
            response.blocks.push({
              id: generateId(),
              type: 'summary',
              text: changesSummary,
              confidence: 'medium',
              source_categories: [],
              generated_at: new Date().toISOString(),
            });
          }
        }
      }

      // Add to conversation
      const turn: AssistantConversationTurn = {
        query,
        response,
        timestamp: new Date().toISOString(),
      };

      _state.conversation.push(turn);

      // Trim conversation if too long
      if (_state.conversation.length > MAX_CONVERSATION_LENGTH) {
        _state.conversation = _state.conversation.slice(-MAX_CONVERSATION_LENGTH);
      }

      _state.processing = false;
      _updateSummary();
      _persistSession();
      _notify();

      console.log(TAG, `Response: intent=${response.query_intent}, basis=${response.context_basis}, confidence=${response.confidence}, blocks=${response.blocks.length}`);
      return response;

    } catch (e) {
      _state.processing = false;
      _state.last_error = `Query processing failed: ${e}`;
      _notify();
      console.error(TAG, 'Query processing error:', e);

      // Return error response
      return {
        id: generateId(),
        query,
        blocks: [{
          id: generateId(),
          type: 'caution',
          text: 'An error occurred while processing your query. Please try again.',
          confidence: 'low',
          source_categories: [],
          generated_at: new Date().toISOString(),
        }],
        confidence: 'low',
        context_available: 0,
        context_total: 9,
        mode: 'placeholder',
        context_basis: 'none',
        query_intent: 'general',
        generated_at: new Date().toISOString(),
      };
    }
  },


  // ── Phase 7C: Guidance Card Management ─────────────────

  getGuidanceCards(): AssistantGuidanceCard[] {
    return _state.guidance_cards.filter(c => !c.dismissed);
  },

  getActiveGuidanceCards(): AssistantGuidanceCard[] {
    return _state.guidance_cards.filter(c => !c.dismissed && !c.resolved);
  },

  getResolvedGuidanceCards(): AssistantGuidanceCard[] {
    return _state.guidance_cards.filter(c => !c.dismissed && c.resolved);
  },

  dismissCard(cardId: string): void {
    const card = _state.guidance_cards.find(c => c.id === cardId);
    if (card) {
      card.dismissed = true;
      console.log(TAG, `Card dismissed: ${card.trigger} ("${card.title}")`);
      _updateSummary();
      _persistSession();
      _notify();
    }
  },

  toggleCardExpanded(cardId: string): void {
    const card = _state.guidance_cards.find(c => c.id === cardId);
    if (card) {
      card.expanded = !card.expanded;
      _notify();
    }
  },

  refreshGuidance(): void {
    if (_state.context) {
      _evaluateGuidanceCards();
      _persistSession();
    }
  },

  clearResolvedCards(): void {
    _state.guidance_cards = _state.guidance_cards.filter(c => !c.resolved || c.dismissed);
    _updateSummary();
    _persistSession();
    _notify();
    console.log(TAG, 'Resolved cards cleared');
  },


  // ── Phase 7D: Expedition Session Management ────────────

  /**
   * Get the current expedition session context.
   */
  getExpeditionSession(): ExpeditionSessionContext | null {
    return _state.expedition_session;
  },

  /**
   * Whether an expedition session is currently active.
   */
  isSessionActive(): boolean {
    return _state.expedition_session?.lifecycle === 'active';
  },

  /**
   * Get the session duration in seconds.
   */
  getSessionDuration(): number {
    const session = _state.expedition_session;
    if (!session || session.lifecycle !== 'active') return 0;
    return Math.round(
      (Date.now() - new Date(session.session_start_time).getTime()) / 1000
    );
  },

  /**
   * Get the latest context delta from the active session.
   */
  getLatestDelta(): ContextDelta | null {
    return _state.expedition_session?.latest_delta ?? null;
  },

  /**
   * Get recent context changes as a summary string.
   */
  getRecentChangesSummary(): string | null {
    const session = _state.expedition_session;
    if (!session || session.delta_history.length === 0) return null;
    return summarizeRecentChanges(session.delta_history, 5);
  },

  /**
   * Manually start an expedition session.
   */
  startManualSession(): void {
    if (_state.expedition_session?.lifecycle === 'active') return;

    let routeName: string | null = null;
    let vehicleName: string | null = null;
    try {
      const { routeStore } = require('./routeStore');
      routeName = routeStore.getActive()?.name || null;
    } catch {}
    try {
      const { vehicleStore } = require('./vehicleStore');
      const v = vehicleStore.getActive?.() || vehicleStore.get?.();
      vehicleName = v?.name || v?.label || null;
    } catch {}

    _startSession('manual', { routeName, vehicleName });
  },

  /**
   * Manually end the expedition session.
   */
  endManualSession(): void {
    _endSession();
  },

  /**
   * Suspend the session (app backgrounding).
   */
  suspendSession(): void {
    const session = _state.expedition_session;
    if (session && session.lifecycle === 'active') {
      session.lifecycle = 'suspended';
      session.last_activity_at = new Date().toISOString();
      _persistSession();
      console.log(TAG, `Session suspended: ${session.session_id}`);
    }
  },

  /**
   * Resume a suspended session (app foregrounding).
   */
  resumeSession(): void {
    const session = _state.expedition_session;
    if (session && session.lifecycle === 'suspended') {
      session.lifecycle = 'active';
      session.last_activity_at = new Date().toISOString();
      session.duration_seconds = Math.round(
        (Date.now() - new Date(session.session_start_time).getTime()) / 1000
      );
      _notify();
      console.log(TAG, `Session resumed: ${session.session_id}`);
    }
  },

  /**
   * Get a simplified summary for Android Auto / CarPlay.
   * Phase 7D: Includes session context.
   */
  getCompanionSummary(): { guidance: string | null; session_active: boolean; session_duration: number } {
    return {
      guidance: getGuidanceSummaryForCompanion(_state.guidance_cards),
      session_active: _state.expedition_session?.lifecycle === 'active',
      session_duration: assistantStore.getSessionDuration(),
    };
  },


  // ── State Access ───────────────────────────────────────

  getState(): AssistantState {
    return _state;
  },

  getSummary(): AssistantSummary {
    return _state.summary;
  },

  getConversation(): AssistantConversationTurn[] {
    return _state.conversation;
  },

  isProcessing(): boolean {
    return _state.processing;
  },

  getMode(): 'online' | 'offline' | 'placeholder' {
    return _state.mode;
  },


  // ── Conversation Management ────────────────────────────

  clearConversation(): void {
    _state.conversation = [];
    _updateSummary();
    _persistSession();
    _notify();
    console.log(TAG, 'Conversation cleared');
  },


  // ── Lifecycle ──────────────────────────────────────────

  /**
   * Reset the assistant to default state.
   * Phase 7D: Also stops session checks and ends session.
   */
  reset(): void {
    _stopGuidanceEvaluation();
    _stopSessionChecks();
    _state = createDefaultAssistantState();
    _contextCacheTimestamp = 0;
    _notify();
    console.log(TAG, 'Reset to default state');
  },

  /**
   * Cleanup — stop periodic evaluation and session checks.
   * Call when the assistant is no longer needed.
   */
  cleanup(): void {
    _stopGuidanceEvaluation();
    _stopSessionChecks();
    // Persist before cleanup
    if (_state.initialized) {
      _persistSession();
    }
    console.log(TAG, 'Cleanup complete');
  },


  // ── Subscriptions ──────────────────────────────────────

  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },
};

