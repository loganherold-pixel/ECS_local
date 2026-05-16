/**
 * Load Map Screen — Offline-First with Weight Tracking
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';

import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import TabErrorBoundary from '../../components/TabErrorBoundary';
import TopoBackground from '../../components/TopoBackground';
import VehicleSilhouette from '../../components/loadmap/VehicleSilhouette';
import type { SilhouetteZone } from '../../components/loadmap/VehicleSilhouette';
import ZoneDetailModal from '../../components/loadmap/ZoneDetailModal';
import type { ZoneInfo, ZoneItem } from '../../components/loadmap/ZoneDetailModal';
import { NON_OBSTRUCTIVE_REFRESH_CONTROL_PROPS } from '../../lib/nonObstructiveRefreshControl';

import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';

import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import { ecsLog } from '../../lib/ecsLogger';
import { fetchVehicleZones } from '../../lib/fetchVehicleZones';
import { vehicleStore } from '../../lib/vehicleStore';
import { setCachedVehicleZones, setBuilderState, getBuilderState, type CachedZone } from '../../lib/expeditionCache';
import type { VehicleZone, Vehicle, LoadoutItem } from '../../lib/types';

import { useApp } from '../../context/AppContext';

interface VehicleWithConfig extends Vehicle {
  wizard_config?: Record<string, string> | null;
  zones?: any[] | null;
}

function LoadMapScreenInner() {
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const router = useRouter();
  const { user, showToast } = useApp();

  const [vehicles, setVehicles] = useState<VehicleWithConfig[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [vehicleZones, setVehicleZones] = useState<VehicleZone[]>([]);
  const [loadoutItems, setLoadoutItems] = useState<LoadoutItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [zoneDataStatus, setZoneDataStatus] = useState<'ready' | 'empty' | 'error'>('empty');
  const [zoneDataMessage, setZoneDataMessage] = useState('No load zones configured yet.');

  const [selectedZone, setSelectedZone] = useState<ZoneInfo | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // ── Fetch vehicles (offline-first) ────────────────────
  const fetchVehicles = useCallback(async () => {
    try {
      const { vehicles: data } = await vehicleStore.getAll(user?.id || null);
      if (!mountedRef.current) return;

      const vehicleList = (data || []) as VehicleWithConfig[];
      setVehicles(vehicleList);

      if (!selectedVehicleId && vehicleList.length > 0) {
        const configured = vehicleList.find(v => v.wizard_config || (v as any).zones);
        if (configured) {
          setSelectedVehicleId(configured.id);
        } else {
          setSelectedVehicleId(vehicleList[0].id);
        }
      }
    } catch (err) {
      console.warn('[LoadMap] fetchVehicles error:', err);
    }

    if (mountedRef.current) setLoading(false);
  }, [user, selectedVehicleId]);

  // ── Fetch zones (offline-first with cache) ────────────
  const fetchZones = useCallback(async (vehicleId: string) => {
    if (mountedRef.current) setZonesLoading(true);

    try {
      const result = await fetchVehicleZones(vehicleId);
      if (!mountedRef.current) return;

      const flatZones = result.flat || [];
      setVehicleZones(flatZones);
      setZoneDataStatus(flatZones.length > 0 ? 'ready' : 'empty');
      setZoneDataMessage(
        flatZones.length > 0
          ? ''
          : 'No load zones configured yet. Add build/loadout data to populate the load map.'
      );

      // Bridge: write to expedition cache for builder flow persistence
      if (flatZones.length > 0) {
        const cachedZones: CachedZone[] = flatZones.map((z: any, i: number) => ({
          id: z.id || `zone_${i}`,
          name: z.name || z.zone_name || 'Zone',
          zone_type: z.zone_type || 'area',
          slot_count: typeof z.slot_count === 'number' ? z.slot_count : 0,
          color: z.color || null,
          icon: z.icon || null,
          sort_order: typeof z.sort_order === 'number' ? z.sort_order : i,
        }));
        setCachedVehicleZones(vehicleId, cachedZones);

        const bs = getBuilderState();
        if (bs.vehicleId === vehicleId && !bs.zonesConfigured) {
          setBuilderState({
            zonesConfigured: true,
            zoneCount: cachedZones.length,
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ecsLog.warn('MAP', '[LoadMap] Failed to fetch vehicle zones', {
        vehicleId,
        error: message,
      });
      if (mountedRef.current) {
        setZoneDataStatus('error');
        setZoneDataMessage('Zone data could not be loaded. Pull to refresh or update vehicle setup.');
      }
      if (mountedRef.current) setVehicleZones([]);
    }

    if (mountedRef.current) setZonesLoading(false);
  }, []);

  // ── Fetch loadout items ───────────────────────────────
  const fetchLoadoutItems = useCallback(async (vehicleId?: string | null) => {
    try {
      const { loadoutStore, loadoutItemStore } = await import('../../lib/loadoutStore');
      const loadoutIds: string[] = [];
      if (vehicleId) {
        const { loadouts } = await loadoutStore.getByVehicleId(vehicleId, user?.id || null);
        loadoutIds.push(...loadouts.map((loadout: any) => loadout.id).filter(Boolean));
      }
      const items = (
        await Promise.all(loadoutIds.map((loadoutId) =>
          loadoutItemStore.getByLoadoutId(loadoutId, user?.id || null)
        ))
      ).flat();
      if (mountedRef.current) {
        setLoadoutItems(items as LoadoutItem[]);
      }
    } catch (err) {
      console.warn('[LoadMap] fetchLoadoutItems error:', err);
      if (mountedRef.current) setLoadoutItems([]);
    }
  }, [user?.id]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchVehicles();
    };
    init();
  }, [fetchVehicles]);

  useEffect(() => {
    if (selectedVehicleId) {
      fetchZones(selectedVehicleId);
      fetchLoadoutItems(selectedVehicleId);
    }
  }, [selectedVehicleId, fetchZones, fetchLoadoutItems]);

  useFocusEffect(
    useCallback(() => {
      if (selectedVehicleId) {
        fetchZones(selectedVehicleId);
        fetchLoadoutItems(selectedVehicleId);
      }
    }, [selectedVehicleId, fetchZones, fetchLoadoutItems])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchVehicles();
    if (selectedVehicleId) {
      await fetchZones(selectedVehicleId);
      await fetchLoadoutItems(selectedVehicleId);
    }
    setRefreshing(false);
  };

  const selectedVehicle = useMemo(
    () => vehicles.find(v => v.id === selectedVehicleId) || null,
    [vehicles, selectedVehicleId]
  );

  const vehicleType = useMemo(() => {
    if (!selectedVehicle?.wizard_config) return 'truck';
    return (selectedVehicle.wizard_config as any)?.vehicle_type || 'truck';
  }, [selectedVehicle]);

  const zoneItemsMap = useMemo(() => {
    const map = new Map<string, LoadoutItem[]>();

    for (const zone of vehicleZones) {
      const zoneName = (zone as any).name || '';
      const items = loadoutItems.filter(item =>
        item.storage_location?.toLowerCase().includes(zoneName.toLowerCase())
      );
      map.set(zone.id, items);
    }

    return map;
  }, [vehicleZones, loadoutItems]);

  const silhouetteZones: SilhouetteZone[] = useMemo(() => {
    return vehicleZones.map(zone => {
      const items = zoneItemsMap.get(zone.id) || [];
      const zoneName = (zone as any).name || 'Zone';
      let zoneId = zone.id;
      const nameLC = zoneName.toLowerCase();

      if (nameLC.includes('cab rack')) zoneId = 'cab_rack';
      else if (nameLC.includes('roof rack')) zoneId = 'roof_rack';
      else if (nameLC.includes('hard top')) zoneId = 'hard_top';
      else if (nameLC.includes('cab interior') || nameLC === 'cab interior') zoneId = 'cab_interior';
      else if (nameLC.includes('bed rack')) zoneId = 'bed_rack';
      else if (nameLC.includes('rsi') || nameLC.includes('smart cap')) zoneId = 'rsi_smart_cap';
      else if (nameLC.includes('alu cab')) zoneId = 'alu_cab';
      else if (nameLC.includes('topper')) zoneId = 'other_topper';
      else if (nameLC.includes('open bed')) zoneId = 'open_bed';
      else if (nameLC.includes('trunk')) zoneId = 'trunk';
      else if (nameLC.includes('hatch')) zoneId = 'hatch';
      else if (nameLC.includes('cargo')) zoneId = 'cargo_area';
      else if (nameLC.includes('drawer')) zoneId = 'drawers';
      else if (nameLC.includes('rack')) zoneId = 'jeep_rack';

      return {
        id: zoneId,
        name: zoneName,
        zone_type: zone.zone_type || 'area',
        slot_count: zone.slot_count || 0,
        color: zone.color || null,
        icon: zone.icon || null,
        items_count: items.length,
        packed_count: items.filter(i => i.is_packed).length,
      };
    });
  }, [vehicleZones, zoneItemsMap]);

  const handleZonePress = (zoneId: string) => {
    const silZone = silhouetteZones.find(z => z.id === zoneId);
    if (!silZone) return;

    const originalZone = vehicleZones.find(z => {
      const name = (z as any).name || '';
      return name === silZone.name;
    });

    setSelectedZone({
      id: originalZone?.id || zoneId,
      name: silZone.name,
      zone_type: silZone.zone_type,
      slot_count: silZone.slot_count,
      color: silZone.color,
      icon: silZone.icon,
    });
    setDetailModalVisible(true);
  };

  const selectedZoneItems: ZoneItem[] = useMemo(() => {
    if (!selectedZone) return [];

    const vZone = vehicleZones.find(z => z.id === selectedZone.id);
    if (!vZone) return [];

    const items = zoneItemsMap.get(vZone.id) || [];
    return items.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category || 'general',
      quantity: item.quantity || 1,
      is_packed: item.is_packed || false,
      is_critical: item.is_critical || false,
      weight_lbs: item.weight_lbs,
      storage_location: item.storage_location,
    }));
  }, [selectedZone, vehicleZones, zoneItemsMap]);

  const stats = useMemo(() => {
    const totalSlots = vehicleZones.reduce((s, z) => s + (z.slot_count || 0), 0);
    const totalItems = silhouetteZones.reduce((s, z) => s + z.items_count, 0);
    const totalPacked = silhouetteZones.reduce((s, z) => s + z.packed_count, 0);
    const readinessPct = totalItems > 0 ? Math.round((totalPacked / totalItems) * 100) : 0;

    return {
      totalSlots,
      totalItems,
      totalPacked,
      readinessPct,
      zoneCount: vehicleZones.length,
    };
  }, [vehicleZones, silhouetteZones]);

  // ── Loading state ─────────────────────────────────────
  if (loading) {
    return (
      <TopoBackground>
        <View style={styles.container}>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerBrand}>EXPEDITION COMMAND</Text>
              <Text style={styles.headerTitle}>LOAD MAP</Text>
            </View>
          </View>
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={TACTICAL.accent} />
            <Text style={styles.loadingText}>LOADING VEHICLE DATA...</Text>
          </View>
        </View>
      </TopoBackground>
    );
  }

  // ── No vehicles: CONFIGURE VEHICLE FIRST ──────────────
  if (vehicles.length === 0) {
    return (
      <TopoBackground>
        <View style={styles.container}>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerBrand}>EXPEDITION COMMAND</Text>
              <Text style={styles.headerTitle}>LOAD MAP</Text>
            </View>
          </View>
          <View style={styles.centerContainer}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="car-outline" size={40} color={TACTICAL.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>SET UP VEHICLE FIRST</Text>
            <Text style={styles.emptySubtext}>
              Set up your vehicle to see the load map.{'\n'}Works offline — no sign-in required.
            </Text>
            <TouchableOpacity
              style={styles.configureBtn}
              onPress={() => router.push('/(tabs)/vehicle-config')}
              activeOpacity={0.8}
            >
              <Ionicons name="construct-outline" size={16} color="#0B0F12" />
              <Text style={styles.configureBtnText}>SET UP VEHICLE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TopoBackground>
    );
  }

  // ── Vehicle exists but not configured ─────────────────
  const hasConfig =
    selectedVehicle?.wizard_config != null ||
    (selectedVehicle as any)?.zones?.length > 0 ||
    (selectedVehicle as any)?.containerZones?.length > 0 ||
    (selectedVehicle as any)?.accessoryFramework != null ||
    (selectedVehicle as any)?.wizard_config?.fleet_build_loadout != null;

  return (
    <TopoBackground>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerBrand}>EXPEDITION COMMAND</Text>
            <Text style={styles.headerTitle}>LOAD MAP</Text>
          </View>
          <TouchableOpacity style={styles.refreshBtn} onPress={handleRefresh} activeOpacity={0.7}>
            <Ionicons name="refresh-outline" size={18} color={TACTICAL.amber} />
          </TouchableOpacity>
        </View>

        {vehicles.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.vehicleSelectorContent}
            style={styles.vehicleSelector}
          >
            {vehicles.map(v => {
              const isActive = v.id === selectedVehicleId;
              const isConfigured = !!(v.wizard_config || (v as any).zones);

              return (
                <TouchableOpacity
                  key={v.id}
                  style={[
                    styles.vehicleTab,
                    isActive && styles.vehicleTabActive,
                    !isConfigured && styles.vehicleTabUnconfigured,
                  ]}
                  onPress={() => setSelectedVehicleId(v.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isConfigured ? 'car-sport' : 'car-outline'}
                    size={14}
                    color={isActive ? TACTICAL.amber : TACTICAL.textMuted}
                  />
                  <Text style={[styles.vehicleTabText, isActive && styles.vehicleTabTextActive]}>
                    {v.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              {...NON_OBSTRUCTIVE_REFRESH_CONTROL_PROPS}
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          }
        >
          {selectedVehicle && (
            <View style={styles.vehicleInfoCard}>
              <View style={styles.vehicleInfoLeft}>
                <Ionicons name="car-sport-outline" size={20} color={TACTICAL.amber} />
                <View>
                  <Text style={styles.vehicleInfoName}>{selectedVehicle.name}</Text>
                  <Text style={styles.vehicleInfoMeta}>
                    {[selectedVehicle.year, selectedVehicle.make, selectedVehicle.model]
                      .filter(Boolean)
                      .join(' ') || 'No details'}
                  </Text>
                </View>
              </View>

              {hasConfig ? (
                <View style={styles.configuredBadge}>
                  <Ionicons name="checkmark-circle" size={12} color="#66BB6A" />
                  <Text style={styles.configuredBadgeText}>CONFIGURED</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.setupBtn}
                  onPress={() => router.push('/(tabs)/vehicle-config')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.setupBtnText}>SET UP</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {!hasConfig && (
            <View style={styles.notConfiguredCard}>
              <View style={styles.notConfiguredIcon}>
                <Ionicons name="construct-outline" size={32} color={TACTICAL.amber} />
              </View>
              <Text style={styles.notConfiguredTitle}>VEHICLE SETUP REQUIRED</Text>
              <Text style={styles.notConfiguredText}>
                Open Vehicle Setup to define your zones and loadout slots.
              </Text>
              <TouchableOpacity
                style={styles.configureBtn}
                onPress={() => router.push('/(tabs)/vehicle-config')}
                activeOpacity={0.8}
              >
                <Ionicons name="construct-outline" size={16} color="#0B0F12" />
                <Text style={styles.configureBtnText}>OPEN SETUP</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editVehicleBtn}
                onPress={() => {
                  if (selectedVehicleId) {
                    router.push({
                      pathname: '/(tabs)/vehicle-config',
                      params: {
                        vehicleId: selectedVehicleId,
                        startAtStep: 'accessoryConfiguration',
                        referrer: 'loadmap',
                      },
                    } as any);
                  } else {
                    router.push('/(tabs)/vehicle-config');
                  }
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.editVehicleText}>EDIT SETUP</Text>
              </TouchableOpacity>
            </View>
          )}

          {hasConfig && !zonesLoading && vehicleZones.length > 0 && (
            <>
              <View style={styles.statsBar}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{stats.zoneCount}</Text>
                  <Text style={styles.statLabel}>ZONES</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{stats.totalSlots}</Text>
                  <Text style={styles.statLabel}>SLOTS</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={[styles.statValue, { color: TACTICAL.amber }]}>{stats.totalItems}</Text>
                  <Text style={styles.statLabel}>ITEMS</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text
                    style={[
                      styles.statValue,
                      {
                        color:
                          stats.readinessPct === 100
                            ? '#66BB6A'
                            : stats.readinessPct > 0
                              ? TACTICAL.amber
                              : TACTICAL.textMuted,
                      },
                    ]}
                  >
                    {stats.readinessPct}%
                  </Text>
                  <Text style={styles.statLabel}>PACKED</Text>
                </View>
              </View>

              <View style={styles.silhouetteSection}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="map-outline" size={14} color={TACTICAL.amber} />
                  <Text style={styles.sectionTitle}>VEHICLE ZONE MAP</Text>
                </View>
                <VehicleSilhouette
                  vehicleType={vehicleType}
                  zones={silhouetteZones}
                  onZonePress={handleZonePress}
                  wizardConfig={selectedVehicle?.wizard_config as Record<string, string> | undefined}
                />
              </View>
            </>
          )}

          {hasConfig && zonesLoading && (
            <View style={styles.zonesLoadingWrap}>
              <ActivityIndicator size="small" color={TACTICAL.accent} />
              <Text style={styles.zonesLoadingText}>LOADING ZONE DATA...</Text>
            </View>
          )}

          {hasConfig && !zonesLoading && vehicleZones.length === 0 && (
            <View style={styles.noZonesCard}>
              <Ionicons
                name={zoneDataStatus === 'error' ? 'warning-outline' : 'grid-outline'}
                size={32}
                color={zoneDataStatus === 'error' ? TACTICAL.danger : TACTICAL.textMuted}
              />
              <Text style={styles.noZonesTitle}>
                {zoneDataStatus === 'error' ? 'ZONE DATA UNAVAILABLE' : 'NO LOAD ZONES CONFIGURED'}
              </Text>
              <Text style={styles.noZonesText}>
                {zoneDataMessage}
              </Text>
              <TouchableOpacity
                style={styles.configureBtn}
                onPress={() => router.push('/(tabs)/vehicle-config')}
                activeOpacity={0.8}
              >
                <Ionicons name="construct-outline" size={16} color="#0B0F12" />
                <Text style={styles.configureBtnText}>UPDATE SETUP</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              LOAD MAP — {vehicleZones.length} ZONES — {stats.totalSlots} TOTAL SLOTS
            </Text>
          </View>
        </ScrollView>

        <ZoneDetailModal
          visible={detailModalVisible}
          zone={selectedZone}
          items={selectedZoneItems}
          onClose={() => {
            setDetailModalVisible(false);
            setSelectedZone(null);
          }}
        />
      </View>
    </TopoBackground>
  );
}

export default function LoadMapScreen() {
  return (
    <TabErrorBoundary tabName="LOAD MAP">
      <LoadMapScreenInner />
    </TabErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: DENSITY.screenPad,
    paddingTop: Platform.OS === 'web' ? 16 : 54,
    paddingBottom: 12,
  },
  headerBrand: { ...TYPO.U2, fontSize: 9, color: TACTICAL.textMuted, letterSpacing: 2 },
  headerTitle: { ...TYPO.T1, color: TACTICAL.amber },
  refreshBtn: {
    width: DENSITY.iconBtnTap,
    height: DENSITY.iconBtnTap,
    borderRadius: 12,
    backgroundColor: 'rgba(196,138,44,0.1)',
    borderWidth: DENSITY.borderDefault,
    borderColor: 'rgba(196,138,44,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleSelector: { maxHeight: 48, marginBottom: 4 },
  vehicleSelectorContent: { paddingHorizontal: DENSITY.screenPad, gap: 8 },
  vehicleTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: DENSITY.borderDefault,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.panel,
  },
  vehicleTabActive: {
    borderColor: TACTICAL.amber + '60',
    backgroundColor: 'rgba(196,138,44,0.1)',
  },
  vehicleTabUnconfigured: { opacity: 0.5 },
  vehicleTabText: { ...TYPO.U2, fontSize: 11, color: TACTICAL.textMuted },
  vehicleTabTextActive: { color: TACTICAL.amber },
  scroll: { flex: 1 },
  scrollContent: { padding: DENSITY.screenPad, paddingBottom: 100 },
  vehicleInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: DENSITY.borderDefault,
    borderColor: TACTICAL.border,
    padding: DENSITY.cardPad,
    marginBottom: DENSITY.cardGap,
  },
  vehicleInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: DENSITY.iconTextGap,
    flex: 1,
  },
  vehicleInfoName: { ...TYPO.T3, color: TACTICAL.text },
  vehicleInfoMeta: { ...TYPO.B2, marginTop: 1 },
  configuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(76,175,80,0.12)',
    borderRadius: 6,
  },
  configuredBadgeText: { ...TYPO.U2, fontSize: 8, color: '#66BB6A' },
  setupBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: TACTICAL.amber,
    borderRadius: 8,
  },
  setupBtnText: { ...TYPO.U2, fontSize: 10, color: '#0B0F12' },
  notConfiguredCard: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: DENSITY.borderDefault,
    borderColor: TACTICAL.border,
    gap: 10,
    marginBottom: DENSITY.sectionGap,
  },
  notConfiguredIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(196,138,44,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notConfiguredTitle: { ...TYPO.T2, color: TACTICAL.amber },
  notConfiguredText: { ...TYPO.B2, textAlign: 'center', lineHeight: 18 },
  configureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: TACTICAL.amber,
    borderRadius: 10,
    marginTop: 4,
  },
  configureBtnText: { ...TYPO.U1, color: '#0B0F12' },
  editVehicleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: DENSITY.borderDefault,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    marginTop: 4,
  },
  editVehicleText: { ...TYPO.U2, color: TACTICAL.textMuted },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: DENSITY.borderDefault,
    borderColor: TACTICAL.border,
    padding: DENSITY.cardPad,
    marginBottom: DENSITY.cardGap,
  },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { ...TYPO.K1, color: TACTICAL.text },
  statLabel: { ...TYPO.T4, fontSize: 8, marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: 'rgba(62,79,60,0.3)' },
  silhouetteSection: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: DENSITY.borderDefault,
    borderColor: TACTICAL.border,
    padding: DENSITY.screenPad,
    marginBottom: DENSITY.sectionGap,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionTitle: { ...TYPO.T4, color: TACTICAL.amber },
  sectionSubtext: { ...TYPO.B2, marginBottom: DENSITY.cardGap, marginLeft: 22 },
  zoneListSection: { marginBottom: DENSITY.sectionGap },
  zoneListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TACTICAL.panel,
    borderRadius: 10,
    borderWidth: DENSITY.borderDefault,
    borderColor: TACTICAL.border,
    padding: DENSITY.cardPad - 3,
    marginTop: 8,
    gap: DENSITY.internalRowGap,
  },
  zoneListColor: { width: 3, height: 40 },
  zoneListGlyph: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  zoneListInfo: { flex: 1, gap: 3 },
  zoneListName: { ...TYPO.T3, color: TACTICAL.text },
  zoneListMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  zoneListType: { ...TYPO.U2, fontSize: 8, color: TACTICAL.textMuted },
  zoneListDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: TACTICAL.textMuted },
  zoneListSlots: { ...TYPO.U2, fontSize: 8, color: TACTICAL.textMuted },
  zoneListItems: { ...TYPO.U2, fontSize: 8, color: TACTICAL.amber },
  zoneListBar: {
    height: 3,
    backgroundColor: 'rgba(62,79,60,0.2)',
    borderRadius: 1.5,
    overflow: 'hidden',
    marginTop: 1,
  },
  zoneListBarFill: { height: '100%', borderRadius: 1.5 },
  zoneListRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  zoneListPct: { ...TYPO.K2, fontSize: 14 },
  zonesLoadingWrap: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  zonesLoadingText: { ...TYPO.T4 },
  noZonesCard: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: DENSITY.borderDefault,
    borderColor: TACTICAL.border,
    gap: 10,
    marginBottom: DENSITY.sectionGap,
  },
  noZonesTitle: { ...TYPO.T2, color: TACTICAL.textMuted },
  noZonesText: { ...TYPO.B2, textAlign: 'center', lineHeight: 18 },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(62,79,60,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { ...TYPO.T1, color: TACTICAL.text, textAlign: 'center' },
  emptySubtext: { ...TYPO.B2, textAlign: 'center', lineHeight: 18 },
  loadingText: { ...TYPO.T4 },
  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: {
    ...TYPO.U2,
    fontSize: 9,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
});



