/**
 * Service Reminders
 *
 * Shows upcoming and overdue service items based on
 * mileage intervals and time intervals from maintenance logs.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { EVENT_TYPE_META, type ServiceReminder, formatMileage } from './MaintenanceTypes';

interface Props {
  reminders: ServiceReminder[];
  currentMileage: number | null;
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '--';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch {
    return '--';
  }
}

function daysUntil(iso: string | null): string {
  if (!iso) return '';
  const diff = Math.floor((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 30) return `${diff}d`;
  if (diff < 365) return `${Math.floor(diff / 30)}mo`;
  return `${Math.floor(diff / 365)}y`;
}

function ReminderRow({ reminder }: { reminder: ServiceReminder }) {
  const meta = EVENT_TYPE_META[reminder.eventType] || EVENT_TYPE_META.general;

  const urgencyColors = {
    overdue: { bg: 'rgba(192, 57, 43, 0.10)', border: 'rgba(192, 57, 43, 0.35)', text: '#EF5350', badge: '#EF5350' },
    soon:    { bg: 'rgba(255, 152, 0, 0.08)', border: 'rgba(255, 152, 0, 0.30)', text: '#FFB74D', badge: '#FFB74D' },
    ok:      { bg: 'rgba(0,0,0,0.12)', border: 'rgba(62, 79, 60, 0.25)', text: TACTICAL.textMuted, badge: '#66BB6A' },
  };
  const colors = urgencyColors[reminder.urgency];

  return (
    <View style={[s.row, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <View style={[s.rowIcon, { backgroundColor: meta.color + '18' }]}>
        <Ionicons name={meta.icon as any} size={14} color={meta.color} />
      </View>
      <View style={s.rowContent}>
        <Text style={s.rowTitle}>{reminder.title}</Text>
        <View style={s.rowMeta}>
          {reminder.lastServiceDate && (
            <Text style={s.rowMetaText}>Last: {formatDateShort(reminder.lastServiceDate)}</Text>
          )}
          {reminder.lastServiceMileage != null && (
            <Text style={s.rowMetaText}>{formatMileage(reminder.lastServiceMileage)}</Text>
          )}
          {!reminder.lastServiceDate && (
            <Text style={[s.rowMetaText, { fontStyle: 'italic' }]}>No record</Text>
          )}
        </View>
      </View>
      <View style={s.rowRight}>
        {reminder.urgency === 'overdue' && (
          <View style={[s.urgencyBadge, { backgroundColor: 'rgba(192, 57, 43, 0.18)', borderColor: 'rgba(192, 57, 43, 0.4)' }]}>
            <Ionicons name="alert-circle" size={10} color={colors.badge} />
            <Text style={[s.urgencyText, { color: colors.badge }]}>OVERDUE</Text>
          </View>
        )}
        {reminder.urgency === 'soon' && (
          <View style={[s.urgencyBadge, { backgroundColor: 'rgba(255, 152, 0, 0.12)', borderColor: 'rgba(255, 152, 0, 0.3)' }]}>
            <Ionicons name="warning" size={10} color={colors.badge} />
            <Text style={[s.urgencyText, { color: colors.badge }]}>SOON</Text>
          </View>
        )}
        {reminder.urgency === 'ok' && (
          <View style={[s.urgencyBadge, { backgroundColor: 'rgba(76, 175, 80, 0.10)', borderColor: 'rgba(76, 175, 80, 0.25)' }]}>
            <Ionicons name="checkmark-circle" size={10} color={colors.badge} />
            <Text style={[s.urgencyText, { color: colors.badge }]}>OK</Text>
          </View>
        )}
        {reminder.nextDueDate && (
          <Text style={[s.dueText, { color: colors.text }]}>{daysUntil(reminder.nextDueDate)}</Text>
        )}
        {reminder.nextDueMileage != null && (
          <Text style={[s.dueText, { color: colors.text }]}>{formatMileage(reminder.nextDueMileage)}</Text>
        )}
      </View>
    </View>
  );
}

export default function ServiceReminders({ reminders, currentMileage }: Props) {
  const overdueCount = reminders.filter(r => r.urgency === 'overdue').length;
  const soonCount = reminders.filter(r => r.urgency === 'soon').length;

  return (
    <View style={s.container}>
      {/* Summary bar */}
      <View style={s.summaryBar}>
        <View style={s.summaryItem}>
          <Ionicons name="speedometer-outline" size={12} color={TACTICAL.textMuted} />
          <Text style={s.summaryLabel}>ODOMETER</Text>
          <Text style={s.summaryValue}>{currentMileage != null ? formatMileage(currentMileage) : 'Not set'}</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryItem}>
          <Ionicons name="alert-circle-outline" size={12} color={overdueCount > 0 ? '#EF5350' : TACTICAL.textMuted} />
          <Text style={s.summaryLabel}>OVERDUE</Text>
          <Text style={[s.summaryValue, overdueCount > 0 && { color: '#EF5350' }]}>{overdueCount}</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryItem}>
          <Ionicons name="warning-outline" size={12} color={soonCount > 0 ? '#FFB74D' : TACTICAL.textMuted} />
          <Text style={s.summaryLabel}>DUE SOON</Text>
          <Text style={[s.summaryValue, soonCount > 0 && { color: '#FFB74D' }]}>{soonCount}</Text>
        </View>
      </View>

      {/* Reminder list */}
      {reminders.map(reminder => (
        <ReminderRow key={reminder.eventType} reminder={reminder} />
      ))}

      {reminders.length === 0 && (
        <View style={s.emptyRow}>
          <Ionicons name="checkmark-circle-outline" size={18} color={TACTICAL.textMuted} />
          <Text style={s.emptyText}>Log maintenance events to see service reminders</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginTop: 4 },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.25)',
    marginBottom: 10,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 3 },
  summaryDivider: { width: 1, height: 28, backgroundColor: 'rgba(62, 79, 60, 0.25)' },
  summaryLabel: { fontSize: 7, fontWeight: '900', color: TACTICAL.textMuted, letterSpacing: 1.5 },
  summaryValue: { fontSize: 12, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  rowIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowContent: { flex: 1 },
  rowTitle: { fontSize: 11, fontWeight: '800', color: TACTICAL.text, letterSpacing: 0.3 },
  rowMeta: { flexDirection: 'row', gap: 8, marginTop: 2 },
  rowMetaText: { fontSize: 9, color: TACTICAL.textMuted, fontFamily: 'Courier' },
  rowRight: { alignItems: 'flex-end', gap: 3 },
  urgencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  urgencyText: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  dueText: { fontSize: 9, fontWeight: '700', fontFamily: 'Courier' },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
  },
  emptyText: { fontSize: 10, color: TACTICAL.textMuted, flex: 1, lineHeight: 15 },
});



