import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO } from '../../lib/theme';
import type { RouteNearbyEstablishedCampsite } from '../../lib/map/establishedCampsiteRouteSearch';

type Props = {
  visible: boolean;
  results: RouteNearbyEstablishedCampsite[];
  dataAvailable: boolean;
  corridorMiles: number;
  bottom: number;
  left: number;
  onSelectCampsite: (campsite: RouteNearbyEstablishedCampsite) => void;
  onViewOnMap: (campsite: RouteNearbyEstablishedCampsite) => void;
};

function formatDistance(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'near route';
  if (value < 0.1) return '<0.1 mi';
  return `${value.toFixed(value < 10 ? 1 : 0)} mi`;
}

export default function EstablishedCampsitesRouteSummary({
  visible,
  results,
  dataAvailable,
  corridorMiles,
  bottom,
  left,
  onSelectCampsite,
  onViewOnMap,
}: Props) {
  if (!visible) return null;

  const hasResults = results.length > 0;
  const emptyCopy = dataAvailable
    ? 'No established campgrounds found near this route. Verify campground details before travel.'
    : 'Established campground data unavailable for this area.';

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
          <Ionicons name="trail-sign-outline" size={13} color={TACTICAL.amber} />
          <Text style={styles.title}>Established Campgrounds Near Route</Text>
        </View>
        <Text style={styles.corridorText}>{corridorMiles.toFixed(0)} mi corridor</Text>
      </View>

      {hasResults ? (
        <View style={styles.resultStack}>
          {results.map((campsite) => (
            <TouchableOpacity
              key={campsite.id}
              style={styles.resultRow}
              activeOpacity={0.84}
              onPress={() => onSelectCampsite(campsite)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${campsite.name} campground details`}
            >
              <View style={styles.resultMain}>
                <Text style={styles.nameText} numberOfLines={1}>
                  {campsite.name}
                </Text>
                <Text style={styles.distanceText} numberOfLines={1}>
                  {formatDistance(campsite.distanceFromRouteMiles)} from route
                </Text>
              </View>
              <TouchableOpacity
                style={styles.viewButton}
                activeOpacity={0.84}
                onPress={() => onViewOnMap(campsite)}
                accessibilityRole="button"
                accessibilityLabel={`View ${campsite.name} on map`}
              >
                <Text style={styles.viewButtonText}>View on map</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>{emptyCopy}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    zIndex: 25,
    elevation: 25,
    width: 318,
    maxWidth: '84%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(242,194,77,0.32)',
    backgroundColor: 'rgba(6,12,16,0.92)',
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
    gap: 7,
  },
  resultRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  resultMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameText: {
    ...TYPO.B2,
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '700',
  },
  distanceText: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    letterSpacing: 0.5,
  },
  viewButton: {
    minHeight: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(242,194,77,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    backgroundColor: 'rgba(242,194,77,0.1)',
  },
  viewButtonText: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 7,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  emptyText: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
  },
});
