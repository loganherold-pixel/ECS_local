/**
 * PowerEventsPanel — Phase 3I-3
 *
 * Compact card that subscribes to the powerEventsStore and displays
 * the most recent detected power events (LOAD_ON, LOAD_OFF, SPIKE, CYCLE).
 *
 * Each row shows:
 *   • Type icon (Ionicons)
 *   • Label + optional delta-W annotation
 *   • Relative timestamp ("2m ago")
 *   • Confidence chip (LOW / MED / HIGH)
 *
 * Empty state shows a monitoring message when no events have been detected.
 *
 * Matches ECS tactical dark theme. Self-contained — only depends on
 * SafeIcon, theme tokens, and the powerEventsStore singleton.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon } from '../../../components/SafeIcon';
import { SPACING, RADIUS, GOLD_RAIL } from '../../../lib/theme';
import { powerEventsStore } from '../../power/detect/powerEventsStore';
import type { PowerEvent, PowerEventType } from '../../power/detect/loadDetection';

// ── Display limit ────────────────────────────────────────────────────────
const MAX_DISPLAY = 10;

// ── Props ────────────────────────────────────────────────────────────────
export interface PowerEventsPanelProps {
  /** Palette from ThemeContext */
  palette?: {
    panel: string;
    text: string;
    textMuted: string;
    amber: string;
    border: string;
  };
}

// ── Defaults ─────────────────────────────────────────────────────────────
const DEFAULT_PALETTE = {
  panel: '#111418',
  text: '#E6EDF3',
  textMuted: '#8B949E',
  amber: '#D4A017',
  border: '#1E232B',
};

// ── Type → visual mapping ────────────────────────────────────────────────

const TYPE_META: Record<
  PowerEventType,
  { icon: string; color: string; label: string }
> = {
  LOAD_ON: {
    icon: 'arrow-up-circle-outline',
    color: '#FF9500',
    label: 'Load On',
  },
  LOAD_OFF: {
    icon: 'arrow-down-circle-outline',
    color: '#34C759',
    label: 'Load Off',
  },
  SPIKE: {
    icon: 'flash-outline',
    color: '#FF3B30',
    label: 'Spike',
  },
  CYCLE: {
    icon: 'repeat-outline',
    color: '#5AC8FA',
    label: 'Cycle',
  },
};

// ── Confidence chip colors ───────────────────────────────────────────────

const CONFIDENCE_COLORS: Record<PowerEvent['confidence'], string> = {
  high: '#34C759',
  medium: '#FFB800',
  low: '#FF9500',
};

const CONFIDENCE_LABELS: Record<PowerEvent['confidence'], string> = {
  high: 'HIGH',
  medium: 'MED',
  low: 'LOW',
};

// ── Relative time formatter ──────────────────────────────────────────────

function relativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  if (diff < 0) return 'just now';

  const sec = Math.floor(diff / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

// ── Event Row ────────────────────────────────────────────────────────────

function EventRow({
  event,
  palette,
  isLast,
}: {
  event: PowerEvent;
  palette: NonNullable<PowerEventsPanelProps['palette']>;
  isLast: boolean;
}) {
  const meta = TYPE_META[event.type] ?? TYPE_META.LOAD_ON;
  const confColor = CONFIDENCE_COLORS[event.confidence];
  const confLabel = CONFIDENCE_LABELS[event.confidence];

  // Build a descriptive line from the event label + deltaW
  const description =
    event.label ??
    meta.label +
      (event.deltaW !== undefined ? ` ${event.deltaW > 0 ? '+' : ''}${event.deltaW} W` : '');

  return (
    <View
      style={[
        styles.row,
        !isLast && { borderBottomWidth: GOLD_RAIL.subsectionWidth, borderBottomColor: GOLD_RAIL.subsection },
      ]}
    >
      {/* Type icon */}
      <View style={[styles.typeIconWrap, { backgroundColor: meta.color + '14' }]}>
        <SafeIcon name={meta.icon} size={16} color={meta.color} />
      </View>

      {/* Label + detail */}
      <View style={styles.labelCol}>
        <Text style={[styles.labelText, { color: palette.text }]} numberOfLines={1}>
          {description}
        </Text>
        {event.deltaW !== undefined && event.label && (
          <Text style={[styles.deltaText, { color: meta.color }]} numberOfLines={1}>
            {event.deltaW > 0 ? '+' : ''}
            {event.deltaW} W
            {event.durationMs !== undefined
              ? ` / ${Math.round(event.durationMs / 1000)}s`
              : ''}
          </Text>
        )}
      </View>

      {/* Relative time */}
      <Text style={[styles.timeText, { color: palette.textMuted }]}>
        {relativeTime(event.t)}
      </Text>

      {/* Confidence chip */}
      <View
        style={[
          styles.confChip,
          {
            backgroundColor: confColor + '15',
            borderColor: confColor + '35',
          },
        ]}
      >
        <View style={[styles.confDot, { backgroundColor: confColor }]} />
        <Text style={[styles.confText, { color: confColor }]}>{confLabel}</Text>
      </View>
    </View>
  );
}

// ── Main Component ───────────────────────────────────────────────────────

export default function PowerEventsPanel({
  palette: paletteProp,
}: PowerEventsPanelProps) {
  const p = paletteProp ?? DEFAULT_PALETTE;

  // ── Subscribe to store ─────────────────────────────────────────────
  const [events, setEvents] = useState<readonly PowerEvent[]>(() =>
    powerEventsStore.getAll(),
  );

  useEffect(() => {
    // Seed with current snapshot
    setEvents(powerEventsStore.getAll());

    const unsub = powerEventsStore.subscribe((updated) => {
      setEvents(updated);
    });

    return unsub;
  }, []);

  // Force relative-time refresh every 30 s
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(iv);
  }, []);

  // Slice to display limit
  const visible = events.slice(0, MAX_DISPLAY);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: p.panel,
          borderColor: p.border,
        },
      ]}
    >
      {/* ── Header row ──────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: p.amber + '12' }]}>
          <SafeIcon name="pulse-outline" size={16} color={p.amber} />
        </View>
        <Text style={[styles.headerTitle, { color: p.amber }]}>
          POWER EVENTS
        </Text>

        {/* Event count badge */}
        {events.length > 0 && (
          <View
            style={[
              styles.countBadge,
              { backgroundColor: p.amber + '18', borderColor: p.amber + '40' },
            ]}
          >
            <Text style={[styles.countText, { color: p.amber }]}>
              {events.length}
            </Text>
          </View>
        )}
      </View>

      {/* ── Amber divider ───────────────────────────────────── */}
      <View
        style={[styles.divider, { backgroundColor: GOLD_RAIL.subsection }]}
      />

      {/* ── Event list or empty state ───────────────────────── */}
      {visible.length === 0 ? (
        <View style={styles.emptyWrap}>
          <SafeIcon name="radio-outline" size={22} color={p.textMuted} />
          <Text style={[styles.emptyText, { color: p.textMuted }]}>
            Monitoring loads…
          </Text>
          <Text style={[styles.emptyHint, { color: p.textMuted }]}>
            Events will appear after 2–5 minutes of telemetry data.
          </Text>
        </View>
      ) : (
        <View style={styles.listWrap}>
          {visible.map((evt, idx) => (
            <EventRow
              key={evt.id}
              event={evt}
              palette={p}
              isLast={idx === visible.length - 1}
            />
          ))}
          {events.length > MAX_DISPLAY && (
            <Text style={[styles.moreText, { color: p.textMuted }]}>
              +{events.length - MAX_DISPLAY} older events
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },

  // ── Header ────────────────────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  countBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  countText: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },

  // ── Divider ───────────────────────────────────────────────
  divider: {
    height: GOLD_RAIL.subsectionWidth,
    marginVertical: SPACING.sm,
  },

  // ── Event row ─────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  typeIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelCol: {
    flex: 1,
    gap: 2,
  },
  labelText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  deltaText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },
  timeText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
    marginRight: 4,
  },

  // ── Confidence chip ───────────────────────────────────────
  confChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  confDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  confText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // ── List ──────────────────────────────────────────────────
  listWrap: {},
  moreText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 8,
  },

  // ── Empty state ───────────────────────────────────────────
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    gap: 6,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  emptyHint: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
});


