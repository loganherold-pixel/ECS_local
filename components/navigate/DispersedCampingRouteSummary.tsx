import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO } from '../../lib/theme';
import type { RouteNearbyDispersedCampingRegion } from '../../lib/map/dispersedCampingRouteSearch';

type Props = {
  visible: boolean;
  results: RouteNearbyDispersedCampingRegion[];
  dataAvailable: boolean;
  corridorMiles: number;
  bottom: number;
  left: number;
  onScoutCandidatePins?: () => void;
  onClearScoutPins?: () => void;
  scoutDisabled?: boolean;
  scoutStatusText?: string | null;
  scoutPinsVisible?: boolean;
};

function confidenceLabel(value: RouteNearbyDispersedCampingRegion['confidence']): string {
  switch (value) {
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'restricted':
      return 'Restricted';
    case 'verify':
    default:
      return 'Verify';
  }
}

function confidenceColor(value: RouteNearbyDispersedCampingRegion['confidence']): string {
  switch (value) {
    case 'high':
      return '#A9B85F';
    case 'medium':
      return '#D4A017';
    case 'restricted':
      return '#C66A4A';
    case 'verify':
    default:
      return TACTICAL.amber;
  }
}

function managerLabel(value: RouteNearbyDispersedCampingRegion['landManager']): string {
  switch (value) {
    case 'STATE':
      return 'State';
    case 'LOCAL':
      return 'Local';
    case 'UNKNOWN':
      return 'Unknown';
    default:
      return value;
  }
}

function formatDistance(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'near route';
  if (value < 0.1) return '<0.1 mi';
  return `${value.toFixed(value < 10 ? 1 : 0)} mi`;
}

export default function DispersedCampingRouteSummary({
  visible,
  results,
  dataAvailable,
  corridorMiles,
  bottom,
  left,
  onScoutCandidatePins,
  onClearScoutPins,
  scoutDisabled = false,
  scoutStatusText = null,
  scoutPinsVisible = false,
}: Props) {
  if (!visible) return null;

  const hasResults = results.length > 0;
  const bodyCopy = dataAvailable
    ? 'No likely eligible public-land regions found near this route. Try widening the search area or verify manually.'
    : 'Eligibility data unavailable for this area.';

  return (
    <View
      pointerEvents={hasResults ? 'box-none' : 'none'}
      style={[
        styles.card,
        {
          bottom,
          left,
        },
      ]}
    >
      <View pointerEvents="none" style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Ionicons name="map-outline" size={13} color={TACTICAL.amber} />
          <Text style={styles.title}>Dispersed Camping Near Route</Text>
        </View>
        <Text style={styles.corridorText}>{corridorMiles.toFixed(0)} mi corridor</Text>
      </View>

      {hasResults ? (
        <View pointerEvents="none" style={styles.resultStack}>
          {results.map((result) => {
            const color = confidenceColor(result.confidence);
            return (
              <View key={result.regionId} style={styles.resultRow}>
                <View style={[styles.confidencePill, { borderColor: color, backgroundColor: `${color}1F` }]}>
                  <Text style={[styles.confidenceText, { color }]}>
                    {confidenceLabel(result.confidence)}
                  </Text>
                </View>
                <Text style={styles.managerText} numberOfLines={1}>
                  {managerLabel(result.landManager)}
                </Text>
                <Text style={styles.distanceText} numberOfLines={1}>
                  {formatDistance(result.distanceFromRouteMiles)}
                </Text>
                <Text style={styles.verifyText}>Verify</Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.emptyText}>{bodyCopy}</Text>
      )}

      {hasResults && onScoutCandidatePins ? (
        <View style={styles.scoutActionRow}>
          <TouchableOpacity
            style={[styles.scoutButton, scoutDisabled && styles.scoutButtonDisabled]}
            onPress={onScoutCandidatePins}
            activeOpacity={0.84}
            disabled={scoutDisabled}
            accessibilityRole="button"
            accessibilityLabel="Scout candidate camp pins"
          >
            <Ionicons name="search-outline" size={12} color={scoutDisabled ? TACTICAL.textMuted : '#091014'} />
            <Text
              style={[styles.scoutButtonText, scoutDisabled && styles.scoutButtonTextDisabled]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.76}
            >
              Scout candidate camp pins
            </Text>
          </TouchableOpacity>
          {scoutPinsVisible && onClearScoutPins ? (
            <TouchableOpacity
              style={styles.clearPinsButton}
              onPress={onClearScoutPins}
              activeOpacity={0.84}
              accessibilityRole="button"
              accessibilityLabel="Clear dispersed camping scout pins"
            >
              <Ionicons name="close-circle-outline" size={12} color="#F07D71" />
              <Text style={styles.clearPinsButtonText}>Clear</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {scoutStatusText ? <Text style={styles.statusText}>{scoutStatusText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    zIndex: 24,
    elevation: 24,
    width: 286,
    maxWidth: '78%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(242,194,77,0.32)',
    backgroundColor: 'rgba(6,12,16,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 8,
  },
  header: {
    gap: 3,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    ...TYPO.U2,
    color: TACTICAL.text,
    fontSize: 9,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  corridorText: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    letterSpacing: 0.4,
  },
  resultStack: {
    gap: 6,
  },
  resultRow: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  confidencePill: {
    minWidth: 54,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignItems: 'center',
  },
  confidenceText: {
    ...TYPO.U2,
    fontSize: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  managerText: {
    ...TYPO.B2,
    flex: 1,
    minWidth: 0,
    color: TACTICAL.text,
    fontSize: 10,
  },
  distanceText: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    minWidth: 42,
    textAlign: 'right',
  },
  verifyText: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 8,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  emptyText: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
  },
  scoutActionRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 7,
  },
  scoutButton: {
    flex: 1,
    minHeight: 30,
    borderRadius: 9,
    backgroundColor: TACTICAL.amber,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  scoutButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  scoutButtonText: {
    ...TYPO.U2,
    color: '#091014',
    fontSize: 8,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  scoutButtonTextDisabled: {
    color: TACTICAL.textMuted,
  },
  clearPinsButton: {
    minHeight: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(240,125,113,0.38)',
    backgroundColor: 'rgba(240,125,113,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 9,
  },
  clearPinsButtonText: {
    ...TYPO.U2,
    color: '#F07D71',
    fontSize: 8,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  statusText: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 13,
  },
});
