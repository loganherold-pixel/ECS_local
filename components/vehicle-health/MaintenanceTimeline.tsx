/**
 * Maintenance Timeline
 *
 * Displays a chronological timeline of maintenance events
 * with event type icons, cost, mileage, and expandable details.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import {
  EVENT_TYPE_META,
  type MaintenanceLog,
  formatCost,
  formatMileage,
} from './MaintenanceTypes';

interface Props {
  logs: MaintenanceLog[];
  onDelete: (logId: string) => void;
  onAddNew: () => void;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function daysAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Today';
  if (diff === 1) return '1 day ago';
  if (diff < 30) return `${diff} days ago`;
  if (diff < 365) return `${Math.floor(diff / 30)} mo ago`;
  return `${Math.floor(diff / 365)}y ago`;
}

function TimelineEntry({ log, isLast, onDelete }: { log: MaintenanceLog; isLast: boolean; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const meta = EVENT_TYPE_META[log.event_type] || EVENT_TYPE_META.general;

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Log',
      `Remove "${log.title}" from maintenance history?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(log.id) },
      ]
    );
  }, [log, onDelete]);

  return (
    <View style={s.entryRow}>
      {/* Timeline connector */}
      <View style={s.timelineCol}>
        <View style={[s.timelineDot, { backgroundColor: meta.color + '33', borderColor: meta.color }]}>
          <Ionicons name={meta.icon as any} size={12} color={meta.color} />
        </View>
        {!isLast && <View style={s.timelineLine} />}
      </View>

      {/* Content */}
      <TouchableOpacity
        style={s.entryCard}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.85}
      >
        <View style={s.entryHeader}>
          <View style={s.entryHeaderLeft}>
            <Text style={s.entryTitle}>{log.title}</Text>
            <Text style={s.entryDate}>{formatDate(log.event_date)} · {daysAgo(log.event_date)}</Text>
          </View>
          <View style={s.entryHeaderRight}>
            {log.cost_cents > 0 && (
              <Text style={s.entryCost}>{formatCost(log.cost_cents)}</Text>
            )}
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={TACTICAL.textMuted}
            />
          </View>
        </View>

        {/* Quick stats row */}
        <View style={s.statsRow}>
          {log.mileage != null && (
            <View style={s.statChip}>
              <Ionicons name="speedometer-outline" size={10} color={TACTICAL.textMuted} />
              <Text style={s.statText}>{formatMileage(log.mileage)}</Text>
            </View>
          )}
          {log.shop_name && (
            <View style={s.statChip}>
              <Ionicons name="location-outline" size={10} color={TACTICAL.textMuted} />
              <Text style={s.statText} numberOfLines={1}>{log.shop_name}</Text>
            </View>
          )}
        </View>

        {/* Expanded details */}
        {expanded && (
          <View style={s.expandedSection}>
            {log.parts_used && (
              <View style={s.detailRow}>
                <Text style={s.detailLabel}>PARTS</Text>
                <Text style={s.detailValue}>{log.parts_used}</Text>
              </View>
            )}
            {log.description && (
              <View style={s.detailRow}>
                <Text style={s.detailLabel}>NOTES</Text>
                <Text style={s.detailValue}>{log.description}</Text>
              </View>
            )}
            {log.next_due_mileage != null && (
              <View style={s.detailRow}>
                <Text style={s.detailLabel}>NEXT DUE</Text>
                <Text style={s.detailValue}>{formatMileage(log.next_due_mileage)}</Text>
              </View>
            )}
            {log.next_due_date && (
              <View style={s.detailRow}>
                <Text style={s.detailLabel}>NEXT DATE</Text>
                <Text style={s.detailValue}>{formatDate(log.next_due_date)}</Text>
              </View>
            )}
            <TouchableOpacity style={s.deleteBtn} onPress={handleDelete} activeOpacity={0.85}>
              <Ionicons name="trash-outline" size={13} color={TACTICAL.danger} />
              <Text style={s.deleteBtnText}>DELETE</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function MaintenanceTimeline({ logs, onDelete, onAddNew }: Props) {
  if (logs.length === 0) {
    return (
      <View style={s.emptyContainer}>
        <View style={s.emptyIcon}>
          <Ionicons name="document-text-outline" size={28} color={TACTICAL.textMuted} />
        </View>
        <Text style={s.emptyTitle}>NO MAINTENANCE RECORDS</Text>
        <Text style={s.emptySub}>Start logging service events to build your vehicle's maintenance history.</Text>
        <TouchableOpacity style={s.emptyAddBtn} onPress={onAddNew} activeOpacity={0.85}>
          <Ionicons name="add" size={16} color="#0B0F12" />
          <Text style={s.emptyAddBtnText}>LOG FIRST SERVICE</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {logs.map((log, idx) => (
        <TimelineEntry
          key={log.id}
          log={log}
          isLast={idx === logs.length - 1}
          onDelete={onDelete}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginTop: 4 },
  entryRow: { flexDirection: 'row', minHeight: 70 },
  timelineCol: { width: 36, alignItems: 'center' },
  timelineDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginTop: 4,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(62, 79, 60, 0.25)',
    marginVertical: 2,
  },
  entryCard: {
    flex: 1,
    marginLeft: 8,
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.25)',
  },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  entryHeaderLeft: { flex: 1 },
  entryHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },
  entryTitle: { fontSize: 12, fontWeight: '800', color: TACTICAL.text, letterSpacing: 0.3 },
  entryDate: { fontSize: 10, color: TACTICAL.textMuted, marginTop: 2 },
  entryCost: { fontSize: 12, fontWeight: '800', color: TACTICAL.amber, fontFamily: 'Courier' },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  statText: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, fontFamily: 'Courier' },
  expandedSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.18)',
  },
  detailRow: { marginBottom: 8 },
  detailLabel: { fontSize: 8, fontWeight: '900', color: TACTICAL.textMuted, letterSpacing: 1.5, marginBottom: 2 },
  detailValue: { fontSize: 11, color: TACTICAL.text, lineHeight: 16 },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(192, 57, 43, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(192, 57, 43, 0.25)',
  },
  deleteBtnText: { fontSize: 10, fontWeight: '900', color: TACTICAL.danger, letterSpacing: 1.2 },
  // Empty state
  emptyContainer: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
    marginTop: 8,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 11, fontWeight: '900', color: TACTICAL.textMuted, letterSpacing: 1.2 },
  emptySub: { fontSize: 10, color: TACTICAL.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 15, maxWidth: 260 },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
  },
  emptyAddBtnText: { fontSize: 10, fontWeight: '900', color: '#0B0F12', letterSpacing: 1.2 },
});



