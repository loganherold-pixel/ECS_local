/**
 * TripRecorderWidget — Dashboard widget for Trip Recording system
 *
 * Compact: Recording status dot + elapsed + distance
 * Card: Recording controls + live stats + last event
 * Detail: Full trip breakdown, past trips list, resource charts, settings
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { tripRecorderEngine, formatDuration, formatDistance, formatSpeed, formatElevation, formatBytes } from '../../lib/tripRecorderEngine';
import type { ActiveRecordingState, TripSummary, TripRecord, ResourceSnapshot } from '../../lib/tripRecorderTypes';
import { TRIP_EVENT_META } from '../../lib/tripRecorderTypes';

// ═══════════════════════════════════════════════════════════
// COMPACT VIEW — Minimal status for collapsed widget
// ═══════════════════════════════════════════════════════════

export function TripRecorderCompact() {
  const [state, setState] = useState<ActiveRecordingState>(tripRecorderEngine.getActiveState());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const unsub = tripRecorderEngine.subscribe(() => setState(tripRecorderEngine.getActiveState()));
    tickRef.current = setInterval(() => {
      if (!tripRecorderEngine.isIdle()) setState(tripRecorderEngine.getActiveState());
    }, 1000);
    return () => { unsub(); if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  const isRecording = state.state === 'recording';
  const isPaused = state.state === 'paused';
  const isActive = isRecording || isPaused;

  return (
    <View style={cs.row}>
      <View style={cs.cell}>
        <Text style={cs.label}>TRIP</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <View style={[cs.dot, isRecording && cs.dotRec, isPaused && cs.dotPause]} />
          <Text style={[cs.value, { fontSize: 9, color: isRecording ? '#EF5350' : isPaused ? '#FFB74D' : TACTICAL.textMuted }]}>
            {isRecording ? 'REC' : isPaused ? 'PAUSE' : 'IDLE'}
          </Text>
        </View>
      </View>
      <View style={cs.cell}>
        <Text style={cs.label}>TIME</Text>
        <Text style={cs.value}>{isActive ? formatDuration(state.elapsedSec) : '\u2014'}</Text>
      </View>
      <View style={cs.cell}>
        <Text style={cs.label}>DIST</Text>
        <Text style={cs.value}>{isActive ? formatDistance(state.distanceMi) : '\u2014'}</Text>
      </View>
    </View>
  );
}

const cs = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  cell: { flex: 1, alignItems: 'center' },
  label: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, marginBottom: 1 },
  value: { fontSize: 12, fontWeight: '900', fontFamily: 'Courier', color: TACTICAL.text },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: TACTICAL.textMuted },
  dotRec: { backgroundColor: '#EF5350' },
  dotPause: { backgroundColor: '#FFB74D' },
});

// ═══════════════════════════════════════════════════════════
// CARD VIEW — Recording status + live stats + controls
// ═══════════════════════════════════════════════════════════

export function TripRecorderCard() {
  const [state, setState] = useState<ActiveRecordingState>(tripRecorderEngine.getActiveState());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const unsub = tripRecorderEngine.subscribe(() => setState(tripRecorderEngine.getActiveState()));
    tickRef.current = setInterval(() => {
      if (!tripRecorderEngine.isIdle()) setState(tripRecorderEngine.getActiveState());
    }, 1000);
    return () => { unsub(); if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  const isRecording = state.state === 'recording';
  const isPaused = state.state === 'paused';
  const isActive = isRecording || isPaused;

  const handleStart = useCallback(() => tripRecorderEngine.startRecording(), []);
  const handlePause = useCallback(() => tripRecorderEngine.pauseRecording(), []);
  const handleResume = useCallback(() => tripRecorderEngine.resumeRecording(), []);
  const handleStop = useCallback(() => tripRecorderEngine.stopRecording(), []);

  // Past trips count
  const tripCount = useMemo(() => tripRecorderEngine.getTripCount(), [state]);

  if (!isActive) {
    return (
      <View style={cardS.body}>
        {/* Idle state */}
        <View style={cardS.statusRow}>
          <View style={[cardS.statusDot, { backgroundColor: TACTICAL.textMuted }]} />
          <Text style={[cardS.statusLabel, { color: TACTICAL.textMuted }]}>NOT RECORDING</Text>
        </View>

        <View style={cardS.metricRow}>
          <Text style={cardS.metricLabel}>PAST TRIPS</Text>
          <Text style={cardS.metricValue}>{tripCount}</Text>
        </View>

        <TouchableOpacity style={cardS.startBtn} onPress={handleStart} activeOpacity={0.7}>
          <Ionicons name="radio-button-on-outline" size={12} color="#0B0F12" />
          <Text style={cardS.startBtnText}>START</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={cardS.body}>
      {/* Recording status */}
      <View style={cardS.statusRow}>
        <View style={[cardS.statusDot, isRecording ? cardS.statusDotRec : cardS.statusDotPause]} />
        <Text style={[cardS.statusLabel, { color: isRecording ? '#EF5350' : '#FFB74D' }]}>
          {isRecording ? 'RECORDING' : 'PAUSED'}
        </Text>
        {state.isExpeditionLinked && (
          <View style={cardS.linkedBadge}>
            <Ionicons name="link-outline" size={8} color={TACTICAL.amber} />
          </View>
        )}
      </View>

      {/* Live stats */}
      <View style={cardS.metricRow}>
        <Text style={cardS.metricLabel}>ELAPSED</Text>
        <Text style={cardS.metricValue}>{formatDuration(state.elapsedSec)}</Text>
      </View>
      <View style={cardS.metricRow}>
        <Text style={cardS.metricLabel}>DISTANCE</Text>
        <Text style={cardS.metricValue}>{formatDistance(state.distanceMi)}</Text>
      </View>
      <View style={cardS.metricRow}>
        <Text style={cardS.metricLabel}>EVENTS</Text>
        <Text style={cardS.metricValue}>{state.eventCount}</Text>
      </View>

      {/* Controls */}
      <View style={cardS.controlRow}>
        {isRecording ? (
          <TouchableOpacity style={cardS.pauseBtn} onPress={handlePause} activeOpacity={0.7}>
            <Ionicons name="pause-outline" size={10} color={TACTICAL.text} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={cardS.resumeBtn} onPress={handleResume} activeOpacity={0.7}>
            <Ionicons name="play-outline" size={10} color="#0B0F12" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={cardS.stopBtn} onPress={handleStop} activeOpacity={0.7}>
          <Ionicons name="stop-outline" size={10} color="#EF5350" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const cardS = StyleSheet.create({
  body: { gap: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusDotRec: { backgroundColor: '#EF5350' },
  statusDotPause: { backgroundColor: '#FFB74D' },
  statusLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 1.5 },
  linkedBadge: { marginLeft: 'auto', padding: 2, borderRadius: 3, backgroundColor: 'rgba(212,160,23,0.08)' },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  metricLabel: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  metricValue: { fontSize: 11, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier' },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 6, borderRadius: 6, backgroundColor: TACTICAL.amber, marginTop: 4,
  },
  startBtnText: { fontSize: 9, fontWeight: '900', color: '#0B0F12', letterSpacing: 1.5 },
  controlRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  pauseBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6,
    borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.2)', borderWidth: 1, borderColor: TACTICAL.border,
  },
  resumeBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6,
    borderRadius: 6, backgroundColor: TACTICAL.amber,
  },
  stopBtn: {
    width: 36, alignItems: 'center', justifyContent: 'center', paddingVertical: 6,
    borderRadius: 6, backgroundColor: 'rgba(239,83,80,0.08)', borderWidth: 1, borderColor: 'rgba(239,83,80,0.3)',
  },
});

// ═══════════════════════════════════════════════════════════
// DETAIL VIEW — Full trip recorder breakdown
// ═══════════════════════════════════════════════════════════

export function TripRecorderDetailView() {
  const [state, setState] = useState<ActiveRecordingState>(tripRecorderEngine.getActiveState());
  const [trips, setTrips] = useState<TripSummary[]>(tripRecorderEngine.getTripSummaries());
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [config, setConfig] = useState(tripRecorderEngine.getConfig());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const unsub = tripRecorderEngine.subscribe(() => {
      setState(tripRecorderEngine.getActiveState());
      setTrips(tripRecorderEngine.getTripSummaries());
    });
    tickRef.current = setInterval(() => {
      if (!tripRecorderEngine.isIdle()) setState(tripRecorderEngine.getActiveState());
    }, 1000);
    return () => { unsub(); if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  const isRecording = state.state === 'recording';
  const isPaused = state.state === 'paused';
  const isActive = isRecording || isPaused;

  const handleStart = useCallback(() => tripRecorderEngine.startRecording(), []);
  const handlePause = useCallback(() => tripRecorderEngine.pauseRecording(), []);
  const handleResume = useCallback(() => tripRecorderEngine.resumeRecording(), []);
  const handleStop = useCallback(() => tripRecorderEngine.stopRecording(), []);

  const handleDeleteTrip = useCallback((tripId: string) => {
    const doDelete = () => {
      tripRecorderEngine.deleteTrip(tripId);
      setTrips(tripRecorderEngine.getTripSummaries());
      if (selectedTripId === tripId) setSelectedTripId(null);
    };
    if (Platform.OS === 'web') {
      if (confirm('Delete this trip record?')) doDelete();
    } else {
      Alert.alert('Delete Trip', 'Delete this recorded trip?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [selectedTripId]);

  // Selected trip detail
  const selectedTrip: TripRecord | null = useMemo(() => {
    if (!selectedTripId) return null;
    return tripRecorderEngine.getTripById(selectedTripId);
  }, [selectedTripId, trips]);

  return (
    <ScrollView style={detS.container} showsVerticalScrollIndicator={false}>
      {/* ═══ ACTIVE RECORDING ═══ */}
      <Text style={detS.section}>TRIP RECORDER</Text>

      {/* Status */}
      <View style={detS.statusCard}>
        <View style={detS.statusRow}>
          <View style={[detS.statusDot, isRecording && { backgroundColor: '#EF5350' }, isPaused && { backgroundColor: '#FFB74D' }]} />
          <Text style={[detS.statusText, {
            color: isRecording ? '#EF5350' : isPaused ? '#FFB74D' : TACTICAL.textMuted,
          }]}>
            {isRecording ? 'RECORDING' : isPaused ? 'PAUSED' : 'IDLE'}
          </Text>
          {state.isExpeditionLinked && (
            <View style={detS.linkedBadge}>
              <Ionicons name="link-outline" size={9} color={TACTICAL.amber} />
              <Text style={detS.linkedText}>EXPEDITION</Text>
            </View>
          )}
        </View>

        {isActive && (
          <>
            <View style={detS.statsGrid}>
              <StatBlock label="ELAPSED" value={formatDuration(state.elapsedSec)} color="#42A5F5" />
              <StatBlock label="DISTANCE" value={formatDistance(state.distanceMi)} color="#66BB6A" />
              <StatBlock label="AVG SPEED" value={state.avgSpeedMph > 0 ? formatSpeed(state.avgSpeedMph) : '\u2014'} color="#FFB74D" />
              <StatBlock label="MAX SPEED" value={state.maxSpeedMph > 0 ? formatSpeed(state.maxSpeedMph) : '\u2014'} color="#FF9800" />
              <StatBlock label="ELEVATION" value={state.elevationGainFt > 0 ? formatElevation(state.elevationGainFt) : '\u2014'} color="#78909C" />
              <StatBlock label="EVENTS" value={`${state.eventCount}`} color="#CE93D8" />
              <StatBlock label="GPS POINTS" value={`${state.pointCount}`} color="#8B949E" />
              <StatBlock label="SNAPSHOTS" value={`${state.snapshotCount}`} color="#4FC3F7" />
            </View>

            {state.lastEventDescription && (
              <View style={detS.lastEventRow}>
                <Ionicons name={state.lastEventType ? (TRIP_EVENT_META[state.lastEventType]?.icon || 'ellipse-outline') as any : 'ellipse-outline'} size={10} color={state.lastEventType ? TRIP_EVENT_META[state.lastEventType]?.color || TACTICAL.textMuted : TACTICAL.textMuted} />
                <Text style={detS.lastEventText} numberOfLines={1}>{state.lastEventDescription}</Text>
              </View>
            )}
          </>
        )}

        {/* Controls */}
        <View style={detS.controlRow}>
          {!isActive ? (
            <TouchableOpacity style={detS.startBtn} onPress={handleStart} activeOpacity={0.7}>
              <Ionicons name="radio-button-on-outline" size={14} color="#0B0F12" />
              <Text style={detS.startBtnText}>START RECORDING</Text>
            </TouchableOpacity>
          ) : (
            <>
              {isRecording ? (
                <TouchableOpacity style={detS.pauseBtn} onPress={handlePause} activeOpacity={0.7}>
                  <Ionicons name="pause-outline" size={14} color={TACTICAL.text} />
                  <Text style={detS.ctrlBtnText}>PAUSE</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={detS.resumeBtn} onPress={handleResume} activeOpacity={0.7}>
                  <Ionicons name="play-outline" size={14} color="#0B0F12" />
                  <Text style={detS.resumeBtnText}>RESUME</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={detS.stopBtn} onPress={handleStop} activeOpacity={0.7}>
                <Ionicons name="stop-outline" size={14} color="#EF5350" />
                <Text style={detS.stopBtnText}>STOP</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* ═══ PAST TRIPS ═══ */}
      <View style={detS.divider} />
      <Text style={detS.section}>TRIP LOG ({trips.length})</Text>

      {trips.length === 0 ? (
        <View style={detS.emptyState}>
          <Ionicons name="trail-sign-outline" size={28} color={TACTICAL.textMuted} />
          <Text style={detS.emptyText}>No recorded trips</Text>
          <Text style={detS.emptySub}>Trips are recorded automatically during expeditions or manually via Start Recording.</Text>
        </View>
      ) : (
        trips.slice(0, 10).map(trip => {
          const isSelected = selectedTripId === trip.id;
          return (
            <TouchableOpacity
              key={trip.id}
              style={[detS.tripCard, isSelected && detS.tripCardSelected]}
              onPress={() => setSelectedTripId(isSelected ? null : trip.id)}
              activeOpacity={0.7}
            >
              <View style={detS.tripHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={detS.tripName} numberOfLines={1}>{trip.name}</Text>
                  <Text style={detS.tripDate}>
                    {new Date(trip.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
                {trip.vehicleName && (
                  <View style={detS.vehicleBadge}>
                    <Ionicons name="car-sport-outline" size={8} color={TACTICAL.amber} />
                    <Text style={detS.vehicleText}>{trip.vehicleName}</Text>
                  </View>
                )}
              </View>

              <View style={detS.tripStatsRow}>
                <View style={detS.tripStat}>
                  <Ionicons name="map-outline" size={9} color="#66BB6A" />
                  <Text style={[detS.tripStatValue, { color: '#66BB6A' }]}>{formatDistance(trip.distanceMi)}</Text>
                </View>
                <View style={detS.tripStat}>
                  <Ionicons name="time-outline" size={9} color="#42A5F5" />
                  <Text style={[detS.tripStatValue, { color: '#42A5F5' }]}>{formatDuration(trip.durationSec)}</Text>
                </View>
                <View style={detS.tripStat}>
                  <Ionicons name="speedometer-outline" size={9} color="#FFB74D" />
                  <Text style={[detS.tripStatValue, { color: '#FFB74D' }]}>{trip.avgSpeedMph > 0 ? `${Math.round(trip.avgSpeedMph)} mph` : '\u2014'}</Text>
                </View>
                {trip.elevationGainFt > 0 && (
                  <View style={detS.tripStat}>
                    <Ionicons name="trending-up-outline" size={9} color="#78909C" />
                    <Text style={[detS.tripStatValue, { color: '#78909C' }]}>{formatElevation(trip.elevationGainFt)}</Text>
                  </View>
                )}
              </View>

              <View style={detS.tripFooter}>
                <Text style={detS.tripFooterText}>
                  {trip.eventCount} events — {trip.routePointCount} pts — {formatBytes(trip.storageBytes)}
                </Text>
                {trip.peakRemoteness != null && (
                  <View style={detS.remBadge}>
                    <Ionicons name="globe-outline" size={8} color="#FF9800" />
                    <Text style={detS.remText}>R{Math.round(trip.peakRemoteness)}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={detS.deleteBtn}
                  onPress={() => handleDeleteTrip(trip.id)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={12} color="#EF5350" />
                </TouchableOpacity>
              </View>

              {/* Expanded detail for selected trip */}
              {isSelected && selectedTrip && (
                <View style={detS.expandedDetail}>
                  <View style={detS.expandDivider} />

                  {/* Resource deltas */}
                  {selectedTrip.startResources && selectedTrip.endResources && (
                    <>
                      <Text style={detS.expandSection}>RESOURCE CHANGES</Text>
                      <ResourceDeltaRow
                        label="FUEL"
                        icon="flame-outline"
                        color="#FF9800"
                        start={selectedTrip.startResources.fuelPercent}
                        end={selectedTrip.endResources.fuelPercent}
                        unit="%"
                      />
                      <ResourceDeltaRow
                        label="WATER"
                        icon="water-outline"
                        color="#4FC3F7"
                        start={selectedTrip.startResources.waterPercent}
                        end={selectedTrip.endResources.waterPercent}
                        unit="%"
                      />
                      <ResourceDeltaRow
                        label="BATTERY"
                        icon="battery-charging-outline"
                        color="#66BB6A"
                        start={selectedTrip.startResources.batteryPercent}
                        end={selectedTrip.endResources.batteryPercent}
                        unit="%"
                      />
                    </>
                  )}

                  {/* Event type summary */}
                  {selectedTrip.events.length > 0 && (
                    <>
                      <Text style={detS.expandSection}>EVENT SUMMARY</Text>
                      <View style={detS.eventChipRow}>
                        {Object.entries(
                          selectedTrip.events.reduce((acc: Record<string, number>, ev) => {
                            acc[ev.type] = (acc[ev.type] || 0) + 1;
                            return acc;
                          }, {})
                        ).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([type, count]) => {
                          const meta = TRIP_EVENT_META[type as keyof typeof TRIP_EVENT_META];
                          if (!meta) return null;
                          return (
                            <View key={type} style={detS.eventChip}>
                              <Ionicons name={meta.icon as any} size={9} color={meta.color} />
                              <Text style={[detS.eventChipText, { color: meta.color }]}>{count}</Text>
                            </View>
                          );
                        })}
                      </View>
                    </>
                  )}

                  {/* Notes */}
                  {selectedTrip.notes ? (
                    <>
                      <Text style={detS.expandSection}>NOTES</Text>
                      <Text style={detS.notesText}>{selectedTrip.notes}</Text>
                    </>
                  ) : null}
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}

      {trips.length > 10 && (
        <Text style={detS.moreText}>+{trips.length - 10} more trips</Text>
      )}

      {/* ═══ RECORDER SETTINGS ═══ */}
      <View style={detS.divider} />
      <Text style={detS.section}>RECORDER SETTINGS</Text>

      <View style={detS.settingsCard}>
        <SettingRow label="Auto-Start on Expedition" value={config.autoStartOnExpedition ? 'ON' : 'OFF'} color={config.autoStartOnExpedition ? '#4CAF50' : TACTICAL.textMuted} />
        <SettingRow label="Auto-Stop on Expedition" value={config.autoStopOnExpedition ? 'ON' : 'OFF'} color={config.autoStopOnExpedition ? '#4CAF50' : TACTICAL.textMuted} />
        <SettingRow label="GPS Interval" value={`${config.gpsIntervalSec}s`} />
        <SettingRow label="Min GPS Distance" value={`${config.minDistanceM}m`} />
        <SettingRow label="Resource Snapshot" value={`${config.resourceSnapshotIntervalSec}s`} />
        <SettingRow label="Max Route Points" value={`${config.maxRoutePoints.toLocaleString()}`} />
        <SettingRow label="Max Stored Trips" value={`${config.maxStoredTrips}`} />
        <SettingRow label="Distance Milestones" value={config.distanceMilestones.join(', ') + ' mi'} />
        <SettingRow label="Elevation Milestones" value={config.elevationMilestones.map(m => `${(m / 1000).toFixed(0)}k`).join(', ') + ' ft'} />
      </View>

      {/* ═══ ENGINE INFO ═══ */}
      <View style={detS.divider} />
      <Text style={detS.section}>ENGINE</Text>
      <SettingRow label="Version" value="v1.0" />
      <SettingRow label="Storage" value="localStorage (offline-first)" />
      <SettingRow label="GPS Source" value="gpsUIState (throttled)" />
      <SettingRow label="Telemetry" value="telemetryConfigStore + OBD + Power" />
      <SettingRow label="Expedition Link" value="expeditionStateStore" />
      <SettingRow label="Downsampling" value="Half-window on overflow" />
      <SettingRow label="Persistence" value="Session restore on restart" />

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ── Sub-components ───────────────────────────────────────

function StatBlock({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={detS.statBlock}>
      <Text style={detS.statBlockLabel}>{label}</Text>
      <Text style={[detS.statBlockValue, { color }]}>{value}</Text>
    </View>
  );
}

function SettingRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={detS.settingRow}>
      <Text style={detS.settingLabel}>{label}</Text>
      <Text style={[detS.settingValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function ResourceDeltaRow({ label, icon, color, start, end, unit }: {
  label: string; icon: string; color: string; start: number | null; end: number | null; unit: string;
}) {
  if (start == null || end == null) return null;
  const delta = end - start;
  const deltaColor = delta < 0 ? '#EF5350' : delta > 0 ? '#66BB6A' : TACTICAL.textMuted;
  return (
    <View style={detS.resDeltaRow}>
      <Ionicons name={icon as any} size={12} color={color} />
      <Text style={[detS.resDeltaLabel, { color }]}>{label}</Text>
      <Text style={detS.resDeltaValues}>{start}{unit}</Text>
      <Ionicons name="arrow-forward-outline" size={8} color={TACTICAL.textMuted} />
      <Text style={detS.resDeltaValues}>{end}{unit}</Text>
      <Text style={[detS.resDeltaDelta, { color: deltaColor }]}>
        {delta > 0 ? '+' : ''}{delta}{unit}
      </Text>
    </View>
  );
}

const detS = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 4 },
  section: { fontSize: 10, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 2, marginTop: 12, marginBottom: 8 },
  divider: { height: 1, backgroundColor: TACTICAL.border, marginVertical: 8 },

  // Status card
  statusCard: { backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 10, borderWidth: 1, borderColor: TACTICAL.border, padding: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: TACTICAL.textMuted },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  linkedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, backgroundColor: 'rgba(212,160,23,0.08)', borderWidth: 1, borderColor: 'rgba(212,160,23,0.2)' },
  linkedText: { fontSize: 7, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1 },

  // Stats grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  statBlock: { width: '47%', alignItems: 'center', paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.1)', borderWidth: 1, borderColor: 'rgba(30,35,43,0.4)' },
  statBlockLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  statBlockValue: { fontSize: 14, fontWeight: '900', fontFamily: 'Courier', marginTop: 2 },

  // Last event
  lastEventRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.08)', marginBottom: 8 },
  lastEventText: { fontSize: 10, color: TACTICAL.text, flex: 1 },

  // Controls
  controlRow: { flexDirection: 'row', gap: 8 },
  startBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, backgroundColor: TACTICAL.amber },
  startBtnText: { fontSize: 10, fontWeight: '900', color: '#0B0F12', letterSpacing: 1.5 },
  pauseBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.2)', borderWidth: 1, borderColor: TACTICAL.border },
  ctrlBtnText: { fontSize: 10, fontWeight: '800', color: TACTICAL.text, letterSpacing: 1 },
  resumeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8, backgroundColor: TACTICAL.amber },
  resumeBtnText: { fontSize: 10, fontWeight: '900', color: '#0B0F12', letterSpacing: 1.5 },
  stopBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: 'rgba(239,83,80,0.08)', borderWidth: 1, borderColor: 'rgba(239,83,80,0.3)' },
  stopBtnText: { fontSize: 10, fontWeight: '800', color: '#EF5350', letterSpacing: 1 },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 13, fontWeight: '700', color: TACTICAL.text },
  emptySub: { fontSize: 10, color: TACTICAL.textMuted, textAlign: 'center', lineHeight: 16 },

  // Trip cards
  tripCard: { backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 10, borderWidth: 1, borderColor: TACTICAL.border, padding: 10, marginBottom: 6 },
  tripCardSelected: { borderColor: 'rgba(212,160,23,0.3)', backgroundColor: 'rgba(212,160,23,0.03)' },
  tripHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  tripName: { fontSize: 13, fontWeight: '800', color: TACTICAL.text },
  tripDate: { fontSize: 9, color: TACTICAL.textMuted, marginTop: 2 },
  vehicleBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, backgroundColor: 'rgba(212,160,23,0.08)', borderWidth: 1, borderColor: 'rgba(212,160,23,0.2)' },
  vehicleText: { fontSize: 8, fontWeight: '700', color: TACTICAL.amber },
  tripStatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  tripStat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  tripStatValue: { fontSize: 10, fontWeight: '800', fontFamily: 'Courier' },
  tripFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tripFooterText: { fontSize: 9, color: TACTICAL.textMuted, flex: 1 },
  remBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, backgroundColor: 'rgba(255,152,0,0.08)', borderWidth: 1, borderColor: 'rgba(255,152,0,0.2)' },
  remText: { fontSize: 8, fontWeight: '800', color: '#FF9800' },
  deleteBtn: { padding: 4 },
  moreText: { fontSize: 10, color: TACTICAL.textMuted, textAlign: 'center', marginTop: 4 },

  // Expanded detail
  expandedDetail: { marginTop: 6 },
  expandDivider: { height: 1, backgroundColor: 'rgba(212,160,23,0.15)', marginBottom: 8 },
  expandSection: { fontSize: 8, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1.5, marginBottom: 6, marginTop: 4 },

  // Resource deltas
  resDeltaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  resDeltaLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, width: 50 },
  resDeltaValues: { fontSize: 10, fontWeight: '700', color: TACTICAL.text, fontFamily: 'Courier' },
  resDeltaDelta: { fontSize: 10, fontWeight: '900', fontFamily: 'Courier', marginLeft: 'auto' },

  // Event chips
  eventChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  eventChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.1)', borderWidth: 1, borderColor: 'rgba(30,35,43,0.4)' },
  eventChipText: { fontSize: 10, fontWeight: '900', fontFamily: 'Courier' },

  // Notes
  notesText: { fontSize: 11, color: TACTICAL.text, lineHeight: 17 },

  // Settings
  settingsCard: { backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: TACTICAL.border },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  settingLabel: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.5 },
  settingValue: { fontSize: 10, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier' },
});



