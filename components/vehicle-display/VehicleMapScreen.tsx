/**
 * VehicleMapScreen — Map Display for Vehicle Surfaces
 *
 * Default vehicle screen. Shows navigation data appropriate
 * to the current driving mode.
 *
 * HighwayDrive:
 *   - Route line, next maneuver, distance remaining, ETA
 *   - Nearby fuel/services
 *
 * ExpeditionDrive:
 *   - Breadcrumb trail, imported GPX route
 *   - Off-route alert, elevation shading
 *   - Offline map indicator
 *   - Adaptive guidance banner (Phase 11)
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { VehicleMapData } from '../../lib/vehicleDisplayTypes';
import { adaptiveExpeditionGuidance } from '../../lib/adaptiveExpeditionGuidance';
import type { GuidanceMessage } from '../../lib/adaptiveGuidanceTypes';
import { GUIDANCE_PRIORITY_COLORS } from '../../lib/adaptiveGuidanceTypes';

interface Props {
  data: VehicleMapData;
}

export default function VehicleMapScreen({ data }: Props) {
  const isHighway = data.mode === 'highway_drive';

  return (
    <View style={styles.container}>
      {/* Map placeholder area */}
      <View style={styles.mapArea}>
        <View style={styles.mapPlaceholder}>
          <Ionicons name="map" size={48} color="rgba(255,255,255,0.15)" />
          <Text style={styles.mapPlaceholderText}>MAP SURFACE</Text>
          <Text style={styles.mapSubtext}>
            {isHighway ? 'Route Navigation' : 'Trail Navigation'}
          </Text>
        </View>

        {/* Speed overlay */}
        {data.speedMph !== null && (
          <View style={styles.speedOverlay}>
            <Text style={styles.speedValue}>{Math.round(data.speedMph)}</Text>
            <Text style={styles.speedUnit}>MPH</Text>
          </View>
        )}

        {/* Heading overlay */}
        {data.headingDeg !== null && (
          <View style={styles.headingOverlay}>
            <Ionicons name="compass-outline" size={18} color="#8B949E" />
            <Text style={styles.headingText}>{Math.round(data.headingDeg)}{'\u00B0'}</Text>
          </View>
        )}

        {/* Offline map indicator (ExpeditionDrive) */}
        {!isHighway && data.offlineMapIndicator && (
          <View style={styles.offlineMapBadge}>
            <Ionicons name="download-outline" size={14} color="#5AC8FA" />
            <Text style={styles.offlineMapText}>
              {data.offlineMapRegion || 'OFFLINE'}
            </Text>
          </View>
        )}

        {/* Off-route alert (ExpeditionDrive) */}
        {!isHighway && data.offRouteAlert && (
          <View style={styles.offRouteAlert}>
            <Ionicons name="alert-circle" size={18} color="#EF5350" />
            <Text style={styles.offRouteText}>
              OFF ROUTE{data.offRouteDistanceFt ? ` \u2022 ${data.offRouteDistanceFt} ft` : ''}
            </Text>
          </View>
        )}

        {/* Adaptive Guidance Banner (Phase 11 — ExpeditionDrive only) */}
        {!isHighway && <GuidanceBanner />}
      </View>

      {/* Bottom info bar */}
      <View style={styles.infoBar}>
        {isHighway ? (
          <HighwayInfoBar data={data} />
        ) : (
          <ExpeditionInfoBar data={data} />
        )}
      </View>
    </View>
  );
}

// ── Guidance Banner (Phase 11) ──────────────────────────────

function GuidanceBanner() {
  const [topMessage, setTopMessage] = useState<GuidanceMessage | null>(
    adaptiveExpeditionGuidance.getTopMessage()
  );

  useEffect(() => {
    const unsub = adaptiveExpeditionGuidance.subscribe(() => {
      setTopMessage(adaptiveExpeditionGuidance.getTopMessage());
    });
    return unsub;
  }, []);

  if (!topMessage) return null;

  const bannerColor = GUIDANCE_PRIORITY_COLORS[topMessage.priority];
  const bgOpacity = topMessage.priority === 'critical' ? 0.25 :
                     topMessage.priority === 'warning' ? 0.2 : 0.15;

  return (
    <View style={[styles.guidanceBanner, {
      backgroundColor: `rgba(${hexToRgb(bannerColor)},${bgOpacity})`,
      borderColor: `rgba(${hexToRgb(bannerColor)},0.4)`,
    }]}>
      <Ionicons name={topMessage.icon as any} size={16} color={bannerColor} />
      <Text style={[styles.guidanceBannerText, { color: bannerColor }]} numberOfLines={1}>
        {topMessage.message}
      </Text>
      <TouchableOpacity
        onPress={() => adaptiveExpeditionGuidance.dismiss(topMessage.deduplicationKey)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close-outline" size={16} color={bannerColor} />
      </TouchableOpacity>
    </View>
  );
}

/** Convert hex color to RGB string for rgba() */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r},${g},${b}`;
}

// ── Info Bars ───────────────────────────────────────────────

function HighwayInfoBar({ data }: { data: VehicleMapData }) {
  return (
    <View style={styles.infoRow}>
      {/* Next maneuver */}
      <View style={styles.infoCell}>
        <Ionicons name="arrow-forward-outline" size={20} color="#5B8DEF" />
        <View style={styles.infoCellContent}>
          <Text style={styles.infoLabel}>NEXT</Text>
          <Text style={styles.infoValue} numberOfLines={1}>
            {data.nextManeuver || 'Continue straight'}
          </Text>
        </View>
      </View>

      {/* Distance remaining */}
      <View style={styles.infoCell}>
        <Ionicons name="trail-sign-outline" size={20} color="#5B8DEF" />
        <View style={styles.infoCellContent}>
          <Text style={styles.infoLabel}>REMAINING</Text>
          <Text style={styles.infoValue}>
            {data.distanceRemainingMiles != null
              ? `${data.distanceRemainingMiles.toFixed(1)} mi`
              : '--'}
          </Text>
        </View>
      </View>

      {/* ETA */}
      <View style={styles.infoCell}>
        <Ionicons name="time-outline" size={20} color="#5B8DEF" />
        <View style={styles.infoCellContent}>
          <Text style={styles.infoLabel}>ETA</Text>
          <Text style={styles.infoValue}>
            {data.etaMinutes != null
              ? data.etaMinutes < 60
                ? `${data.etaMinutes} min`
                : `${Math.floor(data.etaMinutes / 60)}h ${data.etaMinutes % 60}m`
              : '--'}
          </Text>
        </View>
      </View>

      {/* Nearby services */}
      <View style={styles.infoCell}>
        <Ionicons name="car-outline" size={20} color="#5B8DEF" />
        <View style={styles.infoCellContent}>
          <Text style={styles.infoLabel}>SERVICES</Text>
          <Text style={styles.infoValue}>
            {data.nearbyFuelServices.length > 0
              ? `${data.nearbyFuelServices[0].distanceMiles.toFixed(1)} mi`
              : 'None nearby'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function ExpeditionInfoBar({ data }: { data: VehicleMapData }) {
  return (
    <View style={styles.infoRow}>
      {/* Breadcrumb trail */}
      <View style={styles.infoCell}>
        <Ionicons name="footsteps-outline" size={20} color="#D4A017" />
        <View style={styles.infoCellContent}>
          <Text style={styles.infoLabel}>TRAIL</Text>
          <Text style={styles.infoValue}>
            {data.breadcrumbTrail ? 'Recording' : 'Inactive'}
          </Text>
        </View>
      </View>

      {/* GPX route */}
      <View style={styles.infoCell}>
        <Ionicons name="git-branch-outline" size={20} color="#D4A017" />
        <View style={styles.infoCellContent}>
          <Text style={styles.infoLabel}>GPX ROUTE</Text>
          <Text style={styles.infoValue}>
            {data.importedGpxRoute ? 'Loaded' : 'None'}
          </Text>
        </View>
      </View>

      {/* Elevation */}
      <View style={styles.infoCell}>
        <Ionicons name="trending-up-outline" size={20} color="#D4A017" />
        <View style={styles.infoCellContent}>
          <Text style={styles.infoLabel}>ELEVATION</Text>
          <Text style={styles.infoValue}>
            {data.elevationShading ? 'Active' : 'Off'}
          </Text>
        </View>
      </View>

      {/* Coordinates */}
      <View style={styles.infoCell}>
        <Ionicons name="location-outline" size={20} color="#D4A017" />
        <View style={styles.infoCellContent}>
          <Text style={styles.infoLabel}>POSITION</Text>
          <Text style={styles.infoValue}>
            {data.currentLat != null && data.currentLon != null
              ? `${data.currentLat.toFixed(4)}, ${data.currentLon.toFixed(4)}`
              : 'Acquiring...'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapArea: {
    flex: 1,
    backgroundColor: '#0D1117',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  mapPlaceholder: {
    alignItems: 'center',
    gap: 8,
  },
  mapPlaceholderText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 6,
    color: 'rgba(255,255,255,0.12)',
  },
  mapSubtext: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.08)',
  },
  speedOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  speedValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#E6EDF3',
    fontFamily: 'Courier',
  },
  speedUnit: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 3,
    color: '#8B949E',
  },
  headingOverlay: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  headingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8B949E',
    fontFamily: 'Courier',
  },
  offlineMapBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'rgba(90,200,250,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(90,200,250,0.3)',
  },
  offlineMapText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#5AC8FA',
  },
  offRouteAlert: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(239,83,80,0.2)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(239,83,80,0.4)',
  },
  offRouteText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 3,
    color: '#EF5350',
  },
  guidanceBanner: {
    position: 'absolute',
    bottom: 60,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  guidanceBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  infoBar: {
    backgroundColor: '#111418',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  infoCellContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 3,
    color: '#8B949E',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E6EDF3',
  },
});





