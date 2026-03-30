/**
 * ═══════════════════════════════════════════════════════════
 * ECS EXPEDITION PACK MANAGER
 * ═══════════════════════════════════════════════════════════
 *
 * UI for creating, viewing, and managing expedition packs
 * that can be used offline. Users can deliberately download
 * a trip before departure.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { offlineExpeditionModeEngine } from '../../app/lib/offlineExpeditionModeEngine';
import type { ExpeditionPack } from '../../app/lib/offlineExpeditionModeTypes';

interface ExpeditionPackManagerProps {
  onClose?: () => void;
}

export default function ExpeditionPackManager({ onClose }: ExpeditionPackManagerProps) {
  const [packs, setPacks] = useState<ExpeditionPack[]>([]);
  const [activePackId, setActivePackId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(() => {
    setPacks(offlineExpeditionModeEngine.getPacks());
    setActivePackId(offlineExpeditionModeEngine.getActivePack()?.id ?? null);
  }, []);

  useEffect(() => {
    refresh();
    const unsub = offlineExpeditionModeEngine.subscribe(refresh);
    return unsub;
  }, [refresh]);

  const handleCreatePack = useCallback(() => {
    setCreating(true);
    try {
      const pack = offlineExpeditionModeEngine.createPack({
        name: `Expedition Pack — ${new Date().toLocaleDateString()}`,
      });
      if (pack) {
        refresh();
      } else {
        Alert.alert(
          'Pack Creation',
          'Could not create expedition pack. Ensure a route is loaded.',
        );
      }
    } finally {
      setCreating(false);
    }
  }, [refresh]);

  const handleDeletePack = useCallback((packId: string, packName: string) => {
    Alert.alert(
      'Delete Pack',
      `Remove "${packName}" from offline storage?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            offlineExpeditionModeEngine.deletePack(packId);
            refresh();
          },
        },
      ],
    );
  }, [refresh]);

  const handleRefreshPack = useCallback((packId: string) => {
    offlineExpeditionModeEngine.refreshPack(packId);
    refresh();
  }, [refresh]);

  const handleSetActive = useCallback((packId: string) => {
    offlineExpeditionModeEngine.setActivePack(packId);
    refresh();
  }, [refresh]);

  const formatSize = (kb: number): string => {
    if (kb < 1024) return `${kb} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const formatDate = (iso: string): string => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="briefcase-outline" size={20} color="#C48A2C" />
          <Text style={styles.headerTitle}>Expedition Packs</Text>
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color="#888" />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.subtitle}>
        Save expedition data for offline use before departure
      </Text>

      {/* Create Pack Button */}
      <TouchableOpacity
        style={styles.createBtn}
        onPress={handleCreatePack}
        disabled={creating}
        activeOpacity={0.7}
      >
        <Ionicons name="add-circle-outline" size={18} color="#C48A2C" />
        <Text style={styles.createBtnText}>
          {creating ? 'Creating...' : 'Save Current Expedition'}
        </Text>
      </TouchableOpacity>

      {/* Pack List */}
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {packs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cloud-download-outline" size={36} color="#555" />
            <Text style={styles.emptyText}>No expedition packs saved</Text>
            <Text style={styles.emptySubtext}>
              Create a pack to save route, waypoints, and vehicle data for offline use
            </Text>
          </View>
        ) : (
          packs.map((pack) => (
            <View
              key={pack.id}
              style={[
                styles.packCard,
                activePackId === pack.id && styles.packCardActive,
              ]}
            >
              {/* Pack Header */}
              <View style={styles.packHeader}>
                <View style={styles.packHeaderLeft}>
                  <Ionicons
                    name={activePackId === pack.id ? 'briefcase' : 'briefcase-outline'}
                    size={16}
                    color={activePackId === pack.id ? '#C48A2C' : '#888'}
                  />
                  <Text style={styles.packName} numberOfLines={1}>
                    {pack.name}
                  </Text>
                </View>
                {activePackId === pack.id && (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>ACTIVE</Text>
                  </View>
                )}
              </View>

              {/* Pack Details */}
              <View style={styles.packDetails}>
                {pack.route_distance_mi != null && (
                  <View style={styles.packStat}>
                    <Ionicons name="navigate-outline" size={12} color="#888" />
                    <Text style={styles.packStatText}>
                      {pack.route_distance_mi.toFixed(1)} mi
                    </Text>
                  </View>
                )}
                {pack.waypoints.length > 0 && (
                  <View style={styles.packStat}>
                    <Ionicons name="flag-outline" size={12} color="#888" />
                    <Text style={styles.packStatText}>
                      {pack.waypoints.length} waypoints
                    </Text>
                  </View>
                )}
                {pack.route_geometry.length > 0 && (
                  <View style={styles.packStat}>
                    <Ionicons name="map-outline" size={12} color="#888" />
                    <Text style={styles.packStatText}>
                      {pack.route_geometry.length} pts
                    </Text>
                  </View>
                )}
                <View style={styles.packStat}>
                  <Ionicons name="server-outline" size={12} color="#888" />
                  <Text style={styles.packStatText}>
                    {formatSize(pack.size_kb)}
                  </Text>
                </View>
              </View>

              {/* Vehicle & Risk */}
              {(pack.vehicle_name || pack.risk_summary) && (
                <View style={styles.packMeta}>
                  {pack.vehicle_name && (
                    <Text style={styles.packMetaText}>
                      {pack.vehicle_name}
                    </Text>
                  )}
                  {pack.risk_summary && (
                    <Text style={[
                      styles.packMetaText,
                      { color: pack.risk_summary.level === 'critical' ? '#EF5350' : '#888' },
                    ]}>
                      Risk: {pack.risk_summary.level}
                    </Text>
                  )}
                </View>
              )}

              {/* Offline Coverage */}
              <View style={styles.packCoverage}>
                <Ionicons
                  name={pack.map_tiles_cached ? 'checkmark-circle' : 'alert-circle-outline'}
                  size={12}
                  color={pack.map_tiles_cached ? '#4CAF50' : '#FFB300'}
                />
                <Text style={[
                  styles.packCoverageText,
                  { color: pack.map_tiles_cached ? '#4CAF50' : '#FFB300' },
                ]}>
                  {pack.map_tiles_cached
                    ? 'Map region cached'
                    : 'Map tiles not cached for this area'}
                </Text>
              </View>

              {/* Pack Footer */}
              <View style={styles.packFooter}>
                <Text style={styles.packDate}>
                  {formatDate(pack.updated_at)} · v{pack.version}
                </Text>
                <View style={styles.packActions}>
                  {activePackId !== pack.id && (
                    <TouchableOpacity
                      style={styles.packAction}
                      onPress={() => handleSetActive(pack.id)}
                    >
                      <Ionicons name="checkmark-outline" size={14} color="#4CAF50" />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.packAction}
                    onPress={() => handleRefreshPack(pack.id)}
                  >
                    <Ionicons name="refresh-outline" size={14} color="#42A5F5" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.packAction}
                    onPress={() => handleDeletePack(pack.id, pack.name)}
                  >
                    <Ionicons name="trash-outline" size={14} color="#EF5350" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E0E0E0',
  },
  closeBtn: {
    padding: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#888',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C48A2C40',
    borderStyle: 'dashed',
    backgroundColor: '#C48A2C08',
  },
  createBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#C48A2C',
  },
  list: {
    flex: 1,
    paddingHorizontal: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  emptySubtext: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  packCard: {
    backgroundColor: '#222',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  packCardActive: {
    borderColor: '#C48A2C40',
    backgroundColor: '#C48A2C08',
  },
  packHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  packHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  packName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E0E0E0',
    flex: 1,
  },
  activeBadge: {
    backgroundColor: '#C48A2C20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#C48A2C',
    letterSpacing: 0.5,
  },
  packDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  packStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  packStatText: {
    fontSize: 11,
    color: '#888',
  },
  packMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  packMetaText: {
    fontSize: 11,
    color: '#888',
  },
  packCoverage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  packCoverageText: {
    fontSize: 11,
  },
  packFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 8,
  },
  packDate: {
    fontSize: 10,
    color: '#666',
  },
  packActions: {
    flexDirection: 'row',
    gap: 12,
  },
  packAction: {
    padding: 4,
  },
});




