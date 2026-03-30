/**
 * Conflict History Panel
 *
 * Shows past conflict resolutions from the conflict_log.
 * Expandable entries with field-level resolution details.
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { SPACING, RADIUS } from '../../lib/theme';
import { useTheme } from '../../context/ThemeContext';
import {
  getConflictLog,
  clearConflictLog,
  getFieldLabel,
  getTableLabel,
  type ConflictLogEntry,
} from '../../lib/conflictStore';

interface Props {
  refreshKey?: number;
  showToast: (msg: string) => void;
}

const STRATEGY_LABELS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  keep_local: { label: 'Kept Local', icon: 'phone-portrait-outline', color: '#5AC8FA' },
  keep_remote: { label: 'Kept Remote', icon: 'cloud-outline', color: '#34C759' },
  field_merge: { label: 'Field Merge', icon: 'git-merge-outline', color: '#FF9500' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ConflictHistoryPanel({ refreshKey, showToast }: Props) {
  const { colors } = useTheme();
  const [entries, setEntries] = useState<ConflictLogEntry[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setEntries(getConflictLog());
  }, [refreshKey]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleClearLog = useCallback(() => {
    if (entries.length === 0) {
      showToast('No history to clear');
      return;
    }

    const doClear = () => {
      clearConflictLog();
      setEntries([]);
      showToast('Conflict history cleared');
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Clear all ${entries.length} conflict history entries?`)) {
        doClear();
      }
    } else {
      Alert.alert(
        'Clear History',
        `Remove all ${entries.length} conflict history entries?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Clear', style: 'destructive', onPress: doClear },
        ]
      );
    }
  }, [entries, showToast]);

  if (entries.length === 0) {
    return (
      <View style={[hs.emptyCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Ionicons name="time-outline" size={28} color={colors.textMuted} />
        <Text style={[hs.emptyText, { color: colors.textSecondary }]}>No conflict history</Text>
        <Text style={[hs.emptySubtext, { color: colors.textMuted }]}>
          Past resolutions will appear here
        </Text>
      </View>
    );
  }

  return (
    <View>
      {/* Header with clear button */}
      <View style={hs.headerRow}>
        <Text style={[hs.countText, { color: colors.textMuted }]}>
          {entries.length} resolution{entries.length !== 1 ? 's' : ''}
        </Text>
        <TouchableOpacity
          style={[hs.clearBtn, { borderColor: colors.danger + '40' }]}
          onPress={handleClearLog}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={11} color={colors.danger} />
          <Text style={[hs.clearBtnText, { color: colors.danger }]}>CLEAR</Text>
        </TouchableOpacity>
      </View>

      {entries.slice(0, 20).map(entry => {
        const isExpanded = expandedIds.has(entry.id);
        const strategyInfo = STRATEGY_LABELS[entry.strategy] || STRATEGY_LABELS.field_merge;

        return (
          <View
            key={entry.id}
            style={[hs.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
          >
            <TouchableOpacity
              style={hs.cardHeader}
              onPress={() => toggleExpand(entry.id)}
              activeOpacity={0.7}
            >
              <Ionicons name={strategyInfo.icon} size={14} color={strategyInfo.color} />
              <View style={hs.cardHeaderInfo}>
                <Text style={[hs.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {getTableLabel(entry.tableName)}
                </Text>
                <Text style={[hs.cardMeta, { color: colors.textMuted }]}>
                  {timeAgo(entry.resolvedAt)} {'\u00B7'} {entry.fieldResolutions.length} field{entry.fieldResolutions.length !== 1 ? 's' : ''}
                </Text>
              </View>
              <View style={[hs.strategyBadge, { backgroundColor: strategyInfo.color + '15', borderColor: strategyInfo.color + '30' }]}>
                <Text style={[hs.strategyText, { color: strategyInfo.color }]}>{strategyInfo.label}</Text>
              </View>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={colors.textMuted}
              />
            </TouchableOpacity>

            {isExpanded && (
              <View style={[hs.cardBody, { borderTopColor: colors.border }]}>
                {/* Timestamps */}
                <View style={hs.tsRow}>
                  <Text style={[hs.tsText, { color: colors.info }]}>
                    Local: {entry.localUpdatedAt ? new Date(entry.localUpdatedAt).toLocaleString() : '?'}
                  </Text>
                  <Text style={[hs.tsText, { color: colors.success }]}>
                    Remote: {entry.remoteUpdatedAt ? new Date(entry.remoteUpdatedAt).toLocaleString() : '?'}
                  </Text>
                </View>

                {/* Field resolutions */}
                {entry.fieldResolutions.map((field, idx) => (
                  <View
                    key={`${entry.id}-${field.field}`}
                    style={[hs.fieldRow, { borderBottomColor: colors.border }]}
                  >
                    <Text style={[hs.fieldName, { color: colors.textSecondary }]}>
                      {getFieldLabel(field.field)}
                    </Text>
                    <View style={hs.fieldValues}>
                      <Text
                        style={[
                          hs.fieldVal,
                          { color: colors.info },
                          field.resolution !== 'local' && { opacity: 0.4, textDecorationLine: 'line-through' },
                        ]}
                        numberOfLines={1}
                      >
                        {formatVal(field.localValue)}
                      </Text>
                      <Ionicons name="arrow-forward" size={10} color={colors.textMuted} />
                      <Text
                        style={[
                          hs.fieldVal,
                          { color: colors.success },
                          field.resolution !== 'remote' && { opacity: 0.4, textDecorationLine: 'line-through' },
                        ]}
                        numberOfLines={1}
                      >
                        {formatVal(field.remoteValue)}
                      </Text>
                    </View>
                    <View style={[
                      hs.resBadge,
                      {
                        backgroundColor: field.resolution === 'local'
                          ? colors.info + '15'
                          : field.resolution === 'remote'
                            ? colors.success + '15'
                            : colors.warning + '15',
                      },
                    ]}>
                      <Text style={[
                        hs.resBadgeText,
                        {
                          color: field.resolution === 'local'
                            ? colors.info
                            : field.resolution === 'remote'
                              ? colors.success
                              : colors.warning,
                        },
                      ]}>
                        {field.resolution.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                ))}

                <Text style={[hs.recordId, { color: colors.textMuted }]}>
                  ID: {entry.recordId.slice(0, 16)}...
                </Text>
              </View>
            )}
          </View>
        );
      })}

      {entries.length > 20 && (
        <Text style={[hs.moreText, { color: colors.textMuted }]}>
          + {entries.length - 20} more entries
        </Text>
      )}
    </View>
  );
}

function formatVal(val: any): string {
  if (val === null || val === undefined) return '(empty)';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  const str = String(val);
  return str.length > 30 ? str.slice(0, 27) + '...' : str;
}

const hs = StyleSheet.create({
  emptyCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.xl,
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.md,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 11,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  countText: {
    fontSize: 11,
    fontWeight: '600',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  clearBtnText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  card: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: SPACING.md,
  },
  cardHeaderInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardMeta: {
    fontSize: 10,
    fontFamily: 'Courier',
    marginTop: 1,
  },
  strategyBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  strategyText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  cardBody: {
    borderTopWidth: 1,
    padding: SPACING.md,
  },
  tsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  tsText: {
    fontSize: 9,
    fontWeight: '600',
    fontFamily: 'Courier',
  },

  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    borderBottomWidth: 1,
  },
  fieldName: {
    fontSize: 10,
    fontWeight: '600',
    width: 80,
  },
  fieldValues: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fieldVal: {
    fontSize: 10,
    fontFamily: 'Courier',
    flexShrink: 1,
  },
  resBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  resBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  recordId: {
    fontSize: 9,
    fontFamily: 'Courier',
    marginTop: SPACING.sm,
  },

  moreText: {
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: SPACING.sm,
  },
});





