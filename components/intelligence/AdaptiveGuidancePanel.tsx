/**
 * AdaptiveGuidancePanel — Phase 11 UI Component
 *
 * Displays Adaptive Expedition Guidance outputs on the
 * Status screen during ExpeditionDrive mode.
 *
 * All outputs are driver-safe:
 *   - Short messages
 *   - Simple labels
 *   - Priority-colored indicators
 *   - Dismiss functionality with suppression
 *
 * Guidance displayed:
 *   1. Summary card (highest priority, alert count)
 *   2. Active guidance messages (sorted by priority)
 *   3. Bailout route awareness
 *   4. Dismiss controls
 */

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adaptiveExpeditionGuidance } from '../../lib/adaptiveExpeditionGuidance';
import type { AdaptiveGuidanceOutput, GuidanceMessage } from '../../lib/adaptiveGuidanceTypes';
import {
  GUIDANCE_PRIORITY_COLORS,
  GUIDANCE_PRIORITY_LABELS,
  GUIDANCE_CATEGORY_LABELS,
} from '../../lib/adaptiveGuidanceTypes';

// ── Colors ──────────────────────────────────────────────────
const BG = '#0D1117';
const CARD_BG = '#161B22';
const BORDER = '#30363D';
const TEXT_PRIMARY = '#E6EDF3';
const TEXT_SECONDARY = '#8B949E';
const AMBER = '#D4A017';

// ── Component ───────────────────────────────────────────────

export default function AdaptiveGuidancePanel() {
  const [output, setOutput] = useState<AdaptiveGuidanceOutput>(
    adaptiveExpeditionGuidance.get()
  );

  useEffect(() => {
    // Start the guidance engine
    adaptiveExpeditionGuidance.start();

    const unsub = adaptiveExpeditionGuidance.subscribe(() => {
      setOutput(adaptiveExpeditionGuidance.get());
    });

    return () => {
      unsub();
      // Don't stop the engine on unmount — it may be used by other consumers
    };
  }, []);

  const handleDismiss = useCallback((msg: GuidanceMessage) => {
    adaptiveExpeditionGuidance.dismiss(msg.deduplicationKey);
  }, []);

  if (!output.isActive) {
    return (
      <View style={styles.container}>
        <View style={styles.inactiveCard}>
          <Ionicons name="bulb-outline" size={20} color={TEXT_SECONDARY} />
          <Text style={styles.inactiveText}>Expedition Guidance Standby</Text>
        </View>
      </View>
    );
  }

  const activeMessages = output.messages.filter(m => !m.dismissed);
  const { summary, bailoutInfo } = output;

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Ionicons name="bulb-outline" size={16} color={AMBER} />
        <Text style={styles.headerText}>EXPEDITION GUIDANCE</Text>
        {summary.totalActive > 0 && (
          <View style={[styles.countBadge, {
            backgroundColor: summary.highestPriority
              ? GUIDANCE_PRIORITY_COLORS[summary.highestPriority]
              : BORDER,
          }]}>
            <Text style={styles.countBadgeText}>{summary.totalActive}</Text>
          </View>
        )}
      </View>

      {/* ── No Active Guidance ── */}
      {activeMessages.length === 0 && (
        <View style={styles.noGuidanceCard}>
          <Ionicons name="checkmark-circle-outline" size={20} color="#66BB6A" />
          <Text style={styles.noGuidanceText}>No active guidance</Text>
          <Text style={styles.noGuidanceSubtext}>Conditions nominal</Text>
        </View>
      )}

      {/* ── Active Guidance Messages ── */}
      {activeMessages.map((msg) => (
        <GuidanceCard
          key={msg.id}
          message={msg}
          onDismiss={handleDismiss}
        />
      ))}

      {/* ── Bailout Info ── */}
      {bailoutInfo.available && bailoutInfo.totalNearby > 0 && (
        <View style={styles.bailoutCard}>
          <View style={styles.bailoutHeader}>
            <Ionicons name="git-branch-outline" size={14} color={TEXT_SECONDARY} />
            <Text style={styles.bailoutLabel}>EXIT ROUTES</Text>
            <Text style={styles.bailoutCount}>{bailoutInfo.totalNearby} nearby</Text>
          </View>
          {bailoutInfo.nearestName && bailoutInfo.nearestDistanceMi != null && (
            <Text style={styles.bailoutDetail}>
              Nearest: {bailoutInfo.nearestName} — {bailoutInfo.nearestDistanceMi.toFixed(1)} mi
            </Text>
          )}
        </View>
      )}

      {/* ── Dismissed Count ── */}
      {output.totalDismissed > 0 && (
        <View style={styles.dismissedRow}>
          <Text style={styles.dismissedText}>
            {output.totalDismissed} dismissed
          </Text>
          <TouchableOpacity
            onPress={() => adaptiveExpeditionGuidance.clearDismissals()}
            style={styles.clearButton}
          >
            <Text style={styles.clearButtonText}>Show all</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Guidance Card ───────────────────────────────────────────

function GuidanceCard({
  message,
  onDismiss,
}: {
  message: GuidanceMessage;
  onDismiss: (msg: GuidanceMessage) => void;
}) {
  const priorityColor = GUIDANCE_PRIORITY_COLORS[message.priority];
  const priorityLabel = GUIDANCE_PRIORITY_LABELS[message.priority];
  const categoryLabel = GUIDANCE_CATEGORY_LABELS[message.category];

  return (
    <View style={[styles.guidanceCard, { borderLeftColor: priorityColor }]}>
      <View style={styles.guidanceHeader}>
        <Ionicons name={message.icon as any} size={18} color={priorityColor} />
        <View style={styles.guidanceContent}>
          <View style={styles.guidanceLabelRow}>
            <Text style={[styles.priorityBadge, { color: priorityColor }]}>
              {priorityLabel}
            </Text>
            <Text style={styles.categoryBadge}>{categoryLabel}</Text>
          </View>
          <Text style={styles.guidanceMessage} numberOfLines={2}>
            {message.message}
          </Text>
          {message.detail && (
            <Text style={styles.guidanceDetail} numberOfLines={1}>
              {message.detail}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => onDismiss(message)}
          style={styles.dismissButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close-outline" size={18} color={TEXT_SECONDARY} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  headerText: {
    color: AMBER,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    flex: 1,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  countBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  inactiveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CARD_BG,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  inactiveText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
  },
  noGuidanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CARD_BG,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  noGuidanceText: {
    color: '#66BB6A',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  noGuidanceSubtext: {
    color: TEXT_SECONDARY,
    fontSize: 11,
  },
  guidanceCard: {
    backgroundColor: CARD_BG,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: BORDER,
    borderLeftWidth: 3,
  },
  guidanceHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  guidanceContent: {
    flex: 1,
  },
  guidanceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  priorityBadge: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  categoryBadge: {
    fontSize: 9,
    fontWeight: '600',
    color: TEXT_SECONDARY,
    letterSpacing: 0.5,
  },
  guidanceMessage: {
    color: TEXT_PRIMARY,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  guidanceDetail: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    marginTop: 2,
  },
  dismissButton: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  bailoutCard: {
    backgroundColor: CARD_BG,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  bailoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bailoutLabel: {
    color: TEXT_SECONDARY,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    flex: 1,
  },
  bailoutCount: {
    color: TEXT_SECONDARY,
    fontSize: 10,
    fontWeight: '600',
  },
  bailoutDetail: {
    color: TEXT_PRIMARY,
    fontSize: 11,
    marginTop: 4,
    marginLeft: 20,
  },
  dismissedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  dismissedText: {
    color: TEXT_SECONDARY,
    fontSize: 10,
  },
  clearButton: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  clearButtonText: {
    color: TEXT_SECONDARY,
    fontSize: 10,
    fontWeight: '600',
  },
});



