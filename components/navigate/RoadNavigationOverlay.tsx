import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO } from '../../lib/theme';
import { ECSButton } from '../ECSButton';
import ECSActionRow from '../ECSActionRow';
import { ECSCard, ECSPanel } from '../ECSSurface';
import { ECSSearchField, ECSResultsEmptyState } from '../ECSResults';
import { ECSBadge } from '../ECSStatus';
import type { ECSStatusTone } from '../../lib/ecsStatusTokens';
import { ECS_TEXT, ECS_TEXT_SPACING } from '../../lib/ecsTypographyTokens';
import type { RoadNavSearchSuggestion } from '../../lib/mapboxRoadNavigation';
import type { RoadNavigationSessionState } from '../../lib/useRoadNavigation';
import { ECS_CTA_LABELS } from '../../lib/ecsStateCopy';

type Props = {
  topOffset: number;
  bottomOffset: number;
  horizontalInset?: number;
  guidanceRightInset?: number;
  bottomCardRightInset?: number;
  stepListRightInset?: number;
  stepListBottomOffset?: number;
  query: string;
  onChangeQuery: (value: string) => void;
  suggestions: RoadNavSearchSuggestion[];
  searchLoading: boolean;
  searchError: string | null;
  searchDisabled?: boolean;
  searchOperationalLabel?: string | null;
  searchOperationalDetail?: string | null;
  searchOperationalTone?: 'live' | 'degraded' | 'offline' | 'unavailable';
  session: RoadNavigationSessionState;
  previewLoading: boolean;
  stepListExpanded: boolean;
  onToggleSteps: () => void;
  onSelectSuggestion: (suggestion: RoadNavSearchSuggestion) => void;
  onStartNavigation: () => void;
  onEndNavigation: () => void;
  onClearDestination: () => void;
  onReroute: () => void;
  uiMode: 'idle' | 'search' | 'preview' | 'active' | 'arrived' | 'error';
  showSearchSurface?: boolean;
  showActiveTopCard?: boolean;
  previewContext?: {
    tripMode: 'road' | 'trail' | 'hybrid';
    eyebrow: string;
    title: string;
    subtitle?: string | null;
    sourceLabel?: string | null;
    phaseLabel?: string | null;
    metrics: { label: string; value: string }[];
    statusText: string;
    noteText?: string | null;
    primaryActionLabel?: string;
    primaryActionDisabled?: boolean;
    showSteps?: boolean;
    showOverview?: boolean;
    overviewLabel?: string;
    dismissLabel?: string;
    stepListLabel?: string;
    arrivalMessage?: string | null;
  } | null;
  activeContext?: {
    tripMode?: 'road' | 'trail' | 'hybrid';
    eyebrow: string;
    title?: string | null;
    subtitle?: string | null;
    instruction: string;
    distanceLabel?: string | null;
    statusText: string;
    metrics: { label: string; value: string }[];
    progressLabel?: string | null;
    noteText?: string | null;
    showSteps?: boolean;
    showOverview?: boolean;
    showReroute?: boolean;
    overviewLabel?: string;
    rerouteLabel?: string;
    endLabel?: string;
    arrivalMessage?: string | null;
  } | null;
  onPrimaryPreviewAction?: () => void;
  onRouteOverview?: () => void;
};

function formatDistance(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return '--';
  if (meters < 160) {
    return `${Math.max(Math.round(meters / 5) * 5, 5)} ft`;
  }
  const miles = meters / 1609.344;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '--';
  const rounded = Math.max(Math.round(seconds / 60), 1);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatEta(etaIso: string | null): string {
  if (!etaIso) return '--';
  const date = new Date(etaIso);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getManeuverIcon(instruction: string | null): React.ComponentProps<typeof Ionicons>['name'] {
  const lower = String(instruction ?? '').toLowerCase();
  if (lower.includes('left')) return 'arrow-back';
  if (lower.includes('right')) return 'arrow-forward';
  if (lower.includes('u-turn')) return 'refresh';
  if (lower.includes('arrive') || lower.includes('destination')) return 'flag';
  if (lower.includes('merge')) return 'git-merge';
  if (lower.includes('roundabout')) return 'sync';
  return 'navigate';
}

function getOperationalTone(
  tone: Props['searchOperationalTone'],
): ECSStatusTone {
  switch (tone) {
    case 'live':
      return 'live';
    case 'degraded':
    case 'offline':
      return 'warning';
    case 'unavailable':
      return 'unavailable';
    default:
      return 'info';
  }
}

function getPreviewStatusTone(statusLabel: string): ECSStatusTone {
  const normalized = statusLabel.toLowerCase();
  if (normalized.includes('ready')) return 'ready';
  if (normalized.includes('active')) return 'active';
  if (normalized.includes('building') || normalized.includes('updating')) return 'info';
  return 'selected';
}

function SearchSurface({
  topOffset,
  query,
  onChangeQuery,
  searchLoading,
  searchError,
  searchDisabled,
  searchOperationalLabel,
  searchOperationalDetail,
  searchOperationalTone,
  suggestions,
  onSelectSuggestion,
}: Pick<
  Props,
  | 'topOffset'
  | 'query'
  | 'onChangeQuery'
  | 'searchLoading'
  | 'searchError'
  | 'searchDisabled'
  | 'searchOperationalLabel'
  | 'searchOperationalDetail'
  | 'searchOperationalTone'
  | 'suggestions'
  | 'onSelectSuggestion'
>) {
  const showResults = suggestions.length > 0 || !!searchError || searchLoading;
  const showOperationalRow = !!searchOperationalLabel || !!searchOperationalDetail;
  const hasSearchQuery = query.trim().length > 0;
  const showNoMatchState =
    hasSearchQuery &&
    !searchLoading &&
    !searchError &&
    suggestions.length === 0 &&
    !searchDisabled;

  return (
    <View pointerEvents="box-none" style={[styles.searchWrap, { top: topOffset }]}>
      <View style={styles.searchShell}>
        <ECSSearchField
          value={query}
          onChangeText={onChangeQuery}
          placeholder={searchDisabled ? 'Live search unavailable offline' : 'Search address or place'}
          disabled={searchDisabled}
          loading={searchLoading}
          onClear={hasSearchQuery ? () => onChangeQuery('') : undefined}
          style={styles.searchField}
          inputProps={{
            autoCapitalize: 'words',
            autoCorrect: false,
            returnKeyType: 'search',
          }}
        />
        {showOperationalRow ? (
          <View style={styles.searchOperationalRow}>
            {searchOperationalLabel ? (
              <ECSBadge
                label={searchOperationalLabel}
                tone={getOperationalTone(searchOperationalTone)}
                compact
              />
            ) : null}
            {searchOperationalDetail ? (
              <Text style={styles.searchOperationalDetail}>{searchOperationalDetail}</Text>
            ) : null}
          </View>
        ) : null}
        {showResults ? (
          <View style={styles.searchResultsShell}>
            {searchError && suggestions.length === 0 ? (
              <ECSResultsEmptyState
                title="Search Unavailable"
                message={searchError}
                helper="Check connectivity or try a different destination search."
                icon="search-outline"
                variant="compact"
                style={styles.searchEmptyState}
              />
            ) : showNoMatchState ? (
              <ECSResultsEmptyState
                title="No Matches Found"
                message="No destination results matched the current search."
                helper="Try a broader place name or clear the current search."
                actionLabel={ECS_CTA_LABELS.clearSearch}
                onAction={() => onChangeQuery('')}
                icon="search-outline"
                variant="compact"
                style={styles.searchEmptyState}
              />
            ) : (
              <ScrollView style={styles.searchResultsScroll} nestedScrollEnabled>
                {suggestions.map((suggestion) => (
                  <TouchableOpacity
                    key={suggestion.id}
                    style={styles.searchResultRow}
                    activeOpacity={0.82}
                    onPress={() => onSelectSuggestion(suggestion)}
                  >
                    <Ionicons name="location" size={15} color={TACTICAL.amber} />
                    <View style={styles.searchResultTextWrap}>
                      <Text style={styles.searchResultTitle} numberOfLines={1}>
                        {suggestion.title}
                      </Text>
                      {!!suggestion.subtitle ? (
                        <Text style={styles.searchResultSubtitle} numberOfLines={1}>
                          {suggestion.subtitle}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={TACTICAL.textMuted} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function StepList({
  session,
  bottomOffset,
  stepListRightInset = 0,
}: Pick<Props, 'session' | 'bottomOffset' | 'stepListRightInset'>) {
  const steps = session.route?.steps ?? [];
  if (steps.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.bottomDrawerWrap, { bottom: bottomOffset, paddingRight: stepListRightInset }]}
    >
      <ECSPanel variant="secondary" style={styles.bottomDrawer}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {steps.map((step, index) => {
            const active = index === session.currentStepIndex;
            return (
              <View key={step.id} style={[styles.stepRow, active && styles.stepRowActive]}>
                <View style={[styles.stepIndexBadge, active && styles.stepIndexBadgeActive]}>
                  <Text style={[styles.stepIndexText, active && styles.stepIndexTextActive]}>
                    {index + 1}
                  </Text>
                </View>
                <View style={styles.stepTextWrap}>
                  <Text style={[styles.stepInstruction, active && styles.stepInstructionActive]}>
                    {step.instruction}
                  </Text>
                  <Text style={styles.stepMeta}>
                    {formatDistance(step.distanceM)} • {formatDuration(step.durationS)}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </ECSPanel>
    </View>
  );
}

function PreviewCard({
  session,
  previewLoading,
  bottomOffset,
  horizontalInset = 16,
  bottomCardRightInset = 0,
  onStartNavigation,
  onClearDestination,
  onToggleSteps,
  stepListExpanded,
  previewContext,
  onPrimaryPreviewAction,
  onRouteOverview,
}: Pick<
  Props,
  | 'session'
  | 'previewLoading'
  | 'bottomOffset'
  | 'horizontalInset'
  | 'bottomCardRightInset'
  | 'onStartNavigation'
  | 'onClearDestination'
  | 'onToggleSteps'
  | 'stepListExpanded'
  | 'previewContext'
  | 'onPrimaryPreviewAction'
  | 'onRouteOverview'
>) {
  const route = session.route;
  const effectiveMetrics =
    previewContext?.metrics && previewContext.metrics.length > 0
      ? previewContext.metrics.slice(0, 3)
      : [
          { label: 'DIST', value: formatDistance(route?.distanceM ?? null) },
          { label: 'TIME', value: formatDuration(route?.durationS ?? null) },
          {
            label: 'ETA',
            value: route
              ? formatEta(new Date(Date.now() + route.durationS * 1000).toISOString())
              : '--',
          },
        ];
  const primaryActionLabel = previewContext?.primaryActionLabel ?? 'Start Navigation';
  const primaryActionDisabled =
    previewContext?.primaryActionDisabled ?? !route;
  const showSteps = previewContext?.showSteps ?? !!route;
  const showOverview = previewContext?.showOverview ?? !!route;
  const previewTitle = previewContext?.title ?? session.destination?.title ?? 'Route Selected';
  const previewSubtitle = previewContext?.subtitle ?? session.destination?.subtitle ?? null;
  const previewStatusLabel =
    previewContext?.phaseLabel ??
    (previewLoading
      ? 'PREPARING'
      : primaryActionDisabled
        ? 'SELECTED'
        : 'STAGED');
  const previewPhaseText =
    primaryActionDisabled
      ? 'Guidance inactive until preview data is ready.'
      : 'Guidance inactive until you choose Navigate.';
  const previewStatusText =
    previewContext?.statusText ??
    (previewLoading
      ? 'Preparing road route'
      : session.error || session.routeStatusLabel || 'Route staged');

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.bottomWrap,
        {
          bottom: bottomOffset,
          left: horizontalInset,
          right: horizontalInset,
          paddingRight: bottomCardRightInset,
        },
      ]}
    >
      <ECSCard variant="primary" style={styles.bottomCard}>
        <View style={styles.previewSummaryWrap}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderTextWrap}>
              <View style={styles.previewHeaderBadgeRow}>
                <Text style={styles.eyebrow}>{previewContext?.eyebrow ?? 'ROUTE PREVIEW'}</Text>
                {previewContext?.tripMode ? (
                  <ECSBadge
                    label={previewContext.tripMode.toUpperCase()}
                    tone="category"
                    compact
                  />
                ) : null}
                {previewContext?.sourceLabel ? (
                  <ECSBadge
                    label={previewContext.sourceLabel}
                    tone="info"
                    compact
                  />
                ) : null}
                <ECSBadge
                  label={previewStatusLabel}
                  tone={getPreviewStatusTone(previewStatusLabel)}
                  compact
                />
              </View>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {previewTitle}
              </Text>
              {!!previewSubtitle ? (
                <Text style={styles.cardSubtitle} numberOfLines={1}>
                  {previewSubtitle}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={onClearDestination} hitSlop={10}>
              <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.previewPhaseRow}>
            <Text style={styles.previewPhaseText}>{previewPhaseText}</Text>
          </View>
          <Text style={styles.routeStatusText}>{previewStatusText}</Text>
        </View>

        <View style={styles.metricRow}>
          {effectiveMetrics.map((metric) => (
            <View key={metric.label} style={styles.metricBlock}>
              <Text style={styles.metricLabel}>{metric.label}</Text>
              <Text style={styles.metricValue}>{metric.value}</Text>
            </View>
          ))}
        </View>

        {previewContext?.noteText ? (
          <Text style={styles.previewNoteText}>{previewContext.noteText}</Text>
        ) : null}

        {showSteps ? (
          <TouchableOpacity
            style={styles.inlineLinkButton}
            onPress={onToggleSteps}
            activeOpacity={0.82}
          >
            <Ionicons
              name={stepListExpanded ? 'list' : 'list-outline'}
              size={14}
              color={TACTICAL.amber}
            />
            <Text style={styles.inlineLinkButtonText}>
              {previewContext?.stepListLabel ?? 'View route steps'}
            </Text>
          </TouchableOpacity>
        ) : null}

        <ECSActionRow style={styles.actionRow}>
          {showOverview ? (
            <ECSButton
              label={previewContext?.overviewLabel ?? 'Overview'}
              icon="scan-outline"
              variant="secondary"
              size="medium"
              onPress={onRouteOverview}
            />
          ) : null}

          <ECSButton
            label={primaryActionLabel}
            icon="play"
            variant="primary"
            size="medium"
            onPress={onPrimaryPreviewAction ?? onStartNavigation}
            disabled={primaryActionDisabled}
            grow
          />
        </ECSActionRow>
      </ECSCard>
    </View>
  );
}

function ActiveNavigationCard({
  session,
  topOffset,
  bottomOffset,
  horizontalInset = 16,
  guidanceRightInset = 0,
  onEndNavigation,
  onReroute,
  activeContext,
  showActiveTopCard = true,
}: Pick<
  Props,
  | 'session'
  | 'topOffset'
  | 'bottomOffset'
  | 'horizontalInset'
  | 'guidanceRightInset'
  | 'onEndNavigation'
  | 'onReroute'
  | 'activeContext'
> & {
  showActiveTopCard?: boolean;
}) {
  const nextInstruction =
    activeContext?.instruction ?? session.nextInstruction ?? 'Continue on highlighted route';
  const isRerouting = !activeContext && (session.status === 'rerouting' || session.isOffRoute);
  const routeTitle = activeContext?.title ?? session.destination?.title ?? 'Route Active';
  const routeSubtitle = activeContext?.subtitle ?? session.destination?.subtitle ?? null;
  const effectiveMetrics =
    activeContext?.metrics && activeContext.metrics.length > 0
      ? activeContext.metrics.slice(0, 3)
      : [
          { label: 'REMAIN', value: formatDistance(session.remainingDistanceM) },
          { label: 'ETA', value: formatEta(session.etaIso) },
          { label: 'TIME', value: formatDuration(session.remainingDurationS) },
        ];
  const guidanceMetrics = effectiveMetrics.slice(0, 2);
  const showReroute = activeContext?.showReroute ?? (isRerouting || session.isOffRoute);
  const statusLine = activeContext?.statusText ?? session.routeStatusLabel ?? 'Route active';
  const distanceLine =
    activeContext?.distanceLabel ?? formatDistance(session.nextInstructionDistanceM);
  const guidanceEyebrow =
    activeContext?.eyebrow ?? (isRerouting ? 'ROUTE UPDATE' : 'NEXT ACTION');
  const maneuverIcon = getManeuverIcon(nextInstruction);

  return (
    <>
      {showActiveTopCard ? (
      <View
        pointerEvents="box-none"
        style={[styles.activeTopWrap, { top: topOffset, left: horizontalInset, right: horizontalInset }]}
      >
        <ECSCard variant="primary" style={styles.activeTopCard}>
          <View style={styles.activeHeaderRow}>
            <View style={styles.activeHeaderTextWrap}>
              <View style={styles.previewHeaderBadgeRow}>
                <Text style={styles.eyebrow}>
                  {activeContext?.eyebrow ?? (isRerouting ? 'REROUTING' : 'ACTIVE GUIDANCE')}
                </Text>
                {activeContext?.tripMode ? (
                  <ECSBadge
                    label={activeContext.tripMode.toUpperCase()}
                    tone="category"
                    compact
                  />
                ) : null}
                {activeContext?.progressLabel ? (
                  <ECSBadge
                    label={activeContext.progressLabel}
                    tone={isRerouting ? 'warning' : 'active'}
                    compact
                  />
                ) : null}
              </View>
              <Text style={styles.activeRouteTitle} numberOfLines={1}>
                {routeTitle}
              </Text>
              {!!routeSubtitle ? (
                <Text style={styles.activeRouteSubtitle} numberOfLines={1}>
                  {routeSubtitle}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.maneuverRow}>
            <View style={styles.maneuverIconWrap}>
              <Ionicons
                name={maneuverIcon}
                size={18}
                color={TACTICAL.amber}
              />
            </View>
            <View style={styles.maneuverTextWrap}>
              <Text style={styles.activeSectionLabel}>
                {isRerouting ? 'ROUTE UPDATE' : 'NEXT GUIDANCE'}
              </Text>
              <Text style={styles.activeInstruction} numberOfLines={2}>
                {nextInstruction}
              </Text>
            </View>
          </View>

          <View style={styles.activeMetaRow}>
            <Text style={styles.activeMetaValue}>
              {activeContext?.distanceLabel ?? formatDistance(session.nextInstructionDistanceM)}
            </Text>
            <Text style={styles.activeMetaDivider}>•</Text>
              <Text style={styles.activeMetaText}>
                {activeContext?.statusText ?? session.routeStatusLabel ?? 'Route active'}
              </Text>
          </View>
          {activeContext?.noteText ? (
            <Text style={styles.activeNoteText}>{activeContext.noteText}</Text>
          ) : null}
        </ECSCard>
      </View>
      ) : null}

      <View
        pointerEvents="box-none"
        style={[
          styles.activeGuidanceWrap,
          {
            bottom: bottomOffset,
            left: horizontalInset,
            right: horizontalInset,
            paddingRight: guidanceRightInset,
          },
        ]}
      >
        <ECSPanel variant="secondary" style={styles.activeGuidanceCard}>
          <View style={styles.activeGuidanceHeaderRow}>
            <Text style={styles.activeGuidanceEyebrow} numberOfLines={1}>
              {guidanceEyebrow}
            </Text>
            <View style={styles.activeGuidanceHeaderBadges}>
              {activeContext?.tripMode ? (
                <ECSBadge
                  label={activeContext.tripMode.toUpperCase()}
                  tone="category"
                  compact
                />
              ) : null}
              {activeContext?.progressLabel ? (
                <ECSBadge
                  label={activeContext.progressLabel}
                  tone={isRerouting ? 'warning' : 'active'}
                  compact
                />
              ) : null}
            </View>
          </View>
          <View style={styles.activeGuidanceRow}>
            <View style={styles.activeGuidanceIconWrap}>
              <Ionicons name={maneuverIcon} size={18} color={TACTICAL.amber} />
            </View>
            <View style={styles.activeGuidanceCopy}>
              <Text style={styles.activeGuidanceInstruction} numberOfLines={2}>
                {nextInstruction}
              </Text>
              <Text style={styles.activeGuidanceDetail} numberOfLines={1}>
                {distanceLine ? `${distanceLine} to next action` : statusLine}
              </Text>
            </View>
          </View>

          <View style={styles.activeGuidanceMetricsRow}>
            <View style={styles.activeGuidanceMetricChip}>
              <Text style={styles.activeGuidanceMetricLabel}>TURN</Text>
              <Text style={styles.activeGuidanceMetricValue} numberOfLines={1}>
                {distanceLine}
              </Text>
            </View>
            {guidanceMetrics.map((metric) => (
              <View key={metric.label} style={styles.activeGuidanceMetricChip}>
                <Text style={styles.activeGuidanceMetricLabel}>{metric.label}</Text>
                <Text style={styles.activeGuidanceMetricValue} numberOfLines={1}>
                  {metric.value}
                </Text>
              </View>
            ))}
          </View>
        </ECSPanel>
      </View>

    </>
  );
}

function ArrivedCard({
  session,
  bottomOffset,
  horizontalInset = 16,
  bottomCardRightInset = 0,
  onEndNavigation,
  previewContext,
  activeContext,
}: Pick<
  Props,
  | 'session'
  | 'bottomOffset'
  | 'horizontalInset'
  | 'bottomCardRightInset'
  | 'onEndNavigation'
  | 'previewContext'
  | 'activeContext'
>) {
  const arrivedTripMode = activeContext?.tripMode ?? previewContext?.tripMode ?? 'road';
  const arrivedTitle = previewContext?.title ?? session.destination?.title ?? 'Destination reached';
  const arrivedSubtitle = activeContext?.subtitle ?? previewContext?.subtitle ?? session.destination?.subtitle ?? null;
  const arrivedMessage =
    activeContext?.arrivalMessage ??
    activeContext?.noteText ??
    previewContext?.arrivalMessage ??
    'Visual guidance complete.';

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.bottomWrap,
        {
          bottom: bottomOffset,
          left: horizontalInset,
          right: horizontalInset,
          paddingRight: bottomCardRightInset,
        },
      ]}
    >
      <ECSCard variant="primary" style={styles.bottomCard}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardHeaderTextWrap}>
            <View style={styles.previewHeaderBadgeRow}>
              <Text style={styles.eyebrow}>GUIDANCE COMPLETE</Text>
              <ECSBadge label={arrivedTripMode.toUpperCase()} tone="category" compact />
              {previewContext?.sourceLabel ? (
                <ECSBadge
                  label={previewContext.sourceLabel}
                  tone="info"
                  compact
                />
              ) : null}
              <ECSBadge label="ARRIVED" tone="active" compact />
            </View>
          </View>
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {arrivedTitle}
        </Text>
        {!!arrivedSubtitle ? (
          <Text style={styles.cardSubtitle} numberOfLines={1}>
            {arrivedSubtitle}
          </Text>
        ) : null}
        <Text style={styles.routeStatusText}>
          {arrivedMessage}
        </Text>
        <ECSActionRow style={styles.actionRow}>
          <ECSButton
            label="End Navigation"
            icon="checkmark"
            variant="destructive"
            size="medium"
            onPress={onEndNavigation}
            grow
          />
        </ECSActionRow>
      </ECSCard>
    </View>
  );
}

const RoadNavigationOverlay = React.memo(function RoadNavigationOverlay(props: Props) {
  const shouldShowSearch =
    !!props.showSearchSurface &&
    (
      props.uiMode === 'idle' ||
      props.uiMode === 'search' ||
      props.uiMode === 'preview' ||
      props.uiMode === 'error'
    );
  const shouldShowPreview = props.uiMode === 'preview' || props.uiMode === 'error';
  const shouldShowActive = props.uiMode === 'active';
  const shouldShowArrived = props.uiMode === 'arrived';

  const hasSteps = useMemo(
    () => (props.session.route?.steps?.length ?? 0) > 0,
    [props.session.route?.steps],
  );

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {shouldShowSearch ? (
        <SearchSurface
          topOffset={props.topOffset}
          query={props.query}
          onChangeQuery={props.onChangeQuery}
          searchLoading={props.searchLoading}
          searchError={props.searchError}
          searchDisabled={props.searchDisabled}
          searchOperationalLabel={props.searchOperationalLabel}
          searchOperationalDetail={props.searchOperationalDetail}
          searchOperationalTone={props.searchOperationalTone}
          suggestions={props.suggestions}
          onSelectSuggestion={props.onSelectSuggestion}
        />
      ) : null}

      {props.stepListExpanded && hasSteps ? (
        <StepList
          session={props.session}
          bottomOffset={props.stepListBottomOffset ?? props.bottomOffset + 142}
          stepListRightInset={props.stepListRightInset ?? props.guidanceRightInset ?? 0}
        />
      ) : null}

      {shouldShowPreview ? (
        <PreviewCard
          session={props.session}
          previewLoading={props.previewLoading}
          bottomOffset={props.bottomOffset}
          horizontalInset={props.horizontalInset}
          bottomCardRightInset={props.bottomCardRightInset ?? props.guidanceRightInset ?? 0}
          onStartNavigation={props.onStartNavigation}
          onClearDestination={props.onClearDestination}
          onToggleSteps={props.onToggleSteps}
          stepListExpanded={props.stepListExpanded}
          previewContext={props.previewContext}
          onPrimaryPreviewAction={props.onPrimaryPreviewAction}
          onRouteOverview={props.onRouteOverview}
        />
      ) : null}

      {shouldShowActive ? (
        <ActiveNavigationCard
          session={props.session}
          topOffset={props.topOffset}
          bottomOffset={props.bottomOffset}
          horizontalInset={props.horizontalInset}
          guidanceRightInset={props.guidanceRightInset}
          onEndNavigation={props.onEndNavigation}
          onReroute={props.onReroute}
        activeContext={props.activeContext}
        showActiveTopCard={props.showActiveTopCard}
      />
      ) : null}

      {shouldShowArrived ? (
        <ArrivedCard
          session={props.session}
          bottomOffset={props.bottomOffset}
          horizontalInset={props.horizontalInset}
          bottomCardRightInset={props.bottomCardRightInset ?? props.guidanceRightInset ?? 0}
          onEndNavigation={props.onEndNavigation}
          previewContext={props.previewContext}
          activeContext={props.activeContext}
        />
      ) : null}
    </View>
  );
});

RoadNavigationOverlay.displayName = 'RoadNavigationOverlay';

export default RoadNavigationOverlay;

const styles = StyleSheet.create({
  searchWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 84,
    alignItems: 'center',
  },
  searchShell: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.28)',
    backgroundColor: 'rgba(8,12,15,0.97)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 14,
  },
  searchRow: {
    minHeight: 46,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  searchField: {
    minHeight: 46,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  searchInput: {
    flex: 1,
    color: TACTICAL.text,
    ...ECS_TEXT.body,
    fontSize: 13,
  },
  searchInputDisabled: {
    color: TACTICAL.textMuted,
  },
  searchOperationalRow: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(196,138,44,0.10)',
    paddingHorizontal: 13,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchOperationalBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  searchOperationalBadgeLive: {
    borderColor: 'rgba(92, 204, 119, 0.28)',
    backgroundColor: 'rgba(92, 204, 119, 0.10)',
  },
  searchOperationalBadgeDegraded: {
    borderColor: 'rgba(242, 194, 77, 0.28)',
    backgroundColor: 'rgba(242, 194, 77, 0.10)',
  },
  searchOperationalBadgeOffline: {
    borderColor: 'rgba(196,138,44,0.24)',
    backgroundColor: 'rgba(196,138,44,0.10)',
  },
  searchOperationalBadgeUnavailable: {
    borderColor: 'rgba(239, 83, 80, 0.28)',
    backgroundColor: 'rgba(239, 83, 80, 0.10)',
  },
  searchOperationalBadgeText: {
    ...ECS_TEXT.chip,
    color: TACTICAL.text,
    fontSize: 9,
  },
  searchOperationalDetail: {
    flex: 1,
    ...ECS_TEXT.helper,
    lineHeight: 13,
  },
  searchResultsShell: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(196,138,44,0.14)',
    maxHeight: 220,
  },
  searchResultsScroll: {
    maxHeight: 220,
  },
  searchResultRow: {
    minHeight: 54,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  searchResultTextWrap: {
    flex: 1,
  },
  searchResultTitle: {
    ...ECS_TEXT.cardTitle,
    fontSize: 13,
  },
  searchResultSubtitle: {
    ...ECS_TEXT.cardSubtitle,
    marginTop: ECS_TEXT_SPACING.titleToSubtitle - 2,
  },
  searchStatusText: {
    ...ECS_TEXT.dialogBody,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  searchEmptyState: {
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  activeTopWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 82,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  activeTopCard: {
    width: '100%',
    maxWidth: 430,
    paddingHorizontal: 13,
    paddingVertical: 11,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 14,
  },
  previewTopCard: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.2)',
    backgroundColor: 'rgba(8,12,15,0.94)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  previewSummaryWrap: {
    gap: 8,
    marginBottom: 10,
  },
  activeHeaderRow: {
    marginBottom: 10,
  },
  activeHeaderTextWrap: {
    flex: 1,
  },
  activeRouteTitle: {
    ...ECS_TEXT.cardTitle,
  },
  activeRouteSubtitle: {
    ...ECS_TEXT.cardSubtitle,
    marginTop: ECS_TEXT_SPACING.titleToSubtitle - 2,
  },
  maneuverRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  maneuverIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,160,23,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.24)',
  },
  maneuverTextWrap: {
    flex: 1,
  },
  activeInstruction: {
    ...ECS_TEXT.cardTitle,
    fontSize: 14,
    lineHeight: 18,
  },
  activeSectionLabel: {
    ...ECS_TEXT.sectionTitle,
    color: TACTICAL.textMuted,
    marginBottom: 4,
  },
  activeMetaRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  activeMetaValue: {
    ...ECS_TEXT.statValue,
    color: TACTICAL.amber,
    fontSize: 13,
  },
  activeMetaDivider: {
    color: TACTICAL.textMuted,
    fontSize: 11,
  },
  activeMetaText: {
    ...ECS_TEXT.helper,
  },
  activeNoteText: {
    marginTop: 6,
    ...ECS_TEXT.helper,
    color: '#B8B8B8',
  },
  bottomWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 80,
    alignItems: 'center',
  },
  activeGuidanceWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 81,
    alignItems: 'center',
    paddingLeft: 8,
  },
  activeGuidanceCard: {
    width: '100%',
    maxWidth: 392,
    minHeight: 108,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderColor: 'rgba(196,138,44,0.18)',
    backgroundColor: 'rgba(8,12,15,0.84)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 14,
    gap: 9,
  },
  activeGuidanceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  activeGuidanceEyebrow: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 8,
    letterSpacing: 2.1,
    flexShrink: 1,
  },
  activeGuidanceHeaderBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    flexShrink: 1,
  },
  activeGuidanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  activeGuidanceIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,160,23,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.24)',
  },
  activeGuidanceCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  activeGuidanceInstruction: {
    ...ECS_TEXT.cardTitle,
    fontSize: 14,
    lineHeight: 18,
    minHeight: 36,
  },
  activeGuidanceDetail: {
    ...ECS_TEXT.helper,
    marginTop: 4,
    color: TACTICAL.textMuted,
  },
  activeGuidanceMetricsRow: {
    flexDirection: 'row',
    gap: 7,
  },
  activeGuidanceMetricChip: {
    flex: 1,
    minWidth: 0,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.025)',
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 3,
  },
  activeGuidanceMetricLabel: {
    ...ECS_TEXT.statLabel,
    fontSize: 8,
  },
  activeGuidanceMetricValue: {
    ...ECS_TEXT.statValue,
    fontSize: 12,
  },
  bottomCard: {
    width: '100%',
    maxWidth: 392,
    paddingHorizontal: 13,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.36,
    shadowRadius: 16,
    elevation: 16,
  },
  bottomDrawerWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 79,
    alignItems: 'center',
  },
  bottomDrawer: {
    width: '100%',
    maxWidth: 430,
    maxHeight: 210,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardHeaderTextWrap: {
    flex: 1,
  },
  previewHeaderBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  eyebrow: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 9,
    letterSpacing: 2.2,
    marginBottom: 4,
  },
  tripModeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(242,194,77,0.24)',
    backgroundColor: 'rgba(242,194,77,0.08)',
  },
  tripModeBadgeText: {
    ...ECS_TEXT.chip,
    color: TACTICAL.amber,
    fontSize: 9,
  },
  previewStateBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  previewStateBadgeText: {
    ...ECS_TEXT.chip,
    color: TACTICAL.text,
    fontSize: 9,
  },
  progressBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  progressBadgeText: {
    ...ECS_TEXT.chip,
    color: TACTICAL.text,
    fontSize: 9,
  },
  cardTitle: {
    ...ECS_TEXT.cardTitle,
  },
  cardSubtitle: {
    ...ECS_TEXT.cardSubtitle,
    marginTop: ECS_TEXT_SPACING.titleToSubtitle - 2,
  },
  metricRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  metricBlock: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.025)',
    paddingHorizontal: 9,
    paddingVertical: 9,
  },
  metricLabel: {
    ...ECS_TEXT.statLabel,
  },
  metricValue: {
    ...ECS_TEXT.statValue,
    marginTop: ECS_TEXT_SPACING.statLabelToValue + 1,
    fontSize: 13,
  },
  compactMetricRow: {
    flexDirection: 'row',
    gap: 7,
  },
  compactMetricChip: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.025)',
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 3,
  },
  compactMetricLabel: {
    ...ECS_TEXT.statLabel,
  },
  compactMetricValue: {
    ...ECS_TEXT.statValue,
    fontSize: 13,
  },
  compactProgressBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.28)',
    backgroundColor: 'rgba(196,138,44,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  compactProgressBadgeText: {
    ...ECS_TEXT.chip,
    color: TACTICAL.amber,
  },
  routeStatusText: {
    ...ECS_TEXT.dialogBody,
    lineHeight: 15,
  },
  previewPhaseRow: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  previewPhaseText: {
    ...ECS_TEXT.helper,
    color: TACTICAL.textMuted,
  },
  previewNoteText: {
    marginTop: 6,
    ...ECS_TEXT.helper,
    color: '#B8B8B8',
  },
  inlineLinkButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    minHeight: 32,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    backgroundColor: 'rgba(255,255,255,0.025)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineLinkButtonText: {
    ...ECS_TEXT.button,
    color: TACTICAL.amber,
    fontSize: 11,
  },
  actionRow: {
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  stepRowActive: {
    backgroundColor: 'rgba(212,160,23,0.07)',
  },
  stepIndexBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  stepIndexBadgeActive: {
    backgroundColor: 'rgba(212,160,23,0.94)',
  },
  stepIndexText: {
    ...ECS_TEXT.chip,
    color: TACTICAL.textMuted,
    fontSize: 10,
  },
  stepIndexTextActive: {
    color: '#091014',
  },
  stepTextWrap: {
    flex: 1,
  },
  stepInstruction: {
    ...ECS_TEXT.body,
    color: TACTICAL.text,
    fontWeight: '700',
    lineHeight: 16,
  },
  stepInstructionActive: {
    color: TACTICAL.amber,
  },
  stepMeta: {
    ...ECS_TEXT.helper,
    marginTop: ECS_TEXT_SPACING.titleToSubtitle - 2,
  },
});
