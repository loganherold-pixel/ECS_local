import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS, GOLD_RAIL, TACTICAL } from '../../lib/theme';
import {
  getExpeditionFrameworkState,
  subscribeExpeditionFrameworkState,
} from '../../stores/expeditionFrameworkStore';
import { dispatchEventStore } from '../../lib/dispatchEventStore';
import {
  getIncidentRecoveryContextSnapshot,
  getIncidentRecoveryContextVersion,
  subscribeIncidentRecoveryContext,
} from '../../lib/incidentRecoveryContextAdapter';
import {
  buildIncidentRecoveryContainerState,
  type IncidentRecoveryLiveContext,
} from '../../lib/incidentRecoveryContainerState';
import {
  incidentRecoveryWorkflowStore,
  type IncidentDebriefInput,
  type ReportIncidentInput,
  type ResolveIncidentInput,
  type SafetyChecklistInput,
} from '../../lib/incidentRecoveryWorkflowStore';
import type {
  IncidentCoordinate,
  IncidentRecoveryButtonStates,
  IncidentRecoveryContainerState,
  IncidentSeverity,
  IncidentWorkflowButtonState,
} from '../../lib/types/incidentRecovery';
import type { ExpeditionPlaceholderTitle } from './ExpeditionPlaceholderModal';
import ReportIncidentModal from './ReportIncidentModal';
import SafetyChecklistModal from './SafetyChecklistModal';
import ECSAssessmentModal from './ECSAssessmentModal';
import CommunicationPacketModal from './CommunicationPacketModal';
import IncidentTimelineModal from './IncidentTimelineModal';
import ResolveDebriefModal from './ResolveDebriefModal';
import RecoveryPacketBuilderModal from './RecoveryPacketBuilderModal';
import type { IncidentCommunicationPacketAudience } from '../../lib/incidentCommunicationPacket';
import type { ExpeditionAssessmentEscalationRequest } from '../../lib/expedition/assessmentEscalation';
import type { OverlayStackBehavior } from '../../lib/overlayCoordinator';
import { isRecoveryPacketBuilderFeatureEnabled } from '../../lib/recovery/recoveryPacketBuilder';

type IncidentActionId =
  | 'report'
  | 'checklist'
  | 'assessment'
  | 'packet'
  | 'recovery_packet'
  | 'timeline'
  | 'debrief';

type IncidentActionConfig = {
  id: IncidentActionId;
  label: ExpeditionPlaceholderTitle | 'Build Recovery Packet';
  icon: React.ComponentProps<typeof Ionicons>['name'];
  stateKey?: keyof IncidentRecoveryButtonStates;
};

type IncidentRecoveryPanelProps = {
  onOpenPlaceholder: (title: ExpeditionPlaceholderTitle) => void;
  expeditionId?: string;
  routeLabel?: string;
  ecsOnline?: boolean;
  gpsLocation?: IncidentCoordinate | null;
  compact?: boolean;
  modalStackBehavior?: OverlayStackBehavior;
  style?: StyleProp<ViewStyle>;
  assessmentEscalation?: ExpeditionAssessmentEscalationRequest | null;
  onAssessmentEscalationHandled?: () => void;
};

const INCIDENT_ACTIONS: IncidentActionConfig[] = [
  { id: 'report', label: 'Report Incident', icon: 'warning-outline', stateKey: 'reportIncident' },
  { id: 'checklist', label: 'Safety Checklist', icon: 'shield-checkmark-outline', stateKey: 'safetyChecklist' },
  { id: 'assessment', label: 'ECS Assessment', icon: 'scan-outline', stateKey: 'ecsAssessment' },
  { id: 'packet', label: 'Communication Packet', icon: 'radio-outline', stateKey: 'communicationPacket' },
  { id: 'timeline', label: 'Timeline', icon: 'time-outline', stateKey: 'timeline' },
  { id: 'debrief', label: 'Resolve / Debrief', icon: 'checkmark-done-outline', stateKey: 'resolveDebrief' },
];

const RECOVERY_PACKET_ACTION: IncidentActionConfig = {
  id: 'recovery_packet',
  label: 'Build Recovery Packet',
  icon: 'document-text-outline',
};

function subscribeDispatchEventsForReact(listener: () => void): () => void {
  let initialSnapshotDelivered = false;
  return dispatchEventStore.subscribe(() => {
    if (!initialSnapshotDelivered) {
      initialSnapshotDelivered = true;
      return;
    }
    listener();
  });
}

function getStatusLabel(status: string | undefined): string {
  if (!status) return 'Unknown';
  return status
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getSeverityBadge(severity: IncidentSeverity): string {
  return severity === 'unknown' ? 'READY' : severity.toUpperCase();
}

function getPanelCopy(state: IncidentRecoveryContainerState): {
  status: string;
  supportLine?: string;
  badge: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: 'clear' | 'activeIncident' | 'incidentEnded' | 'ready';
} {
  switch (state.displayMode) {
    case 'no_incident':
      return {
        status: state.headline,
        supportLine: state.subheadline,
        badge: 'CLEAR',
        icon: 'checkmark-circle-outline',
        tone: 'clear',
      };
    case 'active_incident':
      return {
        status: state.headline,
        supportLine: state.subheadline,
        badge: getSeverityBadge(state.severity),
        icon: 'shield-half-outline',
        tone: 'activeIncident',
      };
    case 'resolved_recent':
      return {
        status: state.headline,
        supportLine: state.subheadline,
        badge: 'RESOLVED',
        icon: 'shield-checkmark-outline',
        tone: 'incidentEnded',
      };
    default:
      return {
        status: state.headline,
        supportLine: state.subheadline,
        badge: 'READY',
        icon: 'shield-outline',
        tone: 'ready',
      };
  }
}

function formatLastUpdated(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getActionState(
  buttonStates: IncidentRecoveryButtonStates | undefined,
  action: IncidentActionConfig,
): IncidentWorkflowButtonState {
  if (!action.stateKey) {
    return {
      enabled: true,
      status: 'not_started',
      label: action.label,
      description: 'Current user-facing/internal beta.',
    };
  }
  return buttonStates?.[action.stateKey] ?? { enabled: true, status: 'not_started' };
}

function formatGpsLocation(location: IncidentCoordinate | null | undefined): string | undefined {
  if (!location) return undefined;
  return `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
}

export default function IncidentRecoveryPanel({
  onOpenPlaceholder,
  expeditionId,
  routeLabel,
  ecsOnline,
  gpsLocation,
  compact = false,
  modalStackBehavior = 'replace',
  style,
  assessmentEscalation,
  onAssessmentEscalationHandled,
}: IncidentRecoveryPanelProps) {
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportPrefill, setReportPrefill] = useState<ReportIncidentInput | null>(null);
  const [safetyModalVisible, setSafetyModalVisible] = useState(false);
  const [assessmentModalVisible, setAssessmentModalVisible] = useState(false);
  const [packetModalVisible, setPacketModalVisible] = useState(false);
  const [recoveryPacketModalVisible, setRecoveryPacketModalVisible] = useState(false);
  const [timelineModalVisible, setTimelineModalVisible] = useState(false);
  const [resolveDebriefModalVisible, setResolveDebriefModalVisible] = useState(false);
  const recoveryPacketBuilderEnabled = isRecoveryPacketBuilderFeatureEnabled();
  const frameworkState = useSyncExternalStore(
    subscribeExpeditionFrameworkState,
    getExpeditionFrameworkState,
    getExpeditionFrameworkState,
  );
  const dispatchEvents = useSyncExternalStore(
    subscribeDispatchEventsForReact,
    dispatchEventStore.getSnapshot,
    dispatchEventStore.getSnapshot,
  );
  const workflowIncidents = useSyncExternalStore(
    incidentRecoveryWorkflowStore.subscribe,
    incidentRecoveryWorkflowStore.getSnapshot,
    incidentRecoveryWorkflowStore.getSnapshot,
  );
  const incidentContextVersion = useSyncExternalStore(
    subscribeIncidentRecoveryContext,
    getIncidentRecoveryContextVersion,
    getIncidentRecoveryContextVersion,
  );
  const gpsLatitude = gpsLocation?.latitude ?? null;
  const gpsLongitude = gpsLocation?.longitude ?? null;
  const gpsAccuracyMeters = gpsLocation?.accuracyMeters ?? null;
  const gpsCapturedAt = gpsLocation?.capturedAt ?? null;
  const gpsSource = gpsLocation?.source ?? null;
  const gpsLocationForSnapshot = useMemo(
    () => (
      gpsLatitude != null && gpsLongitude != null
        ? {
            latitude: gpsLatitude,
            longitude: gpsLongitude,
            accuracyMeters: gpsAccuracyMeters,
            capturedAt: gpsCapturedAt ?? undefined,
            source: gpsSource ?? undefined,
          }
        : null
    ),
    [gpsAccuracyMeters, gpsCapturedAt, gpsLatitude, gpsLongitude, gpsSource],
  );
  const incidentContextSnapshot = useMemo(
    () => {
      void incidentContextVersion;
      return getIncidentRecoveryContextSnapshot({ gpsLocation: gpsLocationForSnapshot });
    },
    [gpsLocationForSnapshot, incidentContextVersion],
  );
  const liveContext: IncidentRecoveryLiveContext = useMemo(() => ({
    expeditionId,
    routeLabel: routeLabel ?? incidentContextSnapshot.summary?.routeLabel ?? undefined,
    hasRouteContext: frameworkState.hasActiveExpedition || incidentContextSnapshot.route?.hasActiveRoute,
    ecsOnline,
    incidents: workflowIncidents,
    contextSnapshot: incidentContextSnapshot,
  }), [ecsOnline, expeditionId, frameworkState.hasActiveExpedition, incidentContextSnapshot, routeLabel, workflowIncidents]);
  const incidentState = useMemo(
    () => buildIncidentRecoveryContainerState(dispatchEvents, liveContext),
    [dispatchEvents, liveContext],
  );
  const copy = getPanelCopy(incidentState);
  const showIncidentDetails =
    incidentState.displayMode === 'active_incident' ||
    incidentState.displayMode === 'resolved_recent';
  const lastCheckedLabel = formatLastUpdated(incidentState.lastUpdated);
  const missingCriticalData = incidentState.missingCriticalData ?? [];
  const incidentActions = useMemo(
    () => recoveryPacketBuilderEnabled
      ? [
          ...INCIDENT_ACTIONS.slice(0, 4),
          RECOVERY_PACKET_ACTION,
          ...INCIDENT_ACTIONS.slice(4),
        ]
      : INCIDENT_ACTIONS,
    [recoveryPacketBuilderEnabled],
  );

  useEffect(() => {
    if (!assessmentEscalation) return;
    setReportPrefill(assessmentEscalation.reportInput);
    setReportModalVisible(true);
    onAssessmentEscalationHandled?.();
  }, [assessmentEscalation, onAssessmentEscalationHandled]);

  const handleActionPress = (action: IncidentActionConfig) => {
    if (action.id === 'report') {
      setReportPrefill(null);
      setReportModalVisible(true);
      return;
    }
    if (action.id === 'checklist') {
      setSafetyModalVisible(true);
      return;
    }
    if (action.id === 'assessment') {
      if (incidentState.activeIncident) {
        incidentRecoveryWorkflowStore.generateECSAssessment({
          incidentId: incidentState.activeIncident.id,
          expeditionId,
          routeLabel: incidentState.activeIncident.routeLabel ?? routeLabel ?? incidentContextSnapshot.summary?.routeLabel ?? undefined,
          currentLocationLabel: incidentState.locationLabel ?? formatGpsLocation(gpsLocation ?? incidentContextSnapshot.route?.currentLocation),
          convoySummary: incidentContextSnapshot.summary?.convoySummary ?? undefined,
          vehicleSummary: incidentContextSnapshot.summary?.vehicleSummary ?? undefined,
          logisticsSummary: incidentContextSnapshot.summary?.logisticsSummary ?? undefined,
          weatherDaylightSummary: incidentState.activeIncident.metadata?.resources
            ? [
                (incidentState.activeIncident.metadata.resources as any).weather,
                (incidentState.activeIncident.metadata.resources as any).daylight,
              ].filter(Boolean).join(' / ')
            : undefined,
          now: new Date().toISOString(),
        });
      }
      setAssessmentModalVisible(true);
      return;
    }
    if (action.id === 'packet') {
      if (incidentState.activeIncident) {
        incidentRecoveryWorkflowStore.generateCommunicationPacket({
          incidentId: incidentState.activeIncident.id,
          expeditionId,
        });
      }
      setPacketModalVisible(true);
      return;
    }
    if (action.id === 'recovery_packet') {
      setRecoveryPacketModalVisible(true);
      return;
    }
    if (action.id === 'timeline') {
      setTimelineModalVisible(true);
      return;
    }
    if (action.id === 'debrief') {
      setResolveDebriefModalVisible(true);
      return;
    }
    onOpenPlaceholder(action.label as ExpeditionPlaceholderTitle);
  };
  const handleReportSubmit = (input: ReportIncidentInput) => {
    incidentRecoveryWorkflowStore.reportIncident(input);
  };
  const handleSafetySubmit = (input: SafetyChecklistInput) => {
    incidentRecoveryWorkflowStore.saveSafetyChecklist(input);
  };
  const handlePacketCopy = (audience: IncidentCommunicationPacketAudience | 'all') => {
    if (!incidentState.activeIncident) return;
    incidentRecoveryWorkflowStore.logCommunicationPacketCopied({
      incidentId: incidentState.activeIncident.id,
      expeditionId,
      audience,
    });
  };
  const handleTimelineNote = (note: string) => {
    if (!incidentState.activeIncident) return;
    incidentRecoveryWorkflowStore.addTimelineNote({
      incidentId: incidentState.activeIncident.id,
      expeditionId,
      note,
    });
  };
  const handleTimelineLocation = () => {
    if (!incidentState.activeIncident || !gpsLocation) return;
    incidentRecoveryWorkflowStore.addLocationUpdate({
      incidentId: incidentState.activeIncident.id,
      expeditionId,
      location: gpsLocation,
    });
  };
  const handleResolveIncident = (input: ResolveIncidentInput) => {
    incidentRecoveryWorkflowStore.resolveIncident(input);
  };
  const handleSaveDebrief = (input: IncidentDebriefInput) => {
    incidentRecoveryWorkflowStore.saveIncidentDebrief(input);
  };
  const handleClearIncident = () => {
    const incidentId = incidentState.activeIncident?.id;
    const dispatchEventId = incidentState.activeIncident?.dispatchEventId ?? null;
    if (!incidentId && !dispatchEventId && !expeditionId) return;
    Alert.alert(
      'Clear Incident & Recovery',
      'This resets Incident & Recovery back to its original state for this incident. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            incidentRecoveryWorkflowStore.clearIncident({ incidentId, expeditionId });
            if (dispatchEventId) {
              dispatchEventStore.clearEvent(dispatchEventId);
            }
          },
        },
      ],
    );
  };

  return (
    <>
      <View
        style={[
          styles.panel,
          compact && styles.panelCompact,
          copy.tone === 'clear' && styles.panelClear,
          copy.tone === 'activeIncident' && styles.panelAlert,
          copy.tone === 'incidentEnded' && styles.panelEnded,
          style,
        ]}
      >
        <View style={[styles.header, compact && styles.headerCompact]}>
          <View style={styles.titleWrap}>
            <View
              style={[
                styles.iconWrap,
                compact && styles.iconWrapCompact,
                copy.tone === 'clear' && styles.iconWrapClear,
                copy.tone === 'activeIncident' && styles.iconWrapAlert,
                copy.tone === 'incidentEnded' && styles.iconWrapEnded,
              ]}
            >
              <Ionicons
                name={copy.icon}
                size={compact ? 16 : 19}
                color={
                  copy.tone === 'clear'
                    ? TACTICAL.successText
                    : copy.tone === 'activeIncident'
                      ? TACTICAL.danger
                      : TACTICAL.amber
                }
              />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={1}>Incident & Recovery</Text>
              <Text
                style={[
                  styles.status,
                  compact && styles.statusCompact,
                  copy.tone === 'clear' && styles.statusClear,
                  copy.tone === 'activeIncident' && styles.statusAlert,
                ]}
                numberOfLines={1}
              >
                {copy.status}
              </Text>
              {copy.supportLine ? (
                <Text style={[styles.supportLine, compact && styles.supportLineCompact]} numberOfLines={1}>{copy.supportLine}</Text>
              ) : null}
            </View>
          </View>
          <View style={[styles.headerActions, compact && styles.headerActionsCompact]}>
            {incidentState.activeIncident ? (
              <TouchableOpacity
                style={[styles.clearButton, compact && styles.clearButtonCompact]}
                activeOpacity={0.78}
                onPress={handleClearIncident}
                accessibilityRole="button"
                accessibilityLabel="Clear incident and recovery"
              >
                <Text style={[styles.clearButtonText, compact && styles.clearButtonTextCompact]}>Clear</Text>
              </TouchableOpacity>
            ) : null}
            <View
              style={[
                styles.badge,
                compact && styles.badgeCompact,
                copy.tone === 'clear' && styles.badgeClear,
                copy.tone === 'activeIncident' && styles.badgeAlert,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  compact && styles.badgeTextCompact,
                  copy.tone === 'clear' && styles.badgeTextClear,
                  copy.tone === 'activeIncident' && styles.badgeTextAlert,
                ]}
              >
                {copy.badge}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.detailSlot, compact && styles.detailSlotCompact]}>
          {showIncidentDetails ? (
            <View style={[styles.incidentDetail, compact && styles.incidentDetailCompact]}>
              <Text style={[styles.detailLocation, compact && styles.detailLocationCompact]} numberOfLines={1}>
                {incidentState.locationLabel ?? incidentState.routeLabel ?? 'Location unknown'}
              </Text>
              <Text style={[styles.detailSummary, compact && styles.detailSummaryCompact]} numberOfLines={1}>
                {incidentState.activeIncident?.summary ?? incidentState.nextRecommendedAction ?? 'Incident details pending'}
              </Text>
              <Text
                style={[
                  styles.detailStatus,
                  compact && styles.detailStatusCompact,
                  incidentState.displayMode === 'active_incident' && styles.detailStatusAlert,
                ]}
                numberOfLines={1}
              >
                {getStatusLabel(incidentState.status)} / {getSeverityBadge(incidentState.severity)}
              </Text>
              {incidentState.nextRecommendedAction ? (
                <Text style={[styles.detailMeta, compact && styles.detailMetaCompact]} numberOfLines={1}>
                  Next: {incidentState.nextRecommendedAction}
                </Text>
              ) : null}
              {missingCriticalData.length > 0 ? (
                <Text style={[styles.detailWarning, compact && styles.detailWarningCompact]} numberOfLines={1}>
                  Missing: {missingCriticalData.map(getStatusLabel).join(', ')}
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={[styles.incidentDetail, compact && styles.incidentDetailCompact]}>
              <Text style={[styles.detailLocation, compact && styles.detailLocationCompact]} numberOfLines={1}>
                {incidentState.nextRecommendedAction ?? 'Ready to report incident'}
              </Text>
              <Text style={[styles.detailSummary, compact && styles.detailSummaryCompact]} numberOfLines={1}>
                {incidentState.routeLabel ?? 'No incident details active'}
              </Text>
              <Text style={[styles.detailStatus, compact && styles.detailStatusCompact]} numberOfLines={1}>
                {ecsOnline === false ? 'ECS status unknown' : `Last checked ${lastCheckedLabel ?? 'just now'}`}
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.actionGrid, compact && styles.actionGridCompact]}>
          {incidentActions.map((action) => {
            const actionState = getActionState(incidentState.buttonStates, action);
            const enabled = actionState.enabled !== false;
            return (
              <TouchableOpacity
                key={action.id}
                style={[
                  styles.action,
                  compact && styles.actionCompact,
                  !enabled && styles.actionDisabled,
                  actionState.warning && styles.actionWarning,
                ]}
                activeOpacity={0.76}
                disabled={!enabled}
                onPress={() => handleActionPress(action)}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityState={{ disabled: !enabled }}
              >
                {actionState.status === 'complete' ? (
                  <View style={styles.completeCheck}>
                    <Ionicons name="checkmark" size={10} color="#061008" />
                  </View>
                ) : null}
                {actionState.badgeCount && actionState.badgeCount > 0 ? (
                  <View style={styles.actionBadge}>
                    <Text style={styles.actionBadgeText}>{actionState.badgeCount}</Text>
                  </View>
                ) : null}
                <Ionicons name={action.icon} size={compact ? 13 : 15} color={enabled ? TACTICAL.amber : TACTICAL.textMuted} />
                <Text style={[styles.actionText, compact && styles.actionTextCompact, !enabled && styles.actionTextDisabled]} numberOfLines={2}>
                  {actionState.label ?? action.label}
                </Text>
                {actionState.status ? (
                  <Text style={[styles.actionStatus, compact && styles.actionStatusCompact]} numberOfLines={1}>
                    {getStatusLabel(actionState.status)}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <ReportIncidentModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        onSubmit={handleReportSubmit}
        stackBehavior={modalStackBehavior}
        expeditionId={expeditionId}
        routeLabel={routeLabel ?? incidentContextSnapshot.summary?.routeLabel ?? undefined}
        gpsLocation={gpsLocation ?? incidentContextSnapshot.route?.currentLocation}
        contextSnapshot={incidentContextSnapshot}
        prefill={reportPrefill}
      />
      <SafetyChecklistModal
        visible={safetyModalVisible}
        onClose={() => setSafetyModalVisible(false)}
        onSubmit={handleSafetySubmit}
        stackBehavior={modalStackBehavior}
        activeIncident={incidentState.activeIncident}
        expeditionId={expeditionId}
        routeLabel={routeLabel ?? incidentContextSnapshot.summary?.routeLabel ?? undefined}
        gpsLocation={gpsLocation ?? incidentContextSnapshot.route?.currentLocation}
        contextSnapshot={incidentContextSnapshot}
      />
      <ECSAssessmentModal
        visible={assessmentModalVisible}
        onClose={() => setAssessmentModalVisible(false)}
        stackBehavior={modalStackBehavior}
        incident={incidentState.activeIncident}
      />
      <CommunicationPacketModal
        visible={packetModalVisible}
        onClose={() => setPacketModalVisible(false)}
        stackBehavior={modalStackBehavior}
        incident={incidentState.activeIncident}
        onCopyPacket={handlePacketCopy}
      />
      {recoveryPacketBuilderEnabled ? (
        <RecoveryPacketBuilderModal
          visible={recoveryPacketModalVisible}
          onClose={() => setRecoveryPacketModalVisible(false)}
          stackBehavior={modalStackBehavior}
          activeIncident={incidentState.activeIncident}
          contextSnapshot={incidentContextSnapshot}
          gpsLocation={gpsLocation ?? incidentContextSnapshot.route?.currentLocation}
          confirmingUserId={expeditionId ?? 'local-operator'}
        />
      ) : null}
      <IncidentTimelineModal
        visible={timelineModalVisible}
        onClose={() => setTimelineModalVisible(false)}
        stackBehavior={modalStackBehavior}
        incident={incidentState.activeIncident}
        gpsLocation={gpsLocation}
        onAddNote={handleTimelineNote}
        onLogLocation={handleTimelineLocation}
      />
      <ResolveDebriefModal
        visible={resolveDebriefModalVisible}
        onClose={() => setResolveDebriefModalVisible(false)}
        stackBehavior={modalStackBehavior}
        incident={incidentState.activeIncident}
        expeditionId={expeditionId}
        onResolveIncident={handleResolveIncident}
        onSaveDebrief={handleSaveDebrief}
      />
    </>
  );
}

const styles = StyleSheet.create({
  panel: {
    minHeight: 222,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(17,20,24,0.94)',
    padding: 11,
    gap: 11,
  },
  panelCompact: {
    minHeight: 0,
    padding: 7,
    gap: 5,
  },
  panelClear: {
    borderColor: 'rgba(76,175,80,0.26)',
    backgroundColor: 'rgba(13,24,18,0.92)',
  },
  panelAlert: {
    borderColor: 'rgba(192,57,43,0.38)',
    backgroundColor: 'rgba(24,12,12,0.94)',
  },
  panelEnded: {
    borderColor: 'rgba(212,160,23,0.28)',
  },
  header: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerCompact: {
    minHeight: 30,
    gap: 5,
  },
  headerActions: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
  },
  headerActionsCompact: {
    gap: 4,
  },
  clearButton: {
    minHeight: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.36)',
    backgroundColor: 'rgba(192,57,43,0.10)',
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonCompact: {
    minHeight: 20,
    borderRadius: 7,
    paddingHorizontal: 7,
  },
  clearButtonText: {
    color: TACTICAL.danger,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  clearButtonTextCompact: {
    fontSize: 8,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: ECS.accentSoft,
  },
  iconWrapCompact: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  iconWrapClear: {
    borderColor: 'rgba(76,175,80,0.28)',
    backgroundColor: 'rgba(76,175,80,0.10)',
  },
  iconWrapAlert: {
    borderColor: 'rgba(192,57,43,0.38)',
    backgroundColor: 'rgba(192,57,43,0.12)',
  },
  iconWrapEnded: {
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(212,160,23,0.10)',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 15,
    fontWeight: '900',
  },
  titleCompact: {
    fontSize: 12,
    lineHeight: 15,
  },
  status: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  statusCompact: {
    marginTop: 1,
    fontSize: 8.5,
    lineHeight: 11,
  },
  statusClear: {
    color: TACTICAL.successText,
  },
  statusAlert: {
    color: TACTICAL.danger,
  },
  supportLine: {
    marginTop: 1,
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  supportLineCompact: {
    fontSize: 8,
    lineHeight: 10,
  },
  badge: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: ECS.accentSoft,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  badgeCompact: {
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  badgeClear: {
    borderColor: 'rgba(76,175,80,0.28)',
    backgroundColor: 'rgba(76,175,80,0.10)',
  },
  badgeAlert: {
    borderColor: 'rgba(192,57,43,0.34)',
    backgroundColor: 'rgba(192,57,43,0.12)',
  },
  badgeText: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0,
  },
  badgeTextCompact: {
    fontSize: 7,
  },
  badgeTextClear: {
    color: TACTICAL.successText,
  },
  badgeTextAlert: {
    color: TACTICAL.danger,
  },
  detailSlot: {
    minHeight: 54,
    justifyContent: 'center',
  },
  detailSlotCompact: {
    minHeight: 0,
  },
  incidentDetail: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(11,14,18,0.58)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  incidentDetailCompact: {
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 5,
    gap: 2,
  },
  detailLocation: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  detailLocationCompact: {
    fontSize: 9,
    lineHeight: 11,
  },
  detailSummary: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  detailSummaryCompact: {
    fontSize: 8.5,
    lineHeight: 10,
  },
  detailStatus: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
  },
  detailStatusCompact: {
    fontSize: 8,
    lineHeight: 10,
  },
  detailStatusAlert: {
    color: TACTICAL.danger,
  },
  detailMeta: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  detailMetaCompact: {
    fontSize: 8,
    lineHeight: 10,
  },
  detailWarning: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
  },
  detailWarningCompact: {
    fontSize: 8,
    lineHeight: 10,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionGridCompact: {
    gap: 5,
  },
  action: {
    width: '31%',
    minHeight: 54,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(11,14,18,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    paddingVertical: 7,
    gap: 4,
    position: 'relative',
  },
  actionCompact: {
    minHeight: 36,
    borderRadius: 9,
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 2,
  },
  actionDisabled: {
    opacity: 0.62,
  },
  actionWarning: {
    borderColor: 'rgba(212,160,23,0.36)',
    backgroundColor: 'rgba(212,160,23,0.08)',
  },
  actionBadge: {
    position: 'absolute',
    top: 5,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(212,160,23,0.14)',
  },
  actionBadgeText: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
  },
  completeCheck: {
    position: 'absolute',
    top: 5,
    right: 6,
    width: 17,
    height: 17,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.58)',
    backgroundColor: TACTICAL.successText,
  },
  actionText: {
    color: TACTICAL.text,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  actionTextCompact: {
    fontSize: 7,
    lineHeight: 8,
  },
  actionTextDisabled: {
    color: TACTICAL.textMuted,
  },
  actionStatus: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '800',
    textAlign: 'center',
  },
  actionStatusCompact: {
    fontSize: 6,
    lineHeight: 7,
  },
});
