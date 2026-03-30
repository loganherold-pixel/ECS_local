import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Platform, ScrollView, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../components/SafeIcon';

import { supabase } from '../lib/supabase';
import { TACTICAL } from '../lib/theme';
import { useApp } from '../context/AppContext';

import TopoBackground from '../components/TopoBackground';
import AttitudeMonitorWidget from '../components/detail/AttitudeMonitorWidget';
import NarrativeTimeline from '../components/narrative/NarrativeTimeline';
import ExpeditionTileCacheCard from '../components/expedition/ExpeditionTileCacheCard';

import AttitudeSettingsPanel from '../components/detail/AttitudeSettingsPanel';
import VehicleHealthPanel from '../components/vehicle-health/VehicleHealthPanel';
import WeatherIntelPanel from '../components/weather/WeatherIntelPanel';

import { buildLoadModules, type LoadModule, type ZoneWeightData } from '../lib/stabilityEngine';
import { fetchVehicleZones } from '../lib/fetchVehicleZones';
import { useAccelerometer } from '../lib/useAccelerometer';
import { expeditionStore } from '../lib/expeditionCommandStore';

import type { EcsExpedition } from '../lib/expeditionTypes';
import type { VehicleZone } from '../lib/types';
import type { WeatherCoordinate } from '../lib/weatherTypes';



// ── Persistence for advanced stability toggle ──────────────
const ADV_KEY = 'ecs_advanced_stability';
function getPersistedAdv(): boolean {
  try { if (typeof localStorage !== 'undefined') return localStorage.getItem(ADV_KEY) === 'true'; } catch {} return false;
}
function setPersistedAdv(v: boolean): void {
  try { if (typeof localStorage !== 'undefined') { v ? localStorage.setItem(ADV_KEY, 'true') : localStorage.removeItem(ADV_KEY); } } catch {}
}

type TabKey = 'expedition' | 'vehicle' | 'emergency';
type ExpeditionRow = { id: string; title?: string | null; vehicle_id?: string | null; created_at?: string | null; updated_at?: string | null; };

type VehicleRow = { id: string; name: string; make?: string | null; model?: string | null; year?: number | null; fuel_tank_capacity_gal?: number | null; avg_mpg?: number | null; current_fuel_percent?: number | null; water_capacity_gal?: number | null; current_water_gal?: number | null; notes?: string | null; };

function formatVehicleMeta(v?: VehicleRow | null) { if (!v) return 'Not set'; return [v.year, v.make, v.model].filter(Boolean).join(' ') || 'No details'; }
function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function toFixedOrDash(n?: number | string | null, d = 0) { if (n == null) return '--'; const num = typeof n === 'number' ? n : Number(n); if (Number.isNaN(num) || !Number.isFinite(num)) return '--'; return num.toFixed(d); }


function WidgetCard({ title, icon, children, onPress }: { title: string; icon: string; children: React.ReactNode; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.widgetCard} activeOpacity={onPress ? 0.85 : 1} onPress={onPress} disabled={!onPress}>
      <View style={styles.widgetHeader}>
        <Ionicons name={icon as any} size={14} color={TACTICAL.amber} />
        <Text style={styles.widgetTitle}>{title}</Text>
      </View>
      <View style={styles.widgetBody}>{children}</View>
    </TouchableOpacity>
  );
}

export default function ExpeditionDetailScreen() {
  const router = useRouter();
  const { user } = useApp();
  const params = useLocalSearchParams<{ expeditionId?: string; id?: string }>();
  const expeditionId = useMemo(() => params.expeditionId || params.id || '', [params]);

  // ── Mounted ref for memory leak prevention ────────────────
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const [tab, setTab] = useState<TabKey>('expedition');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expedition, setExpedition] = useState<ExpeditionRow | null>(null);
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [waypointCoords, setWaypointCoords] = useState<WeatherCoordinate[]>([]);

  // ── Advanced Stability Modeling ────────────────────────
  const [advancedEnabled, setAdvancedEnabled] = useState(getPersistedAdv);
  const [loadModules, setLoadModules] = useState<LoadModule[]>([]);
  const [zoneWeights, setZoneWeights] = useState<ZoneWeightData[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAdvancedToggle = useCallback((value: boolean) => {
    setAdvancedEnabled(value);
    setPersistedAdv(value);
  }, []);

  // ── Accelerometer Integration ──────────────────────────
  // Only enable accelerometer when on the expedition tab
  const accelEnabled = tab === 'expedition';
  const accel = useAccelerometer(accelEnabled);

  // Fetch zone weight data when advanced mode is enabled
  const fetchZoneWeightData = useCallback(async (vehicleId: string) => {
    try {
      const result = await fetchVehicleZones(vehicleId);
      if (!mountedRef.current) return;
      const zones = result.flat || [];
      const { data: items } = await supabase
        .from('loadout_items')
        .select('name, category, quantity, weight_lbs, storage_location')
        .eq('owner_user_id', user?.id || '')
        .order('sort_order');
      if (!mountedRef.current) return;
      const loadoutItems = (items || []) as Array<{ name: string; category: string; quantity: number; weight_lbs: number | null; storage_location: string | null; }>;

      const zoneData: ZoneWeightData[] = zones.map((zone: VehicleZone) => {
        const zoneName = (zone as any).name || '';
        const zoneNameLC = zoneName.toLowerCase();
        const zoneItems = loadoutItems.filter(item => item.storage_location && item.storage_location.toLowerCase().includes(zoneNameLC));
        const totalWeight = zoneItems.reduce((sum, item) => sum + ((item.weight_lbs || 0) * (item.quantity || 1)), 0);
        const isWater = zoneNameLC.includes('water') || zoneNameLC.includes('tank');
        return { zoneName, totalWeightLbs: totalWeight, isWaterTank: isWater, waterFillPct: isWater ? 0.8 : undefined };
      });
      setZoneWeights(zoneData);
    } catch (err) {
      console.warn('[Stability] Failed to fetch zone weights:', err);
      if (mountedRef.current) setZoneWeights([]);
    }
  }, [user?.id]);


  // Debounced load module computation
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (advancedEnabled && zoneWeights.length > 0) setLoadModules(buildLoadModules(zoneWeights));
      else setLoadModules([]);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [advancedEnabled, zoneWeights]);

  // Fetch zone data when advanced mode is enabled and vehicle changes
  useEffect(() => {
    if (advancedEnabled && vehicle?.id) fetchZoneWeightData(vehicle.id);
    else if (!advancedEnabled) { setZoneWeights([]); setLoadModules([]); }
  }, [advancedEnabled, vehicle?.id, fetchZoneWeightData]);

  const hasSufficientData = useMemo(() => loadModules.filter(m => m.weightLbs > 0).length >= 2, [loadModules]);

  // ── Fetch expedition data ─────────────────────────────
  // Uses expeditionStore.getById() which queries ecs_expeditions (the correct table).
  // Falls back to local cache for offline-created expeditions.
  const fetchExpedition = useCallback(async () => {
    if (!user || !expeditionId) return;
    if (mountedRef.current) setLoading(true);
    try {
      // 1. Try fetching from ecs_expeditions via the command store
      let expData: EcsExpedition | null = await expeditionStore.getById(expeditionId, user.id);


      // 2. If not found in remote DB, check local cache (offline-created expeditions)
      if (!expData) {
        try {
          const raw = typeof localStorage !== 'undefined'
            ? localStorage.getItem(`ecs_cmd_pending_expedition_${expeditionId}`)
            : null;
          if (raw) expData = JSON.parse(raw) as EcsExpedition;
        } catch {}
      }

      if (!mountedRef.current) return;

      if (!expData) {
        // Expedition not found anywhere — show graceful empty state instead of error
        console.warn('[expedition-detail] Expedition not found:', expeditionId);
        setExpedition({ id: expeditionId, title: 'New Expedition', vehicle_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        setVehicle(null);
        if (mountedRef.current) setLoading(false);
        return;
      }

      setExpedition({
        id: expData.id,
        title: expData.title,
        vehicle_id: expData.vehicle_id,
        created_at: expData.created_at,
        updated_at: expData.updated_at,
      });

      // Fetch linked vehicle if present
      if (expData.vehicle_id) {
        try {
          const { data: vehData, error: vehErr } = await supabase
            .from('vehicles')
            .select('id, name, make, model, year, fuel_tank_capacity_gal, avg_mpg, current_fuel_percent, water_capacity_gal, current_water_gal, notes')
            .eq('id', expData.vehicle_id)
            .single();
          if (!mountedRef.current) return;
          if (!vehErr && vehData) {
            setVehicle(vehData as any);
          } else {
            // Vehicle not found — may not exist yet or was deleted
            console.warn('[expedition-detail] Vehicle not found:', expData.vehicle_id);
            setVehicle(null);
          }
        } catch (vehErr) {
          console.warn('[expedition-detail] Vehicle fetch error:', vehErr);
          if (mountedRef.current) setVehicle(null);
        }
      } else {
        setVehicle(null);
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      console.error('[expedition-detail] fetch error:', err);
      // Don't show alert for non-critical errors — just set empty state
      setExpedition({ id: expeditionId, title: 'Expedition', vehicle_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      setVehicle(null);
    }
    if (mountedRef.current) setLoading(false);
  }, [user, expeditionId]);



  const refresh = useCallback(async () => {
    if (!user || !expeditionId) return;
    if (mountedRef.current) setRefreshing(true);
    await fetchExpedition();
    if (mountedRef.current) setRefreshing(false);
  }, [fetchExpedition, user, expeditionId]);

  useEffect(() => { fetchExpedition(); }, [fetchExpedition]);

  // ── Fetch waypoint coordinates for weather ─────────────
  useEffect(() => {
    if (!user || !expeditionId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: wps } = await supabase
          .from('expedition_waypoints')
          .select('name, latitude, longitude, order_index')
          .eq('expedition_id', expeditionId)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .order('order_index');
        if (cancelled || !mountedRef.current) return;
        if (wps && wps.length > 0) {
          const coords: WeatherCoordinate[] = wps
            .filter((w: any) => w.latitude != null && w.longitude != null)
            .map((w: any) => ({
              lat: w.latitude,
              lng: w.longitude,
              label: w.name || `WP ${w.order_index + 1}`,
            }));
          setWaypointCoords(coords);
        }
      } catch (err) {
        console.warn('[Weather] Failed to fetch waypoints:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [user, expeditionId]);




  const expeditionTitle = expedition?.title || 'New Trip';

  const handleOpenVehicleConfig = useCallback(() => {
    if (!expeditionId) return;
    router.navigate({ pathname: '/(tabs)/vehicle-config', params: { expeditionId } } as any);
  }, [router, expeditionId]);

  // Derived stats — coerce to number to handle string values from DB/cache
  const fuelCapacity = vehicle?.fuel_tank_capacity_gal != null ? Number(vehicle.fuel_tank_capacity_gal) : null;
  const fuelPercent = vehicle?.current_fuel_percent != null ? Number(vehicle.current_fuel_percent) : null;
  const avgMpg = vehicle?.avg_mpg != null ? Number(vehicle.avg_mpg) : null;
  const estRangeMiles = useMemo(() => {
    if (fuelCapacity == null || fuelPercent == null || avgMpg == null) return null;
    if (Number.isNaN(fuelCapacity) || Number.isNaN(fuelPercent) || Number.isNaN(avgMpg)) return null;
    return fuelCapacity * clamp(fuelPercent / 100, 0, 1) * avgMpg;
  }, [fuelCapacity, fuelPercent, avgMpg]);
  const waterCapacity = vehicle?.water_capacity_gal != null ? Number(vehicle.water_capacity_gal) : null;
  const currentWater = vehicle?.current_water_gal != null ? Number(vehicle.current_water_gal) : null;
  const dailyUse = 1.0;
  const estWaterDays = useMemo(() => {
    const available = currentWater ?? waterCapacity;
    if (available == null || Number.isNaN(available) || !dailyUse) return null;
    return available / dailyUse;
  }, [currentWater, waterCapacity]);


  if (!user) return null;

  return (
    <TopoBackground>
      <View style={styles.container}>
        {/* Top header */}
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <View style={styles.dot} />
            <Text style={styles.tripTitle}>{expeditionTitle}</Text>
          </View>
          <TouchableOpacity style={styles.profileBtn} onPress={() => router.push('/settings' as any)} activeOpacity={0.85}>
            <Ionicons name="person-circle-outline" size={22} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabsRow}>
          {(['expedition', 'vehicle', 'emergency'] as TabKey[]).map(t => {
            const icons: Record<TabKey, string> = { expedition: 'compass-outline', vehicle: 'car-outline', emergency: 'shield-outline' };
            const labels: Record<TabKey, string> = { expedition: 'EXPEDITION', vehicle: 'VEHICLE', emergency: 'EMERGENCY' };
            const isActive = tab === t;
            return (
              <TouchableOpacity key={t} style={[styles.tabPill, isActive && styles.tabPillActive]} onPress={() => setTab(t)} activeOpacity={0.85}>
                <Ionicons name={icons[t] as any} size={14} color={isActive ? TACTICAL.amber : TACTICAL.textMuted} />
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{labels[t]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={TACTICAL.accent} />
            <Text style={styles.loadingText}>LOADING TRIP...</Text>
          </View>
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

            {/* ═══════════ EXPEDITION TAB ═══════════ */}
            {tab === 'expedition' && (
              <>
                {/* Vehicle Configure CTA */}
                <TouchableOpacity style={styles.vehicleConfigureCard} onPress={handleOpenVehicleConfig} activeOpacity={0.85}>
                  <View style={styles.vehicleConfigureLeft}>
                    <View style={styles.vehicleConfigureIcon}>
                      <Ionicons name="car-sport-outline" size={18} color={TACTICAL.amber} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.vehicleConfigureTitle}>VEHICLE CONFIGURE</Text>
                      <Text style={styles.vehicleConfigureSubtitle}>
                        {vehicle ? `${vehicle.name} • ${formatVehicleMeta(vehicle)}` : 'No vehicle linked — tap to add/select one'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.vehicleConfigureRight}>
                    <View style={[styles.badge, vehicle ? styles.badgeSet : styles.badgeNotSet]}>
                      <Text style={styles.badgeText}>{vehicle ? 'SET' : 'NOT SET'}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={TACTICAL.textMuted} />
                  </View>
                </TouchableOpacity>

                {/* ── Attitude Monitor Settings ── */}
                <AttitudeSettingsPanel
                  advancedEnabled={advancedEnabled}
                  onToggle={handleAdvancedToggle}
                  hasSufficientData={hasSufficientData}
                />

                {/* ── Attitude Monitor Widget ── */}
                <AttitudeMonitorWidget
                  advancedEnabled={advancedEnabled}
                  loadModules={loadModules}
                  rollAngleDeg={accel.rollDeg}
                  pitchAngleDeg={accel.pitchDeg}
                  sensorStatus={accel.sensorStatus}
                  isCalibrated={accel.isCalibrated}
                  onCalibrate={accel.calibrate}
                  onResetCalibration={accel.resetCalibration}
                />

                {/* Widgets grid */}
                <View style={styles.widgetsGrid}>
                  <WidgetCard title="Fuel Range" icon="flame-outline">
                    <View style={styles.widgetRow}>
                      <Text style={styles.widgetBig}>{estRangeMiles == null ? '--' : toFixedOrDash(estRangeMiles, 0)}</Text>
                      <Text style={styles.widgetUnit}>mi</Text>
                    </View>
                    <View style={styles.widgetMeta}><Text style={styles.widgetMetaLabel}>RANGE</Text><Text style={styles.widgetMetaValue}>{estRangeMiles == null ? '--' : `${toFixedOrDash(estRangeMiles, 0)} mi`}</Text></View>
                    <View style={styles.widgetMeta}><Text style={styles.widgetMetaLabel}>DAILY</Text><Text style={styles.widgetMetaValue}>--</Text></View>
                  </WidgetCard>

                  <WidgetCard title="Water Projection" icon="water-outline">
                    <View style={styles.widgetRow}>
                      <Text style={styles.widgetBig}>{estWaterDays == null ? '--' : toFixedOrDash(estWaterDays, 1)}</Text>
                      <Text style={styles.widgetUnit}>days</Text>
                    </View>
                    <View style={styles.widgetMeta}><Text style={styles.widgetMetaLabel}>CAPACITY</Text><Text style={styles.widgetMetaValue}>{waterCapacity == null ? '--' : `${toFixedOrDash(waterCapacity, 1)} gal`}</Text></View>
                    <View style={styles.widgetMeta}><Text style={styles.widgetMetaLabel}>DAILY USE</Text><Text style={styles.widgetMetaValue}>{dailyUse.toFixed(1)} gal</Text></View>
                  </WidgetCard>

                  <WidgetCard title="Route Progress" icon="paper-plane-outline">
                    <View style={styles.widgetRow}><Text style={styles.widgetBig}>0.0</Text><Text style={styles.widgetUnit}>mi</Text></View>
                    <View style={styles.widgetMeta}><Text style={styles.widgetMetaLabel}>COVERED</Text><Text style={styles.widgetMetaValue}>0.0 mi</Text></View>
                    <View style={styles.widgetMeta}><Text style={styles.widgetMetaLabel}>WAYPOINTS</Text><Text style={styles.widgetMetaValue}>0</Text></View>
                  </WidgetCard>

                  <WidgetCard title="Emergency Contact" icon="shield-outline">
                    <Text style={styles.emergencyTitle}>EMERGENCY</Text>
                    <View style={styles.widgetMeta}><Text style={styles.widgetMetaLabel}>CONTACT</Text><Text style={styles.widgetMetaValue} numberOfLines={1}>Not set</Text></View>
                    <View style={styles.widgetMeta}><Text style={styles.widgetMetaLabel}>TEAM</Text><Text style={styles.widgetMetaValue}>1 person</Text></View>
                    <View style={styles.widgetMeta}><Text style={styles.widgetMetaLabel}>COMMS</Text><Text style={styles.widgetMetaValue}>LIMITED</Text></View>
                  </WidgetCard>
                </View>

                {/* ── Offline Map Tile Pre-Cache ── */}
                {waypointCoords.length >= 2 && expeditionId ? (
                  <ExpeditionTileCacheCard
                    expeditionId={expeditionId}
                    expeditionTitle={expeditionTitle}
                    waypointCoords={waypointCoords}
                  />
                ) : null}


                {/* ── Weather Intelligence Panel ── */}
                <WeatherIntelPanel
                  coordinates={waypointCoords}
                  locationLabel={expeditionTitle}
                  autoFetch={true}
                  compact={false}
                />

                {/* ── Expedition Timeline ── */}
                {expeditionId ? (
                  <NarrativeTimeline
                    expeditionId={expeditionId}
                    loadFromServer={true}
                  />
                ) : null}

                <Text style={styles.hintText}>Long press any widget to enter layout mode</Text>
                <View style={{ height: 120 }} />

              </>
            )}


            {/* ═══════════ VEHICLE TAB ═══════════ */}
            {tab === 'vehicle' && (
              <>
                <View style={styles.sectionHeader}>
                  <Ionicons name="car-outline" size={16} color={TACTICAL.amber} />
                  <Text style={styles.sectionTitle}>VEHICLE</Text>
                  <TouchableOpacity style={styles.refreshBtn} onPress={refresh} disabled={refreshing} activeOpacity={0.85}>
                    {refreshing ? <ActivityIndicator size="small" color={TACTICAL.textMuted} /> : <Ionicons name="refresh-outline" size={16} color={TACTICAL.textMuted} />}
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.vehicleConfigureCard} onPress={handleOpenVehicleConfig} activeOpacity={0.85}>
                  <View style={styles.vehicleConfigureLeft}>
                    <View style={styles.vehicleConfigureIcon}><Ionicons name="settings-outline" size={18} color={TACTICAL.amber} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.vehicleConfigureTitle}>{vehicle ? 'CHANGE / EDIT VEHICLE' : 'ADD / SELECT VEHICLE'}</Text>
                      <Text style={styles.vehicleConfigureSubtitle}>{vehicle ? `${vehicle.name} • ${formatVehicleMeta(vehicle)}` : 'No vehicle linked to this expedition'}</Text>
                    </View>
                  </View>
                  <View style={styles.vehicleConfigureRight}><Ionicons name="chevron-forward" size={18} color={TACTICAL.textMuted} /></View>
                </TouchableOpacity>

                {vehicle ? (
                  <View style={styles.detailPanel}>
                    <Text style={styles.detailTitle}>{vehicle.name}</Text>
                    <Text style={styles.detailSub}>{formatVehicleMeta(vehicle)}</Text>
                    <View style={styles.detailRow}><Text style={styles.detailLabel}>Fuel Tank</Text><Text style={styles.detailValue}>{vehicle.fuel_tank_capacity_gal == null ? '--' : `${toFixedOrDash(vehicle.fuel_tank_capacity_gal, 1)} gal`}</Text></View>
                    <View style={styles.detailRow}><Text style={styles.detailLabel}>Avg MPG</Text><Text style={styles.detailValue}>{vehicle.avg_mpg == null ? '--' : `${toFixedOrDash(vehicle.avg_mpg, 1)} mpg`}</Text></View>
                    <View style={styles.detailRow}><Text style={styles.detailLabel}>Fuel %</Text><Text style={styles.detailValue}>{vehicle.current_fuel_percent == null ? '--' : `${toFixedOrDash(vehicle.current_fuel_percent, 0)}%`}</Text></View>
                    <View style={styles.detailRow}><Text style={styles.detailLabel}>Water Capacity</Text><Text style={styles.detailValue}>{vehicle.water_capacity_gal == null ? '--' : `${toFixedOrDash(vehicle.water_capacity_gal, 1)} gal`}</Text></View>
                    <View style={styles.detailRow}><Text style={styles.detailLabel}>Current Water</Text><Text style={styles.detailValue}>{vehicle.current_water_gal == null ? '--' : `${toFixedOrDash(vehicle.current_water_gal, 1)} gal`}</Text></View>
                    {!!vehicle.notes && (<View style={styles.notesBox}><Ionicons name="document-text-outline" size={14} color={TACTICAL.textMuted} /><Text style={styles.notesText}>{vehicle.notes}</Text></View>)}
                  </View>
                ) : (
                  <View style={styles.emptyPanel}>
                    <Ionicons name="car-outline" size={34} color={TACTICAL.textMuted} />
                    <Text style={styles.emptyTitle}>NO VEHICLE LINKED</Text>
                    <Text style={styles.emptySub}>Tap Vehicle Configure to add/select a vehicle for this expedition.</Text>
                  </View>
                )}

                {/* ── Vehicle Health & Maintenance ── */}
                {vehicle && (
                  <VehicleHealthPanel
                    vehicleId={vehicle.id}
                    expeditionId={expeditionId}
                  />
                )}

                <View style={{ height: 120 }} />
              </>
            )}


            {/* ═══════════ EMERGENCY TAB ═══════════ */}
            {tab === 'emergency' && (
              <>
                <View style={styles.sectionHeader}>
                  <Ionicons name="shield-outline" size={16} color={TACTICAL.amber} />
                  <Text style={styles.sectionTitle}>EMERGENCY</Text>
                </View>
                <View style={styles.detailPanel}>
                  <Text style={styles.detailTitle}>Emergency Profile</Text>
                  <Text style={styles.detailSub}>Configure contacts, comms, and fail-safes.</Text>
                  <View style={styles.detailRow}><Text style={styles.detailLabel}>Primary Contact</Text><Text style={styles.detailValue}>Not set</Text></View>
                  <View style={styles.detailRow}><Text style={styles.detailLabel}>Team</Text><Text style={styles.detailValue}>1 person</Text></View>
                  <View style={styles.detailRow}><Text style={styles.detailLabel}>Comms</Text><Text style={styles.detailValue}>LIMITED</Text></View>
                  <TouchableOpacity style={styles.primaryBtn} onPress={() => Alert.alert('Next', 'Emergency configuration screen is next.')} activeOpacity={0.85}>
                    <Ionicons name="settings-outline" size={16} color="#0B0F12" />
                    <Text style={styles.primaryBtnText}>CONFIGURE EMERGENCY</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ height: 120 }} />
              </>
            )}
          </ScrollView>
        )}
      </View>
    </TopoBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { paddingTop: Platform.OS === 'web' ? 18 : 54, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4CAF50' },
  tripTitle: { fontSize: 14, fontWeight: '800', color: TACTICAL.text, letterSpacing: 0.3 },
  profileBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tabsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(62, 79, 60, 0.22)' },
  tabPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: 'rgba(62, 79, 60, 0.25)' },
  tabPillActive: { borderColor: TACTICAL.amber, backgroundColor: 'rgba(196, 138, 44, 0.08)' },
  tabText: { fontSize: 10, fontWeight: '900', color: TACTICAL.textMuted, letterSpacing: 1.2 },
  tabTextActive: { color: TACTICAL.amber },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 12, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1.5 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.5, flex: 1 },
  refreshBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: 'rgba(62, 79, 60, 0.25)', alignItems: 'center', justifyContent: 'center' },
  vehicleConfigureCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: 'rgba(196, 138, 44, 0.35)', marginBottom: 14 },
  vehicleConfigureLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  vehicleConfigureIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(196, 138, 44, 0.12)', borderWidth: 1, borderColor: 'rgba(196, 138, 44, 0.28)' },
  vehicleConfigureTitle: { fontSize: 12, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.3 },
  vehicleConfigureSubtitle: { fontSize: 11, color: TACTICAL.textMuted, marginTop: 3 },
  vehicleConfigureRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  badgeSet: { backgroundColor: 'rgba(76, 175, 80, 0.10)', borderColor: 'rgba(76, 175, 80, 0.35)' },
  badgeNotSet: { backgroundColor: 'rgba(192, 57, 43, 0.10)', borderColor: 'rgba(192, 57, 43, 0.35)' },
  badgeText: { fontSize: 9, fontWeight: '900', color: TACTICAL.textMuted, letterSpacing: 1.2 },
  widgetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', marginTop: 6 },
  widgetCard: { width: '48%', borderRadius: 14, padding: 12, backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: 'rgba(62, 79, 60, 0.35)', minHeight: 130 },
  widgetHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  widgetTitle: { fontSize: 11, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.2, flex: 1 },
  widgetBody: { flex: 1 },
  widgetRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 10 },
  widgetBig: { fontSize: 22, fontWeight: '900', color: TACTICAL.text, fontFamily: 'Courier' },
  widgetUnit: { fontSize: 11, fontWeight: '800', color: TACTICAL.textMuted, marginBottom: 3 },
  widgetMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  widgetMetaLabel: { fontSize: 9, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1.1 },
  widgetMetaValue: { fontSize: 10, fontWeight: '700', color: TACTICAL.text, fontFamily: 'Courier' },
  emergencyTitle: { fontSize: 12, fontWeight: '900', color: '#E74C3C', letterSpacing: 1.4, marginBottom: 8 },
  hintText: { textAlign: 'center', fontSize: 10, color: 'rgba(138,138,133,0.55)', marginTop: 18, letterSpacing: 0.4 },
  detailPanel: { marginTop: 12, backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(62, 79, 60, 0.35)', padding: 14 },
  detailTitle: { fontSize: 14, fontWeight: '900', color: TACTICAL.text, letterSpacing: 0.4 },
  detailSub: { fontSize: 11, color: TACTICAL.textMuted, marginTop: 3, marginBottom: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(62, 79, 60, 0.18)' },
  detailLabel: { fontSize: 10, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 0.8 },
  detailValue: { fontSize: 12, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier' },
  notesBox: { flexDirection: 'row', gap: 10, marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: 'rgba(62, 79, 60, 0.10)', borderWidth: 1, borderColor: 'rgba(62, 79, 60, 0.25)' },
  notesText: { flex: 1, fontSize: 11, color: TACTICAL.textMuted, lineHeight: 16 },
  emptyPanel: { marginTop: 12, padding: 22, borderRadius: 14, alignItems: 'center', gap: 10, backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: 'rgba(62, 79, 60, 0.35)' },
  emptyTitle: { fontSize: 12, fontWeight: '900', color: TACTICAL.textMuted, letterSpacing: 1.1 },
  emptySub: { fontSize: 11, color: TACTICAL.textMuted, textAlign: 'center', lineHeight: 16 },
  primaryBtn: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: TACTICAL.amber },
  primaryBtnText: { fontSize: 12, fontWeight: '900', color: '#0B0F12', letterSpacing: 1.2 },
});




