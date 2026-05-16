import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import TacticalPopupShell from '../TacticalPopupShell';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { GOLD_RAIL, TACTICAL } from '../../lib/theme';
import { EXPEDITION_FULL_BODY_POPUP_PROPS } from './expeditionPopupLayout';
import type {
  IncidentContext,
  IncidentCoordinate,
  IncidentTimelineEvent,
} from '../../lib/types/incidentRecovery';

type IncidentTimelineModalProps = {
  visible: boolean;
  onClose: () => void;
  incident?: IncidentContext | null;
  gpsLocation?: IncidentCoordinate | null;
  onAddNote: (note: string) => void;
  onLogLocation: () => void;
};

function getEventTime(event: IncidentTimelineEvent): number {
  const parsed = Date.parse(event.timestamp ?? event.occurredAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatEventTime(event: IncidentTimelineEvent): string {
  const parsed = getEventTime(event);
  if (!parsed) return 'Time unknown';
  return new Date(parsed).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function eventLabel(event: IncidentTimelineEvent): string {
  switch (event.type) {
    case 'reported':
      return 'Incident created';
    case 'checklist_updated':
      return event.title || 'Safety check completed';
    case 'assessment_updated':
      return 'ECS assessment generated';
    case 'evidence_added':
      return 'Evidence added';
    case 'location_updated':
      return 'Location updated';
    case 'communication_packet_generated':
      return 'Communication packet generated';
    case 'communication_packet_copied':
      return 'Communication packet copied';
    case 'communication_sent':
      return 'Communication sent/logged';
    case 'severity_changed':
      return 'Severity changed';
    case 'status_changed':
      return 'Status changed';
    case 'assistance_requested':
      return 'Assistance requested';
    case 'recovery_attempt_logged':
      return 'Recovery attempt logged';
    case 'resolved':
      return 'Incident resolved';
    case 'debrief_added':
      return 'Debrief created';
    case 'note':
      return 'User note added';
    default:
      return event.title;
  }
}

function eventIcon(event: IncidentTimelineEvent): React.ComponentProps<typeof Ionicons>['name'] {
  switch (event.type) {
    case 'reported':
      return 'warning-outline';
    case 'checklist_updated':
      return 'shield-checkmark-outline';
    case 'assessment_updated':
      return 'scan-outline';
    case 'location_updated':
      return 'location-outline';
    case 'communication_packet_generated':
    case 'communication_packet_copied':
    case 'communication_sent':
      return 'radio-outline';
    case 'resolved':
    case 'debrief_added':
      return 'checkmark-done-outline';
    case 'note':
      return 'create-outline';
    default:
      return 'time-outline';
  }
}

export default function IncidentTimelineModal({
  visible,
  onClose,
  incident,
  gpsLocation,
  onAddNote,
  onLogLocation,
}: IncidentTimelineModalProps) {
  const [note, setNote] = useState('');
  const events = useMemo(
    () => [...(incident?.timeline ?? [])].sort((left, right) => getEventTime(left) - getEventTime(right)),
    [incident?.timeline],
  );
  const footer = (
    <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.78}>
      <Text style={styles.closeButtonText}>Close</Text>
    </TouchableOpacity>
  );

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title="Timeline"
      icon="time-outline"
      eyebrow="INCIDENT & RECOVERY"
      subtitle="Chronological incident updates, notes, and workflow events."
      overlayClass="workflow"
      {...EXPEDITION_FULL_BODY_POPUP_PROPS}
      footer={footer}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!incident ? (
          <View style={styles.section}>
            <Text style={styles.emptyTitle}>No active incident</Text>
            <Text style={styles.emptyText}>
              Timeline will appear after an incident is reported or created from a safety check.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.noteBox}>
              <Text style={styles.sectionTitle}>Add note</Text>
              <TextInput
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="Add a short incident note..."
                placeholderTextColor={TACTICAL.textMuted}
                multiline
                textAlignVertical="top"
              />
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.smallButton, !note.trim() && styles.buttonDisabled]}
                  disabled={!note.trim()}
                  onPress={() => {
                    onAddNote(note);
                    setNote('');
                  }}
                  activeOpacity={0.78}
                >
                  <Ionicons name="create-outline" size={13} color={TACTICAL.amber} />
                  <Text style={styles.smallButtonText}>Add Note</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallButton, !gpsLocation && styles.buttonDisabled]}
                  disabled={!gpsLocation}
                  onPress={onLogLocation}
                  activeOpacity={0.78}
                >
                  <Ionicons name="location-outline" size={13} color={TACTICAL.amber} />
                  <Text style={styles.smallButtonText}>Log Location</Text>
                </TouchableOpacity>
              </View>
            </View>

            {events.length === 0 ? (
              <View style={styles.section}>
                <Text style={styles.emptyTitle}>No timeline events</Text>
                <Text style={styles.emptyText}>Workflow events and notes will appear here.</Text>
              </View>
            ) : (
              <View style={styles.timeline}>
                {events.map((event) => (
                  <View key={event.id} style={styles.eventRow}>
                    <View style={styles.eventRail}>
                      <View style={styles.eventIconWrap}>
                        <Ionicons name={eventIcon(event)} size={14} color={TACTICAL.amber} />
                      </View>
                    </View>
                    <View style={styles.eventCard}>
                      <View style={styles.eventHeader}>
                        <Text style={styles.eventTitle}>{eventLabel(event)}</Text>
                        <Text style={styles.eventTime}>{formatEventTime(event)}</Text>
                      </View>
                      <Text style={styles.eventSummary}>
                        {event.summary ?? event.detail ?? event.title}
                      </Text>
                      {event.actor || event.actorId || event.source ? (
                        <Text style={styles.eventMeta}>
                          Actor: {event.actor ?? event.actorId ?? event.source}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </TacticalPopupShell>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(11,14,18,0.62)',
    padding: 12,
    gap: 8,
  },
  emptyTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
  },
  emptyText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  noteBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(17,20,24,0.78)',
    padding: 12,
    gap: 9,
  },
  sectionTitle: {
    color: TACTICAL.amber,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  noteInput: {
    minHeight: 70,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(5,7,10,0.72)',
    color: TACTICAL.text,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 11,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  smallButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(11,14,18,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  smallButtonText: {
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
  },
  timeline: {
    gap: 10,
  },
  eventRow: {
    flexDirection: 'row',
    gap: 9,
  },
  eventRail: {
    width: 26,
    alignItems: 'center',
  },
  eventIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(212,160,23,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(11,14,18,0.62)',
    padding: 10,
    gap: 5,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  eventTitle: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  eventTime: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '800',
  },
  eventSummary: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  eventMeta: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '800',
  },
  closeButton: {
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.72)',
  },
  closeButtonText: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
});
