import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SafeIcon as Ionicons } from '../../SafeIcon';
import { GOLD_RAIL, TACTICAL, TYPO } from '../../../lib/theme';
import type {
  RecoveryDifficulty,
  RecoveryHazardCompassData,
  RecoveryHazardCompassState,
  RecoveryHazardCommsConfidence,
  RecoveryHazardDriftLevel,
} from '../../../lib/navigation/recoveryHazardCompassData';
import { CommandCenterFrame } from './CommandCenterFrame';
import type { CommandCenterMode } from './commandCenterTypes';
import { useRecoveryHazardCompassData } from './useRecoveryHazardCompassData';

type RecoveryHazardCompassProps = {
  mode?: CommandCenterMode;
  availableModes?: CommandCenterMode[];
  onModeChange?: (mode: CommandCenterMode) => void;
  testID?: string;
};

type CompassRowTone = 'live' | 'estimated' | 'warning' | 'hazard' | 'muted';

type IntelligenceRow = {
  key: string;
  label: string;
  value: string;
  detail: string;
  tone: CompassRowTone;
  icon: React.ComponentProps<typeof Ionicons>['name'];
};

const STATE_LABEL: Record<RecoveryHazardCompassState, string> = {
  live: 'LIVE',
  estimated: 'ESTIMATED',
  partial: 'PARTIAL',
  offline: 'OFFLINE',
  setupNeeded: 'SETUP NEEDED',
};

const STATE_ACCENT: Record<RecoveryHazardCompassState, string> = {
  live: '#49D17A',
  estimated: '#5AC8FA',
  partial: TACTICAL.amber,
  offline: TACTICAL.textMuted,
  setupNeeded: TACTICAL.amber,
};

const TONE_ACCENT: Record<CompassRowTone, string> = {
  live: '#49D17A',
  estimated: '#5AC8FA',
  warning: TACTICAL.amber,
  hazard: TACTICAL.danger,
  muted: TACTICAL.textMuted,
};

function formatBearing(value: number | null): string {
  if (value == null) return '--';
  return `${Math.round(value).toString().padStart(3, '0')}°`;
}

function formatHeading(value: number | null): string {
  if (value == null) return '--°';
  return `${Math.round(value).toString().padStart(3, '0')}°`;
}

function formatDistance(value: number | null): string {
  if (value == null) return 'unavailable';
  if (value < 0.1) return '<0.1 mi';
  if (value < 10) return `${value.toFixed(1)} mi`;
  return `${Math.round(value)} mi`;
}

function formatUpdateAge(updatedAt: Date | null): string {
  if (!updatedAt) return 'Update pending';
  const elapsedMs = Date.now() - updatedAt.getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 'Updated just now';
  const seconds = Math.round(elapsedMs / 1000);
  if (seconds < 5) return 'Updated just now';
  if (seconds < 60) return `Updated ${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `Updated ${hours}h ago`;
}

function formatGpsConfidence(data: RecoveryHazardCompassData): string {
  if (!data.currentLocation) return data.isOffline ? 'GPS unavailable' : 'GPS awaiting fix';
  const accuracyMeters = data.locationAccuracyMeters;
  if (accuracyMeters != null && Number.isFinite(accuracyMeters)) {
    return `GPS ±${Math.max(1, Math.round(accuracyMeters * 3.28084))} ft`;
  }
  return data.isOffline || data.isUsingCachedData ? 'Last known position' : 'GPS fix';
}

function formatRouteStatus(data: RecoveryHazardCompassData): string {
  if (!data.activeRoute) return 'Route unavailable';
  return data.activeRoute.isActive ? 'Route active' : 'Route staged';
}

function formatCacheStatus(data: RecoveryHazardCompassData): string {
  if (data.isOffline) return data.isUsingCachedData ? 'Offline cached' : 'Offline';
  return data.isUsingCachedData ? 'Cached data' : 'Live data';
}

function formatSignal(value: RecoveryHazardCommsConfidence): string {
  switch (value) {
    case 'good':
      return 'Good';
    case 'limited':
      return 'Limited';
    case 'poor':
      return 'Poor';
    case 'offline':
      return 'Offline';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

function formatDifficulty(value: RecoveryDifficulty): string {
  switch (value) {
    case 'low':
      return 'Low';
    case 'moderate':
      return 'Moderate';
    case 'high':
      return 'High';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

function resolveDriftTone(value: RecoveryHazardDriftLevel): CompassRowTone {
  if (value === 'critical') return 'hazard';
  if (value === 'caution' || value === 'watch') return 'warning';
  return 'live';
}

function resolveDifficultyTone(value: RecoveryDifficulty): CompassRowTone {
  if (value === 'high') return 'hazard';
  if (value === 'moderate') return 'warning';
  if (value === 'low') return 'live';
  return 'muted';
}

function resolveCommsTone(value: RecoveryHazardCommsConfidence): CompassRowTone {
  if (value === 'good') return 'live';
  if (value === 'limited') return 'warning';
  if (value === 'poor' || value === 'offline') return 'hazard';
  return 'muted';
}

function formatBearingDistance(bearing: number | null, distance: number | null): string {
  if (bearing == null && distance == null) return 'Unavailable';
  if (bearing == null) return formatDistance(distance);
  return `${formatBearing(bearing)} · ${formatDistance(distance)}`;
}

function buildRows(data: RecoveryHazardCompassData): IntelligenceRow[] {
  const savedOrStartName = data.nearestSavedPinName ?? data.activeRoute?.routeStart?.label ?? 'Start or saved pin unavailable';
  const savedOrStartBearing = data.nearestSavedPinName ? data.bearingToNearestSavedPin : data.bearingToStart;
  const savedOrStartDistance = data.nearestSavedPinName ? data.distanceToNearestSavedPinMiles : data.distanceToStartMiles;

  return [
    {
      key: 'route',
      label: 'Nearest route / safe exit',
      value: formatBearingDistance(data.bearingToRoute, data.distanceToRouteMiles),
      detail: data.nearestRoutePoint ? 'Return corridor ready' : 'Route return unavailable',
      tone: data.nearestRoutePoint ? resolveDriftTone(data.routeDriftLevel) : 'muted',
      icon: 'trail-sign-outline',
    },
    {
      key: 'waypoint',
      label: 'Nearest waypoint',
      value: formatBearingDistance(data.bearingToNearestWaypoint, data.distanceToNearestWaypointMiles),
      detail: data.nearestWaypointName ?? 'Select route or waypoint',
      tone: data.nearestWaypointName ? 'estimated' : 'muted',
      icon: 'navigate-outline',
    },
    {
      key: 'saved',
      label: 'Saved pin / start',
      value: formatBearingDistance(savedOrStartBearing, savedOrStartDistance),
      detail: savedOrStartName,
      tone: savedOrStartBearing != null ? 'warning' : 'muted',
      icon: 'flag-outline',
    },
    {
      key: 'comms',
      label: 'Comms confidence',
      value: formatSignal(data.commsConfidence),
      detail: formatGpsConfidence(data),
      tone: resolveCommsTone(data.commsConfidence),
      icon: 'radio-outline',
    },
    {
      key: 'risk',
      label: 'Recovery difficulty',
      value: formatDifficulty(data.recoveryDifficulty),
      detail: data.hasActiveRoute ? `Route drift ${data.routeDriftLevel}` : 'Route unknown',
      tone: resolveDifficultyTone(data.recoveryDifficulty),
      icon: 'analytics-outline',
    },
  ];
}

function IntelligenceRowView({ row }: { row: IntelligenceRow }) {
  const accent = TONE_ACCENT[row.tone];
  return (
    <View style={styles.intelligenceRow}>
      <View style={[styles.rowIconWrap, { borderColor: `${accent}55`, backgroundColor: `${accent}16` }]}>
        <Ionicons name={row.icon} size={12} color={accent} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {row.label}
        </Text>
        <Text style={styles.rowDetail} numberOfLines={1}>
          {row.detail}
        </Text>
      </View>
      <Text style={[styles.rowValue, { color: row.tone === 'muted' ? TACTICAL.textMuted : TACTICAL.text }]} numberOfLines={1}>
        {row.value}
      </Text>
    </View>
  );
}

function DirectionChip({
  label,
  bearing,
  tone,
}: {
  label: string;
  bearing: number | null;
  tone: CompassRowTone;
}) {
  const accent = TONE_ACCENT[tone];
  return (
    <View style={[styles.directionChip, { borderColor: `${accent}66`, backgroundColor: `${accent}18` }]}>
      <View style={[styles.directionChipDot, { backgroundColor: accent }]} />
      <Text style={[styles.directionChipText, { color: accent }]} numberOfLines={1}>
        {label} {formatBearing(bearing)}
      </Text>
    </View>
  );
}

function SetupNeededState({ data }: { data: RecoveryHazardCompassData }) {
  const missing = data.missingInputs.length > 0 ? data.missingInputs.join(' · ') : 'Location · Route · Waypoint';
  return (
    <View style={styles.setupState}>
      <View style={styles.setupIcon}>
        <Ionicons name="locate-outline" size={24} color={TACTICAL.amber} />
      </View>
      <Text style={styles.setupTitle} numberOfLines={1}>
        Recovery intelligence limited
      </Text>
      <Text style={styles.setupText} numberOfLines={2}>
        Enable location or select an active route, waypoint, or saved pin to calculate return bearings.
      </Text>
      <Text style={styles.setupMissing} numberOfLines={1}>
        Missing: {missing}
      </Text>
    </View>
  );
}

export function RecoveryHazardCompass({
  mode = 'recoveryHazardCompass',
  availableModes,
  onModeChange,
  testID = 'recovery-hazard-compass',
}: RecoveryHazardCompassProps) {
  const data = useRecoveryHazardCompassData();
  const rows = useMemo(() => buildRows(data), [data]);
  const accentColor = STATE_ACCENT[data.state];
  const footerItems = [
    formatGpsConfidence(data),
    formatRouteStatus(data),
    formatCacheStatus(data),
    formatUpdateAge(data.lastUpdatedAt),
  ];
  const headingNote =
    data.headingSource === 'estimated'
      ? 'Heading estimated from route'
      : data.headingSource === 'gpsCourse'
        ? 'Heading from GPS course'
        : data.headingSource === 'unavailable'
          ? data.isOffline
            ? 'Offline - using last known position'
            : 'Heading unavailable'
          : 'Heading from live compass';
  const hazardLabel = data.hazardLabel ?? 'No known hazards nearby';
  const safeBearing = data.safeCorridorBearingDegrees ?? data.bearingToRoute ?? data.bearingToNearestWaypoint;

  return (
    <CommandCenterFrame
      title="RECOVERY / HAZARD COMPASS"
      subtitle="Field Recovery Intelligence"
      state={data.state}
      stateLabel={STATE_LABEL[data.state]}
      mode={mode}
      availableModes={availableModes}
      onModeChange={onModeChange}
      footer={
        <View style={styles.footerWrap}>
          {footerItems.map((item) => (
            <Text key={item} style={styles.footerText} numberOfLines={1}>
              {item}
            </Text>
          ))}
        </View>
      }
      testID={testID}
    >
      <View style={[styles.body, data.state === 'offline' ? styles.bodyOffline : null]}>
        {data.state === 'setupNeeded' ? (
          <SetupNeededState data={data} />
        ) : (
          <>
            <View style={styles.mainContent}>
              <View style={styles.compassColumn}>
                <View style={[styles.compassRing, { borderColor: `${accentColor}88` }]}>
                  <Text style={[styles.cardinalTop, styles.cardinalText]}>N</Text>
                  <Text style={[styles.cardinalRight, styles.cardinalText]}>E</Text>
                  <Text style={[styles.cardinalBottom, styles.cardinalText]}>S</Text>
                  <Text style={[styles.cardinalLeft, styles.cardinalText]}>W</Text>
                  <View
                    style={[
                      styles.safeCorridorIndicator,
                      {
                        borderTopColor: TONE_ACCENT.estimated,
                        transform: [{ rotate: `${safeBearing ?? 0}deg` }],
                      },
                      safeBearing == null ? styles.indicatorUnavailable : null,
                    ]}
                  />
                  <View
                    style={[
                      styles.hazardIndicator,
                      {
                        borderTopColor: TACTICAL.danger,
                        transform: [{ rotate: `${data.hazardBearingDegrees ?? 0}deg` }],
                      },
                      data.hazardBearingDegrees == null ? styles.indicatorUnavailable : null,
                    ]}
                  />
                  <View
                    style={[
                      styles.headingNeedle,
                      { backgroundColor: accentColor, transform: [{ rotate: `${data.currentHeadingDegrees ?? 0}deg` }] },
                      data.currentHeadingDegrees == null ? styles.headingNeedleUnavailable : null,
                    ]}
                  />
                  <View style={styles.compassCenter}>
                    <Text style={[styles.headingText, data.currentHeadingDegrees == null ? styles.headingTextMuted : null]}>
                      {formatHeading(data.currentHeadingDegrees)}
                    </Text>
                    <Text style={styles.cardinalDirectionText} numberOfLines={1}>
                      {data.cardinalDirection}
                    </Text>
                  </View>
                  <View style={styles.vehicleMarker}>
                    <Ionicons name="car-sport-outline" size={12} color={TACTICAL.text} />
                  </View>
                </View>
                <Text style={[styles.headingNote, data.headingSource === 'unavailable' ? styles.mutedText : null]} numberOfLines={1}>
                  {headingNote}
                </Text>
                <View style={styles.chipRow}>
                  <DirectionChip label="SAFE" bearing={safeBearing} tone={safeBearing != null ? 'estimated' : 'muted'} />
                  <DirectionChip label="HAZ" bearing={data.hazardBearingDegrees} tone={data.hazardBearingDegrees != null ? 'hazard' : 'muted'} />
                  <DirectionChip label="START" bearing={data.bearingToStart} tone={data.bearingToStart != null ? 'warning' : 'muted'} />
                </View>
              </View>

              <View style={styles.readoutColumn}>
                {rows.map((row) => (
                  <IntelligenceRowView key={row.key} row={row} />
                ))}
              </View>
            </View>

            <View
              style={[
                styles.recommendationStrip,
                {
                  borderColor: `${accentColor}55`,
                  backgroundColor: data.recoveryDifficulty === 'high'
                    ? 'rgba(192, 57, 43, 0.16)'
                    : data.recoveryDifficulty === 'moderate'
                      ? 'rgba(212, 160, 23, 0.16)'
                      : 'rgba(255,255,255,0.04)',
                },
              ]}
            >
              <View style={[styles.recommendationIcon, { borderColor: `${accentColor}66` }]}>
                <Ionicons name="compass-outline" size={13} color={accentColor} />
              </View>
              <View style={styles.recommendationCopy}>
                <Text style={[styles.recommendationText, { color: accentColor }]} numberOfLines={1}>
                  {data.recommendedAction}
                </Text>
                <Text style={styles.recommendationDetail} numberOfLines={1}>
                  {data.confidenceLabel} · {hazardLabel}
                </Text>
              </View>
            </View>
          </>
        )}
      </View>
    </CommandCenterFrame>
  );
}

export default RecoveryHazardCompass;

const styles = StyleSheet.create({
  body: {
    flex: 1,
    minHeight: 0,
    gap: 7,
    padding: 7,
    backgroundColor: 'rgba(2, 5, 8, 0.48)',
  },
  bodyOffline: {
    opacity: 0.78,
  },
  mainContent: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  compassColumn: {
    width: '39%',
    minWidth: 110,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
  },
  compassRing: {
    width: '100%',
    maxWidth: 142,
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 2,
    backgroundColor: 'rgba(7, 12, 17, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#D6A13A',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  cardinalText: {
    position: 'absolute',
    color: 'rgba(230, 237, 243, 0.78)',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  cardinalTop: {
    top: 8,
  },
  cardinalRight: {
    right: 9,
  },
  cardinalBottom: {
    bottom: 8,
  },
  cardinalLeft: {
    left: 9,
  },
  safeCorridorIndicator: {
    position: 'absolute',
    top: 8,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  hazardIndicator: {
    position: 'absolute',
    top: 14,
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  indicatorUnavailable: {
    opacity: 0,
  },
  headingNeedle: {
    position: 'absolute',
    width: 3,
    height: '33%',
    borderRadius: 999,
    top: '17%',
  },
  headingNeedleUnavailable: {
    opacity: 0.24,
  },
  compassCenter: {
    width: '62%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GOLD_RAIL.instrument,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  vehicleMarker: {
    position: 'absolute',
    bottom: 22,
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.32)',
    backgroundColor: 'rgba(0,0,0,0.46)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingText: {
    color: TACTICAL.text,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '900',
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  headingTextMuted: {
    color: TACTICAL.textMuted,
  },
  cardinalDirectionText: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 10,
    letterSpacing: 1.1,
  },
  headingNote: {
    color: 'rgba(230, 237, 243, 0.72)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
    includeFontPadding: false,
    textAlign: 'center',
    maxWidth: '100%',
  },
  mutedText: {
    color: TACTICAL.textMuted,
  },
  chipRow: {
    width: '100%',
    gap: 3,
  },
  directionChip: {
    minHeight: 18,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  directionChipDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  directionChipText: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  readoutColumn: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 4,
  },
  intelligenceRow: {
    minHeight: 32,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.13)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    paddingHorizontal: 7,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  rowIconWrap: {
    width: 23,
    height: 23,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowLabel: {
    color: TACTICAL.amber,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    includeFontPadding: false,
    textTransform: 'uppercase',
  },
  rowDetail: {
    color: 'rgba(230, 237, 243, 0.78)',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '800',
    includeFontPadding: false,
  },
  rowValue: {
    maxWidth: '42%',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.2,
    includeFontPadding: false,
    textAlign: 'right',
  },
  recommendationStrip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  recommendationIcon: {
    width: 25,
    height: 25,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.26)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recommendationCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  recommendationText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  recommendationDetail: {
    color: 'rgba(230, 237, 243, 0.72)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    includeFontPadding: false,
  },
  footerWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  footerText: {
    flexShrink: 1,
    color: 'rgba(230, 237, 243, 0.74)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    letterSpacing: 0.25,
    includeFontPadding: false,
  },
  setupState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  setupIcon: {
    width: 42,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.4)',
    backgroundColor: 'rgba(212, 160, 23, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupTitle: {
    color: TACTICAL.amber,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 0.8,
    includeFontPadding: false,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  setupText: {
    color: 'rgba(230, 237, 243, 0.76)',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    includeFontPadding: false,
    textAlign: 'center',
  },
  setupMissing: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    includeFontPadding: false,
    textAlign: 'center',
  },
});
