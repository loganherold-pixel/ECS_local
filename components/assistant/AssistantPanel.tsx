/**
 * ═══════════════════════════════════════════════════════════
 * ECS AI EXPEDITION ASSISTANT — Main Panel (Phase 7A–7D)
 * ═══════════════════════════════════════════════════════════
 *
 * The primary assistant UI with:
 *   - Input area for expedition-related questions
 *   - Structured response display with typed blocks
 *   - Conversation history
 *   - Context diagnostics toggle
 *   - Phase 7B: Context basis indicators (live/partial/stale/none)
 *   - Phase 7B: Query intent badges
 *   - Phase 7B: Enhanced quick prompts for ECS-specific queries
 *   - Phase 7C: Guided recommendation cards section
 *   - Phase 7C: Guidance card count in header
 *   - Phase 7C: Refresh guidance button
 *   - Phase 7D: Expedition session indicator
 *   - Phase 7D: Session duration display
 *   - ECS dark-mode styling
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS, GOLD_RAIL } from '../../lib/theme';
import { assistantStore } from '../../lib/assistantStore';
import AssistantDiagnosticsPanel from './AssistantDiagnostics';
import GuidanceCardList from './GuidanceCardList';
import type {
  AssistantConversationTurn,
  AssistantResponseBlock,
  AssistantResponse,
  AssistantGuidanceCard,
  ExpeditionSessionContext,
  ContextBasis,
  QueryIntent,
} from '../../lib/assistantTypes';
import {
  RESPONSE_TYPE_DISPLAY,
  CONFIDENCE_DISPLAY,
  CONTEXT_BASIS_DISPLAY,
  QUERY_INTENT_DISPLAY,
  SESSION_LIFECYCLE_DISPLAY,
} from '../../lib/assistantTypes';

// ── Quick Prompt Suggestions (Phase 7B: ECS-specific) ────
const QUICK_PROMPTS = [
  'Am I ready for this route?',
  'What is my biggest current risk?',
  'How is my power system doing?',
  'Am I offline-ready?',
  'Is my loadout affecting vehicle stability?',
  'Give me an expedition overview',
  'How remote am I right now?',
  'Check my connectivity status',
  'How is my vehicle?',
  'Describe my active route',
];


// ── Context Basis Badge ──────────────────────────────────

function ContextBasisBadge({ basis }: { basis: ContextBasis }) {
  const display = CONTEXT_BASIS_DISPLAY[basis];
  if (!display) return null;

  return (
    <View style={[styles.basisBadge, { borderColor: display.color + '50' }]}>
      <Ionicons name={display.icon as any} size={9} color={display.color} />
      <Text style={[styles.basisText, { color: display.color }]}>
        {display.shortLabel}
      </Text>
    </View>
  );
}


// ── Intent Badge ─────────────────────────────────────────

function IntentBadge({ intent }: { intent: QueryIntent }) {
  const display = QUERY_INTENT_DISPLAY[intent];
  if (!display || intent === 'general') return null;

  return (
    <View style={styles.intentBadge}>
      <Text style={styles.intentText}>{display.label}</Text>
    </View>
  );
}


// ── Phase 7D: Session Indicator ──────────────────────────

function SessionIndicator({ session }: { session: ExpeditionSessionContext | null }) {
  if (!session || session.lifecycle === 'inactive' || session.lifecycle === 'ended') {
    return null;
  }

  const display = SESSION_LIFECYCLE_DISPLAY[session.lifecycle];
  const durationSec = assistantStore.getSessionDuration();
  const hours = Math.floor(durationSec / 3600);
  const mins = Math.floor((durationSec % 3600) / 60);
  const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <View style={styles.sessionBar}>
      <View style={styles.sessionBarLeft}>
        <View style={[styles.sessionDot, { backgroundColor: display.color }]} />
        <Ionicons name={display.icon as any} size={11} color={display.color} />
        <Text style={[styles.sessionLabel, { color: display.color }]}>
          {display.shortLabel}
        </Text>
      </View>
      <View style={styles.sessionBarCenter}>
        {session.vehicle_profile && (
          <Text style={styles.sessionMeta} numberOfLines={1}>
            {session.vehicle_profile}
          </Text>
        )}
        {session.active_route && (
          <>
            <Text style={styles.sessionMetaSep}>{'\u2022'}</Text>
            <Text style={styles.sessionMeta} numberOfLines={1}>
              {session.active_route}
            </Text>
          </>
        )}
      </View>
      <View style={styles.sessionBarRight}>
        <Ionicons name="time-outline" size={10} color={ECS.muted} />
        <Text style={styles.sessionDuration}>{durationStr}</Text>
        <Text style={styles.sessionQueries}>
          {session.query_count}q
        </Text>
      </View>
    </View>
  );
}


// ── Response Block Renderer ──────────────────────────────

function ResponseBlockView({ block }: { block: AssistantResponseBlock }) {
  const typeDisplay = RESPONSE_TYPE_DISPLAY[block.type];

  return (
    <View style={[styles.responseBlock, { borderLeftColor: typeDisplay.color }]}>
      <View style={styles.blockHeader}>
        <Ionicons name={typeDisplay.icon as any} size={14} color={typeDisplay.color} />
        <Text style={[styles.blockTypeLabel, { color: typeDisplay.color }]}>
          {typeDisplay.label}
        </Text>
      </View>
      <Text style={styles.blockText}>{block.text}</Text>
    </View>
  );
}


// ── Conversation Turn Renderer ───────────────────────────

function ConversationTurnView({ turn }: { turn: AssistantConversationTurn }) {
  const confDisplay = CONFIDENCE_DISPLAY[turn.response.confidence];
  const basis: ContextBasis = turn.response.context_basis || 'none';
  const intent: QueryIntent = turn.response.query_intent || 'general';

  return (
    <View style={styles.turnContainer}>
      {/* User query */}
      <View style={styles.queryBubble}>
        <Ionicons name="person-outline" size={12} color={ECS.accent} />
        <Text style={styles.queryText}>{turn.query}</Text>
      </View>

      {/* Assistant response */}
      <View style={styles.responseBubble}>
        <View style={styles.responseHeader}>
          <Ionicons name="shield-outline" size={12} color={ECS.accent} />
          <Text style={styles.responseLabel}>ECS ASSISTANT</Text>
          <IntentBadge intent={intent} />
          <View style={{ flex: 1 }} />
          <ContextBasisBadge basis={basis} />
          <View style={[styles.confBadge, { borderColor: confDisplay.color + '40' }]}>
            <View style={[styles.confDot, { backgroundColor: confDisplay.color }]} />
            <Text style={[styles.confText, { color: confDisplay.color }]}>
              {turn.response.confidence.toUpperCase()}
            </Text>
          </View>
        </View>

        {turn.response.blocks.map(block => (
          <ResponseBlockView key={block.id} block={block} />
        ))}

        <Text style={styles.contextNote}>
          Context: {turn.response.context_available}/{turn.response.context_total} systems
        </Text>
      </View>
    </View>
  );
}


// ── Main Panel ───────────────────────────────────────────

export default function AssistantPanel() {
  const [query, setQuery] = useState('');
  const [conversation, setConversation] = useState<AssistantConversationTurn[]>([]);
  const [guidanceCards, setGuidanceCards] = useState<AssistantGuidanceCard[]>([]);
  const [expeditionSession, setExpeditionSession] = useState<ExpeditionSessionContext | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [rev, setRev] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // Initialize and subscribe
  useEffect(() => {
    if (!assistantStore.isInitialized()) {
      assistantStore.initialize();
    }

    setConversation(assistantStore.getConversation());
    setGuidanceCards(assistantStore.getGuidanceCards());
    setExpeditionSession(assistantStore.getExpeditionSession());

    const unsub = assistantStore.subscribe(() => {
      setConversation([...assistantStore.getConversation()]);
      setGuidanceCards([...assistantStore.getGuidanceCards()]);
      setExpeditionSession(assistantStore.getExpeditionSession());
      setIsProcessing(assistantStore.isProcessing());
      setRev(r => r + 1);
    });

    return () => {
      unsub();
    };
  }, []);

  // Phase 7D: Update session duration every 15s
  useEffect(() => {
    if (!expeditionSession || expeditionSession.lifecycle !== 'active') return;
    const timer = setInterval(() => setRev(r => r + 1), 15_000);
    return () => clearInterval(timer);
  }, [expeditionSession?.lifecycle]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [conversation.length]);

  const handleSubmit = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || isProcessing) return;

    setQuery('');
    await assistantStore.submitQuery(trimmed);
  }, [query, isProcessing]);

  const handleQuickPrompt = useCallback(async (prompt: string) => {
    if (isProcessing) return;
    await assistantStore.submitQuery(prompt);
  }, [isProcessing]);

  const handleClear = useCallback(() => {
    assistantStore.clearConversation();
  }, []);

  const handleRefreshGuidance = useCallback(() => {
    assistantStore.refreshContext(true);
  }, []);

  const summary = assistantStore.getSummary();
  const diagnostics = assistantStore.getDiagnostics();
  const activeCardCount = guidanceCards.filter(c => !c.dismissed && !c.resolved).length;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="shield-outline" size={18} color={ECS.accent} />
          <Text style={styles.headerTitle}>AI EXPEDITION ASSISTANT</Text>
        </View>
        <View style={styles.headerRight}>
          {/* Phase 7C: Guidance card count */}
          {activeCardCount > 0 && (
            <View style={styles.guidanceCountChip}>
              <Ionicons name="bulb-outline" size={10} color={ECS.accent} />
              <Text style={styles.guidanceCountText}>{activeCardCount}</Text>
            </View>
          )}
          <View style={styles.statusChip}>
            <View style={[styles.statusDot, {
              backgroundColor: summary.mode === 'online' ? '#4CAF50' : summary.mode === 'offline' ? '#FFB300' : '#78909C',
            }]} />
            <Text style={styles.statusText}>{summary.mode.toUpperCase()}</Text>
          </View>
          {/* Phase 7C: Refresh guidance */}
          <TouchableOpacity
            style={styles.diagToggle}
            onPress={handleRefreshGuidance}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh-outline" size={16} color={ECS.muted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.diagToggle}
            onPress={() => setShowDiagnostics(!showDiagnostics)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={showDiagnostics ? 'analytics' : 'analytics-outline'}
              size={16}
              color={showDiagnostics ? ECS.accent : ECS.muted}
            />
          </TouchableOpacity>
          {conversation.length > 0 && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={handleClear}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={14} color={ECS.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Phase 7D: Session indicator */}
      <SessionIndicator session={expeditionSession} />

      {/* Context bar */}
      <View style={styles.contextBar}>
        <Text style={styles.contextBarText}>
          {summary.context_available}/{summary.context_total} systems
        </Text>
        <View style={styles.contextProgress}>
          <View style={[styles.contextProgressFill, {
            width: `${summary.completeness_pct}%`,
            backgroundColor: summary.completeness_pct >= 70 ? '#4CAF50' : summary.completeness_pct >= 40 ? '#FFB300' : '#78909C',
          }]} />
        </View>
        <Text style={styles.contextBarPct}>{summary.completeness_pct}%</Text>
      </View>

      {/* Diagnostics panel (collapsible) */}
      {showDiagnostics && (
        <View style={styles.diagnosticsWrapper}>
          <AssistantDiagnosticsPanel diagnostics={diagnostics} />
        </View>
      )}

      {/* Conversation area */}
      <ScrollView
        ref={scrollRef}
        style={styles.conversationArea}
        contentContainerStyle={styles.conversationContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Phase 7C: Guidance Cards Section */}
        {guidanceCards.length > 0 && (
          <GuidanceCardList cards={guidanceCards} showResolved={true} />
        )}

        {conversation.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={40} color={ECS.stroke} />
            <Text style={styles.emptyTitle}>ECS Expedition Assistant</Text>
            <Text style={styles.emptySubtitle}>
              Ask expedition-related questions. The assistant uses your vehicle, loadout, route, power, connectivity, and risk data to provide context-aware guidance.
              {activeCardCount > 0 ? `\n\n${activeCardCount} recommendation${activeCardCount !== 1 ? 's' : ''} above require your attention.` : ''}
              {expeditionSession?.lifecycle === 'active' ? '\n\nExpedition session is active \u2014 the assistant is tracking system changes.' : ''}
            </Text>

            {/* Quick prompts */}
            <Text style={styles.quickPromptsTitle}>SUGGESTED QUERIES</Text>
            <View style={styles.quickPromptsGrid}>
              {QUICK_PROMPTS.map((prompt, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.quickPromptChip}
                  onPress={() => handleQuickPrompt(prompt)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickPromptText} numberOfLines={2}>
                    {prompt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          conversation.map((turn, idx) => (
            <ConversationTurnView key={idx} turn={turn} />
          ))
        )}

        {isProcessing && (
          <View style={styles.processingIndicator}>
            <ActivityIndicator size="small" color={ECS.accent} />
            <Text style={styles.processingText}>Analyzing ECS context\u2026</Text>
          </View>
        )}
      </ScrollView>

      {/* Input area */}
      <View style={styles.inputArea}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Ask about your expedition\u2026"
          placeholderTextColor={ECS.muted}
          multiline={false}
          returnKeyType="send"
          onSubmitEditing={handleSubmit}
          editable={!isProcessing}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!query.trim() || isProcessing) && styles.sendBtnDisabled]}
          onPress={handleSubmit}
          disabled={!query.trim() || isProcessing}
          activeOpacity={0.7}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={ECS.bgPrimary} />
          ) : (
            <Ionicons name="arrow-up" size={18} color={ECS.bgPrimary} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}


// ── Styles ───────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ECS.bgPrimary,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: GOLD_RAIL.section,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
    color: ECS.accent,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  // Phase 7C: Guidance count chip
  guidanceCountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(212,160,23,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.25)',
  },
  guidanceCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: ECS.accent,
  },

  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
    color: ECS.muted,
  },
  diagToggle: {
    padding: 4,
  },
  clearBtn: {
    padding: 4,
  },

  // Phase 7D: Session indicator bar
  sessionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: 'rgba(76,175,80,0.04)',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(76,175,80,0.15)',
  },
  sessionBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sessionDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  sessionLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  sessionBarCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
    gap: 4,
  },
  sessionMeta: {
    fontSize: 9,
    color: ECS.muted,
    fontWeight: '500',
    maxWidth: 100,
  },
  sessionMetaSep: {
    fontSize: 6,
    color: ECS.strokeSoft,
  },
  sessionBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sessionDuration: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'Courier',
    color: ECS.muted,
  },
  sessionQueries: {
    fontSize: 8,
    fontWeight: '600',
    color: ECS.strokeSoft,
    marginLeft: 4,
  },

  // Context bar
  contextBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: ECS.bgPanel,
    borderBottomWidth: 0.5,
    borderBottomColor: ECS.stroke,
  },
  contextBarText: {
    fontSize: 9,
    color: ECS.muted,
    fontWeight: '600',
  },
  contextProgress: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  contextProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  contextBarPct: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: 'Courier',
    color: ECS.muted,
    width: 28,
    textAlign: 'right',
  },

  // Diagnostics
  diagnosticsWrapper: {
    padding: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: ECS.stroke,
  },

  // Conversation
  conversationArea: {
    flex: 1,
  },
  conversationContent: {
    padding: 16,
    paddingBottom: 20,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: ECS.text,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 12,
    color: ECS.muted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  quickPromptsTitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 3,
    color: ECS.accent,
    marginTop: 24,
    marginBottom: 10,
  },
  quickPromptsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  quickPromptChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: ECS.bgPanel,
    borderWidth: 1,
    borderColor: ECS.stroke,
    maxWidth: '48%',
  },
  quickPromptText: {
    fontSize: 11,
    color: ECS.text,
    fontWeight: '500',
  },

  // Conversation turn
  turnContainer: {
    marginBottom: 16,
  },
  queryBubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(212,160,23,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.12)',
    marginBottom: 8,
    alignSelf: 'flex-end',
    maxWidth: '90%',
  },
  queryText: {
    fontSize: 13,
    color: ECS.text,
    fontWeight: '500',
    flex: 1,
  },
  responseBubble: {
    backgroundColor: ECS.bgPanel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    padding: 12,
    alignSelf: 'flex-start',
    maxWidth: '95%',
  },
  responseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  responseLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    color: ECS.accent,
  },

  // Phase 7B: Context basis badge
  basisBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  basisText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Phase 7B: Intent badge
  intentBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(212,160,23,0.10)',
  },
  intentText: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
    color: ECS.accent,
  },

  confBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  confDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  confText: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },
  contextNote: {
    fontSize: 9,
    color: ECS.muted,
    marginTop: 8,
    textAlign: 'right',
  },

  // Response block
  responseBlock: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  blockTypeLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  blockText: {
    fontSize: 12,
    color: ECS.text,
    lineHeight: 18,
  },

  // Processing
  processingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  processingText: {
    fontSize: 12,
    color: ECS.muted,
    fontStyle: 'italic',
  },

  // Input
  inputArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.section,
    backgroundColor: ECS.bgPanel,
  },
  input: {
    flex: 1,
    backgroundColor: ECS.bgElev,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: ECS.text,
    maxHeight: 80,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: ECS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: ECS.strokeSoft,
    opacity: 0.5,
  },
});



