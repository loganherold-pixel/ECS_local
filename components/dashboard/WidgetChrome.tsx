import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TACTICAL } from '../../lib/theme';
import { ECSWidgetFallback } from '../ECSStateMessage';
import { ECSWidgetSkeleton } from '../ECSLoading';
import { ECSCard } from '../ECSSurface';
import { ECSCardTitle, ECSHelperText, ECSSectionTitle, ECSStatLabel, ECSStatValue } from '../ECSText';
import { ECS_TEXT_SPACING } from '../../lib/ecsTypographyTokens';
import { ECSBadge } from '../ECSStatus';
import type { ECSStatusTone } from '../../lib/ecsStatusTokens';
import { DASHBOARD_WIDGET_GRAMMAR } from './widgetGrammar';

export type WidgetTone =
  | 'good'
  | 'attention'
  | 'critical'
  | 'neutral'
  | 'live'
  | 'stale'
  | 'offline'
  | 'unavailable'
  | 'warning'
  | 'degraded'
  | 'misconfigured';

export type WidgetStateKind =
  | 'loading'
  | 'live'
  | 'stale'
  | 'unavailable'
  | 'misconfigured'
  | 'degraded'
  | 'warning'
  | 'critical';

export interface WidgetStateDescriptor {
  kind: WidgetStateKind;
  badgeLabel: string;
  primary: string;
  secondary?: string;
  tone: WidgetTone;
}

interface WidgetCardShellProps {
  badge?: {
    label: string;
    tone?: WidgetTone;
  } | null;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

interface WidgetPrimaryValueProps {
  label?: string;
  value: string;
  tone?: WidgetTone;
  align?: 'left' | 'center';
}

interface WidgetSecondaryStatProps {
  label: string;
  value: string;
  tone?: WidgetTone;
}

interface WidgetEmptyStateProps {
  primary: string;
  secondary?: string;
}

interface WidgetMicroStatProps {
  label: string;
  value: string;
  tone?: WidgetTone;
}

interface WidgetCompactRowProps {
  title?: string;
  summary: string;
  tone?: WidgetTone;
  status?: string;
  statusTone?: WidgetTone;
}

const TONE_COLORS: Record<WidgetTone, string> = {
  good: '#4CAF50',
  attention: '#FFB300',
  critical: '#EF5350',
  neutral: TACTICAL.textMuted,
  live: '#4CAF50',
  stale: '#FFB300',
  offline: '#90A4AE',
  unavailable: TACTICAL.textMuted,
  warning: '#FFB300',
  degraded: '#FFB300',
  misconfigured: '#B79B5B',
};

const STATE_TONE_MAP: Record<WidgetStateKind, WidgetTone> = {
  loading: 'attention',
  live: 'live',
  stale: 'stale',
  unavailable: 'unavailable',
  misconfigured: 'misconfigured',
  degraded: 'degraded',
  warning: 'warning',
  critical: 'critical',
};

export function getWidgetToneColor(tone: WidgetTone = 'neutral'): string {
  return TONE_COLORS[tone];
}

export function getWidgetStateTone(kind: WidgetStateKind): WidgetTone {
  return STATE_TONE_MAP[kind];
}

function mapWidgetToneToStatusTone(tone: WidgetTone): ECSStatusTone {
  switch (tone) {
    case 'good':
    case 'live':
      return 'live';
    case 'attention':
    case 'stale':
    case 'warning':
    case 'degraded':
      return 'warning';
    case 'critical':
      return 'unavailable';
    case 'misconfigured':
      return 'ready';
    case 'offline':
    case 'unavailable':
      return 'unavailable';
    case 'neutral':
    default:
      return 'info';
  }
}

export function createWidgetStateDescriptor(params: {
  kind: WidgetStateKind;
  badgeLabel?: string;
  primary: string;
  secondary?: string;
}): WidgetStateDescriptor {
  return {
    kind: params.kind,
    badgeLabel: params.badgeLabel ?? params.kind.replace(/_/g, ' ').toUpperCase(),
    primary: params.primary,
    secondary: params.secondary,
    tone: getWidgetStateTone(params.kind),
  };
}

export function getWidgetStateBadge(
  kind: WidgetStateKind,
  label?: string,
): { label: string; tone: WidgetTone } {
  return {
    label: label ?? kind.replace(/_/g, ' ').toUpperCase(),
    tone: getWidgetStateTone(kind),
  };
}

export function WidgetCardShell({ badge, footer, children }: WidgetCardShellProps) {
  return (
    <ECSCard variant="compact" style={styles.cardSurface}>
      <View style={styles.shell}>
        <View style={styles.headerZone}>
          {badge ? <WidgetStatusBadge label={badge.label} tone={badge.tone} /> : <View style={styles.badgePlaceholder} />}
        </View>
        <View style={styles.main}>{children}</View>
        <View style={styles.footer}>{footer ?? <View style={styles.footerPlaceholder} />}</View>
      </View>
    </ECSCard>
  );
}

export function WidgetStatusBadge({ label, tone = 'neutral' }: { label: string; tone?: WidgetTone }) {
  return <ECSBadge label={label} tone={mapWidgetToneToStatusTone(tone)} compact style={styles.badge} />;
}

export function WidgetPrimaryValue({
  label,
  value,
  tone = 'neutral',
  align = 'left',
}: WidgetPrimaryValueProps) {
  const color = getWidgetToneColor(tone);
  return (
    <View style={[styles.primaryBlock, align === 'center' && styles.primaryCentered]}>
      {label ? <ECSStatLabel style={styles.primaryLabel}>{label}</ECSStatLabel> : null}
      <ECSStatValue style={[styles.primaryValue, { color }, align === 'center' && styles.primaryCenteredText]} numberOfLines={1}>
        {value}
      </ECSStatValue>
    </View>
  );
}

export function WidgetSecondaryRow({ items }: { items: WidgetSecondaryStatProps[] }) {
  return (
    <View style={styles.secondaryRow}>
      {items.slice(0, 2).map((item) => (
        <View key={item.label} style={styles.secondaryCell}>
          <ECSStatLabel style={styles.secondaryLabel}>{item.label}</ECSStatLabel>
          <ECSStatValue style={[styles.secondaryValue, { color: getWidgetToneColor(item.tone ?? 'neutral') }]} numberOfLines={1}>
            {item.value}
          </ECSStatValue>
        </View>
      ))}
    </View>
  );
}

export function WidgetMetaLine({
  text,
  tone = 'neutral',
}: {
  text: string;
  tone?: WidgetTone;
}) {
  return (
    <ECSHelperText style={[styles.metaLine, { color: getWidgetToneColor(tone) }]} numberOfLines={1}>
      {text}
    </ECSHelperText>
  );
}

export function WidgetMicroStrip({ items }: { items: WidgetMicroStatProps[] }) {
  return (
    <View style={styles.microStrip}>
      {items.slice(0, 3).map((item) => (
        <View key={`${item.label}-${item.value}`} style={styles.microItem}>
          <Text style={styles.microLabel} numberOfLines={1}>
            {item.label}
          </Text>
          <Text
            style={[styles.microValue, { color: getWidgetToneColor(item.tone ?? 'neutral') }]}
            numberOfLines={1}
          >
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export const WidgetCompactRow = React.memo(function WidgetCompactRow({
  title,
  summary,
  tone = 'neutral',
  status,
  statusTone,
}: WidgetCompactRowProps) {
  return (
    <View style={styles.compactRow}>
      {title ? (
        <Text style={styles.compactTitle} numberOfLines={1}>
          {title}
        </Text>
      ) : <View style={styles.compactTitlePlaceholder} />}
      <Text style={[styles.compactSummary, { color: getWidgetToneColor(tone) }]} numberOfLines={1}>
        {summary}
      </Text>
      {status ? (
        <Text
          style={[styles.compactStatus, { color: getWidgetToneColor(statusTone ?? tone) }]}
          numberOfLines={1}
        >
          {status}
        </Text>
      ) : <View style={styles.compactStatusPlaceholder} />}
    </View>
  );
}, (prev, next) => (
  prev.title === next.title &&
  prev.summary === next.summary &&
  prev.tone === next.tone &&
  prev.status === next.status &&
  prev.statusTone === next.statusTone
));

export function WidgetEmptyState({ primary, secondary }: WidgetEmptyStateProps) {
  return <ECSWidgetFallback title={primary} message={secondary ?? ''} />;
}

export function WidgetStateMessage({ state }: { state: WidgetStateDescriptor }) {
  if (state.kind === 'loading') {
    return <ECSWidgetSkeleton />;
  }
  return <WidgetEmptyState primary={state.primary} secondary={state.secondary} />;
}

const styles = StyleSheet.create({
  cardSurface: {
    flex: 1,
  },
  shell: {
    flex: 1,
    minHeight: 0,
    gap: DASHBOARD_WIDGET_GRAMMAR.shellGap,
  },
  headerZone: {
    minHeight: DASHBOARD_WIDGET_GRAMMAR.headerMinHeight,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  main: {
    flex: 1,
    minHeight: 0,
    gap: DASHBOARD_WIDGET_GRAMMAR.shellGap,
    justifyContent: 'flex-start',
  },
  footer: {
    marginTop: 'auto',
    minHeight: DASHBOARD_WIDGET_GRAMMAR.footerMinHeight,
    justifyContent: 'flex-end',
    paddingTop: 1,
  },
  footerPlaceholder: {
    height: 10,
  },
  badge: {
    maxWidth: '100%',
  },
  badgePlaceholder: {
    height: DASHBOARD_WIDGET_GRAMMAR.badgeHeight,
  },
  badgeText: {
    maxWidth: '100%',
  },
  primaryBlock: {
    minHeight: DASHBOARD_WIDGET_GRAMMAR.primaryMinHeight,
    justifyContent: 'center',
    gap: Math.max(2, ECS_TEXT_SPACING.widgetTitleToValue - 2),
  },
  primaryCentered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
  },
  primaryValue: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.2,
    lineHeight: 23,
    includeFontPadding: false,
  },
  primaryCenteredText: {
    textAlign: 'center',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 8,
    minHeight: DASHBOARD_WIDGET_GRAMMAR.secondaryMinHeight,
    alignItems: 'flex-start',
  },
  secondaryCell: {
    flex: 1,
    gap: ECS_TEXT_SPACING.statLabelToValue,
    minHeight: DASHBOARD_WIDGET_GRAMMAR.secondaryMinHeight,
    justifyContent: 'flex-start',
  },
  secondaryLabel: {
  },
  secondaryValue: {
    fontSize: 10,
    lineHeight: 12,
    includeFontPadding: false,
    fontVariant: ['tabular-nums'],
  },
  metaLine: {
    fontSize: 9,
    lineHeight: 11,
    minHeight: 11,
    includeFontPadding: false,
    fontVariant: ['tabular-nums'],
  },
  microStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: DASHBOARD_WIDGET_GRAMMAR.microGap,
    minHeight: 18,
    alignItems: 'center',
  },
  microItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    minWidth: 0,
    maxWidth: '100%',
  },
  microLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  microValue: {
    fontSize: 8.5,
    fontWeight: '800',
    color: TACTICAL.text,
    includeFontPadding: false,
    fontVariant: ['tabular-nums'],
  },
  compactRow: {
    flex: 1,
    minHeight: DASHBOARD_WIDGET_GRAMMAR.compact.rowMinHeight,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactTitle: {
    flexShrink: 0,
    minWidth: DASHBOARD_WIDGET_GRAMMAR.compact.titleMinWidth,
    maxWidth: DASHBOARD_WIDGET_GRAMMAR.compact.titleMaxWidth,
    color: TACTICAL.textMuted,
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 1.1,
    lineHeight: 9,
    includeFontPadding: false,
    textTransform: 'uppercase',
  },
  compactTitlePlaceholder: {
    flexShrink: 0,
    minWidth: DASHBOARD_WIDGET_GRAMMAR.compact.titleMinWidth,
    maxWidth: DASHBOARD_WIDGET_GRAMMAR.compact.titleMaxWidth,
  },
  compactSummary: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 14,
    letterSpacing: 0.1,
    includeFontPadding: false,
    fontVariant: ['tabular-nums'],
  },
  compactStatus: {
    flexShrink: 1,
    minWidth: DASHBOARD_WIDGET_GRAMMAR.compact.statusMinWidth,
    maxWidth: DASHBOARD_WIDGET_GRAMMAR.compact.statusMaxWidth,
    fontSize: 8.5,
    fontWeight: '900',
    lineHeight: 10,
    letterSpacing: 0.8,
    includeFontPadding: false,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    textTransform: 'uppercase',
  },
  compactStatusPlaceholder: {
    flexShrink: 1,
    minWidth: DASHBOARD_WIDGET_GRAMMAR.compact.statusMinWidth,
    maxWidth: DASHBOARD_WIDGET_GRAMMAR.compact.statusMaxWidth,
  },
  emptyState: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  emptyPrimary: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    textAlign: 'center',
    lineHeight: 14,
  },
  emptySecondary: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    opacity: 0.8,
    textAlign: 'center',
    lineHeight: 12,
  },
});
