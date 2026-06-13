import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS, GOLD_RAIL, TACTICAL } from '../../lib/theme';
import {
  createDebriefPrepTaskPayload,
  filterDebriefMapOverlaysForRecord,
  getInitialDebriefSelectionState,
  selectDebriefChapter,
  selectDebriefEvent,
  selectDebriefMapOverlay,
  selectDebriefRecommendation,
  type DebriefChapter,
  type DebriefConfidence,
  type DebriefEvent,
  type DebriefEvidence,
  type DebriefMapOverlay,
  type DebriefPrepTaskPayload,
  type DebriefRecommendation,
  type DebriefRecord,
  type DebriefSelectionState,
  type DebriefValueState,
} from '../../lib/debrief/expeditionDebriefRecord';

type ExpeditionReplayDebriefPanelProps = {
  record: DebriefRecord | null;
  enabled?: boolean;
  layoutMode?: 'desktop' | 'mobile';
  onCreatePrepTask?: (payload: DebriefPrepTaskPayload) => void | Promise<void>;
};

type SelectedDebriefContext = {
  chapter: DebriefChapter | null;
  event: DebriefEvent | null;
  overlay: DebriefMapOverlay | null;
  recommendation: DebriefRecommendation | null;
  evidence: DebriefEvidence[];
};

function formatLabel(value: string | null | undefined): string {
  return String(value ?? 'unavailable').replace(/_/g, ' ');
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'unavailable';
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function confidenceStyle(confidence: DebriefConfidence | undefined) {
  if (confidence === 'high') return styles.chipHigh;
  if (confidence === 'medium') return styles.chipMedium;
  if (confidence === 'low') return styles.chipLow;
  return styles.chipUnknown;
}

function valueStateStyle(state: DebriefValueState | undefined) {
  if (state === 'observed') return styles.chipHigh;
  if (state === 'inferred') return styles.chipMedium;
  if (state === 'stale') return styles.chipLow;
  return styles.chipUnavailable;
}

function overlayIcon(type: DebriefMapOverlay['type']): React.ComponentProps<typeof Ionicons>['name'] {
  switch (type) {
    case 'offline_gap':
      return 'cloud-offline-outline';
    case 'stale_span':
      return 'time-outline';
    case 'confidence_segment':
      return 'git-branch-outline';
    case 'camp_endpoint':
      return 'bonfire-outline';
    case 'weather_overlay':
      return 'partly-sunny-outline';
    case 'loadout_issue':
      return 'cube-outline';
    case 'recovery_action':
      return 'construct-outline';
    case 'route_segment':
      return 'map-outline';
    default:
      return 'radio-button-on-outline';
  }
}

function DebriefSourceChip({
  label,
  tone,
}: {
  label: string;
  tone?: 'high' | 'medium' | 'low' | 'unknown' | 'unavailable';
}) {
  const toneStyle =
    tone === 'high'
      ? styles.chipHigh
      : tone === 'medium'
        ? styles.chipMedium
        : tone === 'low'
          ? styles.chipLow
          : tone === 'unavailable'
            ? styles.chipUnavailable
            : styles.chipUnknown;
  return (
    <View style={[styles.sourceChip, toneStyle]}>
      <Text style={styles.sourceChipText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function EvidenceChipRow({ evidence }: { evidence: DebriefEvidence }) {
  return (
    <View style={styles.chipWrap}>
      <DebriefSourceChip label={`Source: ${formatLabel(evidence.sourceSystem)}`} />
      <DebriefSourceChip label={`Event: ${formatDateTime(evidence.eventTime)}`} />
      <DebriefSourceChip label={`Known at the time: ${formatDateTime(evidence.knownAt)}`} />
      <DebriefSourceChip label={`Confidence: ${formatLabel(evidence.confidence)}`} tone={evidence.confidence} />
      <DebriefSourceChip label={`State: ${formatLabel(evidence.valueState)}`} tone={evidence.valueState === 'unavailable' ? 'unavailable' : evidence.valueState === 'stale' ? 'low' : 'medium'} />
      <DebriefSourceChip label={`Freshness: ${formatLabel(evidence.freshness)}`} tone={evidence.freshness === 'unavailable' ? 'unavailable' : evidence.freshness === 'stale' || evidence.freshness === 'expired' ? 'low' : 'medium'} />
    </View>
  );
}

function buildSelectedContext(record: DebriefRecord, selection: DebriefSelectionState): SelectedDebriefContext {
  const chapter = record.chapters.find((item) => item.chapterId === selection.selectedChapterId) ?? record.chapters[0] ?? null;
  const event = record.events.find((item) => item.eventId === selection.selectedEventId) ??
    (chapter ? record.events.find((item) => chapter.eventIds.includes(item.eventId)) : null) ??
    null;
  const overlay = record.mapOverlays.find((item) => item.overlayId === selection.selectedMapOverlayId) ??
    (event ? record.mapOverlays.find((item) => item.eventIds.includes(event.eventId)) : null) ??
    null;
  const recommendation = record.recommendations.find((item) => item.recommendationId === selection.selectedRecommendationId) ??
    (event ? record.recommendations.find((item) => item.linkedEventIds.includes(event.eventId)) : null) ??
    (chapter ? record.recommendations.find((item) => chapter.recommendationIds.includes(item.recommendationId)) : null) ??
    null;
  const evidenceIds = new Set<string>([
    ...(event?.evidenceIds ?? []),
    ...(overlay?.evidenceIds ?? []),
    ...(recommendation?.linkedEvidenceIds ?? []),
  ]);
  const evidence = record.evidence.filter((item) => evidenceIds.has(item.evidenceId));
  return { chapter, event, overlay, recommendation, evidence };
}

function TripSummaryHeader({ record }: { record: DebriefRecord }) {
  const topRecommendationCount = record.tripSummary.topRecommendationIds.length;
  return (
    <View style={styles.summaryHeader}>
      <View style={styles.summaryTitleRow}>
        <View style={styles.summaryIcon}>
          <Ionicons name="map-outline" size={15} color={TACTICAL.amber} />
        </View>
        <View style={styles.summaryCopy}>
          <Text style={styles.kicker}>Internal beta</Text>
          <Text style={styles.title}>Expedition Replay & Debrief</Text>
          <Text style={styles.subtitle}>
            Map-led replay built from a single DebriefRecord. Values show what ECS knew at the time.
          </Text>
        </View>
      </View>
      <View style={styles.summaryMetrics}>
        <Metric label="Completion" value={formatLabel(record.tripSummary.completionStatus)} />
        <Metric label="Readiness Delta" value={record.tripSummary.readinessDelta ?? 'source-limited'} />
        <Metric label="Incidents" value={`${record.tripSummary.incidentCount}`} />
        <Metric label="Offline Gaps" value={`${record.tripSummary.offlineGapCount}`} />
        <Metric label="Top Recs" value={`${topRecommendationCount}`} />
      </View>
      <View style={styles.chipWrap}>
        <DebriefSourceChip label={`Status: ${formatLabel(record.status)}`} tone={record.status === 'complete' ? 'high' : record.status === 'source_limited' ? 'unavailable' : 'medium'} />
        <DebriefSourceChip label={`Generated: ${formatDateTime(record.generatedAt)}`} />
        <DebriefSourceChip label={`Route geometry: ${record.routeGeometryVersion ? 'matched' : 'source-limited'}`} tone={record.routeGeometryVersion ? 'medium' : 'unavailable'} />
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.metricLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

function ReplayMapWorkspace({
  overlays,
  selectedOverlayId,
  onSelectMapOverlay,
}: {
  overlays: DebriefMapOverlay[];
  selectedOverlayId?: string;
  onSelectMapOverlay: (overlayId: string) => void;
}) {
  return (
    <View style={styles.mapPanel} testID="expedition-replay-map-workspace">
      <View style={styles.panelHeader}>
        <View style={styles.panelTitleRow}>
          <Ionicons name="map-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.panelTitle}>Replay Map</Text>
        </View>
        <Text style={styles.panelMeta}>{overlays.length} overlays</Text>
      </View>
      <View style={styles.mapSurface}>
        <View style={styles.mapGridA} />
        <View style={styles.mapGridB} />
        <View style={styles.routeLine} />
        {overlays.length > 0 ? (
          <View style={styles.overlayList}>
            {overlays.map((overlay) => {
              const selected = selectedOverlayId === overlay.overlayId;
              return (
                <TouchableOpacity
                  key={overlay.overlayId}
                  style={[
                    styles.overlayPill,
                    selected && styles.overlayPillSelected,
                    overlay.valueState === 'stale' && styles.overlayPillStale,
                    overlay.valueState === 'unavailable' && styles.overlayPillUnavailable,
                  ]}
                  onPress={() => onSelectMapOverlay(overlay.overlayId)}
                  activeOpacity={0.82}
                  accessibilityRole="button"
                  accessibilityLabel={`Select map overlay ${overlay.label}`}
                >
                  <Ionicons name={overlayIcon(overlay.type)} size={13} color={selected ? '#0B0F12' : TACTICAL.amber} />
                  <View style={styles.overlayCopy}>
                    <Text style={[styles.overlayTitle, selected && styles.overlayTitleSelected]} numberOfLines={1}>{overlay.label}</Text>
                    <Text style={[styles.overlayMeta, selected && styles.overlayMetaSelected]} numberOfLines={1}>
                      {formatLabel(overlay.type)} / {formatLabel(overlay.valueState)} / {formatLabel(overlay.confidence)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.mapEmptyState}>
            <Ionicons name="map-outline" size={22} color={TACTICAL.textMuted} />
            <Text style={styles.mapEmptyTitle}>Map replay source-limited</Text>
            <Text style={styles.mapEmptyText}>Timeline and evidence remain available without route geometry.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function ChapterTimeline({
  record,
  selection,
  onSelectChapter,
  onSelectTimelineEvent,
}: {
  record: DebriefRecord;
  selection: DebriefSelectionState;
  onSelectChapter: (chapterId: string) => void;
  onSelectTimelineEvent: (eventId: string) => void;
}) {
  return (
    <View style={styles.timelinePanel} testID="expedition-replay-timeline">
      <View style={styles.panelHeader}>
        <View style={styles.panelTitleRow}>
          <Ionicons name="time-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.panelTitle}>Chapter Timeline</Text>
        </View>
        <Text style={styles.panelMeta}>{record.chapters.length} chapters</Text>
      </View>
      <View style={styles.timelineList}>
        {record.chapters.map((chapter) => {
          const activeChapter = selection.selectedChapterId === chapter.chapterId;
          const chapterEvents = record.events.filter((event) => chapter.eventIds.includes(event.eventId));
          return (
            <View key={chapter.chapterId} style={[styles.chapterBlock, activeChapter && styles.chapterBlockActive]}>
              <TouchableOpacity
                style={styles.chapterButton}
                onPress={() => onSelectChapter(chapter.chapterId)}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityState={{ selected: activeChapter }}
                accessibilityLabel={`Select ${chapter.title}`}
              >
                <Text style={[styles.chapterOrder, activeChapter && styles.chapterOrderActive]}>{chapter.order}</Text>
                <View style={styles.chapterCopy}>
                  <Text style={styles.chapterTitle} numberOfLines={1}>{chapter.title}</Text>
                  <Text style={styles.chapterSummary} numberOfLines={2}>{chapter.summary}</Text>
                </View>
                <Text style={styles.chapterCount}>{chapterEvents.length}</Text>
              </TouchableOpacity>
              {activeChapter ? (
                <View style={styles.eventList}>
                  {chapterEvents.length > 0 ? chapterEvents.map((event) => {
                    const eventEvidence = record.evidence.find((item) => event.evidenceIds.includes(item.evidenceId));
                    const activeEvent = selection.selectedEventId === event.eventId;
                    return (
                      <TouchableOpacity
                        key={event.eventId}
                        style={[styles.eventRow, activeEvent && styles.eventRowActive]}
                        onPress={() => onSelectTimelineEvent(event.eventId)}
                        activeOpacity={0.82}
                        accessibilityRole="button"
                        accessibilityState={{ selected: activeEvent }}
                        accessibilityLabel={`Select timeline event ${event.title}`}
                      >
                        <View style={[styles.eventDot, eventEvidence && valueStateStyle(eventEvidence.valueState)]} />
                        <View style={styles.eventCopy}>
                          <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
                          <Text style={styles.eventMeta} numberOfLines={1}>
                            {formatDateTime(event.eventTime)} / known at the time {formatDateTime(event.knownAt)}
                          </Text>
                          {eventEvidence ? (
                            <View style={styles.eventChipMiniRow}>
                              <DebriefSourceChip label={formatLabel(eventEvidence.sourceSystem)} />
                              <DebriefSourceChip label={formatLabel(eventEvidence.confidence)} tone={eventEvidence.confidence} />
                              <DebriefSourceChip label={formatLabel(eventEvidence.valueState)} tone={eventEvidence.valueState === 'unavailable' ? 'unavailable' : eventEvidence.valueState === 'stale' ? 'low' : 'medium'} />
                            </View>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  }) : (
                    <Text style={styles.sourceLimitedText}>No timestamped event evidence is available for this chapter.</Text>
                  )}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function DetailPanel({
  context,
  onSelectRecommendation,
  onCreatePrepTask,
  taskSystemAvailable,
}: {
  context: SelectedDebriefContext;
  onSelectRecommendation: (recommendationId: string) => void;
  onCreatePrepTask: (recommendationId: string) => void;
  taskSystemAvailable: boolean;
}) {
  const recommendation = context.recommendation;
  const taskActionDisabled = !recommendation || !taskSystemAvailable || recommendation.state === 'dismissed' || recommendation.state === 'converted_to_task';
  return (
    <View style={styles.detailPanelReplay} testID="expedition-replay-detail-panel">
      <View style={styles.panelHeader}>
        <View style={styles.panelTitleRow}>
          <Ionicons name="document-text-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.panelTitle}>Selected Detail</Text>
        </View>
        <Text style={styles.panelMeta}>{context.chapter?.title ?? 'source-limited'}</Text>
      </View>
      {context.event ? (
        <View style={styles.detailSectionReplay}>
          <Text style={styles.detailReplayTitle}>{context.event.title}</Text>
          <Text style={styles.detailReplayText}>{context.event.summary}</Text>
          <View style={styles.chipWrap}>
            <DebriefSourceChip label={`Event: ${formatDateTime(context.event.eventTime)}`} />
            <DebriefSourceChip label={`Known at the time: ${formatDateTime(context.event.knownAt)}`} />
            <DebriefSourceChip label={`Severity: ${formatLabel(context.event.severity)}`} />
          </View>
        </View>
      ) : (
        <View style={styles.detailSectionReplay}>
          <Text style={styles.detailReplayTitle}>Source-limited chapter</Text>
          <Text style={styles.detailReplayText}>No timestamped event is available. ECS is not inferring historical facts from current data.</Text>
        </View>
      )}

      {context.overlay ? (
        <View style={styles.detailSectionReplay}>
          <Text style={styles.detailReplayLabel}>Map Context</Text>
          <Text style={styles.detailReplayText}>{context.overlay.label}</Text>
          <View style={styles.chipWrap}>
            <DebriefSourceChip label={formatLabel(context.overlay.type)} />
            <DebriefSourceChip label={`Confidence: ${formatLabel(context.overlay.confidence)}`} tone={context.overlay.confidence} />
            <DebriefSourceChip label={`State: ${formatLabel(context.overlay.valueState)}`} tone={context.overlay.valueState === 'unavailable' ? 'unavailable' : context.overlay.valueState === 'stale' ? 'low' : 'medium'} />
          </View>
        </View>
      ) : null}

      <View style={styles.detailSectionReplay}>
        <Text style={styles.detailReplayLabel}>Evidence</Text>
        {context.evidence.length > 0 ? context.evidence.map((item) => (
          <View key={item.evidenceId} style={styles.evidenceCard}>
            <Text style={styles.evidenceTitle}>{item.label}</Text>
            <Text style={styles.evidenceValue}>{item.value == null ? 'unavailable' : String(item.value)}</Text>
            {item.detail ? <Text style={styles.evidenceDetail}>{item.detail}</Text> : null}
            <EvidenceChipRow evidence={item} />
          </View>
        )) : (
          <Text style={styles.sourceLimitedText}>No source evidence is available for this selection.</Text>
        )}
      </View>

      <View style={styles.detailSectionReplay}>
        <Text style={styles.detailReplayLabel}>Recommendations</Text>
        {recommendation ? (
          <View style={styles.recommendationCard}>
            <TouchableOpacity
              style={styles.recommendationSelectButton}
              onPress={() => onSelectRecommendation(recommendation.recommendationId)}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={`Select recommendation ${recommendation.title}`}
            >
              <Text style={styles.recommendationTitle}>{recommendation.title}</Text>
              <Text style={styles.recommendationMeta}>{formatLabel(recommendation.targetArea)} / {formatLabel(recommendation.state)}</Text>
            </TouchableOpacity>
            <Text style={styles.detailReplayText}>{recommendation.rationale}</Text>
            <TouchableOpacity
              style={[styles.taskButton, taskActionDisabled && styles.taskButtonDisabled]}
              onPress={() => onCreatePrepTask(recommendation.recommendationId)}
              activeOpacity={0.82}
              disabled={taskActionDisabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: taskActionDisabled }}
              accessibilityLabel="Create prep task from recommendation"
            >
              <Ionicons name="checkmark-done-outline" size={13} color={taskActionDisabled ? TACTICAL.textMuted : '#0B0F12'} />
              <Text style={[styles.taskButtonText, taskActionDisabled && styles.taskButtonTextDisabled]}>
                {!taskSystemAvailable ? 'Task system unavailable' : recommendation.state === 'converted_to_task' ? 'Task already created' : recommendation.state === 'dismissed' ? 'Recommendation dismissed' : 'Create Prep Task'}
              </Text>
            </TouchableOpacity>
            {!taskSystemAvailable ? (
              <Text style={styles.sourceLimitedText}>Task system unavailable in internal beta. Payload is preserved in the DebriefRecord.</Text>
            ) : null}
          </View>
        ) : (
          <Text style={styles.sourceLimitedText}>No recommendation is linked to this selection.</Text>
        )}
      </View>
    </View>
  );
}

export default function ExpeditionReplayDebriefPanel({
  record,
  enabled = false,
  layoutMode,
  onCreatePrepTask,
}: ExpeditionReplayDebriefPanelProps) {
  const { width } = useWindowDimensions();
  const isDesktop = layoutMode ? layoutMode === 'desktop' : width >= 840;
  const [selection, setSelection] = useState<DebriefSelectionState>(() => (record ? getInitialDebriefSelectionState(record) : {}));
  const [taskMessage, setTaskMessage] = useState<string | null>(null);

  useEffect(() => {
    if (record) setSelection(getInitialDebriefSelectionState(record));
  }, [record]);

  const overlays = useMemo(() => (record ? filterDebriefMapOverlaysForRecord(record) : []), [record]);
  const context = useMemo(() => (record ? buildSelectedContext(record, selection) : null), [record, selection]);

  const onSelectChapter = useCallback((chapterId: string) => {
    if (!record) return;
    setSelection((current) => selectDebriefChapter(record, current, chapterId));
    setTaskMessage(null);
  }, [record]);

  const onSelectTimelineEvent = useCallback((eventId: string) => {
    if (!record) return;
    setSelection((current) => selectDebriefEvent(record, current, eventId));
    setTaskMessage(null);
  }, [record]);

  const onSelectMapOverlay = useCallback((overlayId: string) => {
    if (!record) return;
    setSelection((current) => selectDebriefMapOverlay(record, current, overlayId));
    setTaskMessage(null);
  }, [record]);

  const onSelectRecommendation = useCallback((recommendationId: string) => {
    if (!record) return;
    setSelection((current) => selectDebriefRecommendation(record, current, recommendationId));
    setTaskMessage(null);
  }, [record]);

  const handleCreatePrepTask = useCallback((recommendationId: string) => {
    if (!record) return;
    const payload = createDebriefPrepTaskPayload(record, recommendationId);
    if (!payload) {
      setTaskMessage('Prep task action is unavailable for this recommendation.');
      return;
    }
    if (!onCreatePrepTask) {
      setTaskMessage('Task system unavailable in internal beta. Payload is preserved in the DebriefRecord.');
      return;
    }
    void Promise.resolve(onCreatePrepTask(payload)).then(() => {
      setTaskMessage('Prep task request sent with linked debrief evidence.');
    });
  }, [onCreatePrepTask, record]);

  if (!enabled || !record || !context) return null;

  return (
    <View style={styles.panelShell}>
      <TripSummaryHeader record={record} />
      <View style={[styles.replayLayout, isDesktop ? styles.desktopReplayLayout : styles.mobileReplayLayout]}>
        <ReplayMapWorkspace
          overlays={overlays}
          selectedOverlayId={selection.selectedMapOverlayId}
          onSelectMapOverlay={onSelectMapOverlay}
        />

        {!isDesktop ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.mobileChapterSelector}
            contentContainerStyle={styles.mobileChapterSelectorContent}
            testID="expedition-replay-mobile-chapter-selector"
          >
            {record.chapters.map((chapter) => (
              <TouchableOpacity
                key={chapter.chapterId}
                style={[
                  styles.mobileChapterButton,
                  selection.selectedChapterId === chapter.chapterId && styles.mobileChapterButtonActive,
                ]}
                onPress={() => onSelectChapter(chapter.chapterId)}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityState={{ selected: selection.selectedChapterId === chapter.chapterId }}
                accessibilityLabel={`Select ${chapter.title}`}
              >
                <Text style={styles.mobileChapterOrder}>{chapter.order}</Text>
                <Text style={styles.mobileChapterLabel} numberOfLines={1}>{chapter.title}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}

        <ChapterTimeline
          record={record}
          selection={selection}
          onSelectChapter={onSelectChapter}
          onSelectTimelineEvent={onSelectTimelineEvent}
        />
        <DetailPanel
          context={context}
          onSelectRecommendation={onSelectRecommendation}
          onCreatePrepTask={handleCreatePrepTask}
          taskSystemAvailable={Boolean(onCreatePrepTask)}
        />
      </View>

      {record.warnings.length > 0 || taskMessage ? (
        <View style={styles.warningPanel}>
          {record.warnings.slice(0, 4).map((warning) => (
            <Text key={warning} style={styles.warningText}>{warning}</Text>
          ))}
          {taskMessage ? <Text style={styles.taskMessage}>{taskMessage}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panelShell: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(17,20,24,0.78)',
    padding: 10,
    gap: 10,
  },
  summaryHeader: {
    gap: 10,
  },
  summaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: ECS.accentSoft,
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  kicker: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  title: {
    color: TACTICAL.text,
    fontSize: 15,
    fontWeight: '900',
  },
  subtitle: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  summaryMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  metricTile: {
    flexGrow: 1,
    flexBasis: '18%',
    minHeight: 46,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(0,0,0,0.16)',
    paddingHorizontal: 7,
    paddingVertical: 7,
    justifyContent: 'center',
  },
  metricValue: {
    color: TACTICAL.amber,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metricLabel: {
    marginTop: 3,
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '800',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  sourceChip: {
    minHeight: 21,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(0,0,0,0.14)',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  sourceChipText: {
    color: TACTICAL.text,
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  chipHigh: {
    borderColor: 'rgba(101, 181, 121, 0.36)',
    backgroundColor: 'rgba(101, 181, 121, 0.12)',
  },
  chipMedium: {
    borderColor: 'rgba(242, 194, 77, 0.34)',
    backgroundColor: 'rgba(242, 194, 77, 0.10)',
  },
  chipLow: {
    borderColor: 'rgba(230, 126, 34, 0.34)',
    backgroundColor: 'rgba(230, 126, 34, 0.10)',
  },
  chipUnknown: {
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(138,148,158,0.10)',
  },
  chipUnavailable: {
    borderColor: 'rgba(138,148,158,0.22)',
    backgroundColor: 'rgba(138,148,158,0.07)',
  },
  replayLayout: {
    gap: 10,
  },
  desktopReplayLayout: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  mobileReplayLayout: {
    flexDirection: 'column',
  },
  mapPanel: {
    flex: 1.2,
    minWidth: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(7,10,13,0.94)',
    padding: 9,
    gap: 8,
  },
  timelinePanel: {
    flex: 0.95,
    minWidth: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.74)',
    padding: 9,
    gap: 8,
  },
  detailPanelReplay: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.74)',
    padding: 9,
    gap: 8,
  },
  panelHeader: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  panelTitle: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
  },
  panelMeta: {
    flexShrink: 1,
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    textAlign: 'right',
    textTransform: 'uppercase',
  },
  mapSurface: {
    minHeight: 250,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(7,10,13,0.98)',
    padding: 10,
  },
  mapGridA: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '33%',
    width: 1,
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  mapGridB: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1,
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  routeLine: {
    position: 'absolute',
    left: 22,
    right: 22,
    top: '48%',
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(242,194,77,0.62)',
  },
  overlayList: {
    gap: 7,
  },
  overlayPill: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(11,14,18,0.9)',
    padding: 8,
  },
  overlayPillSelected: {
    backgroundColor: TACTICAL.amber,
    borderColor: TACTICAL.amber,
  },
  overlayPillStale: {
    borderStyle: 'dashed',
  },
  overlayPillUnavailable: {
    opacity: 0.74,
  },
  overlayCopy: {
    flex: 1,
    minWidth: 0,
  },
  overlayTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  overlayTitleSelected: {
    color: '#0B0F12',
  },
  overlayMeta: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  overlayMetaSelected: {
    color: 'rgba(11,15,18,0.78)',
  },
  mapEmptyState: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    padding: 16,
  },
  mapEmptyTitle: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  mapEmptyText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 14,
  },
  timelineList: {
    gap: 7,
  },
  chapterBlock: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(0,0,0,0.14)',
    overflow: 'hidden',
  },
  chapterBlockActive: {
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(196,138,44,0.06)',
  },
  chapterButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
  },
  chapterOrder: {
    width: 22,
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  chapterOrderActive: {
    color: TACTICAL.amber,
  },
  chapterCopy: {
    flex: 1,
    minWidth: 0,
  },
  chapterTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  chapterSummary: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 11,
  },
  chapterCount: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
  },
  eventList: {
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    padding: 7,
    gap: 6,
  },
  eventRow: {
    minHeight: 44,
    flexDirection: 'row',
    gap: 8,
    borderRadius: 7,
    padding: 7,
    backgroundColor: 'rgba(17,20,24,0.72)',
  },
  eventRowActive: {
    backgroundColor: ECS.accentSoft,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
  },
  eventCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  eventTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  eventMeta: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '700',
  },
  eventChipMiniRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  mobileChapterSelector: {
    maxHeight: 40,
  },
  mobileChapterSelectorContent: {
    gap: 7,
    paddingVertical: 1,
  },
  mobileChapterButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.82)',
    paddingHorizontal: 9,
  },
  mobileChapterButtonActive: {
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: ECS.accentSoft,
  },
  mobileChapterOrder: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
  },
  mobileChapterLabel: {
    maxWidth: 150,
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  detailSectionReplay: {
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 8,
    gap: 7,
  },
  detailReplayTitle: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
  },
  detailReplayLabel: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  detailReplayText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  evidenceCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(0,0,0,0.14)',
    padding: 8,
    gap: 6,
  },
  evidenceTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  evidenceValue: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
  },
  evidenceDetail: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 13,
  },
  sourceLimitedText: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 13,
  },
  recommendationCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(0,0,0,0.14)',
    padding: 8,
    gap: 7,
  },
  recommendationSelectButton: {
    gap: 2,
  },
  recommendationTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  recommendationMeta: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  taskButton: {
    alignSelf: 'flex-start',
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 8,
    backgroundColor: TACTICAL.amber,
    paddingHorizontal: 10,
  },
  taskButtonDisabled: {
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  taskButtonText: {
    color: '#0B0F12',
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  taskButtonTextDisabled: {
    color: TACTICAL.textMuted,
  },
  warningPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(0,0,0,0.14)',
    padding: 8,
    gap: 5,
  },
  warningText: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 13,
  },
  taskMessage: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 13,
  },
});
