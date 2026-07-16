import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';

import { SafeIcon as Ionicons } from './SafeIcon';
import { TACTICAL, ECS } from '../lib/theme';
import { ECSButton } from './ECSButton';
import { ECSHelperText, ECSText } from './ECSText';
import { ECSBadge } from './ECSStatus';
import ECSOperationalAnnouncer from './ECSOperationalAnnouncer';
import { ECS_TEXT_SPACING } from '../lib/ecsTypographyTokens';
import { ECS_STATUS, type ECSStatusTone } from '../lib/ecsStatusTokens';
import type { ECSAsyncSurfaceState } from '../lib/state/asyncSurfaceState';
import {
  resolveECSAsyncSurfacePresentation,
  type ECSAsyncPresentationCopyOverrides,
} from '../lib/state/asyncSurfacePresentation';

export type ECSStateVariant =
  | 'standard'
  | 'selection_required'
  | 'partial_data'
  | 'warning'
  | 'compact'
  | 'loading'
  | 'empty'
  | 'stale'
  | 'offline'
  | 'disabled'
  | 'permission_required'
  | 'recoverable_error'
  | 'nonrecoverable_error';

type BaseProps = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHint?: string;
  helper?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  iconAsset?: number;
  variant?: ECSStateVariant;
  align?: 'left' | 'center';
  busy?: boolean;
  sourceLabel?: string;
  statusTone?: ECSStatusTone;
  accessibilityLabel?: string;
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive';
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function ECSStateMessage({
  title,
  message,
  actionLabel,
  onAction,
  actionHint,
  helper,
  icon = 'information-circle-outline',
  iconAsset,
  variant = 'standard',
  align = 'center',
  busy = false,
  sourceLabel,
  statusTone,
  accessibilityLabel,
  accessibilityLiveRegion = 'none',
  style,
  testID,
}: BaseProps) {
  const tone = statusTone ? ECS_STATUS.tone[statusTone].text : getVariantTone(variant);
  const centered = align === 'center';

  return (
    <>
      <View
        testID={testID}
        accessible={false}
        style={[
          styles.card,
          centered ? styles.cardCentered : styles.cardLeft,
          variant === 'compact' && styles.cardCompact,
          { borderColor: `${tone}2C`, backgroundColor: `${tone}10` },
          style,
        ]}
      >
        <View
          accessible={busy}
          accessibilityRole={busy ? 'progressbar' : undefined}
          accessibilityLabel={busy ? accessibilityLabel ?? title : undefined}
          accessibilityState={busy ? { busy: true } : undefined}
          style={[styles.iconWrap, { borderColor: `${tone}38`, backgroundColor: `${tone}14` }]}
        >
          {busy ? (
            <ActivityIndicator accessible={false} size="small" color={tone} />
          ) : iconAsset ? (
            <Image
              source={iconAsset}
              style={[styles.iconAsset, variant === 'compact' && styles.iconAssetCompact]}
              contentFit="contain"
              transition={0}
              accessible={false}
            />
          ) : (
            <Ionicons
              name={icon}
              size={variant === 'compact' ? 15 : 18}
              color={tone}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          )}
        </View>
        <ECSText variant="dialogTitle" style={[styles.title, centered ? styles.textCentered : styles.textLeft]}>{title}</ECSText>
        <ECSText variant="dialogBody" style={[styles.message, centered ? styles.textCentered : styles.textLeft]}>{message}</ECSText>
        {sourceLabel ? (
          <View style={[styles.sourceRow, centered ? styles.sourceRowCentered : styles.sourceRowLeft]}>
            <ECSBadge
              label={sourceLabel}
              tone={statusTone ?? 'info'}
              compact
              accessibilityLabel={`Source state: ${sourceLabel}`}
            />
          </View>
        ) : null}
        {helper ? (
          <ECSHelperText style={[styles.helper, centered ? styles.textCentered : styles.textLeft]}>{helper}</ECSHelperText>
        ) : null}
        {actionLabel && onAction ? (
          <ECSButton
            label={actionLabel}
            onPress={onAction}
            variant="secondary"
            size="medium"
            accessibilityHint={actionHint}
          />
        ) : null}
      </View>
      {accessibilityLiveRegion !== 'none' ? (
        <Text
          accessible
          accessibilityLiveRegion={accessibilityLiveRegion}
          importantForAccessibility="yes"
          style={styles.visuallyHidden}
        >
          {accessibilityLabel ?? `${title}. ${message}`}
        </Text>
      ) : null}
    </>
  );
}

export type ECSAsyncStateMessageProps<T> = {
  state: ECSAsyncSurfaceState<T>;
  subject: string;
  emptyReason?: 'empty' | 'filtered';
  offline?: boolean;
  copy?: ECSAsyncPresentationCopyOverrides;
  retryLabel?: string;
  onRetry?: () => void;
  align?: 'left' | 'center';
  compact?: boolean;
  showReady?: boolean;
  announceInitial?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Canonical ECS presentation for a typed async surface state. The async model
 * owns truth; this component only renders that established state and dedupes
 * screen-reader announcements by request generation and terminal timestamp.
 */
export function ECSAsyncStateMessage<T>({
  state,
  subject,
  emptyReason,
  offline = false,
  copy,
  retryLabel,
  onRetry,
  align = 'center',
  compact = false,
  showReady = false,
  announceInitial = false,
  style,
  testID,
}: ECSAsyncStateMessageProps<T>) {
  const presentation = resolveECSAsyncSurfacePresentation(state, {
    subject,
    emptyReason,
    offline,
    copy,
    retryLabel,
  });
  const shouldRender = presentation.renderState || (showReady && presentation.kind === 'ready');
  const announcementEvent = useMemo(() => {
    if (!shouldRender) return null;
    const assertive = presentation.accessibilityLiveRegion === 'assertive';
    return {
      id: [
        state.surfaceId,
        state.requestId ?? `generation-${state.generation}`,
        presentation.kind,
        state.completedAt ?? state.startedAt ?? 0,
      ].join(':'),
      kind: assertive ? 'error' as const : 'status_changed' as const,
      subject: assertive ? subject : presentation.title,
      detail: assertive
        ? `${presentation.title}. ${presentation.message}`
        : presentation.message,
    };
  }, [
    presentation.accessibilityLiveRegion,
    presentation.kind,
    presentation.message,
    presentation.title,
    shouldRender,
    state.completedAt,
    state.generation,
    state.requestId,
    state.startedAt,
    state.surfaceId,
    subject,
  ]);

  if (!shouldRender) return null;

  const helper = [
    presentation.helper,
    presentation.safeErrorCode ? `Reference: ${presentation.safeErrorCode}.` : null,
  ].filter(Boolean).join(' ');

  return (
    <>
      <ECSOperationalAnnouncer
        event={announcementEvent}
        announceInitial={announceInitial}
      />
      <ECSStateMessage
        testID={testID}
        title={presentation.title}
        message={presentation.message}
        helper={helper || undefined}
        icon={presentation.icon}
        variant={compact ? 'compact' : getPresentationVariant(presentation.kind)}
        align={align}
        busy={presentation.showSpinner}
        sourceLabel={presentation.sourceLabel}
        statusTone={presentation.tone}
        accessibilityLabel={presentation.accessibilityLabel}
        accessibilityLiveRegion="none"
        actionLabel={presentation.showRetry && onRetry ? presentation.retryLabel : undefined}
        onAction={presentation.showRetry ? onRetry : undefined}
        actionHint="Retries this surface without changing existing last-good data"
        style={style}
      />
    </>
  );
}

export function ECSInlineHelper({
  text,
  variant = 'standard',
  icon,
}: {
  text: string;
  variant?: Exclude<ECSStateVariant, 'compact'>;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}) {
  const tone = getVariantTone(variant);
  return (
    <View style={[styles.inlineHelper, { borderColor: `${tone}22`, backgroundColor: `${tone}0C` }]}>
      <Ionicons name={icon ?? getInlineIcon(variant)} size={13} color={tone} />
      <ECSHelperText style={styles.inlineHelperText}>{text}</ECSHelperText>
    </View>
  );
}

export function ECSWidgetFallback({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.widgetFallback}>
      <ECSText variant="cardTitle" style={styles.widgetTitle}>{title}</ECSText>
      <ECSHelperText style={styles.widgetMessage}>{message}</ECSHelperText>
      {actionLabel && onAction ? (
        <ECSButton
          label={actionLabel}
          onPress={onAction}
          variant="secondary"
          size="compact"
        />
      ) : null}
    </View>
  );
}

function getVariantTone(variant: ECSStateVariant): string {
  switch (variant) {
    case 'loading':
    case 'selection_required':
      return '#5AC8FA';
    case 'stale':
    case 'offline':
    case 'partial_data':
      return '#B79B5B';
    case 'permission_required':
      return '#5AC8FA';
    case 'recoverable_error':
    case 'nonrecoverable_error':
    case 'warning':
      return TACTICAL.danger;
    case 'disabled':
    case 'empty':
    case 'compact':
      return TACTICAL.textMuted;
    default:
      return TACTICAL.amber;
  }
}

function getInlineIcon(variant: Exclude<ECSStateVariant, 'compact'>): React.ComponentProps<typeof Ionicons>['name'] {
  switch (variant) {
    case 'selection_required':
      return 'radio-button-on-outline';
    case 'partial_data':
      return 'layers-outline';
    case 'warning':
      return 'warning-outline';
    default:
      return 'information-circle-outline';
  }
}

function getPresentationVariant(
  kind: ReturnType<typeof resolveECSAsyncSurfacePresentation>['kind'],
): ECSStateVariant {
  switch (kind) {
    case 'loading':
      return 'loading';
    case 'empty':
    case 'no_results_after_filter':
      return 'empty';
    case 'stale':
      return 'stale';
    case 'offline_cached':
      return 'offline';
    case 'partial':
    case 'cancelled':
      return 'partial_data';
    case 'disabled_by_rollout':
      return 'disabled';
    case 'permission_required':
      return 'permission_required';
    case 'recoverable_error':
    case 'provider_unavailable':
      return 'recoverable_error';
    case 'nonrecoverable_error':
      return 'nonrecoverable_error';
    case 'idle':
    case 'ready':
    default:
      return 'standard';
  }
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: ECS.radius,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  cardCentered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLeft: {
    alignItems: 'flex-start',
  },
  cardCompact: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconAsset: {
    width: 22,
    height: 22,
  },
  iconAssetCompact: {
    width: 18,
    height: 18,
  },
  title: {
    marginTop: ECS_TEXT_SPACING.emptyTitleToBody - 2,
  },
  message: {
    marginTop: ECS_TEXT_SPACING.emptyTitleToBody - 4,
  },
  helper: {
    opacity: 0.9,
  },
  sourceRow: {
    width: '100%',
    flexDirection: 'row',
  },
  sourceRowCentered: {
    justifyContent: 'center',
  },
  sourceRowLeft: {
    justifyContent: 'flex-start',
  },
  textCentered: {
    textAlign: 'center',
  },
  textLeft: {
    textAlign: 'left',
  },
  inlineHelper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  inlineHelperText: {
    flex: 1,
  },
  widgetFallback: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  widgetTitle: {
    textAlign: 'center',
  },
  widgetMessage: {
    textAlign: 'center',
  },
  visuallyHidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0.01,
  },
});
