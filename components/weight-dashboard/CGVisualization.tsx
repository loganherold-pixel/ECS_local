/**
 * CG Visualization — Center-of-Gravity on Vehicle Outline
 *
 * Renders a top-down vehicle silhouette with:
 *   - CG dot position (gold/amber)
 *   - Front/rear axle lines
 *   - Zone regions with weight-proportional fills
 *   - Axle load percentages
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TACTICAL } from '../../lib/theme';
import type { CGResult } from '../../lib/weightEngine';
import type { StabilityResult } from '../../lib/stabilityEngine';

interface Props {
  cgResult: CGResult;
  stability: StabilityResult;
  frontAxlePercent: number;
  rearAxlePercent: number;
  totalWeight: number;
  vehicleType?: string | null;
}

const FRONT_AXLE_X = 0.22;
const REAR_AXLE_X = 0.72;
type VehicleProfileKind = 'truck' | 'suv' | 'van' | 'wagon' | 'generic';

function clampPercent(value: number, fallback: number): number {
  const safe = Number.isFinite(value) ? value : fallback;
  return Math.max(7, Math.min(93, safe * 100));
}

function resolveVehicleProfileKind(vehicleType: string | null | undefined): VehicleProfileKind {
  const normalized = String(vehicleType ?? '').toLowerCase();
  if (normalized.includes('truck') || normalized.includes('pickup') || normalized.includes('ute')) return 'truck';
  if (normalized.includes('van') || normalized.includes('bus')) return 'van';
  if (normalized.includes('suv') || normalized.includes('jeep') || normalized.includes('4x4')) return 'suv';
  if (normalized.includes('wagon') || normalized.includes('crossover') || normalized.includes('car')) return 'wagon';
  return 'generic';
}

function vehicleProfileLabel(kind: VehicleProfileKind): string {
  switch (kind) {
    case 'truck': return 'TRUCK PROFILE';
    case 'suv': return 'SUV / 4x4 PROFILE';
    case 'van': return 'VAN PROFILE';
    case 'wagon': return 'WAGON PROFILE';
    default: return 'VEHICLE PROFILE';
  }
}

function TopDownVehicleFallbackProfile({ kind }: { kind: VehicleProfileKind }) {
  if (kind === 'truck') {
    return (
      <View style={styles.vehicleProfileSilhouette}>
        <View style={[styles.profileNose, styles.truckNose]}>
          <View style={styles.hoodRidge} />
        </View>
        <View style={styles.truckCab}>
          <View style={styles.windshield} />
          <View style={styles.cabinGlass} />
        </View>
        <View style={styles.truckBed}>
          <View style={styles.bedRailTop} />
          <View style={styles.bedFloor} />
          <View style={styles.bedRailBottom} />
        </View>
        <View style={styles.tailGate} />
      </View>
    );
  }

  if (kind === 'van') {
    return (
      <View style={styles.vehicleProfileSilhouette}>
        <View style={[styles.profileNose, styles.vanNose]}>
          <View style={styles.hoodRidge} />
        </View>
        <View style={styles.vanCabin}>
          <View style={styles.windshield} />
          <View style={styles.vanGlass} />
          <View style={styles.vanCargoLine} />
        </View>
        <View style={styles.tailGate} />
      </View>
    );
  }

  if (kind === 'suv') {
    return (
      <View style={styles.vehicleProfileSilhouette}>
        <View style={[styles.profileNose, styles.suvNose]}>
          <View style={styles.hoodRidge} />
        </View>
        <View style={styles.suvCabin}>
          <View style={styles.windshield} />
          <View style={styles.cabinGlass} />
          <View style={styles.rearGlass} />
        </View>
        <View style={styles.suvHatch} />
      </View>
    );
  }

  return (
    <View style={styles.vehicleProfileSilhouette}>
      <View style={[styles.profileNose, styles.wagonNose]}>
        <View style={styles.hoodRidge} />
      </View>
      <View style={styles.wagonCabin}>
        <View style={styles.windshield} />
        <View style={styles.cabinGlass} />
      </View>
      <View style={styles.wagonRear} />
    </View>
  );
}

function TopDownVehicleProfile({ kind }: { kind: VehicleProfileKind }) {
  return <TopDownVehicleFallbackProfile kind={kind} />;
}

export default function CGVisualization({
  cgResult,
  stability,
  frontAxlePercent,
  rearAxlePercent,
  totalWeight,
  vehicleType,
}: Props) {
  const profileKind = useMemo(() => resolveVehicleProfileKind(vehicleType), [vehicleType]);
  const cgLongitudinalPercent = clampPercent(cgResult.xCG, 0.45);
  const cgLateralPercent = clampPercent(cgResult.yCG ?? 0.5, 0.5);
  const markerClamped = cgLongitudinalPercent <= 7 || cgLongitudinalPercent >= 93 || cgLateralPercent <= 7 || cgLateralPercent >= 93;

  // Stability color
  const stabilityColor = cgResult.stability === 'balanced'
    ? '#66BB6A'
    : cgResult.stability === 'moderate_rear'
      ? '#FF9800'
      : '#EF5350';

  const cgColor = stability.stabilityColor || TACTICAL.amber;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>CENTER OF GRAVITY</Text>
        <View style={[styles.stabilityBadge, { borderColor: stabilityColor + '60', backgroundColor: stabilityColor + '15' }]}>
          <View style={[styles.stabilityDot, { backgroundColor: stabilityColor }]} />
          <Text style={[styles.stabilityText, { color: stabilityColor }]}>
            {cgResult.stability === 'balanced' ? 'BALANCED' : cgResult.stability === 'moderate_rear' ? 'REAR BIAS' : 'EXTREME REAR'}
          </Text>
        </View>
      </View>

      {/* Vehicle Outline */}
      <View style={styles.vehicleContainer}>
        <View style={styles.profileLegend}>
          <Text style={styles.profileLabel}>{vehicleProfileLabel(profileKind)}</Text>
          <View style={styles.sideLegend}>
            <Text style={styles.sideLegendText}>DRIVER</Text>
            <View style={styles.sideLegendLine} />
            <Text style={styles.sideLegendText}>PASSENGER</Text>
          </View>
        </View>

        <View style={styles.profileFrame}>
          <TopDownVehicleProfile kind={profileKind} />

          <View style={[styles.axleLine, { top: `${FRONT_AXLE_X * 100}%` }]}>
            <View style={styles.axleEnd} />
            <View style={styles.axleDash} />
            <View style={styles.axleEnd} />
          </View>

          <View style={[styles.axleLine, { top: `${REAR_AXLE_X * 100}%` }]}>
            <View style={styles.axleEnd} />
            <View style={styles.axleDash} />
            <View style={styles.axleEnd} />
          </View>

          <View
            style={[
              styles.cgDot,
              {
                left: `${cgLateralPercent}%`,
                top: `${cgLongitudinalPercent}%`,
                backgroundColor: cgColor,
                shadowColor: cgColor,
              },
            ]}
          >
            <View style={[styles.cgDotInner, { backgroundColor: cgColor }]} />
          </View>

          <View style={[styles.cgLineH, { top: `${cgLongitudinalPercent}%`, left: '18%', width: '64%' }]} />
          <View style={[styles.cgLineV, { left: `${cgLateralPercent}%`, top: `${Math.max(0, cgLongitudinalPercent - 8)}%`, height: '16%' }]} />
        </View>

        {markerClamped ? (
          <Text style={styles.markerWarning}>COG marker clamped to visible vehicle profile bounds</Text>
        ) : null}

        <View style={styles.directionArrow}>
          <Text style={styles.arrowLabel}>FWD</Text>
          <View style={styles.arrowLine} />
          <View style={styles.arrowHeadDown} />
          <Text style={styles.arrowLabel}>REAR</Text>
        </View>
      </View>

      {/* Axle Load Bars */}
      <View style={styles.axleRow}>
        {/* Front Axle */}
        <View style={styles.axleCard}>
          <Text style={styles.axleLabel}>FRONT AXLE</Text>
          <View style={styles.axleBarContainer}>
            <View style={styles.axleBarTrack}>
              <View
                style={[
                  styles.axleBarFill,
                  {
                    width: `${Math.min(100, frontAxlePercent)}%`,
                    backgroundColor: frontAxlePercent > 65 ? '#FF9800' : '#66BB6A',
                  },
                ]}
              />
            </View>
            <Text style={[styles.axlePercent, { color: frontAxlePercent > 65 ? '#FF9800' : '#66BB6A' }]}>
              {frontAxlePercent}%
            </Text>
          </View>
          <Text style={styles.axleWeight}>
            {Math.round(totalWeight * frontAxlePercent / 100)} lbs
          </Text>
        </View>

        {/* Rear Axle */}
        <View style={styles.axleCard}>
          <Text style={styles.axleLabel}>REAR AXLE</Text>
          <View style={styles.axleBarContainer}>
            <View style={styles.axleBarTrack}>
              <View
                style={[
                  styles.axleBarFill,
                  {
                    width: `${Math.min(100, rearAxlePercent)}%`,
                    backgroundColor: rearAxlePercent > 75 ? '#EF5350' : rearAxlePercent > 65 ? '#FF9800' : '#66BB6A',
                  },
                ]}
              />
            </View>
            <Text style={[styles.axlePercent, { color: rearAxlePercent > 75 ? '#EF5350' : rearAxlePercent > 65 ? '#FF9800' : '#66BB6A' }]}>
              {rearAxlePercent}%
            </Text>
          </View>
          <Text style={styles.axleWeight}>
            {Math.round(totalWeight * rearAxlePercent / 100)} lbs
          </Text>
        </View>
      </View>

      {/* CG Coordinates */}
      <View style={styles.cgCoords}>
        <View style={styles.cgCoordItem}>
          <Text style={styles.cgCoordLabel}>CG-X</Text>
          <Text style={styles.cgCoordValue}>{(cgResult.xCG * 100).toFixed(1)}%</Text>
        </View>
        <View style={styles.cgCoordDivider} />
        <View style={styles.cgCoordItem}>
          <Text style={styles.cgCoordLabel}>CG-Y</Text>
          <Text style={styles.cgCoordValue}>{((cgResult.yCG ?? 0.5) * 100).toFixed(1)}%</Text>
        </View>
        <View style={styles.cgCoordDivider} />
        <View style={styles.cgCoordItem}>
          <Text style={styles.cgCoordLabel}>CG-Z</Text>
          <Text style={styles.cgCoordValue}>{(cgResult.zCG * 100).toFixed(1)}%</Text>
        </View>
        <View style={styles.cgCoordDivider} />
        <View style={styles.cgCoordItem}>
          <Text style={styles.cgCoordLabel}>CG HEIGHT</Text>
          <Text style={styles.cgCoordValue}>{stability.cg.zCg.toFixed(1)}"</Text>
        </View>
        <View style={styles.cgCoordDivider} />
        <View style={styles.cgCoordItem}>
          <Text style={styles.cgCoordLabel}>LAT OFFSET</Text>
          <Text style={styles.cgCoordValue}>{stability.cg.yCg.toFixed(1)}"</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.2)',
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  stabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  stabilityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stabilityText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // Vehicle outline
  vehicleContainer: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  profileLegend: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  profileLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  sideLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sideLegendText: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  sideLegendLine: {
    width: 18,
    height: 1,
    backgroundColor: 'rgba(196, 138, 44, 0.28)',
  },
  profileFrame: {
    width: '100%',
    height: 280,
    maxHeight: 320,
    position: 'relative',
    overflow: 'visible',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vehicleProfileSilhouette: {
    position: 'absolute',
    left: '24%',
    right: '24%',
    top: 10,
    bottom: 10,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileNose: {
    borderWidth: 1.5,
    borderColor: 'rgba(196, 138, 44, 0.4)',
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  truckNose: {
    width: '62%',
    height: '16%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomWidth: 0,
  },
  suvNose: {
    width: '66%',
    height: '17%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderBottomWidth: 0,
  },
  vanNose: {
    width: '76%',
    height: '12%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomWidth: 0,
  },
  wagonNose: {
    width: '62%',
    height: '18%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomWidth: 0,
  },
  hoodRidge: {
    width: '58%',
    height: 1,
    backgroundColor: 'rgba(196, 138, 44, 0.32)',
  },
  truckCab: {
    width: '78%',
    height: '23%',
    borderWidth: 1.5,
    borderColor: 'rgba(196, 138, 44, 0.46)',
    backgroundColor: 'rgba(196, 138, 44, 0.13)',
    borderRadius: 14,
    marginTop: -1,
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 8,
  },
  truckBed: {
    width: '86%',
    flex: 1,
    borderWidth: 1.5,
    borderColor: 'rgba(196, 138, 44, 0.4)',
    borderTopWidth: 0,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginTop: -1,
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  bedRailTop: {
    height: 1,
    marginHorizontal: 10,
    backgroundColor: 'rgba(196, 138, 44, 0.35)',
  },
  bedFloor: {
    flex: 1,
    marginHorizontal: 14,
    marginVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.18)',
    backgroundColor: 'rgba(196, 138, 44, 0.04)',
  },
  bedRailBottom: {
    height: 1,
    marginHorizontal: 10,
    backgroundColor: 'rgba(196, 138, 44, 0.35)',
  },
  tailGate: {
    width: '74%',
    height: '7%',
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: 'rgba(196, 138, 44, 0.34)',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    backgroundColor: 'rgba(196, 138, 44, 0.07)',
  },
  windshield: {
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(138, 181, 158, 0.45)',
  },
  cabinGlass: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(138, 181, 158, 0.28)',
    backgroundColor: 'rgba(138, 181, 158, 0.08)',
  },
  rearGlass: {
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(138, 181, 158, 0.35)',
  },
  suvCabin: {
    width: '82%',
    flex: 1,
    borderWidth: 1.5,
    borderColor: 'rgba(196, 138, 44, 0.44)',
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
    borderRadius: 18,
    marginTop: -1,
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 7,
  },
  suvHatch: {
    width: '68%',
    height: '8%',
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: 'rgba(196, 138, 44, 0.34)',
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
  },
  vanCabin: {
    width: '88%',
    flex: 1,
    borderWidth: 1.5,
    borderColor: 'rgba(196, 138, 44, 0.44)',
    backgroundColor: 'rgba(196, 138, 44, 0.1)',
    borderRadius: 12,
    marginTop: -1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  vanGlass: {
    height: '34%',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(138, 181, 158, 0.28)',
    backgroundColor: 'rgba(138, 181, 158, 0.08)',
  },
  vanCargoLine: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.14)',
  },
  wagonCabin: {
    width: '76%',
    flex: 1,
    borderWidth: 1.5,
    borderColor: 'rgba(196, 138, 44, 0.42)',
    backgroundColor: 'rgba(196, 138, 44, 0.1)',
    borderRadius: 18,
    marginTop: -1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  wagonRear: {
    width: '66%',
    height: '10%',
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: 'rgba(196, 138, 44, 0.32)',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
  },

  // Axle lines
  axleLine: {
    position: 'absolute',
    left: '20%',
    right: '20%',
    height: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  axleEnd: {
    width: 4,
    height: 8,
    borderRadius: 2,
    backgroundColor: 'rgba(196, 138, 44, 0.38)',
  },
  axleDash: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(138, 138, 133, 0.25)',
  },

  // CG Dot
  cgDot: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
    marginTop: -8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
    opacity: 0.85,
  },
  cgDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  cgLineH: {
    position: 'absolute',
    height: 1,
    backgroundColor: 'rgba(196, 138, 44, 0.25)',
  },
  cgLineV: {
    position: 'absolute',
    width: 1,
    backgroundColor: 'rgba(196, 138, 44, 0.25)',
  },
  markerWarning: {
    marginTop: 4,
    fontSize: 8,
    fontWeight: '800',
    color: '#FF9800',
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // Direction arrow
  directionArrow: {
    flexDirection: 'column',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  arrowLine: {
    width: 1,
    height: 20,
    backgroundColor: TACTICAL.textMuted,
  },
  arrowHeadDown: {
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderTopColor: TACTICAL.textMuted,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  arrowLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    marginLeft: 2,
  },

  // Axle loads
  axleRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  axleCard: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
  },
  axleLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  axleBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  axleBarTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(62, 79, 60, 0.2)',
    overflow: 'hidden',
  },
  axleBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  axlePercent: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'Courier',
    minWidth: 36,
    textAlign: 'right',
  },
  axleWeight: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    marginTop: 4,
    fontFamily: 'Courier',
  },

  // CG Coordinates
  cgCoords: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.15)',
  },
  cgCoordItem: {
    flex: 1,
    alignItems: 'center',
  },
  cgCoordLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  cgCoordValue: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  cgCoordDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(62, 79, 60, 0.2)',
  },
});



