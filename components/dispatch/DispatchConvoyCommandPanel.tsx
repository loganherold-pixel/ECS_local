import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import ECSConvoyCommandPanelRive from '../rive/ECSConvoyCommandPanelRive';
import { useReducedMotion } from '../../lib/ecsAnimations';
import { TACTICAL, TYPO } from '../../lib/theme';
import {
  formatConvoyDistanceMiles,
  selectConvoyCommandPanelViewModel,
} from '../../lib/convoy/convoyCommandSelectors';
import type { ConvoyCommandVisualState } from '../../lib/convoy/convoyCommandTypes';
import type { DispatchEvent } from '../../lib/dispatchLiveEvents';
import { useConvoyCommandData } from '../dashboard/commandCenter/useConvoyCommandData';

type DispatchConvoyCommandPanelProps = {
  connectionLabel: string;
  teamStatusLabel: string;
  teamMemberCount: number;
  hasActiveTeam: boolean;
  emergencyEvents: DispatchEvent[];
  emergencySubmitting: boolean;
  onEmergencyPing: () => void;
  onOpenEmergencyEvent: (event: DispatchEvent) => void;
  presentation?: 'full' | 'feed';
  testID?: string;
};

const STATUS_TONE: Record<ConvoyCommandVisualState, string> = {
  live: TACTICAL.text,
  estimated: TACTICAL.textMuted,
  partial: TACTICAL.amber,
  offline: TACTICAL.textMuted,
  alert: TACTICAL.danger,
};

function formatVehicleCount(count: number): string {
  if (count <= 0) return '0 VEHICLES';
  if (count === 1) return '1 VEHICLE';
  return `${count} VEHICLES`;
}

function formatUpdatedAt(value: string | number | Date | null): string {
  if (value == null) return 'No live timestamp';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return 'No live timestamp';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatEmergencyEventTime(event: DispatchEvent): string {
  const date = new Date(event.createdAt);
  if (!Number.isFinite(date.getTime())) return 'Time unavailable';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function getEmergencyLocationLabel(event: DispatchEvent): string {
  if (!event.location) return 'Coordinate unavailable';
  const accuracy = event.location.accuracyMeters;
  const accuracyLabel = typeof accuracy === 'number' && Number.isFinite(accuracy)
    ? ` +/- ${Math.round(accuracy)}m`
    : '';
  return `${event.location.latitude.toFixed(5)}, ${event.location.longitude.toFixed(5)}${accuracyLabel}`;
}

export default function DispatchConvoyCommandPanel({
  connectionLabel,
  teamStatusLabel,
  teamMemberCount,
  hasActiveTeam,
  emergencyEvents,
  emergencySubmitting,
  onEmergencyPing,
  onOpenEmergencyEvent,
  presentation = 'full',
  testID = 'dispatch-convoy-command-panel',
}: DispatchConvoyCommandPanelProps) {
  const reducedMotion = useReducedMotion();
  const { width: windowWidth } = useWindowDimensions();
  const commandData = useConvoyCommandData();
  const isCompact = windowWidth < 820;
  const viewModel = useMemo(
    () => selectConvoyCommandPanelViewModel({ commandData }),
    [commandData],
  );
  const statusTone = STATUS_TONE[viewModel.visualState];
  const widestGapLabel = formatConvoyDistanceMiles(viewModel.widestGapMiles) ?? '--';
  const hasConvoyData = viewModel.vehicleCount > 0 || viewModel.members.length > 0;
  const truthLine = viewModel.isUsingLiveData
    ? 'Live convoy telemetry is active.'
    : hasConvoyData
      ? 'Convoy roster/check-in state available; live tracking is not active.'
      : 'No active convoy. Live convoy tracking is not being simulated.';
  const primaryEmergencyEvent = emergencyEvents[0] ?? null;
  const isFeedPresentation = presentation === 'feed';

  return (
    <View testID={testID} style={[styles.shell, isFeedPresentation ? styles.feedShell : null]}>
      <View style={[styles.panelStage, isFeedPresentation ? styles.feedPanelStage : null]}>
        <ECSConvoyCommandPanelRive
          reducedMotion={reducedMotion}
          style={styles.riveLayer}
          testID={`${testID}-rive`}
        />
        <View pointerEvents="none" style={styles.scrim} />

        <View pointerEvents="box-none" style={styles.overlay}>
          <View pointerEvents="none" style={[styles.topIdentity, isCompact ? styles.topIdentityCompact : null]}>
            <Text style={[styles.eyebrow, isCompact ? styles.eyebrowCompact : null]}>DISPATCH CONVOY COMMAND</Text>
            <Text
              style={[styles.groupName, isCompact ? styles.groupNameCompact : null]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {viewModel.groupName}
            </Text>
            <Text
              style={[styles.truthLine, isCompact ? styles.truthLineCompact : null]}
              numberOfLines={isCompact ? 1 : 2}
              adjustsFontSizeToFit={isCompact}
              minimumFontScale={0.7}
            >
              {truthLine}
            </Text>
          </View>

          <View pointerEvents="none" style={[styles.statusPill, isCompact ? styles.statusPillCompact : null, { borderColor: `${statusTone}66` }]}>
            <Text style={[styles.statusText, isCompact ? styles.statusTextCompact : null, { color: statusTone }]} numberOfLines={1}>
              {viewModel.statusLabel}
            </Text>
          </View>

          <View pointerEvents="none" style={[styles.connectionBar, isCompact ? styles.connectionBarCompact : null]}>
            <Text style={[styles.connectionBarText, isCompact ? styles.connectionBarTextCompact : null]} numberOfLines={1}>
              {connectionLabel} / {teamStatusLabel}
            </Text>
          </View>

          <View pointerEvents="none" style={[styles.metricBlock, styles.vehicleMetric, isCompact ? styles.metricBlockCompact : null]}>
            <Text style={[styles.metricLabel, isCompact ? styles.metricLabelCompact : null]}>VEHICLES</Text>
            <Text style={[styles.metricValue, isCompact ? styles.metricValueCompact : null]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.74}>
              {formatVehicleCount(viewModel.vehicleCount)}
            </Text>
          </View>

          <View pointerEvents="none" style={[styles.metricBlock, styles.reportingMetric, isCompact ? styles.metricBlockCompact : null]}>
            <Text style={[styles.metricLabel, isCompact ? styles.metricLabelCompact : null]}>
              {isCompact ? 'RPT' : 'REPORTING'}
            </Text>
            <Text style={[styles.metricValue, isCompact ? styles.metricValueCompact : null]} numberOfLines={1}>
              {viewModel.reportingCount}/{Math.max(viewModel.vehicleCount, viewModel.members.length)}
            </Text>
          </View>

          <View pointerEvents="none" style={[styles.metricBlock, styles.gapMetric, isCompact ? styles.metricBlockCompact : null]}>
            <Text style={[styles.metricLabel, isCompact ? styles.metricLabelCompact : null]}>
              {isCompact ? 'GAP' : 'WIDEST GAP'}
            </Text>
            <Text style={[styles.metricValue, isCompact ? styles.metricValueCompact : null]} numberOfLines={1}>
              {widestGapLabel}
            </Text>
          </View>

          <View pointerEvents="none" style={[styles.metricBlock, styles.regroupMetric, isCompact ? styles.metricBlockCompact : null]}>
            <Text style={[styles.metricLabel, isCompact ? styles.metricLabelCompact : null]}>REGROUP</Text>
            <Text
              style={[
                styles.metricValue,
                isCompact ? styles.metricValueCompact : null,
                viewModel.regroupSuggested ? styles.metricValueCaution : null,
              ]}
              numberOfLines={1}
            >
              {viewModel.regroupSuggested ? 'ADVISED' : 'STANDBY'}
            </Text>
          </View>

          <View pointerEvents="none" style={[styles.memberStack, isCompact ? styles.memberStackCompact : null]}>
            <Text style={[styles.memberTitle, isCompact ? styles.memberTitleCompact : null]}>CONVOY SIGNALS</Text>
            {(viewModel.members.length > 0 ? viewModel.members.slice(0, 4) : [
              { id: 'empty', displayName: 'No live convoy members', isReporting: false, isLostSignal: false, isStale: true },
            ]).map((member) => {
              const tone = member.isLostSignal ? TACTICAL.danger : member.isReporting ? TACTICAL.text : TACTICAL.amber;
              return (
                <View key={member.id} style={styles.memberRow}>
                  <View style={[styles.memberDot, { backgroundColor: tone }]} />
                  <Text style={[styles.memberName, isCompact ? styles.memberNameCompact : null]} numberOfLines={1}>{member.displayName}</Text>
                </View>
              );
            })}
          </View>

          <View style={[styles.emergencyPanel, isCompact ? styles.emergencyPanelCompact : null]}>
            <View style={styles.emergencyCopy}>
              <Text style={[styles.emergencyEyebrow, isCompact ? styles.emergencyEyebrowCompact : null]}>EMERGENCY COORDINATE PING</Text>
              <Text style={[styles.emergencyText, isCompact ? styles.emergencyTextCompact : null]} numberOfLines={isCompact ? 3 : 2}>
                Sends your current GPS position into ECS team recovery. It does not contact emergency services.
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.emergencyButton,
                isCompact ? styles.emergencyButtonCompact : null,
                emergencySubmitting ? styles.emergencyButtonDisabled : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Send emergency coordinate ping"
              accessibilityState={{ disabled: emergencySubmitting }}
              activeOpacity={emergencySubmitting ? 1 : 0.78}
              disabled={emergencySubmitting}
              onPress={onEmergencyPing}
            >
              <Ionicons name="locate-outline" size={isCompact ? 13 : 15} color={TACTICAL.danger} />
              <Text style={[styles.emergencyButtonText, isCompact ? styles.emergencyButtonTextCompact : null]} numberOfLines={1}>
                {emergencySubmitting ? 'GETTING GPS' : 'PING GPS'}
              </Text>
            </TouchableOpacity>
          </View>

          <View pointerEvents="none" style={[styles.dispatchFacts, isCompact ? styles.dispatchFactsCompact : null]}>
            <Fact label="Team" value={hasActiveTeam ? `${teamMemberCount} member${teamMemberCount === 1 ? '' : 's'}` : 'Inactive'} />
            <Fact label="Updated" value={formatUpdatedAt(viewModel.updatedAt)} />
            <Fact label="Live data" value={viewModel.isUsingLiveData ? 'Yes' : 'No'} />
          </View>
        </View>
      </View>

      {!isFeedPresentation ? (
      <View style={styles.emergencyFeed}>
        <View style={styles.emergencyFeedHeader}>
          <Text style={styles.emergencyFeedTitle}>Emergency Pings</Text>
          <Text style={styles.emergencyFeedCount}>{emergencyEvents.length} active</Text>
        </View>
        {primaryEmergencyEvent ? (
          <TouchableOpacity
            style={styles.emergencyEventRow}
            accessibilityRole="button"
            accessibilityLabel="Open latest emergency coordinate ping"
            activeOpacity={0.8}
            onPress={() => onOpenEmergencyEvent(primaryEmergencyEvent)}
          >
            <View style={styles.emergencyEventIcon}>
              <Ionicons name="pin-outline" size={15} color={TACTICAL.danger} />
            </View>
            <View style={styles.emergencyEventCopy}>
              <Text style={styles.emergencyEventTitle} numberOfLines={1}>
                {primaryEmergencyEvent.title || 'Recovery Assist'}
              </Text>
              <Text style={styles.emergencyEventMeta} numberOfLines={1}>
                {formatEmergencyEventTime(primaryEmergencyEvent)} / {getEmergencyLocationLabel(primaryEmergencyEvent)}
              </Text>
            </View>
            <Ionicons name="map-outline" size={16} color={TACTICAL.amber} />
          </TouchableOpacity>
        ) : (
          <View style={styles.emptyEmergencyRow}>
            <Text style={styles.emptyEmergencyText}>
              No active emergency coordinate pings. Use PING GPS only when a convoy partner needs an immediate map target.
            </Text>
          </View>
        )}
      </View>
      ) : null}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    minHeight: 0,
    gap: 10,
  },
  feedShell: {
    flex: 0,
    minHeight: 0,
    gap: 0,
  },
  panelStage: {
    width: '100%',
    aspectRatio: 1060 / 704,
    minHeight: 260,
    alignSelf: 'center',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'rgba(3,6,8,0.24)',
  },
  feedPanelStage: {
    minHeight: 220,
  },
  riveLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  topIdentity: {
    position: 'absolute',
    left: '11.8%',
    top: '5.1%',
    width: '34.5%',
  },
  topIdentityCompact: {
    top: '5.6%',
    width: '30.5%',
  },
  eyebrow: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 8,
    letterSpacing: 0.9,
  },
  eyebrowCompact: {
    fontSize: 6.5,
    letterSpacing: 0.65,
  },
  groupName: {
    color: TACTICAL.text,
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '900',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  groupNameCompact: {
    fontSize: 12,
    lineHeight: 14,
    marginTop: 1,
    letterSpacing: 0,
  },
  truthLine: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  truthLineCompact: {
    fontSize: 6.5,
    lineHeight: 8,
    marginTop: 1,
  },
  statusPill: {
    position: 'absolute',
    right: '3.2%',
    top: '5.9%',
    width: '17.8%',
    minHeight: '7.8%',
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,8,10,0.68)',
    paddingHorizontal: 8,
  },
  statusPillCompact: {
    top: '5.4%',
    minHeight: '7%',
    paddingHorizontal: 5,
  },
  statusText: {
    ...TYPO.U2,
    fontSize: 9,
    letterSpacing: 1,
  },
  statusTextCompact: {
    fontSize: 7.5,
    letterSpacing: 0.75,
  },
  connectionBar: {
    position: 'absolute',
    left: '3.1%',
    right: '3.1%',
    top: '17.8%',
    minHeight: '3.6%',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  connectionBarCompact: {
    top: '21.4%',
    paddingHorizontal: 7,
  },
  connectionBarText: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    letterSpacing: 0.8,
  },
  connectionBarTextCompact: {
    fontSize: 6.5,
    letterSpacing: 0.55,
  },
  metricBlock: {
    position: 'absolute',
    minHeight: 44,
    justifyContent: 'center',
    gap: 4,
  },
  metricBlockCompact: {
    minHeight: 34,
    gap: 2,
  },
  vehicleMetric: {
    left: '4.3%',
    bottom: '6.4%',
    width: '21%',
    alignItems: 'flex-start',
  },
  reportingMetric: {
    left: '36.7%',
    bottom: '6.1%',
    width: '10.5%',
    alignItems: 'center',
  },
  gapMetric: {
    left: '49.5%',
    bottom: '6.1%',
    width: '10.5%',
    alignItems: 'center',
  },
  regroupMetric: {
    right: '4%',
    bottom: '6.5%',
    width: '22%',
    alignItems: 'flex-end',
  },
  metricLabel: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 7.5,
    letterSpacing: 1,
  },
  metricLabelCompact: {
    fontSize: 6.25,
    letterSpacing: 0.75,
  },
  metricValue: {
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 0.35,
  },
  metricValueCompact: {
    fontSize: 10.5,
    lineHeight: 12,
    letterSpacing: 0.1,
  },
  metricValueCaution: {
    color: TACTICAL.amber,
  },
  memberStack: {
    position: 'absolute',
    left: '5.1%',
    top: '27%',
    width: '19%',
    gap: 5,
  },
  memberStackCompact: {
    top: '28.2%',
    gap: 3,
  },
  memberTitle: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 7,
    letterSpacing: 0.8,
  },
  memberTitleCompact: {
    fontSize: 6,
    letterSpacing: 0.65,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  memberDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  memberName: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '800',
  },
  memberNameCompact: {
    fontSize: 7.5,
  },
  emergencyPanel: {
    position: 'absolute',
    right: '4.6%',
    top: '27.2%',
    width: '24%',
    minHeight: '18%',
    justifyContent: 'space-between',
    gap: 8,
  },
  emergencyPanelCompact: {
    right: '4%',
    top: '28.4%',
    width: '23%',
    gap: 5,
  },
  emergencyCopy: {
    gap: 3,
  },
  emergencyEyebrow: {
    ...TYPO.U2,
    color: TACTICAL.danger,
    fontSize: 7.5,
    letterSpacing: 0.8,
  },
  emergencyEyebrowCompact: {
    fontSize: 6.5,
    letterSpacing: 0.55,
  },
  emergencyText: {
    color: TACTICAL.textMuted,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '700',
  },
  emergencyTextCompact: {
    fontSize: 6.75,
    lineHeight: 8.5,
  },
  emergencyButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: `${TACTICAL.danger}88`,
    borderRadius: 999,
    backgroundColor: `${TACTICAL.danger}18`,
    paddingHorizontal: 10,
  },
  emergencyButtonCompact: {
    minHeight: 28,
    gap: 4,
    paddingHorizontal: 6,
  },
  emergencyButtonDisabled: {
    opacity: 0.58,
  },
  emergencyButtonText: {
    color: TACTICAL.danger,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  emergencyButtonTextCompact: {
    fontSize: 8.5,
    letterSpacing: 0.45,
  },
  dispatchFacts: {
    position: 'absolute',
    left: '36.5%',
    top: '26%',
    width: '27%',
    gap: 6,
  },
  dispatchFactsCompact: {
    top: '27.6%',
    gap: 4,
  },
  fact: {
    minHeight: 30,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.14)',
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  factLabel: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 7,
    letterSpacing: 0.7,
  },
  factValue: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
    marginTop: 2,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  emergencyFeed: {
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.22)',
    borderRadius: 10,
    backgroundColor: 'rgba(5,8,10,0.66)',
    overflow: 'hidden',
  },
  emergencyFeedHeader: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212,160,23,0.16)',
    paddingHorizontal: 11,
  },
  emergencyFeedTitle: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  emergencyFeedCount: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    letterSpacing: 0.8,
  },
  emergencyEventRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  emergencyEventIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: `${TACTICAL.danger}66`,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${TACTICAL.danger}14`,
  },
  emergencyEventCopy: {
    flex: 1,
    minWidth: 0,
  },
  emergencyEventTitle: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
  },
  emergencyEventMeta: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  emptyEmergencyRow: {
    minHeight: 58,
    justifyContent: 'center',
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  emptyEmergencyText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
});
