import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS, GOLD_RAIL, TACTICAL } from '../../lib/theme';
import type {
  AssessmentCategory,
  ExpeditionAssessment,
  ExpeditionAssessmentDataUsed,
  ExpeditionAssessmentRelatedAction,
} from '../../lib/expedition/operationalAssessmentTypes';
import type { ExpeditionAssessmentNarrative } from '../../lib/ai/expeditionAssessmentNarrative';

export type ExpeditionAssessmentDetailAction =
  | ExpeditionAssessmentRelatedAction
  | {
      id: 'refresh-assessment' | 'open-incident-recovery';
      label: string;
      disabled?: boolean;
      reason?: string;
    };

type ExpeditionAssessmentDetailViewProps = {
  category: AssessmentCategory | null;
  assessment?: ExpeditionAssessment;
  narrative?: ExpeditionAssessmentNarrative;
  loading?: boolean;
  usingMockData?: boolean;
  offline?: boolean;
  stale?: boolean;
  onRefresh?: () => void;
  onOpenIncidentRecovery?: () => void;
  onRelatedAction?: (action: ExpeditionAssessmentDetailAction) => void;
};

export const EXPEDITION_ASSESSMENT_CATEGORY_LABELS: Record<AssessmentCategory, string> = {
  overview: 'Overview',
  route: 'Route',
  convoy: 'Convoy',
  camp: 'Camp',
  logistics: 'Logistics',
  vehicles: 'Vehicles',
};

const STATUS_TONE: Record<ExpeditionAssessment['status'], {
  label: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
}> = {
  normal: {
    label: 'Normal',
    color: TACTICAL.successText,
    backgroundColor: 'rgba(212,160,23,0.08)',
    borderColor: GOLD_RAIL.subsection,
  },
  watch: {
    label: 'Watch',
    color: TACTICAL.amber,
    backgroundColor: 'rgba(212,160,23,0.10)',
    borderColor: GOLD_RAIL.subsection,
  },
  caution: {
    label: 'Caution',
    color: ECS.warning,
    backgroundColor: 'rgba(230,126,34,0.10)',
    borderColor: 'rgba(230,126,34,0.36)',
  },
  critical: {
    label: 'Critical',
    color: TACTICAL.danger,
    backgroundColor: 'rgba(192,57,43,0.10)',
    borderColor: 'rgba(192,57,43,0.42)',
  },
  unknown: {
    label: 'Unknown',
    color: TACTICAL.textMuted,
    backgroundColor: 'rgba(139,148,158,0.10)',
    borderColor: 'rgba(139,148,158,0.24)',
  },
};

export default function ExpeditionAssessmentDetailView({
  category,
  assessment,
  narrative,
  loading,
  usingMockData,
  offline,
  stale,
  onRefresh,
  onOpenIncidentRecovery,
}: ExpeditionAssessmentDetailViewProps) {
  const resolvedCategory = category ? EXPEDITION_ASSESSMENT_CATEGORY_LABELS[category] : 'Assessment';
  const tone = assessment ? STATUS_TONE[assessment.status] : STATUS_TONE.unknown;
  const dataLimitations = buildDataLimitations(assessment, narrative);
  const whyItems = [
    ...(narrative?.whyEcsThinksThis ?? assessment?.why ?? []),
    ...dataLimitations.filter((item) => /missing|stale/i.test(item)),
  ];
  const lowConfidence = assessment?.confidence === 'low';
  const overviewSummary = category === 'overview' && assessment
    ? buildOverviewSystemSummary(assessment)
    : null;
  const routeSummary = category === 'route' && assessment
    ? buildRouteSystemSummary(assessment)
    : null;
  const convoySummary = category === 'convoy' && assessment
    ? buildConvoySystemSummary(assessment)
    : null;
  const campSummary = category === 'camp' && assessment
    ? buildCampSystemSummary(assessment)
    : null;
  const logisticsSummary = category === 'logistics' && assessment
    ? buildLogisticsSystemSummary(assessment)
    : null;
  const vehiclesSummary = category === 'vehicles' && assessment
    ? buildVehiclesSystemSummary(assessment)
    : null;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <View style={styles.headerCard}>
        <View style={styles.headerTopRow}>
          <View style={styles.categoryWrap}>
            <Text style={styles.eyebrow}>CATEGORY</Text>
            <Text style={styles.categoryName}>{resolvedCategory}</Text>
          </View>
          <View style={[
            styles.statusBadge,
            { borderColor: tone.borderColor, backgroundColor: tone.backgroundColor },
          ]}>
            <Text style={[styles.statusBadgeText, { color: tone.color }]}>{tone.label}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <MetaChip label={assessment?.lastUpdated ? `Updated ${formatTime(assessment.lastUpdated)}` : 'Updated unknown'} />
          <MetaChip label={assessment ? `${assessment.confidence} confidence` : 'loading'} emphasized={lowConfidence} />
          {usingMockData ? <MetaChip label="mock/demo data" /> : null}
          {offline ? <MetaChip label="offline" /> : null}
          {stale ? <MetaChip label="stale data" emphasized /> : null}
        </View>

        {lowConfidence ? (
          <View style={styles.lowConfidenceBanner}>
            <Ionicons name="alert-circle-outline" size={14} color={TACTICAL.amber} />
            <Text style={styles.lowConfidenceText}>
              Confidence is low. Treat this as a cautious assessment until missing or stale data is refreshed.
            </Text>
          </View>
        ) : null}

        {onRefresh ? (
          <TouchableOpacity
            style={styles.refreshButton}
            activeOpacity={0.78}
            onPress={onRefresh}
            accessibilityRole="button"
            accessibilityLabel="Refresh Expedition assessment"
          >
            <Ionicons name="refresh-outline" size={14} color={TACTICAL.text} />
            <Text style={styles.refreshButtonText}>Refresh assessment</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {shouldShowEscalation(assessment) ? (
        <View style={styles.escalationBanner}>
          <View style={styles.escalationIcon}>
            <Ionicons name="shield-checkmark-outline" size={17} color={TACTICAL.danger} />
          </View>
          <View style={styles.escalationCopy}>
            <Text style={styles.escalationTitle}>Escalation Recommended</Text>
            <Text style={styles.escalationBody}>
              {assessment?.escalationReason ?? 'ECS recommends moving this through Incident & Recovery.'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.escalationButton}
            activeOpacity={0.78}
            onPress={onOpenIncidentRecovery}
            accessibilityRole="button"
            accessibilityLabel="Open Incident & Recovery"
          >
            <Text style={styles.escalationButtonText}>Incident & Recovery</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {overviewSummary ? (
        <View style={styles.overviewSection}>
          <View style={styles.overviewHeader}>
            <View style={styles.overviewHeaderCopy}>
              <Text style={styles.sectionTitle}>Expedition Status</Text>
              <Text style={styles.sectionBody}>{overviewSummary.statusLine}</Text>
            </View>
            <View style={[
              styles.overviewStatusBadge,
              overviewSummary.status === 'critical' && styles.overviewStatusCritical,
              overviewSummary.status === 'caution' && styles.overviewStatusCaution,
              overviewSummary.status === 'watch' && styles.overviewStatusWatch,
              overviewSummary.status === 'unknown' && styles.overviewStatusUnknown,
            ]}>
              <Text style={styles.overviewStatusText}>{overviewSummary.status.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.overviewSignalGrid}>
            {overviewSummary.signals.map((signal) => (
              <View key={signal.label} style={styles.overviewSignal}>
                <Text style={styles.overviewSignalLabel}>{signal.label}</Text>
                <Text style={styles.overviewSignalValue} numberOfLines={2}>{signal.value}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Subsystem Summary</Text>
          <View style={styles.subsystemList}>
            {overviewSummary.subsystems.map((subsystem) => (
              <View key={subsystem.id} style={styles.subsystemRow}>
                <View style={styles.subsystemCopy}>
                  <Text style={styles.subsystemLabel}>{subsystem.label}</Text>
                  <Text style={styles.subsystemSummary} numberOfLines={2}>{subsystem.summary}</Text>
                </View>
                <View style={[
                  styles.subsystemStatusBadge,
                  subsystem.status === 'critical' && styles.overviewStatusCritical,
                  subsystem.status === 'caution' && styles.overviewStatusCaution,
                  subsystem.status === 'watch' && styles.overviewStatusWatch,
                  subsystem.status === 'unknown' && styles.overviewStatusUnknown,
                ]}>
                  <Text style={styles.subsystemStatusText}>{subsystem.status.toUpperCase()}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {routeSummary ? (
        <View style={styles.routeSection}>
          <View style={styles.routeHeader}>
            <View style={styles.routeHeaderCopy}>
              <Text style={styles.sectionTitle}>Route Control</Text>
              <Text style={styles.sectionBody}>{routeSummary.statusLine}</Text>
            </View>
            <View style={[
              styles.overviewStatusBadge,
              routeSummary.status === 'critical' && styles.overviewStatusCritical,
              routeSummary.status === 'caution' && styles.overviewStatusCaution,
              routeSummary.status === 'watch' && styles.overviewStatusWatch,
              routeSummary.status === 'unknown' && styles.overviewStatusUnknown,
            ]}>
              <Text style={styles.overviewStatusText}>{routeSummary.status.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.routeSignalGrid}>
            {routeSummary.signals.map((signal) => (
              <View key={signal.label} style={styles.routeSignal}>
                <Text style={styles.overviewSignalLabel}>{signal.label}</Text>
                <Text style={styles.overviewSignalValue} numberOfLines={2}>{signal.value}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {convoySummary ? (
        <View style={styles.convoySection}>
          <View style={styles.routeHeader}>
            <View style={styles.routeHeaderCopy}>
              <Text style={styles.sectionTitle}>Convoy Accountability</Text>
              <Text style={styles.sectionBody}>{convoySummary.statusLine}</Text>
            </View>
            <View style={[
              styles.overviewStatusBadge,
              convoySummary.status === 'critical' && styles.overviewStatusCritical,
              convoySummary.status === 'caution' && styles.overviewStatusCaution,
              convoySummary.status === 'watch' && styles.overviewStatusWatch,
              convoySummary.status === 'unknown' && styles.overviewStatusUnknown,
            ]}>
              <Text style={styles.overviewStatusText}>{convoySummary.status.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.routeSignalGrid}>
            {convoySummary.signals.map((signal) => (
              <View key={signal.label} style={styles.routeSignal}>
                <Text style={styles.overviewSignalLabel}>{signal.label}</Text>
                <Text style={styles.overviewSignalValue} numberOfLines={2}>{signal.value}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Member/callsign list</Text>
          <View style={styles.subsystemList}>
            {convoySummary.members.length > 0 ? convoySummary.members.map((member) => (
              <View key={member.id} style={styles.convoyMemberRow}>
                <View style={styles.subsystemCopy}>
                  <Text style={styles.subsystemLabel}>{member.callsign}</Text>
                  <Text style={styles.subsystemSummary} numberOfLines={2}>
                    Last check-in: {member.lastCheckIn} | Last known location: {member.location}
                  </Text>
                </View>
                <View style={styles.convoyMemberStatus}>
                  <Text style={styles.overviewSignalLabel}>Movement status</Text>
                  <Text style={styles.convoyMemberStatusText}>{member.movementStatus}</Text>
                </View>
              </View>
            )) : (
              <Text style={styles.sectionBody}>No member-level roster is available for this convoy assessment.</Text>
            )}
          </View>
        </View>
      ) : null}

      {campSummary ? (
        <View style={styles.campSection}>
          <View style={styles.routeHeader}>
            <View style={styles.routeHeaderCopy}>
              <Text style={styles.sectionTitle}>Camp Readiness</Text>
              <Text style={styles.sectionBody}>{campSummary.statusLine}</Text>
            </View>
            <View style={[
              styles.overviewStatusBadge,
              campSummary.status === 'critical' && styles.overviewStatusCritical,
              campSummary.status === 'caution' && styles.overviewStatusCaution,
              campSummary.status === 'watch' && styles.overviewStatusWatch,
              campSummary.status === 'unknown' && styles.overviewStatusUnknown,
            ]}>
              <Text style={styles.overviewStatusText}>{campSummary.status.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.routeSignalGrid}>
            {campSummary.signals.map((signal) => (
              <View key={signal.label} style={styles.routeSignal}>
                <Text style={styles.overviewSignalLabel}>{signal.label}</Text>
                <Text style={styles.overviewSignalValue} numberOfLines={2}>{signal.value}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {logisticsSummary ? (
        <View style={styles.logisticsSection}>
          <View style={styles.routeHeader}>
            <View style={styles.routeHeaderCopy}>
              <Text style={styles.sectionTitle}>Logistics Endurance</Text>
              <Text style={styles.sectionBody}>{logisticsSummary.statusLine}</Text>
            </View>
            <View style={[
              styles.overviewStatusBadge,
              logisticsSummary.status === 'critical' && styles.overviewStatusCritical,
              logisticsSummary.status === 'caution' && styles.overviewStatusCaution,
              logisticsSummary.status === 'watch' && styles.overviewStatusWatch,
              logisticsSummary.status === 'unknown' && styles.overviewStatusUnknown,
            ]}>
              <Text style={styles.overviewStatusText}>{logisticsSummary.status.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.routeSignalGrid}>
            {logisticsSummary.signals.map((signal) => (
              <View key={signal.label} style={styles.routeSignal}>
                <Text style={styles.overviewSignalLabel}>{signal.label}</Text>
                <Text style={styles.overviewSignalValue} numberOfLines={2}>{signal.value}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {vehiclesSummary ? (
        <View style={styles.vehiclesSection}>
          <View style={styles.routeHeader}>
            <View style={styles.routeHeaderCopy}>
              <Text style={styles.sectionTitle}>Vehicle Readiness</Text>
              <Text style={styles.sectionBody}>{vehiclesSummary.statusLine}</Text>
            </View>
            <View style={[
              styles.overviewStatusBadge,
              vehiclesSummary.status === 'critical' && styles.overviewStatusCritical,
              vehiclesSummary.status === 'caution' && styles.overviewStatusCaution,
              vehiclesSummary.status === 'watch' && styles.overviewStatusWatch,
              vehiclesSummary.status === 'unknown' && styles.overviewStatusUnknown,
            ]}>
              <Text style={styles.overviewStatusText}>{vehiclesSummary.status.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.routeSignalGrid}>
            {vehiclesSummary.signals.map((signal) => (
              <View key={signal.label} style={styles.routeSignal}>
                <Text style={styles.overviewSignalLabel}>{signal.label}</Text>
                <Text style={styles.overviewSignalValue} numberOfLines={2}>{signal.value}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Vehicle list</Text>
          <View style={styles.subsystemList}>
            {vehiclesSummary.vehicles.length > 0 ? vehiclesSummary.vehicles.map((vehicle) => (
              <View key={vehicle.id} style={styles.vehicleRow}>
                <View style={styles.subsystemCopy}>
                  <Text style={styles.subsystemLabel}>{vehicle.name}</Text>
                  <Text style={styles.subsystemSummary} numberOfLines={2}>
                    Driver: {vehicle.driver} | Fuel/range: {vehicle.fuelRange} | Tires: {vehicle.tires}
                  </Text>
                </View>
                <View style={styles.vehicleStatus}>
                  <Text style={styles.overviewSignalLabel}>Readiness</Text>
                  <Text style={styles.vehicleStatusText}>{vehicle.readiness}</Text>
                </View>
              </View>
            )) : (
              <Text style={styles.sectionBody}>No vehicle-level data is available for this assessment.</Text>
            )}
          </View>
        </View>
      ) : null}

      <DetailSection
        title="ECS Assessment"
        text={loading ? 'Refreshing Expedition assessment.' : narrative?.plainLanguageSummary ?? assessment?.summary}
      />
      <DetailSection title="Why ECS Thinks This" items={whyItems} />
      <DetailSection title="What To Watch" items={narrative?.whatToWatch ?? assessment?.whatToWatch} />
      <DetailSection title="Recommended Action" text={narrative?.recommendedAction ?? assessment?.recommendedAction} />
      <DetailSection title="To Improve Status" items={narrative?.toImproveStatus ?? assessment?.toImproveStatus} />
      <DataUsedSection dataUsed={assessment?.dataUsed} />
    </ScrollView>
  );
}

function buildDataLimitations(
  assessment?: ExpeditionAssessment,
  narrative?: ExpeditionAssessmentNarrative,
): string[] {
  const limitations = narrative?.dataLimitations?.length
    ? narrative.dataLimitations
    : [
        ...(assessment?.missingDataWarnings ?? []),
        ...(assessment?.staleDataWarnings ?? []),
      ];

  if (limitations.length > 0) return limitations;
  if (assessment?.confidence === 'low') return ['Low confidence assessment. Refresh data before relying on this status.'];
  return [];
}

function buildOverviewSystemSummary(assessment: ExpeditionAssessment): {
  status: ExpeditionAssessment['status'];
  statusLine: string;
  signals: { label: string; value: string }[];
  subsystems: { id: string; label: string; status: string; summary: string }[];
} {
  const data = new Map(assessment.dataUsed.map((item) => [item.id, item]));
  const topConcern = assessment.why.find((item) => item.startsWith('Top concern:'))
    ?.replace('Top concern: ', '')
    ?? (assessment.status === 'normal' ? 'No leading concern.' : assessment.summary);
  const valueFor = (id: string, fallback = 'Not available') => {
    const value = data.get(id)?.value;
    if (value === null || value === undefined || value === '') return fallback;
    return String(value);
  };

  const subsystems = ['route', 'convoy', 'camp', 'logistics', 'vehicles'].map((id) => {
    const item = data.get(`${id}-status`);
    return {
      id,
      label: EXPEDITION_ASSESSMENT_CATEGORY_LABELS[id as AssessmentCategory],
      status: String(item?.value ?? 'unknown'),
      summary: item?.notes ?? 'Subsystem assessment not available.',
    };
  });

  return {
    status: assessment.status,
    statusLine:
      assessment.status === 'normal'
        ? 'Expedition stable. Route, convoy, camp, logistics, and vehicle assessments are inside operating margin.'
        : topConcern,
    signals: [
      { label: 'Top concern', value: topConcern },
      { label: 'Route phase', value: valueFor('route-phase') },
      { label: 'Progress', value: valueFor('route-progress') },
      { label: 'ETA', value: valueFor('current-eta') },
      { label: 'Next checkpoint', value: valueFor('next-checkpoint') },
      {
        label: 'Convoy accountability',
        value: `${valueFor('convoy-accountability')} active / ${valueFor('convoy-team-size')} total`,
      },
      { label: 'Communications/data quality', value: valueFor('communications-quality') },
      { label: 'Camp readiness', value: valueFor('camp-readiness') },
      { label: 'Logistics endurance', value: valueFor('logistics-endurance') },
      { label: 'Vehicle readiness', value: valueFor('vehicle-readiness') },
    ],
    subsystems,
  };
}

function buildRouteSystemSummary(assessment: ExpeditionAssessment): {
  status: ExpeditionAssessment['status'];
  statusLine: string;
  signals: { label: string; value: string }[];
} {
  const data = new Map(assessment.dataUsed.map((item) => [item.id, item]));
  const valueFor = (id: string, fallback = 'Not available') => {
    const value = data.get(id)?.value;
    if (value === null || value === undefined || value === '') return fallback;
    return String(value);
  };
  const offRoute = valueFor('off-route', 'unknown');
  const routeIssueSummary = [
    valueFor('known-hazards', ''),
    valueFor('route-issues', ''),
  ].filter((item) => item && item !== 'none' && item !== 'Not available').join(' / ');

  return {
    status: assessment.status,
    statusLine:
      assessment.status === 'normal'
        ? 'Route viable. Current route data shows the expedition on track, inside the travel window, and without an active route blocker.'
        : assessment.summary,
    signals: [
      { label: 'On-route/off-route', value: offRoute === 'true' ? 'Off route' : offRoute === 'false' ? 'On route' : offRoute },
      { label: 'ETA vs plan', value: `${valueFor('eta')} / plan ends ${valueFor('planned-window-end')}` },
      { label: 'Next checkpoint', value: valueFor('next-checkpoint') },
      { label: 'Camp ETA', value: valueFor('camp-eta') },
      { label: 'Daylight margin', value: valueFor('daylight-margin') },
      { label: 'Upcoming difficult terrain', value: valueFor('difficult-terrain-label', valueFor('difficult-terrain')) },
      { label: 'Known hazards / route issues', value: routeIssueSummary || 'None reported' },
      { label: 'Alternate route options', value: valueFor('alternate-route-label', valueFor('alternate-route')) },
      { label: 'Last safe turnaround / exit', value: `${valueFor('last-safe-turnaround')} / ${valueFor('exit-route')}` },
      { label: 'Deviation impact', value: `${valueFor('deviation-time')} min / ${valueFor('deviation-fuel')}% fuel` },
    ],
  };
}

function buildConvoySystemSummary(assessment: ExpeditionAssessment): {
  status: ExpeditionAssessment['status'];
  statusLine: string;
  signals: { label: string; value: string }[];
  members: {
    id: string;
    callsign: string;
    lastCheckIn: string;
    location: string;
    movementStatus: string;
  }[];
} {
  const data = new Map(assessment.dataUsed.map((item) => [item.id, item]));
  const valueFor = (id: string, fallback = 'Not available') => {
    const value = data.get(id)?.value;
    if (value === null || value === undefined || value === '') return fallback;
    return String(value);
  };
  const memberPrefixes = assessment.dataUsed
    .filter((item) => item.id.startsWith('member-') && item.id.endsWith('-callsign'))
    .map((item) => item.id.replace(/-callsign$/, ''));
  const members = memberPrefixes.map((prefix) => ({
    id: prefix,
    callsign: valueFor(`${prefix}-callsign`, 'Unknown member'),
    lastCheckIn: valueFor(`${prefix}-last-check-in`),
    location: valueFor(`${prefix}-last-location`),
    movementStatus: valueFor(`${prefix}-movement-status`, 'unknown'),
  }));
  const activeCount = valueFor('active-member-count', 'unknown');
  const teamCount = valueFor('team-member-count', 'unknown');
  const overdue = valueFor('overdue-members', 'none');
  const missedCheckpoint = valueFor('missed-checkpoint-members', 'none');

  return {
    status: assessment.status,
    statusLine:
      assessment.status === 'normal'
        ? 'Convoy stable. Members are accounted for, connected, and moving within the expected group spacing.'
        : assessment.summary,
    signals: [
      { label: 'Members accounted for', value: `${activeCount} active / ${teamCount} total` },
      { label: 'Member/callsign list', value: valueFor('member-list', members.map((member) => member.callsign).join(', ') || 'Not available') },
      { label: 'Last check-in time', value: valueFor('last-check-in') },
      { label: 'Convoy spacing', value: `${valueFor('convoy-spacing')} minutes` },
      { label: 'Lead/sweep separation', value: `${valueFor('lead-sweep-separation')} miles` },
      { label: 'Missed checkpoint or overdue member', value: [overdue, missedCheckpoint].filter((item) => item && item !== 'none').join(' / ') || 'none' },
      { label: 'Communications status', value: valueFor('communications') },
      { label: 'Recommended regroup or check-in action', value: valueFor('recommended-regroup-point', assessment.recommendedAction) },
    ],
    members,
  };
}

function buildCampSystemSummary(assessment: ExpeditionAssessment): {
  status: ExpeditionAssessment['status'];
  statusLine: string;
  signals: { label: string; value: string }[];
} {
  const data = new Map(assessment.dataUsed.map((item) => [item.id, item]));
  const valueFor = (id: string, fallback = 'Not available') => {
    const value = data.get(id)?.value;
    if (value === null || value === undefined || value === '') return fallback;
    return String(value);
  };

  return {
    status: assessment.status,
    statusLine:
      assessment.status === 'normal'
        ? 'Camp plan is sound. Current inputs support safely reaching, establishing, and operating camp tonight.'
        : assessment.summary,
    signals: [
      { label: 'Planned camp status', value: `${valueFor('next-camp-name')} / ${valueFor('planned-camp-status', valueFor('camp-readiness-status'))}` },
      { label: 'ETA to camp', value: `${valueFor('camp-eta')} / ${valueFor('distance-to-camp')} mi` },
      { label: 'Sunset/daylight margin', value: `${valueFor('sunset')} / ${valueFor('daylight-arrival-margin')} min` },
      { label: 'Arrival before/after dark', value: valueFor('arrival-before-dark') === 'false' ? 'After dark' : valueFor('arrival-before-dark') === 'true' ? 'Before dark' : valueFor('arrival-before-dark') },
      { label: 'Weather risk', value: valueFor('weather-exposure') },
      { label: 'Wind / temperature / precipitation', value: `${valueFor('wind')} mph / ${valueFor('temperature')} F / ${valueFor('precipitation')}%` },
      { label: 'Route difficulty remaining before camp', value: valueFor('route-difficulty-remaining') },
      { label: 'Convoy arrival confidence', value: valueFor('convoy-arrival-confidence') },
      { label: 'Camp confirmation status', value: valueFor('camp-confirmed') === 'true' ? 'Confirmed' : valueFor('camp-confirmed') === 'false' ? 'Unconfirmed' : valueFor('camp-confirmed') },
      { label: 'Alternate camp options', value: `${valueFor('alternate-camp-label', valueFor('alternate-camp'))} / daylight improves: ${valueFor('alternate-camp-improves-daylight')}` },
      { label: 'Fuel/water/power readiness for overnight', value: `${valueFor('overnight-fuel-ready')} / ${valueFor('overnight-water-ready')} / ${valueFor('overnight-power-ready')}` },
      { label: 'Recommended action', value: assessment.recommendedAction },
    ],
  };
}

function buildLogisticsSystemSummary(assessment: ExpeditionAssessment): {
  status: ExpeditionAssessment['status'];
  statusLine: string;
  signals: { label: string; value: string }[];
} {
  const data = new Map(assessment.dataUsed.map((item) => [item.id, item]));
  const valueFor = (id: string, fallback = 'Not available') => {
    const value = data.get(id)?.value;
    if (value === null || value === undefined || value === '') return fallback;
    return String(value);
  };

  return {
    status: assessment.status,
    statusLine:
      assessment.status === 'normal'
        ? 'Logistics stable. Fuel, water, food, power, and essential equipment are inside the current operating margin.'
        : assessment.summary,
    signals: [
      { label: 'Fuel status by vehicle', value: valueFor('fuel-status-by-vehicle') },
      { label: 'Lowest fuel/range vehicle', value: valueFor('lowest-fuel-range-vehicle') },
      { label: 'Fuel remaining', value: `${valueFor('fuel-remaining')} gal / ${valueFor('fuel-level-percent')}%` },
      { label: 'Fuel reserve to next checkpoint/camp/resupply', value: `${valueFor('fuel-reserve-next-checkpoint')} mi / ${valueFor('fuel-reserve-camp')} mi / ${valueFor('fuel-reserve-resupply')} mi` },
      { label: 'Water remaining', value: `${valueFor('water-remaining')} L` },
      { label: 'Water per person', value: `${valueFor('water-per-person')} L/person` },
      { label: 'Water endurance', value: `${valueFor('water-endurance-days')} days` },
      { label: 'Food endurance', value: `${valueFor('food-days')} days` },
      { label: 'Power/battery endurance', value: `${valueFor('power-hours')} hours / ${valueFor('battery-power-status')}` },
      { label: 'Critical equipment status', value: `${valueFor('critical-equipment-ready')} / ${valueFor('critical-equipment-issues', 'none')}` },
      { label: 'Distance/time to next resupply', value: `${valueFor('distance-to-resupply')} mi / ${valueFor('time-to-resupply')} hours` },
      { label: 'Limiting resource', value: valueFor('limiting-resource') },
      { label: 'Recommended action', value: assessment.recommendedAction },
    ],
  };
}

function buildVehiclesSystemSummary(assessment: ExpeditionAssessment): {
  status: ExpeditionAssessment['status'];
  statusLine: string;
  signals: { label: string; value: string }[];
  vehicles: {
    id: string;
    name: string;
    driver: string;
    readiness: string;
    fuelRange: string;
    tires: string;
  }[];
} {
  const data = new Map(assessment.dataUsed.map((item) => [item.id, item]));
  const valueFor = (id: string, fallback = 'Not available') => {
    const value = data.get(id)?.value;
    if (value === null || value === undefined || value === '') return fallback;
    return String(value);
  };
  const vehiclePrefixes = assessment.dataUsed
    .filter((item) => item.id.endsWith('-label') && !item.id.startsWith('route-'))
    .map((item) => item.id.replace(/-label$/, ''));
  const vehicles = vehiclePrefixes.map((prefix) => {
    const name = valueFor(`${prefix}-callsign`, valueFor(`${prefix}-label`, 'Unknown vehicle'));
    return {
      id: prefix,
      name,
      driver: valueFor(`${prefix}-driver`),
      readiness: valueFor(`${prefix}-disabled`) === 'true' ? 'disabled' : valueFor(`${prefix}-readiness`, 'unknown'),
      fuelRange: `${valueFor(`${prefix}-fuel`)}% / ${valueFor(`${prefix}-range`)} mi`,
      tires: valueFor(`${prefix}-tires`),
    };
  });
  const firstPrefix = vehiclePrefixes[0];

  return {
    status: assessment.status,
    statusLine:
      assessment.status === 'normal'
        ? 'Vehicles ready. Current inputs show the convoy vehicles are healthy enough to continue.'
        : assessment.summary,
    signals: [
      { label: 'Vehicle list', value: valueFor('vehicle-list', vehicles.map((vehicle) => vehicle.name).join(', ') || 'Not available') },
      { label: 'Callsign/name/driver', value: firstPrefix ? `${valueFor(`${firstPrefix}-callsign`, valueFor(`${firstPrefix}-label`))} / ${valueFor(`${firstPrefix}-driver`)}` : 'Not available' },
      { label: 'Vehicle readiness', value: firstPrefix ? valueFor(`${firstPrefix}-readiness`) : 'Not available' },
      { label: 'Fuel/range per vehicle', value: vehicles.map((vehicle) => `${vehicle.name}: ${vehicle.fuelRange}`).join(' / ') || 'Not available' },
      { label: 'Tire status', value: vehicles.map((vehicle) => `${vehicle.name}: ${vehicle.tires}`).join(' / ') || 'Not available' },
      { label: 'Battery/voltage', value: firstPrefix ? `${valueFor(`${firstPrefix}-battery`)} V` : 'Not available' },
      { label: 'Engine/temp/fault data', value: firstPrefix ? `${valueFor(`${firstPrefix}-engine-status`)} / ${valueFor(`${firstPrefix}-engine-temperature`)} F / ${valueFor(`${firstPrefix}-engine-fault-codes`, 'none')}` : 'Not available' },
      { label: 'Manual issue reports', value: firstPrefix ? valueFor(`${firstPrefix}-manual-issue-reports`, 'none') : 'Not available' },
      { label: 'Recovery gear status', value: firstPrefix ? valueFor(`${firstPrefix}-recovery-ready`) : 'Not available' },
      { label: 'Spare tire status', value: firstPrefix ? valueFor(`${firstPrefix}-spare-tire-ready`) : 'Not available' },
      { label: 'Limiting vehicle', value: valueFor('limiting-vehicle') },
      { label: 'Recommended action', value: assessment.recommendedAction },
    ],
    vehicles,
  };
}

function shouldShowEscalation(assessment?: ExpeditionAssessment): boolean {
  return assessment?.status === 'critical' || assessment?.escalationRecommended === true;
}

function DataUsedSection({ dataUsed }: { dataUsed?: ExpeditionAssessmentDataUsed[] }) {
  const rows = dataUsed?.filter((item) => item.label) ?? [];
  if (rows.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Data Used</Text>
      {rows.map((item) => (
        <View
          key={item.id}
          style={[
            styles.dataRow,
            item.isMissing && styles.dataRowWarning,
            item.isStale && styles.dataRowStale,
          ]}
        >
          <View style={styles.dataTextWrap}>
            <Text style={styles.dataLabel}>{item.label}</Text>
            <Text style={styles.dataValue} numberOfLines={2}>
              {formatEvidenceValue(item.value)}
            </Text>
          </View>
          <View style={styles.dataMetaWrap}>
            <Text style={styles.dataSource}>{formatSourceLabel(item.source)}</Text>
            {item.confidence ? <Text style={styles.dataMeta}>{item.confidence} confidence</Text> : null}
            {item.updatedAt ? <Text style={styles.dataMeta}>{formatTime(item.updatedAt)}</Text> : null}
            {item.isMissing ? <Text style={styles.dataWarning}>MISSING</Text> : null}
            {item.isStale ? <Text style={styles.dataWarning}>STALE</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function formatEvidenceValue(value: ExpeditionAssessmentDataUsed['value']): string {
  if (value === null || value === undefined || value === '') return 'Not available';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function formatSourceLabel(source: ExpeditionAssessmentDataUsed['source']): string {
  switch (source) {
    case 'liveGps':
      return 'LIVE GPS';
    case 'userManual':
      return 'MANUAL';
    case 'vehicleObd':
      return 'VEHICLE OBD';
    case 'satellite':
      return 'SATELLITE';
    case 'cached':
      return 'CACHED';
    case 'mock':
      return 'MOCK';
    default:
      return 'UNKNOWN';
  }
}

function MetaChip({ label, emphasized }: { label: string; emphasized?: boolean }) {
  return (
    <View style={[styles.metaChip, emphasized && styles.metaChipEmphasized]}>
      <Text style={[styles.metaChipText, emphasized && styles.metaChipTextEmphasized]}>{label}</Text>
    </View>
  );
}

function DetailSection({
  title,
  text,
  items,
}: {
  title: string;
  text?: string;
  items?: string[];
}) {
  const resolvedItems = items?.filter(Boolean) ?? [];
  if (!text && resolvedItems.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {text ? <Text style={styles.sectionBody}>{text}</Text> : null}
      {resolvedItems.map((item, index) => (
        <View key={`${title}-${index}`} style={styles.bulletRow}>
          <View style={styles.bullet} />
          <Text style={styles.sectionBody}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: 10,
    paddingBottom: 2,
  },
  headerCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(17,20,24,0.94)',
    padding: 12,
    gap: 9,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  categoryWrap: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  eyebrow: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0,
  },
  categoryName: {
    color: TACTICAL.text,
    fontSize: 15,
    fontWeight: '900',
  },
  statusBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(212,160,23,0.08)',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  metaChipEmphasized: {
    borderColor: 'rgba(230,126,34,0.36)',
    backgroundColor: 'rgba(230,126,34,0.10)',
  },
  metaChipText: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  metaChipTextEmphasized: {
    color: ECS.warning,
  },
  lowConfidenceBanner: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(212,160,23,0.07)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 9,
  },
  lowConfidenceText: {
    flex: 1,
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  escalationBanner: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.42)',
    backgroundColor: 'rgba(192,57,43,0.09)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
  },
  escalationIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(192,57,43,0.08)',
  },
  escalationCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  escalationTitle: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  escalationBody: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  escalationButton: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(212,160,23,0.10)',
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  escalationButtonText: {
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
  },
  refreshButton: {
    alignSelf: 'flex-start',
    minHeight: 34,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(212,160,23,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  refreshButtonText: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(10,12,15,0.54)',
    padding: 11,
    gap: 7,
  },
  overviewSection: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(17,20,24,0.82)',
    padding: 11,
    gap: 10,
  },
  routeSection: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(17,20,24,0.82)',
    padding: 11,
    gap: 10,
  },
  convoySection: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(17,20,24,0.82)',
    padding: 11,
    gap: 10,
  },
  campSection: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(17,20,24,0.82)',
    padding: 11,
    gap: 10,
  },
  logisticsSection: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(17,20,24,0.82)',
    padding: 11,
    gap: 10,
  },
  vehiclesSection: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(17,20,24,0.82)',
    padding: 11,
    gap: 10,
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  routeHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  routeSignalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  routeSignal: {
    minWidth: '47%',
    flexGrow: 1,
    flexBasis: '47%',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(10,12,15,0.50)',
    padding: 8,
    gap: 4,
  },
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  overviewHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  overviewStatusBadge: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(212,160,23,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  overviewStatusWatch: {
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(212,160,23,0.10)',
  },
  overviewStatusCaution: {
    borderColor: 'rgba(230,126,34,0.36)',
    backgroundColor: 'rgba(230,126,34,0.10)',
  },
  overviewStatusCritical: {
    borderColor: 'rgba(192,57,43,0.42)',
    backgroundColor: 'rgba(192,57,43,0.10)',
  },
  overviewStatusUnknown: {
    borderColor: 'rgba(139,148,158,0.24)',
    backgroundColor: 'rgba(139,148,158,0.10)',
  },
  overviewStatusText: {
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
  },
  overviewSignalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  overviewSignal: {
    minWidth: '47%',
    flexGrow: 1,
    flexBasis: '47%',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(10,12,15,0.50)',
    padding: 8,
    gap: 4,
  },
  overviewSignalLabel: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
  },
  overviewSignalValue: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  subsystemList: {
    gap: 7,
  },
  subsystemRow: {
    minHeight: 48,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(255,255,255,0.025)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  subsystemCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  subsystemLabel: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  subsystemSummary: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 13,
  },
  subsystemStatusBadge: {
    borderRadius: 7,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(212,160,23,0.08)',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  subsystemStatusText: {
    color: TACTICAL.text,
    fontSize: 8,
    fontWeight: '900',
  },
  convoyMemberRow: {
    minHeight: 54,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(255,255,255,0.025)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  convoyMemberStatus: {
    alignItems: 'flex-end',
    gap: 3,
  },
  convoyMemberStatusText: {
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  vehicleRow: {
    minHeight: 54,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(255,255,255,0.025)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  vehicleStatus: {
    alignItems: 'flex-end',
    gap: 3,
  },
  vehicleStatusText: {
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  sectionBody: {
    flex: 1,
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 15,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 5,
    backgroundColor: TACTICAL.amber,
  },
  dataRow: {
    minHeight: 44,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.10)',
    backgroundColor: 'rgba(255,255,255,0.025)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  dataRowWarning: {
    borderColor: 'rgba(192,57,43,0.34)',
    backgroundColor: 'rgba(192,57,43,0.07)',
  },
  dataRowStale: {
    borderColor: 'rgba(230,126,34,0.30)',
    backgroundColor: 'rgba(230,126,34,0.07)',
  },
  dataTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  dataLabel: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '800',
  },
  dataValue: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  dataMetaWrap: {
    alignItems: 'flex-end',
    gap: 3,
  },
  dataSource: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
  },
  dataMeta: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  dataWarning: {
    color: TACTICAL.danger,
    fontSize: 8,
    fontWeight: '900',
  },
  actionGrid: {
    gap: 7,
  },
  relatedAction: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(212,160,23,0.08)',
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 3,
  },
  relatedActionDisabled: {
    borderColor: 'rgba(139,148,158,0.18)',
    backgroundColor: 'rgba(139,148,158,0.06)',
  },
  relatedActionText: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  relatedActionTextDisabled: {
    color: TACTICAL.textMuted,
  },
  relatedActionReason: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
});
