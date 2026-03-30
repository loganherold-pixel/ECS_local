// ============================================================
// Expedition Timeline Panel — Mission logbook UI
// ============================================================
// Displays the auto-generated expedition timeline with:
//   - Filter chips by event type
//   - Reverse-chronological event list
//   - Quick-add buttons (fuel stop, camp, note)
//   - Summary card when expedition is complete
//   - Sync status indicator
// ============================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, ECS, GOLD_RAIL } from '../../lib/theme';
import {
  timelineIntelligenceEngine,
  TIMELINE_EVENT_META,
  type TimelineEntry,
  type TimelineEventType,
  type TimelineSummary,
} from '../../lib/timelineIntelligenceEngine';
import {
  expeditionStateStore,
  type ExpeditionState,
} from '../../lib/expeditionStateStore';
import TimelineEventCard from './TimelineEventCard';
import TimelineSummaryCard from './TimelineSummaryCard';

// ── Filter Types ─────────────────────────────────────────────
type FilterValue = TimelineEventType | 'ALL';

const FILTER_CHIPS: { value: FilterValue; label: string; icon: string; color: string }[] = [
  { value: 'ALL',                  label: 'ALL',     icon: 'list-outline',             color: TACTICAL.textMuted },
  { value: 'milestone',            label: 'MILES',   icon: 'trophy-outline',           color: '#42A5F5' },
  { value: 'remote_zone_entered',  label: 'REMOTE',  icon: 'radio-outline',            color: '#E67E22' },
  { value: 'system_warning',       label: 'WARN',    icon: 'warning-outline',          color: '#FF9500' },
  { value: 'camp_established',     label: 'CAMP',    icon: 'bonfire-outline',          color: '#FFB74D' },
  { value: 'manual_note',          label: 'NOTES',   icon: 'create-outline',           color: '#8B949E' },
];

// ── Quick Actions ────────────────────────────────────────────
const QUICK_ACTIONS: { type: TimelineEventType; label: string; icon: string; color: string }[] = [
  { type: 'fuel_stop',         label: 'FUEL STOP',  icon: 'flame-outline',    color: '#EF5350' },
  { type: 'camp_established',  label: 'CAMP',       icon: 'bonfire-outline',  color: '#FFB74D' },
  { type: 'checkpoint',        label: 'CHECKPOINT',  icon: 'location-outline', color: '#CE93D8' },
  { type: 'manual_note',       label: 'NOTE',       icon: 'create-outline',   color: '#8B949E' },
];

interface Props {
  expeditionId: string | null;
  expeditionState: ExpeditionState;
  /** Optional: called when user taps an event with coordinates */
  onEventLocationPress?: (lat: number, lng: number) => void;
}

export default function ExpeditionTimelinePanel({
  expeditionId,
  expeditionState,
  onEventLocationPress,
}: Props) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [filter, setFilter] = useState<FilterValue>('ALL');
  const [summary, setSummary] = useState<TimelineSummary | null>(null);
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteDescription, setNoteDescription] = useState('');
  const [quickActionType, setQuickActionType] = useState<TimelineEventType | null>(null);
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  // ── Load entries ───────────────────────────────────────────
  const loadEntries = useCallback(() => {
    if (!expeditionId) {
      setEntries([]);
      setSummary(null);
      return;
    }

    const all = timelineIntelligenceEngine.getEntries(expeditionId);
    setEntries(all);

    // Generate summary if complete
    if (expeditionState === 'complete' || all.length > 0) {
      setSummary(timelineIntelligenceEngine.getSummary(expeditionId));
    }
  }, [expeditionId, expeditionState]);

  // ── Subscribe to timeline changes ──────────────────────────
  useEffect(() => {
    loadEntries();

    const unsubscribe = timelineIntelligenceEngine.subscribe(() => {
      loadEntries();
    });

    return unsubscribe;
  }, [loadEntries]);

  // ── Pulse animation for live indicator ─────────────────────
  useEffect(() => {
    if (expeditionState !== 'active') return;

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 1000, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [expeditionState, pulseAnim]);

  // ── Filtered entries ───────────────────────────────────────
  const filteredEntries = useMemo(() => {
    if (filter === 'ALL') return entries;
    return entries.filter(e => e.event_type === filter);
  }, [entries, filter]);

  // ── Handle quick action ────────────────────────────────────
  const handleQuickAction = useCallback((type: TimelineEventType) => {
    if (type === 'manual_note') {
      setQuickActionType(type);
      setNoteTitle('');
      setNoteDescription('');
      setNoteModalVisible(true);
      return;
    }

    // Direct log for non-note actions
    switch (type) {
      case 'fuel_stop':
        timelineIntelligenceEngine.logFuelStop();
        break;
      case 'camp_established':
        timelineIntelligenceEngine.logCampEstablished();
        break;
      case 'checkpoint':
        timelineIntelligenceEngine.logEvent('checkpoint', 'Checkpoint', 'Manual checkpoint logged');
        break;
      default:
        timelineIntelligenceEngine.logEvent(type, TIMELINE_EVENT_META[type]?.label || 'Event', '');
    }
  }, []);

  // ── Submit note ────────────────────────────────────────────
  const handleSubmitNote = useCallback(() => {
    if (!noteTitle.trim()) return;
    timelineIntelligenceEngine.logNote(noteTitle.trim(), noteDescription.trim());
    setNoteModalVisible(false);
    setNoteTitle('');
    setNoteDescription('');
  }, [noteTitle, noteDescription]);

  // ── Handle event press (map centering) ─────────────────────
  const handleEventPress = useCallback((entry: TimelineEntry) => {
    if (entry.latitude != null && entry.longitude != null && onEventLocationPress) {
      onEventLocationPress(entry.latitude, entry.longitude);
    }
  }, [onEventLocationPress]);

  const isActive = expeditionState === 'active';
  const isComplete = expeditionState === 'complete';
  const isEmpty = filteredEntries.length === 0;

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="git-commit-outline" size={16} color={ECS.accent} />
          <Text style={styles.headerTitle}>EXPEDITION TIMELINE</Text>
        </View>

        <View style={styles.headerRight}>
          {isActive && (
            <Animated.View style={[styles.liveBadge, { opacity: pulseAnim }]}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </Animated.View>
          )}

          <Text style={styles.countText}>
            {filteredEntries.length} EVENT{filteredEntries.length !== 1 ? 'S' : ''}
          </Text>
        </View>
      </View>

      {/* ── Summary Card (visible when complete or has data) ── */}
      {isComplete && summary && summary.totalEvents > 0 && (
        <TimelineSummaryCard summary={summary} />
      )}

      {/* ── Filter Chips ── */}
      <View style={styles.filterRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChips}
        >
          {FILTER_CHIPS.map((chip) => {
            const isActiveFilter = filter === chip.value;
            // Count events for this filter
            const count = chip.value === 'ALL'
              ? entries.length
              : entries.filter(e => e.event_type === chip.value).length;

            return (
              <TouchableOpacity
                key={chip.value}
                style={[
                  styles.filterChip,
                  isActiveFilter && {
                    borderColor: chip.color + '50',
                    backgroundColor: chip.color + '0C',
                  },
                ]}
                onPress={() => setFilter(chip.value)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={chip.icon as any}
                  size={10}
                  color={isActiveFilter ? chip.color : TACTICAL.textMuted}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    isActiveFilter && { color: chip.color },
                  ]}
                >
                  {chip.label}
                </Text>
                {count > 0 && (
                  <View style={[styles.filterCount, isActiveFilter && { backgroundColor: chip.color + '20' }]}>
                    <Text style={[styles.filterCountText, isActiveFilter && { color: chip.color }]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Quick Actions (only when active) ── */}
      {isActive && (
        <View style={styles.quickActionsRow}>
          {QUICK_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.type}
              style={[styles.quickActionBtn, { borderColor: action.color + '25' }]}
              onPress={() => handleQuickAction(action.type)}
              activeOpacity={0.7}
            >
              <Ionicons name={action.icon as any} size={12} color={action.color} />
              <Text style={[styles.quickActionText, { color: action.color }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Timeline List ── */}
      <View style={styles.listContainer}>
        {isEmpty ? (
          <View style={styles.emptyState}>
            <Ionicons name="git-commit-outline" size={36} color={TACTICAL.textMuted + '40'} />
            <Text style={styles.emptyTitle}>
              {expeditionState === 'standby'
                ? 'NO ACTIVE EXPEDITION'
                : filter === 'ALL'
                  ? 'TIMELINE EMPTY'
                  : `NO ${FILTER_CHIPS.find(c => c.value === filter)?.label || ''} EVENTS`}
            </Text>
            <Text style={styles.emptySubtitle}>
              {expeditionState === 'standby'
                ? 'Begin an expedition to start logging events automatically.'
                : isActive
                  ? 'Events will appear as milestones, zone changes, and warnings are detected.'
                  : 'Try a different filter.'}
            </Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          >
            {filteredEntries.map((entry, index) => (
              <TimelineEventCard
                key={entry.id}
                entry={entry}
                isFirst={index === 0}
                isLast={index === filteredEntries.length - 1}
                onPress={entry.latitude != null ? handleEventPress : undefined}
              />
            ))}
          </ScrollView>
        )}
      </View>

      {/* ── Note Modal ── */}
      <Modal
        visible={noteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNoteModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="create-outline" size={16} color={ECS.accent} />
              <Text style={styles.modalTitle}>ADD NOTE</Text>
              <TouchableOpacity onPress={() => setNoteModalVisible(false)} style={styles.modalClose}>
                <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Note title..."
              placeholderTextColor={TACTICAL.textMuted + '60'}
              value={noteTitle}
              onChangeText={setNoteTitle}
              maxLength={80}
              autoFocus
            />

            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder="Description (optional)..."
              placeholderTextColor={TACTICAL.textMuted + '60'}
              value={noteDescription}
              onChangeText={setNoteDescription}
              maxLength={500}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={[
                styles.modalSubmitBtn,
                !noteTitle.trim() && styles.modalSubmitBtnDisabled,
              ]}
              onPress={handleSubmitNote}
              activeOpacity={0.7}
              disabled={!noteTitle.trim()}
            >
              <Ionicons name="checkmark" size={14} color={noteTitle.trim() ? '#0B0E12' : TACTICAL.textMuted} />
              <Text style={[
                styles.modalSubmitText,
                !noteTitle.trim() && { color: TACTICAL.textMuted },
              ]}>
                LOG NOTE
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ── Header ─────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.75,
    borderBottomColor: GOLD_RAIL.subsection,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: ECS.accent,
    letterSpacing: 3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: 'rgba(76,175,80,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.25)',
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
  },
  liveText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#4CAF50',
    letterSpacing: 2,
  },
  countText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    fontFamily: 'Courier',
  },

  // ── Filter Chips ───────────────────────────────────────
  filterRow: {
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 12,
  },
  filterChips: {
    gap: 6,
    paddingRight: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  filterChipText: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  filterCount: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginLeft: 2,
  },
  filterCountText: {
    fontSize: 7,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },

  // ── Quick Actions ──────────────────────────────────────
  quickActionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  quickActionText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // ── List ───────────────────────────────────────────────
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
    paddingLeft: 8,
  },

  // ── Empty State ────────────────────────────────────────
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 40,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 11,
    color: TACTICAL.textMuted + '80',
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 260,
  },

  // ── Note Modal ─────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: ECS.bgPanel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ECS.stroke,
    padding: 16,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: ECS.accent,
    letterSpacing: 3,
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  modalInput: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: ECS.stroke,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '600',
    color: TACTICAL.text,
  },
  modalTextArea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  modalSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: ECS.accent,
  },
  modalSubmitBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  modalSubmitText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0B0E12',
    letterSpacing: 2,
  },
});



