import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import type { ExpeditionWaypoint } from '../../lib/types';

// ============================================================
// HAVERSINE DISTANCE (miles)
// ============================================================
function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ============================================================
// POSITION AGE HELPER
// ============================================================
function formatPositionAge(updatedAt: string | null): { text: string; stale: boolean } {
  if (!updatedAt) return { text: 'NEVER', stale: true };
  const diff = Date.now() - new Date(updatedAt).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  const stale = mins > 240; // > 4 hours
  if (days > 0) return { text: `${days}d ${hrs % 24}h`, stale };
  if (hrs > 0) return { text: `${hrs}h ${mins % 60}m`, stale };
  if (mins > 0) return { text: `${mins}m`, stale };
  return { text: '<1m', stale: false };
}

// ============================================================
// PROPS
// ============================================================
interface Props {
  expeditionId: string;
  currentLat: number | null;
  currentLon: number | null;
  positionUpdatedAt: string | null;
  startWaypointId: string | null;
  waypoints: ExpeditionWaypoint[];
  onUpdated: () => void;
}

// ============================================================
// COMPONENT
// ============================================================
export default function CurrentPositionCard({
  expeditionId,
  currentLat,
  currentLon,
  positionUpdatedAt,
  startWaypointId,
  waypoints,
  onUpdated,
}: Props) {
  const [lat, setLat] = useState(currentLat != null ? String(currentLat) : '');
  const [lon, setLon] = useState(currentLon != null ? String(currentLon) : '');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<'success' | 'error' | null>(null);

  useEffect(() => { setLat(currentLat != null ? String(currentLat) : ''); }, [currentLat]);
  useEffect(() => { setLon(currentLon != null ? String(currentLon) : ''); }, [currentLon]);

  const hasPosition = currentLat != null && currentLon != null;
  const posAge = formatPositionAge(positionUpdatedAt);

  // ── Save position ──────────────────────────────────────────
  const handleUpdatePosition = useCallback(async () => {
    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);
    if (isNaN(parsedLat) || isNaN(parsedLon)) {
      setToast('error');
      setTimeout(() => setToast(null), 2500);
      return;
    }
    if (parsedLat < -90 || parsedLat > 90 || parsedLon < -180 || parsedLon > 180) {
      setToast('error');
      setTimeout(() => setToast(null), 2500);
      return;
    }
    setSaving(true);
    setToast(null);
    try {
      const { error } = await supabase
        .from('expeditions')
        .update({
          current_lat: parsedLat,
          current_lon: parsedLon,
          current_position_updated_at: new Date().toISOString(),
        })
        .eq('id', expeditionId);
      if (error) throw error;
      setToast('success');
      onUpdated();
    } catch {
      setToast('error');
    }
    setSaving(false);
    setTimeout(() => setToast(null), 2500);
  }, [lat, lon, expeditionId, onUpdated]);

  // ── Distance to Start ──────────────────────────────────────
  let distanceToStart: number | null = null;
  let startWpName: string | null = null;
  if (hasPosition && startWaypointId) {
    const startWp = waypoints.find(wp => wp.id === startWaypointId);
    if (startWp && startWp.latitude != null && startWp.longitude != null) {
      distanceToStart = haversineMiles(currentLat!, currentLon!, startWp.latitude, startWp.longitude);
      startWpName = startWp.name;
    }
  }

  // ── Nearest Fuel/Water ─────────────────────────────────────
  let nearestFuel: { name: string; miles: number } | null = null;
  let nearestWater: { name: string; miles: number } | null = null;

  if (hasPosition) {
    const fuelWps = waypoints.filter(
      wp => wp.waypoint_type === 'fuel' && wp.latitude != null && wp.longitude != null
    );
    const waterWps = waypoints.filter(
      wp => (wp.waypoint_type === 'water' || wp.waypoint_type === 'resupply') &&
        wp.latitude != null && wp.longitude != null
    );

    for (const wp of fuelWps) {
      const d = haversineMiles(currentLat!, currentLon!, wp.latitude!, wp.longitude!);
      if (!nearestFuel || d < nearestFuel.miles) {
        nearestFuel = { name: wp.name, miles: d };
      }
    }
    for (const wp of waterWps) {
      const d = haversineMiles(currentLat!, currentLon!, wp.latitude!, wp.longitude!);
      if (!nearestWater || d < nearestWater.miles) {
        nearestWater = { name: wp.name, miles: d };
      }
    }
  }

  return (
    <View style={s.card}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Ionicons name="locate-outline" size={16} color={TACTICAL.amber} />
          <Text style={s.headerTitle}>CURRENT POSITION</Text>
        </View>
        <View style={s.headerRight}>
          {saving && <ActivityIndicator size="small" color={TACTICAL.accent} />}
          {toast === 'success' && (
            <View style={s.toastSuccess}>
              <Ionicons name="checkmark-circle" size={12} color={TACTICAL.successText} />
              <Text style={s.toastSuccessText}>UPDATED</Text>
            </View>
          )}
          {toast === 'error' && (
            <View style={s.toastError}>
              <Ionicons name="alert-circle" size={12} color={TACTICAL.danger} />
              <Text style={s.toastErrorText}>UNABLE TO SAVE. TRY AGAIN.</Text>
            </View>
          )}
        </View>
      </View>

      {/* Position Age Signal Row */}
      <View style={s.signalRow}>
        <Ionicons
          name="radio-outline"
          size={13}
          color={posAge.stale ? TACTICAL.amber : TACTICAL.successText}
        />
        <Text style={[s.signalLabel, { color: posAge.stale ? TACTICAL.amber : TACTICAL.textMuted }]}>
          POSITION AGE:
        </Text>
        <Text style={[s.signalValue, { color: posAge.stale ? TACTICAL.amber : TACTICAL.successText }]}>
          {posAge.text}
        </Text>
        {posAge.stale && (
          <View style={s.staleWarning}>
            <Ionicons name="warning-outline" size={10} color={TACTICAL.amber} />
          </View>
        )}
      </View>
      {posAge.stale && (
        <View style={s.staleNote}>
          <Text style={s.staleNoteText}>
            Position stale — update for accurate resupply intelligence.
          </Text>
        </View>
      )}

      {/* Lat/Lon Inputs */}
      <View style={s.coordRow}>
        <View style={s.coordField}>
          <Text style={s.label}>LATITUDE</Text>
          <TextInput
            style={s.coordInput}
            value={lat}
            onChangeText={setLat}
            placeholder="0.00000"
            placeholderTextColor={TACTICAL.textMuted}
            keyboardType="numeric"
            autoCorrect={false}
          />
        </View>
        <View style={s.coordField}>
          <Text style={s.label}>LONGITUDE</Text>
          <TextInput
            style={s.coordInput}
            value={lon}
            onChangeText={setLon}
            placeholder="0.00000"
            placeholderTextColor={TACTICAL.textMuted}
            keyboardType="numeric"
            autoCorrect={false}
          />
        </View>
      </View>

      {/* Update Position Button */}
      <View style={s.btnRow}>
        <TouchableOpacity
          style={[s.updateBtn, saving && s.updateBtnDisabled]}
          onPress={handleUpdatePosition}
          disabled={saving}
          activeOpacity={0.7}
        >
          {saving ? (
            <ActivityIndicator size="small" color={TACTICAL.text} />
          ) : (
            <>
              <Ionicons name="navigate" size={14} color={TACTICAL.text} />
              <Text style={s.updateBtnText}>UPDATE POSITION</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* No position amber note */}
      {!hasPosition && (
        <View style={s.amberNote}>
          <Ionicons name="alert-circle-outline" size={14} color={TACTICAL.amber} />
          <Text style={s.amberNoteText}>
            Set current position to enable nearest fuel/water intelligence.
          </Text>
        </View>
      )}

      {/* ── Distance to Start ─────────────────────────────── */}
      {distanceToStart != null && (
        <View style={s.intelRow}>
          <View style={s.intelIconCol}>
            <Ionicons name="flag-outline" size={16} color={TACTICAL.amber} />
          </View>
          <View style={s.intelContent}>
            <Text style={s.intelLabel}>DISTANCE TO START</Text>
            <Text style={s.intelValue}>{distanceToStart.toFixed(1)} MI</Text>
            {startWpName && (
              <Text style={s.intelSub}>{startWpName}</Text>
            )}
          </View>
        </View>
      )}

      {/* ── Nearest Fuel/Water Cards ──────────────────────── */}
      {hasPosition && (
        <View style={s.resupplyGrid}>
          {/* Nearest Fuel */}
          <View style={[s.resupplyCard, { borderTopColor: '#FF9800' }]}>
            <View style={s.resupplyHeader}>
              <Ionicons name="flask-outline" size={14} color="#FF9800" />
              <Text style={s.resupplyTitle}>NEAREST FUEL</Text>
            </View>
            {nearestFuel ? (
              <>
                <Text style={s.resupplyName} numberOfLines={1}>{nearestFuel.name}</Text>
                <Text style={[s.resupplyDist, { color: '#FF9800' }]}>
                  {nearestFuel.miles.toFixed(1)} MI
                </Text>
              </>
            ) : (
              <Text style={s.resupplyNone}>No fuel waypoints with coordinates</Text>
            )}
          </View>

          {/* Nearest Water */}
          <View style={[s.resupplyCard, { borderTopColor: '#29B6F6' }]}>
            <View style={s.resupplyHeader}>
              <Ionicons name="water-outline" size={14} color="#29B6F6" />
              <Text style={s.resupplyTitle}>NEAREST WATER</Text>
            </View>
            {nearestWater ? (
              <>
                <Text style={s.resupplyName} numberOfLines={1}>{nearestWater.name}</Text>
                <Text style={[s.resupplyDist, { color: '#29B6F6' }]}>
                  {nearestWater.miles.toFixed(1)} MI
                </Text>
              </>
            ) : (
              <Text style={s.resupplyNone}>No water waypoints with coordinates</Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
  card: {
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.2)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toastSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(62,107,62,0.15)',
    borderRadius: 6,
  },
  toastSuccessText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.successText,
    letterSpacing: 1,
  },
  toastError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(192,57,43,0.12)',
    borderRadius: 6,
  },
  toastErrorText: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.danger,
    letterSpacing: 0.5,
  },

  // Signal row
  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  signalLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  signalValue: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },
  staleWarning: {
    marginLeft: 4,
  },
  staleNote: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  staleNoteText: {
    fontSize: 10,
    color: TACTICAL.amber,
    fontStyle: 'italic',
    lineHeight: 14,
  },

  // Coord inputs
  coordRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  coordField: {
    flex: 1,
    gap: 6,
  },
  label: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  coordInput: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.3)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },

  // Button
  btnRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  updateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: TACTICAL.accent,
    borderRadius: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: TACTICAL.borderFocus,
  },
  updateBtnDisabled: {
    opacity: 0.6,
  },
  updateBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },

  // Amber note
  amberNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(196,138,44,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.2)',
    borderRadius: 8,
  },
  amberNoteText: {
    fontSize: 11,
    color: TACTICAL.amber,
    flex: 1,
    lineHeight: 16,
  },

  // Intel rows
  intelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.15)',
    gap: 12,
  },
  intelIconCol: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(196,138,44,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  intelContent: {
    flex: 1,
  },
  intelLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  intelValue: {
    fontSize: 20,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  intelSub: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    marginTop: 2,
  },

  // Resupply grid
  resupplyGrid: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  resupplyCard: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.2)',
    borderTopWidth: 3,
    padding: 12,
    gap: 4,
  },
  resupplyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  resupplyTitle: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  resupplyName: {
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  resupplyDist: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  resupplyNone: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
    lineHeight: 14,
  },
});



