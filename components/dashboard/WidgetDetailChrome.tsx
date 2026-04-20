import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { DASHBOARD_WIDGET_GRAMMAR } from './widgetGrammar';

export type WidgetDetailTone =
  | 'neutral'
  | 'live'
  | 'manual'
  | 'attention'
  | 'warning'
  | 'critical'
  | 'muted';

interface WidgetDetailBadge {
  label: string;
  tone?: WidgetDetailTone;
}

interface WidgetDetailLeadCardProps {
  eyebrow?: string;
  title: string;
  summary?: string | null;
  tone?: WidgetDetailTone;
  badges?: WidgetDetailBadge[];
  metaLines?: Array<string | null | undefined>;
  children?: React.ReactNode;
}

interface WidgetDetailStateCardProps {
  title: string;
  message: string;
  tone?: WidgetDetailTone;
  badgeLabel?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  metaLines?: Array<string | null | undefined>;
  children?: React.ReactNode;
}

interface WidgetDetailSectionCardProps {
  children: React.ReactNode;
  tone?: WidgetDetailTone;
}

interface WidgetDetailMetricGridProps {
  children: React.ReactNode;
}

export function WidgetDetailSectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function WidgetDetailSectionCard({
  children,
  tone = 'neutral',
}: WidgetDetailSectionCardProps) {
  return <View style={[styles.card, styles.sectionCard, getCardToneStyle(tone)]}>{children}</View>;
}

export function WidgetDetailMetricGrid({ children }: WidgetDetailMetricGridProps) {
  return <View style={styles.metricGrid}>{children}</View>;
}

export function WidgetDetailLeadCard({
  eyebrow,
  title,
  summary,
  tone = 'neutral',
  badges,
  metaLines,
  children,
}: WidgetDetailLeadCardProps) {
  const accent = getToneColor(tone);
  return (
    <View style={[styles.card, styles.leadCard, getCardToneStyle(tone)]}>
      {badges?.length ? (
        <View style={styles.badgeRow}>
          {badges.map((badge) => (
            <WidgetDetailBadgeChip
              key={`${badge.label}-${badge.tone ?? 'neutral'}`}
              label={badge.label}
              tone={badge.tone ?? tone}
            />
          ))}
        </View>
      ) : null}
      {eyebrow ? <Text style={[styles.eyebrow, { color: accent }]}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {summary ? <Text style={styles.summary}>{summary}</Text> : null}
      {metaLines?.filter(Boolean).map((line) => (
        <Text key={line} style={styles.metaLine}>
          {line}
        </Text>
      ))}
      {children ? <View style={styles.contentSlot}>{children}</View> : null}
    </View>
  );
}

export function WidgetDetailStateCard({
  title,
  message,
  tone = 'muted',
  badgeLabel,
  icon = 'information-circle-outline',
  metaLines,
  children,
}: WidgetDetailStateCardProps) {
  const accent = getToneColor(tone);
  return (
    <View style={[styles.card, styles.stateCard, getCardToneStyle(tone)]}>
      <View style={styles.stateHeader}>
        <View style={[styles.stateIconWrap, { backgroundColor: `${accent}16` }]}>
          <Ionicons name={icon} size={13} color={accent} />
        </View>
        <View style={styles.stateTextBlock}>
          {badgeLabel ? <Text style={[styles.eyebrow, { color: accent }]}>{badgeLabel}</Text> : null}
          <Text style={styles.title}>{title}</Text>
        </View>
      </View>
      <Text style={styles.summary}>{message}</Text>
      {metaLines?.filter(Boolean).map((line) => (
        <Text key={line} style={styles.metaLine}>
          {line}
        </Text>
      ))}
      {children ? <View style={styles.contentSlot}>{children}</View> : null}
    </View>
  );
}

function WidgetDetailBadgeChip({ label, tone = 'neutral' }: WidgetDetailBadge) {
  const accent = getToneColor(tone);
  return (
    <View style={[styles.badgeChip, { backgroundColor: `${accent}16`, borderColor: `${accent}32` }]}>
      <Text style={[styles.badgeText, { color: accent }]}>{label}</Text>
    </View>
  );
}

function getToneColor(tone: WidgetDetailTone) {
  switch (tone) {
    case 'live':
      return '#4CAF50';
    case 'manual':
      return '#4FC3F7';
    case 'attention':
    case 'warning':
      return '#FFB300';
    case 'critical':
      return '#EF5350';
    case 'muted':
      return TACTICAL.textMuted;
    case 'neutral':
    default:
      return TACTICAL.amber;
  }
}

function getCardToneStyle(tone: WidgetDetailTone) {
  const accent = getToneColor(tone);
  return {
    borderColor: `${accent}30`,
    backgroundColor: `${accent}0A`,
  };
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginTop: 0,
    marginBottom: 2,
  },
  card: {
    borderRadius: DASHBOARD_WIDGET_GRAMMAR.detail.cardRadius,
    borderWidth: 1,
    padding: DASHBOARD_WIDGET_GRAMMAR.detail.cardPadding,
    gap: DASHBOARD_WIDGET_GRAMMAR.detail.cardGap,
  },
  leadCard: {
    marginBottom: 4,
  },
  sectionCard: {
    paddingTop: 12,
    paddingBottom: 12,
    gap: DASHBOARD_WIDGET_GRAMMAR.detail.sectionGap,
  },
  stateCard: {
    gap: DASHBOARD_WIDGET_GRAMMAR.detail.sectionGap,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  badgeChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  eyebrow: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  summary: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 15,
    minHeight: 15,
  },
  metaLine: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 13,
  },
  contentSlot: {
    marginTop: DASHBOARD_WIDGET_GRAMMAR.detail.contentGap,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: DASHBOARD_WIDGET_GRAMMAR.detail.metricGap,
  },
  stateHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stateIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateTextBlock: {
    flex: 1,
    gap: 2,
  },
});
