import React from 'react';
import { ActivityIndicator, DimensionValue, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { ECSPanel, ECSSection, ECSSectionBadge, ECSSectionHeader } from './ECSSurface';
import { ECSStateIndicator } from './ECSStatus';
import { ECSHelperText, ECSStatValue } from './ECSText';
import { TACTICAL } from '../lib/theme';

export type ECSTransientKind =
  | 'loading'
  | 'syncing'
  | 'saving'
  | 'retrying'
  | 'cached'
  | 'stale'
  | 'offline'
  | 'live';

function getTransientTone(kind: ECSTransientKind) {
  switch (kind) {
    case 'live':
      return 'live' as const;
    case 'cached':
    case 'stale':
      return 'warning' as const;
    case 'offline':
      return 'unavailable' as const;
    case 'syncing':
    case 'saving':
    case 'retrying':
    case 'loading':
    default:
      return 'selected' as const;
  }
}

export function ECSSkeletonBlock({
  width = '100%',
  height = 12,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius: Math.min(height / 2, 10),
        },
        style,
      ]}
    />
  );
}

export function ECSTransientNotice({
  kind = 'loading',
  label,
  message,
  compact = false,
  style,
}: {
  kind?: ECSTransientKind;
  label: string;
  message?: string | null;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const tone = getTransientTone(kind);
  const showSpinner = kind === 'loading' || kind === 'syncing' || kind === 'saving' || kind === 'retrying';

  return (
    <ECSPanel
      variant={kind === 'offline' || kind === 'stale' || kind === 'cached' ? 'warning' : 'quiet'}
      style={[styles.noticePanel, compact && styles.noticePanelCompact, style]}
    >
      <View style={styles.noticeRow}>
        {showSpinner ? (
          <ActivityIndicator size="small" color={TACTICAL.amber} />
        ) : (
          <ECSStateIndicator label={label} tone={tone} compact={compact} />
        )}
        {showSpinner ? (
          <View style={styles.noticeCopy}>
            <ECSStatValue style={styles.noticeLabel}>{label}</ECSStatValue>
            {message ? <ECSHelperText>{message}</ECSHelperText> : null}
          </View>
        ) : message ? (
          <ECSHelperText style={styles.noticeMessage}>{message}</ECSHelperText>
        ) : null}
      </View>
    </ECSPanel>
  );
}

export function ECSLoadingCard({
  title = 'Loading',
  message,
  compact = false,
  lineCount = 3,
  style,
}: {
  title?: string;
  message?: string | null;
  compact?: boolean;
  lineCount?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const lines = Array.from({ length: lineCount });

  return (
    <ECSPanel variant={compact ? 'compact' : 'secondary'} style={[styles.card, compact && styles.cardCompact, style]}>
      <View style={styles.cardHeader}>
        <ECSSkeletonBlock width="34%" height={compact ? 10 : 12} />
        <View style={styles.cardBadge}>
          <ECSSkeletonBlock width={54} height={compact ? 18 : 20} />
        </View>
      </View>
      <ECSSkeletonBlock width="58%" height={compact ? 16 : 18} />
      {message ? <ECSHelperText style={styles.cardMessage}>{message}</ECSHelperText> : null}
      <View style={styles.cardBody}>
        {lines.map((_, index) => (
          <ECSSkeletonBlock
            key={`loading-line-${index}`}
            width={index === lines.length - 1 ? '62%' : '100%'}
            height={compact ? 10 : 12}
          />
        ))}
      </View>
    </ECSPanel>
  );
}

export function ECSLoadingSection({
  title,
  icon,
  badge = 'Loading',
  description,
  accentColor = TACTICAL.amber,
  cardCount = 2,
  compactCards = false,
  style,
}: {
  title: string;
  icon?: React.ComponentProps<typeof ECSSectionHeader>['icon'];
  badge?: string;
  description?: string | null;
  accentColor?: string;
  cardCount?: number;
  compactCards?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ECSSection style={style}>
      <ECSSectionHeader
        title={title}
        icon={icon}
        accentColor={accentColor}
        badge={<ECSSectionBadge label={badge} color={accentColor} />}
      />
      {description ? <ECSHelperText>{description}</ECSHelperText> : null}
      <View style={styles.sectionCards}>
        {Array.from({ length: cardCount }).map((_, index) => (
          <ECSLoadingCard
            key={`${title}-loading-${index}`}
            title={title}
            compact={compactCards}
            lineCount={compactCards ? 2 : 3}
          />
        ))}
      </View>
    </ECSSection>
  );
}

export function ECSWidgetSkeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <ECSPanel variant="compact" style={[styles.widget, style]}>
      <View style={styles.widgetTop}>
        <ECSSkeletonBlock width={72} height={20} />
      </View>
      <View style={styles.widgetMain}>
        <ECSSkeletonBlock width="44%" height={14} />
        <ECSSkeletonBlock width="72%" height={28} />
        <ECSSkeletonBlock width="56%" height={11} />
      </View>
      <View style={styles.widgetFooter}>
        <ECSSkeletonBlock width="68%" height={10} />
      </View>
    </ECSPanel>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  noticePanel: {
    paddingVertical: 12,
  },
  noticePanelCompact: {
    paddingVertical: 10,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  noticeCopy: {
    flex: 1,
    gap: 3,
  },
  noticeLabel: {
    fontSize: 12,
  },
  noticeMessage: {
    flex: 1,
  },
  card: {
    gap: 10,
  },
  cardCompact: {
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardBadge: {
    alignItems: 'flex-end',
  },
  cardMessage: {
    opacity: 0.94,
  },
  cardBody: {
    gap: 8,
  },
  sectionCards: {
    gap: 10,
  },
  widget: {
    flex: 1,
    minHeight: 150,
    gap: 8,
  },
  widgetTop: {
    minHeight: 22,
  },
  widgetMain: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    gap: 10,
  },
  widgetFooter: {
    minHeight: 16,
    justifyContent: 'flex-end',
  },
});
