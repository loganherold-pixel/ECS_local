import React, { useEffect, useState, useSyncExternalStore } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS, GOLD_RAIL, TACTICAL } from '../../lib/theme';
import type { AssessmentCategory } from '../../lib/expedition/operationalAssessmentTypes';
import type {
  ExpeditionTopCardKey,
  RouteLifecycleState,
} from '../../lib/types/expedition';
import type { IncidentCoordinate } from '../../lib/types/incidentRecovery';
import {
  getExpeditionFrameworkState,
  markTopCardViewed,
  setExpeditionFrameworkPreviewState,
  subscribeExpeditionFrameworkState,
} from '../../stores/expeditionFrameworkStore';
import {
  getVisibleUnreadCount,
  isCampEnabled,
  isConvoyEnabled,
  isLogisticsEnabled,
  isOverviewEnabled,
  isRouteEnabled,
  isVehiclesEnabled,
} from '../../lib/expedition/selectors';
import {
  formatRemoteWeatherRiskStatusLine,
  getHighestActiveRemoteWeatherRisk,
  subscribeRemoteWeatherRiskUpdates,
  type HighestActiveRemoteWeatherRisk,
} from '../../lib/expedition/expeditionStatusSelectors';
import IncidentRecoveryPanel from './IncidentRecoveryPanel';
import GarminInreachVisibilityPanel from '../garmin/GarminInreachVisibilityPanel';
import ExpeditionSummaryCard from './ExpeditionSummaryCard';
import ExpeditionPlaceholderModal, {
  type ExpeditionPlaceholderTitle,
} from './ExpeditionPlaceholderModal';
import ExpeditionAssessmentDetailModal from './ExpeditionAssessmentDetailModal';
import ExpeditionDebriefModal from './ExpeditionDebriefModal';
import type { ExpeditionAssessmentDetailAction } from './ExpeditionAssessmentDetailView';
import { useExpeditionAssessmentStore } from '../../stores/expeditionAssessmentStore';
import {
  buildAssessmentEscalationRequest,
  type ExpeditionAssessmentEscalationRequest,
} from '../../lib/expedition/assessmentEscalation';
import { getIncidentRecoveryContextSnapshot } from '../../lib/incidentRecoveryContextAdapter';
import type { ExpeditionRecord } from '../../lib/expeditionStateStore';

type ExpeditionCardId = ExpeditionTopCardKey;

type ExpeditionTabProps = {
  hasActiveRoute: boolean;
  teamMemberCount: number;
  campCount: number;
  routeCompleted: boolean;
  routeLifecycleState?: RouteLifecycleState;
  expeditionId?: string;
  routeLabel?: string;
  completedExpeditionRecord?: ExpeditionRecord | null;
  ecsOnline?: boolean;
  gpsLocation?: IncidentCoordinate | null;
};

type CardConfig = {
  id: ExpeditionCardId;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  enabled: boolean;
  status: string;
  assessmentStatus?: string;
  disabledHint?: string;
  unreadCount?: number;
  alertCount?: number;
  stale?: boolean;
  selected?: boolean;
};

export default function ExpeditionTab({
  hasActiveRoute,
  teamMemberCount,
  campCount,
  routeCompleted,
  routeLifecycleState,
  expeditionId,
  routeLabel,
  completedExpeditionRecord,
  ecsOnline,
  gpsLocation,
}: ExpeditionTabProps) {
  const [selectedCardId, setSelectedCardId] = useState<ExpeditionCardId | null>(null);
  const [selectedAssessmentCategory, setSelectedAssessmentCategory] = useState<AssessmentCategory | null>(null);
  const [placeholderTitle, setPlaceholderTitle] = useState<ExpeditionPlaceholderTitle | null>(null);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [assessmentEscalation, setAssessmentEscalation] = useState<ExpeditionAssessmentEscalationRequest | null>(null);
  const [remoteWeatherRisk, setRemoteWeatherRisk] = useState<HighestActiveRemoteWeatherRisk | null>(
    () => getHighestActiveRemoteWeatherRisk(),
  );
  const assessmentStore = useExpeditionAssessmentStore();
  const { refreshAssessments } = assessmentStore;
  const frameworkState = useSyncExternalStore(
    subscribeExpeditionFrameworkState,
    getExpeditionFrameworkState,
    getExpeditionFrameworkState,
  );

  const resolvedRouteLifecycleState: RouteLifecycleState =
    routeLifecycleState ?? (routeCompleted ? 'completed' : hasActiveRoute ? 'active' : 'idle');

  useEffect(() => {
    setExpeditionFrameworkPreviewState({
      routeLifecycleState: resolvedRouteLifecycleState,
      hasActiveExpedition: hasActiveRoute,
      teamMemberCount,
      hasRouteCamps: campCount > 0,
    });
  }, [campCount, hasActiveRoute, resolvedRouteLifecycleState, teamMemberCount]);

  useEffect(() => {
    void refreshAssessments();
  }, [refreshAssessments]);

  useEffect(() => {
    const refreshRemoteWeatherRisk = () => {
      setRemoteWeatherRisk(getHighestActiveRemoteWeatherRisk());
    };
    const unsubscribe = subscribeRemoteWeatherRiskUpdates(refreshRemoteWeatherRisk);
    const interval = setInterval(refreshRemoteWeatherRisk, 60_000);
    refreshRemoteWeatherRisk();

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const getAssessmentCardState = (category: AssessmentCategory, fallback: string) => {
    const assessment = assessmentStore.assessments[category];
    if (!assessment) {
      return {
        status: fallback,
        assessmentStatus: 'unknown',
        alertCount: 0,
        stale: false,
      };
    }

    const activeConcern =
      assessment.status === 'watch' ||
      assessment.status === 'caution' ||
      assessment.status === 'critical';
    const dataConcernCount = assessment.missingDataWarnings.length + assessment.staleDataWarnings.length;
    return {
      status: assessment.staleDataWarnings.length > 0
        ? `Stale: ${assessment.summary}`
        : assessment.summary,
      assessmentStatus: assessment.status,
      alertCount: activeConcern ? Math.max(1, dataConcernCount, assessment.why.length) : 0,
      stale: assessment.staleDataWarnings.length > 0,
    };
  };

  const handleCardPress = (card: CardConfig) => {
    if (!card.enabled) return;
    setSelectedCardId(card.id);
    markTopCardViewed(card.id);
    setSelectedAssessmentCategory(card.id);
  };

  const openAssessmentCategory = (category: AssessmentCategory) => {
    setSelectedCardId(category as ExpeditionCardId);
    setSelectedAssessmentCategory(category);
  };

  const getTopConcernCategory = (): AssessmentCategory => {
    const categories: AssessmentCategory[] = ['route', 'convoy', 'camp', 'logistics', 'vehicles'];
    const weights: Record<string, number> = { normal: 0, watch: 1, unknown: 2, caution: 3, critical: 4 };
    return categories.reduce((top, category) => {
      const next = assessmentStore.assessments[category];
      const current = assessmentStore.assessments[top];
      return (weights[next?.status ?? 'unknown'] ?? 0) > (weights[current?.status ?? 'unknown'] ?? 0)
        ? category
        : top;
    }, 'route' as AssessmentCategory);
  };

  const handleAssessmentAction = (action: ExpeditionAssessmentDetailAction) => {
    if (action.id === 'open-incident-recovery') {
      if (selectedAssessmentCategory) {
        const assessment = assessmentStore.assessments[selectedAssessmentCategory];
        if (assessment) {
          setAssessmentEscalation(buildAssessmentEscalationRequest({
            assessment,
            contextSnapshot: assessmentStore.contextSnapshot,
            incidentContextSnapshot: getIncidentRecoveryContextSnapshot({ gpsLocation }),
            expeditionId,
            routeLabel,
            gpsLocation,
          }));
        }
      }
      setSelectedAssessmentCategory(null);
      return;
    }
    if (action.id === 'open-top-concern') {
      openAssessmentCategory(('targetCategory' in action && action.targetCategory) ? action.targetCategory : getTopConcernCategory());
      return;
    }
    if (action.id.startsWith('review-') && 'targetCategory' in action && action.targetCategory) {
      openAssessmentCategory(action.targetCategory);
      return;
    }
    void assessmentStore.applyManualAssessmentAction(action.id);
  };

  const overviewAssessment = getAssessmentCardState('overview', 'Assessment pending');
  const routeAssessment = getAssessmentCardState('route', 'Assessment pending');
  const convoyAssessment = getAssessmentCardState('convoy', 'Assessment pending');
  const campAssessment = getAssessmentCardState('camp', 'Assessment pending');
  const logisticsAssessment = getAssessmentCardState('logistics', 'Assessment pending');
  const vehiclesAssessment = getAssessmentCardState('vehicles', 'Assessment pending');
  const predictiveHazardStatus = hasActiveRoute
    ? remoteWeatherRisk
      ? formatRemoteWeatherRiskStatusLine(remoteWeatherRisk)
      : 'No predictive hazards detected.'
    : routeAssessment.status;

  const topCards: CardConfig[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: 'compass-outline',
      enabled: isOverviewEnabled(frameworkState),
      status: isOverviewEnabled(frameworkState) ? overviewAssessment.status : 'Start navigation to enable',
      assessmentStatus: overviewAssessment.assessmentStatus,
      disabledHint: 'Start navigation to enable',
      unreadCount: getVisibleUnreadCount(frameworkState, 'overview'),
      alertCount: overviewAssessment.alertCount,
      stale: overviewAssessment.stale,
      selected: selectedCardId === 'overview',
    },
    {
      id: 'route',
      label: 'Route',
      icon: 'map-outline',
      enabled: isRouteEnabled(frameworkState),
      status: isRouteEnabled(frameworkState) ? predictiveHazardStatus : 'Start navigation to enable',
      assessmentStatus: routeAssessment.assessmentStatus,
      disabledHint: 'Start navigation to enable',
      unreadCount: getVisibleUnreadCount(frameworkState, 'route'),
      alertCount: routeAssessment.alertCount,
      stale: routeAssessment.stale,
      selected: selectedCardId === 'route',
    },
    {
      id: 'convoy',
      label: 'Convoy',
      icon: 'people-outline',
      enabled: isConvoyEnabled(frameworkState),
      status: isConvoyEnabled(frameworkState) ? convoyAssessment.status : 'Team required',
      assessmentStatus: convoyAssessment.assessmentStatus,
      disabledHint: 'Team required',
      unreadCount: getVisibleUnreadCount(frameworkState, 'convoy'),
      alertCount: convoyAssessment.alertCount,
      stale: convoyAssessment.stale,
      selected: selectedCardId === 'convoy',
    },
  ];

  const secondRowCards: CardConfig[] = [
    {
      id: 'camp',
      label: 'Camp',
      icon: 'bonfire-outline',
      enabled: isCampEnabled(frameworkState),
      status: isCampEnabled(frameworkState) ? campAssessment.status : 'No camps on active route',
      assessmentStatus: campAssessment.assessmentStatus,
      disabledHint: 'No camps on active route',
      unreadCount: getVisibleUnreadCount(frameworkState, 'camp'),
      alertCount: campAssessment.alertCount,
      stale: campAssessment.stale,
      selected: selectedCardId === 'camp',
    },
    {
      id: 'logistics',
      label: 'Logistics',
      icon: 'cube-outline',
      enabled: isLogisticsEnabled(frameworkState),
      status: logisticsAssessment.status,
      assessmentStatus: logisticsAssessment.assessmentStatus,
      unreadCount: getVisibleUnreadCount(frameworkState, 'logistics'),
      alertCount: logisticsAssessment.alertCount,
      stale: logisticsAssessment.stale,
      selected: selectedCardId === 'logistics',
    },
    {
      id: 'vehicles',
      label: 'Vehicles',
      icon: 'car-sport-outline',
      enabled: isVehiclesEnabled(frameworkState),
      status: vehiclesAssessment.status,
      assessmentStatus: vehiclesAssessment.assessmentStatus,
      unreadCount: getVisibleUnreadCount(frameworkState, 'vehicles'),
      alertCount: vehiclesAssessment.alertCount,
      stale: vehiclesAssessment.stale,
      selected: selectedCardId === 'vehicles',
    },
  ];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.surface}>
        <TopoBackground />

        <View style={styles.cardRow}>
          {topCards.map((card) => (
            <ExpeditionCard key={card.id} card={card} onPress={handleCardPress} />
          ))}
        </View>

        <View style={styles.cardRow}>
          {secondRowCards.map((card) => (
            <ExpeditionCard key={card.id} card={card} onPress={handleCardPress} />
          ))}
        </View>

        <IncidentRecoveryPanel
          onOpenPlaceholder={setPlaceholderTitle}
          expeditionId={expeditionId}
          routeLabel={routeLabel}
          ecsOnline={ecsOnline}
          gpsLocation={gpsLocation}
          assessmentEscalation={assessmentEscalation}
          onAssessmentEscalationHandled={() => setAssessmentEscalation(null)}
        />

        <GarminInreachVisibilityPanel />

        <ExpeditionSummaryCard
          routeLifecycleState={frameworkState.routeLifecycleState}
          onOpenSummary={() => setSummaryVisible(true)}
        />

        <ExpeditionPlaceholderModal
          visible={placeholderTitle != null}
          title={placeholderTitle}
          onClose={() => setPlaceholderTitle(null)}
        />
        <ExpeditionAssessmentDetailModal
          visible={selectedAssessmentCategory != null}
          category={selectedAssessmentCategory}
          assessment={
            selectedAssessmentCategory
              ? assessmentStore.assessments[selectedAssessmentCategory]
              : undefined
          }
          narrative={
            selectedAssessmentCategory
              ? assessmentStore.narratives[selectedAssessmentCategory]
              : undefined
          }
          loading={assessmentStore.loading}
          usingMockData={assessmentStore.usingMockData}
          offline={assessmentStore.offline}
          stale={assessmentStore.stale}
          onRefresh={() => {
            refreshAssessments();
          }}
          onOpenIncidentRecovery={() => {
            handleAssessmentAction({ id: 'open-incident-recovery', label: 'Open Incident & Recovery' });
          }}
          onRelatedAction={handleAssessmentAction}
          onClose={() => setSelectedAssessmentCategory(null)}
        />
        <ExpeditionDebriefModal
          visible={summaryVisible}
          completedRecord={completedExpeditionRecord}
          routeLabel={routeLabel}
          expeditionId={expeditionId}
          onClose={() => setSummaryVisible(false)}
        />
      </View>
    </ScrollView>
  );
}

function TopoBackground() {
  return (
    <View pointerEvents="none" style={styles.topoLayer}>
      <View style={[styles.topoLine, styles.topoLineA]} />
      <View style={[styles.topoLine, styles.topoLineB]} />
      <View style={[styles.topoLine, styles.topoLineC]} />
      <View style={styles.topoGridA} />
      <View style={styles.topoGridB} />
    </View>
  );
}

function ExpeditionCard({
  card,
  onPress,
}: {
  card: CardConfig;
  onPress: (card: CardConfig) => void;
}) {
  const badgeCount = card.unreadCount && card.unreadCount > 0
    ? card.unreadCount
    : card.alertCount ?? 0;
  const showUnread = card.enabled && badgeCount > 0;
  const statusTone = card.assessmentStatus ?? 'unknown';

  return (
    <TouchableOpacity
      style={[
        styles.card,
        card.enabled ? styles.cardActive : styles.cardDisabled,
        card.selected && card.enabled && styles.cardSelected,
      ]}
      disabled={!card.enabled}
      activeOpacity={0.78}
      onPress={() => onPress(card)}
      accessibilityRole="button"
      accessibilityLabel={card.label}
      accessibilityState={{ disabled: !card.enabled, selected: card.selected && card.enabled }}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.cardIconWrap, !card.enabled && styles.disabledIconWrap]}>
          <Ionicons
            name={card.icon}
            size={16}
            color={card.enabled ? TACTICAL.amber : TACTICAL.textMuted}
          />
        </View>
        <View style={[
          styles.cardStatusPill,
          statusTone === 'critical' && styles.cardStatusCritical,
          statusTone === 'caution' && styles.cardStatusCaution,
          statusTone === 'watch' && styles.cardStatusWatch,
          statusTone === 'unknown' && styles.cardStatusUnknown,
          !card.enabled && styles.cardStatusDisabled,
        ]}>
          <Text style={[
            styles.cardStatusPillText,
            !card.enabled && styles.disabledHintText,
          ]}>
            {String(statusTone).toUpperCase()}
          </Text>
        </View>
      </View>
      {showUnread ? (
        <View style={styles.cardUnreadBadge}>
          <Text style={styles.cardUnreadBadgeText}>{badgeCount}</Text>
        </View>
      ) : null}
      <Text style={[styles.cardLabel, !card.enabled && styles.disabledText]} numberOfLines={1}>
        {card.label}
      </Text>
      <Text
        style={[
          styles.cardStatus,
          card.stale && card.enabled && styles.cardStatusStale,
          !card.enabled && styles.disabledHintText,
        ]}
        numberOfLines={1}
      >
        {card.status}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  surface: {
    flex: 1,
    minHeight: 0,
    gap: 10,
    overflow: 'hidden',
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(11,14,18,0.96)',
    padding: 10,
  },
  topoLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.42,
  },
  topoLine: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    borderRadius: 999,
  },
  topoLineA: {
    width: 260,
    height: 120,
    top: -30,
    right: -70,
    transform: [{ rotate: '-12deg' }],
  },
  topoLineB: {
    width: 220,
    height: 96,
    top: 130,
    left: -80,
    transform: [{ rotate: '18deg' }],
  },
  topoLineC: {
    width: 300,
    height: 150,
    bottom: -70,
    right: -110,
    transform: [{ rotate: '9deg' }],
  },
  topoGridA: {
    position: 'absolute',
    width: 1,
    top: 0,
    bottom: 0,
    left: '33%',
    backgroundColor: GOLD_RAIL.internal,
  },
  topoGridB: {
    position: 'absolute',
    height: 1,
    left: 0,
    right: 0,
    top: '58%',
    backgroundColor: GOLD_RAIL.internal,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 8,
  },
  card: {
    flex: 1,
    minHeight: 78,
    position: 'relative',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 9,
    gap: 7,
  },
  cardActive: {
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(17,20,24,0.92)',
  },
  cardSelected: {
    borderColor: GOLD_RAIL.major,
    backgroundColor: 'rgba(212,160,23,0.10)',
  },
  cardDisabled: {
    borderColor: 'rgba(139,148,158,0.16)',
    backgroundColor: 'rgba(17,20,24,0.46)',
    opacity: 0.62,
  },
  cardHeader: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  cardStatusPill: {
    maxWidth: 66,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(212,160,23,0.08)',
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  cardStatusWatch: {
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(212,160,23,0.08)',
  },
  cardStatusCaution: {
    borderColor: 'rgba(230,126,34,0.36)',
    backgroundColor: 'rgba(230,126,34,0.10)',
  },
  cardStatusCritical: {
    borderColor: 'rgba(192,57,43,0.42)',
    backgroundColor: 'rgba(192,57,43,0.10)',
  },
  cardStatusUnknown: {
    borderColor: 'rgba(139,148,158,0.22)',
    backgroundColor: 'rgba(139,148,158,0.08)',
  },
  cardStatusDisabled: {
    borderColor: 'rgba(139,148,158,0.16)',
    backgroundColor: 'rgba(139,148,158,0.06)',
  },
  cardStatusPillText: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0,
  },
  cardIconWrap: {
    width: 25,
    height: 25,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: ECS.accentSoft,
  },
  disabledIconWrap: {
    borderColor: 'rgba(139,148,158,0.18)',
    backgroundColor: 'rgba(139,148,158,0.08)',
  },
  cardUnreadBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(212,160,23,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  cardUnreadBadgeText: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0,
  },
  cardLabel: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '800',
  },
  cardStatus: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  cardStatusStale: {
    color: TACTICAL.amber,
  },
  disabledText: {
    color: TACTICAL.textMuted,
  },
  disabledHintText: {
    color: 'rgba(139,148,158,0.82)',
  },
});
