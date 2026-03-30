/**
 * ═══════════════════════════════════════════════════════════
 * ECS AI EXPEDITION ASSISTANT — Context Diagnostics Panel
 * ═══════════════════════════════════════════════════════════
 *
 * Phase 7A: Shows what ECS context categories are currently
 * available to the assistant.
 *
 * Phase 7B: Enhanced with issue indicators, freshness info,
 * and context basis summary.
 *
 * Phase 7C: Added guidance evaluation status and active
 * trigger count.
 *
 * Phase 7D: Added expedition session diagnostics, delta
 * tracking status, and delivery log summary.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS } from '../../lib/theme';
import type { AssistantContextDiagnostics } from '../../lib/assistantTypes';
import {
  CONTEXT_CATEGORY_DISPLAY,
  CONTEXT_AVAILABILITY_DISPLAY,
  SESSION_LIFECYCLE_DISPLAY,
} from '../../lib/assistantTypes';
import { assistantStore } from '../../lib/assistantStore';

interface Props {
  diagnostics: AssistantContextDiagnostics | null;
}

export default function AssistantDiagnosticsPanel({ diagnostics }: Props) {
  if (!diagnostics) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>CONTEXT DIAGNOSTICS</Text>
        <Text style={styles.emptyText}>Initializing context assembly\u2026</Text>
      </View>
    );
  }

  // Phase 7B: Count issues
  const issueCount = diagnostics.entries.filter(e =>
    e.data_summary.includes('MISSING') ||
    e.data_summary.includes('NOT SUSTAINABLE') ||
    e.data_summary.includes('ANOMALIES') ||
    e.data_summary.includes('INTEGRITY')
  ).length;

  // Phase 7C: Guidance card stats
  const activeCards = assistantStore.getActiveGuidanceCards();
  const resolvedCards = assistantStore.getResolvedGuidanceCards();

  // Phase 7D: Session stats
  const session = assistantStore.getExpeditionSession();
  const sessionActive = session?.lifecycle === 'active';
  const sessionDisplay = session ? SESSION_LIFECYCLE_DISPLAY[session.lifecycle] : null;
  const latestDelta = assistantStore.getLatestDelta();

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>CONTEXT DIAGNOSTICS</Text>
        <View style={styles.headerBadges}>
          {issueCount > 0 && (
            <View style={styles.issueBadge}>
              <Ionicons name="warning-outline" size={9} color="#E67E22" />
              <Text style={styles.issueText}>{issueCount} ISSUE{issueCount > 1 ? 'S' : ''}</Text>
            </View>
          )}
          <View style={styles.completenessChip}>
            <Text style={[
              styles.completenessText,
              { color: diagnostics.completeness_pct >= 70 ? '#4CAF50' : diagnostics.completeness_pct >= 40 ? '#FFB300' : '#78909C' },
            ]}>
              {diagnostics.completeness_pct}%
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>
          {diagnostics.available_count}/{diagnostics.total_count} systems reporting
        </Text>
      </View>

      {diagnostics.entries.map(entry => {
        const catDisplay = CONTEXT_CATEGORY_DISPLAY[entry.category];
        const availDisplay = CONTEXT_AVAILABILITY_DISPLAY[entry.availability];
        const hasIssue = entry.data_summary.includes('MISSING') ||
          entry.data_summary.includes('NOT SUSTAINABLE') ||
          entry.data_summary.includes('ANOMALIES') ||
          entry.data_summary.includes('INTEGRITY');

        return (
          <View key={entry.category} style={[
            styles.entryRow,
            hasIssue && styles.entryRowIssue,
          ]}>
            <View style={[styles.statusDot, { backgroundColor: availDisplay.color }]} />
            <Ionicons
              name={catDisplay.icon as any}
              size={14}
              color={catDisplay.color}
            />
            <View style={styles.entryInfo}>
              <Text style={styles.entryLabel}>{catDisplay.shortLabel}</Text>
              <Text style={styles.entrySummary} numberOfLines={1}>
                {entry.data_summary}
              </Text>
            </View>
            <View style={[styles.availBadge, { borderColor: availDisplay.color + '40' }]}>
              <Text style={[styles.availText, { color: availDisplay.color }]}>
                {availDisplay.label.toUpperCase()}
              </Text>
            </View>
          </View>
        );
      })}

      {/* Phase 7C: Guidance Evaluation Status */}
      <View style={styles.guidanceStatusRow}>
        <View style={styles.guidanceStatusLeft}>
          <Ionicons name="bulb-outline" size={12} color={ECS.accent} />
          <Text style={styles.guidanceStatusLabel}>GUIDANCE ENGINE</Text>
        </View>
        <View style={styles.guidanceStatusRight}>
          {activeCards.length > 0 && (
            <View style={styles.guidanceActiveBadge}>
              <Text style={styles.guidanceActiveText}>
                {activeCards.length} ACTIVE
              </Text>
            </View>
          )}
          {resolvedCards.length > 0 && (
            <View style={styles.guidanceResolvedBadge}>
              <Text style={styles.guidanceResolvedText}>
                {resolvedCards.length} RESOLVED
              </Text>
            </View>
          )}
          {activeCards.length === 0 && resolvedCards.length === 0 && (
            <Text style={styles.guidanceNoneText}>No triggers</Text>
          )}
        </View>
      </View>

      {/* Phase 7D: Session Status */}
      <View style={styles.sessionStatusRow}>
        <View style={styles.guidanceStatusLeft}>
          <Ionicons name="navigate-outline" size={12} color={sessionActive ? '#4CAF50' : ECS.muted} />
          <Text style={[styles.guidanceStatusLabel, { color: sessionActive ? '#4CAF50' : ECS.muted }]}>
            SESSION
          </Text>
        </View>
        <View style={styles.guidanceStatusRight}>
          {session && sessionDisplay ? (
            <>
              <View style={[styles.sessionBadge, { borderColor: sessionDisplay.color + '40' }]}>
                <View style={[styles.sessionBadgeDot, { backgroundColor: sessionDisplay.color }]} />
                <Text style={[styles.sessionBadgeText, { color: sessionDisplay.color }]}>
                  {sessionDisplay.shortLabel}
                </Text>
              </View>
              {sessionActive && (
                <>
                  <Text style={styles.sessionStatText}>
                    {session.query_count}q
                  </Text>
                  <Text style={styles.sessionStatText}>
                    {session.guidance_eval_count}eval
                  </Text>
                  {session.delta_history.length > 0 && (
                    <Text style={styles.sessionStatText}>
                      {session.delta_history.length}\u0394
                    </Text>
                  )}
                </>
              )}
            </>
          ) : (
            <Text style={styles.guidanceNoneText}>No session</Text>
          )}
        </View>
      </View>

      {/* Phase 7D: Latest delta summary */}
      {latestDelta && latestDelta.has_significant_changes && (
        <View style={styles.deltaRow}>
          <Ionicons name="swap-vertical-outline" size={10} color={ECS.muted} />
          <Text style={styles.deltaText}>
            Last delta: {latestDelta.changes.length} change(s) ({latestDelta.improved_count}\u2191 {latestDelta.degraded_count}\u2193)
          </Text>
        </View>
      )}

      <Text style={styles.sourceNote}>
        {diagnostics.entries.map(e => e.source_module).filter((v, i, a) => a.indexOf(v) === i).length} source modules | Eval: 30s | Session: 15s | Last: {new Date(diagnostics.evaluated_at).toLocaleTimeString()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: ECS.bgPanel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    padding: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 4,
    color: ECS.accent,
    textTransform: 'uppercase',
  },
  headerBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  issueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(230,126,34,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(230,126,34,0.25)',
  },
  issueText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#E67E22',
  },
  completenessChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(212,160,23,0.08)',
  },
  completenessText: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Courier',
  },
  summaryRow: {
    marginBottom: 10,
  },
  summaryText: {
    fontSize: 11,
    color: ECS.muted,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: ECS.stroke,
  },
  entryRowIssue: {
    backgroundColor: 'rgba(230,126,34,0.04)',
    marginHorizontal: -4,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  entryInfo: {
    flex: 1,
  },
  entryLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: ECS.text,
    textTransform: 'uppercase',
  },
  entrySummary: {
    fontSize: 10,
    color: ECS.muted,
    marginTop: 1,
  },
  availBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 1,
  },
  availText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1,
  },
  emptyText: {
    fontSize: 12,
    color: ECS.muted,
    textAlign: 'center',
    paddingVertical: 20,
  },

  // Phase 7C: Guidance evaluation status
  guidanceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: ECS.stroke,
  },
  guidanceStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  guidanceStatusLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    color: ECS.accent,
  },
  guidanceStatusRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  guidanceActiveBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: 'rgba(230,126,34,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(230,126,34,0.25)',
  },
  guidanceActiveText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#E67E22',
  },
  guidanceResolvedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.20)',
  },
  guidanceResolvedText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#4CAF50',
  },
  guidanceNoneText: {
    fontSize: 9,
    color: ECS.muted,
  },

  // Phase 7D: Session status
  sessionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: ECS.stroke,
  },
  sessionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 1,
  },
  sessionBadgeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  sessionBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1,
  },
  sessionStatText: {
    fontSize: 8,
    fontWeight: '600',
    color: ECS.muted,
    fontFamily: 'Courier',
  },

  // Phase 7D: Delta row
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingLeft: 4,
  },
  deltaText: {
    fontSize: 9,
    color: ECS.muted,
  },

  sourceNote: {
    fontSize: 9,
    color: ECS.muted,
    marginTop: 8,
    textAlign: 'right',
  },
});



