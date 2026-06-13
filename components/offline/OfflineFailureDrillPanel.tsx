import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  type OfflineDrillCapabilityResult,
  type OfflineDrillCapabilityStatus,
  type OfflineFailureDrillResult,
} from '../../lib/offlineFailureDrillService';

type Props = {
  result: OfflineFailureDrillResult;
  compact?: boolean;
};

const STATUS_META: Record<OfflineDrillCapabilityStatus, { color: string; icon: string }> = {
  available_offline: { color: '#4CAF50', icon: 'checkmark-circle-outline' },
  partially_available: { color: '#FFB300', icon: 'alert-circle-outline' },
  cached_but_stale: { color: '#E67E22', icon: 'time-outline' },
  unavailable: { color: '#78909C', icon: 'close-circle-outline' },
  manual_fallback_required: { color: '#42A5F5', icon: 'reader-outline' },
};

const STATUS_LABELS: Record<OfflineDrillCapabilityStatus, string> = {
  available_offline: 'Available offline',
  partially_available: 'Partially available',
  cached_but_stale: 'Cached but stale',
  unavailable: 'Unavailable',
  manual_fallback_required: 'Manual fallback required',
};

export default function OfflineFailureDrillPanel({ result, compact = false }: Props) {
  if (!result.enabled) return null;

  const unavailableCount = result.capabilities.filter((item) => item.status === 'unavailable').length;
  const staleCount = result.capabilities.filter((item) => item.status === 'cached_but_stale').length;
  const label = unavailableCount > 0
    ? `${unavailableCount} unavailable`
    : staleCount > 0
      ? `${staleCount} stale`
      : 'Local-only check complete';

  if (compact) {
    return (
      <View style={styles.compact}>
        <Ionicons name="cloud-offline-outline" size={13} color="#C48A2C" />
        <Text style={styles.compactText} numberOfLines={1}>Offline Failure Drill: {label}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="cloud-offline-outline" size={16} color="#C48A2C" />
          <Text style={styles.title}>Offline Failure Drill</Text>
        </View>
        <Text style={styles.readiness}>current user-facing ECS extension</Text>
      </View>

      <Text style={styles.subtitle}>
        Local-only no-network readiness check. Live routing, live weather, live availability, team sync, provider updates, and fresh Dispatch state are not promised unless verified in local cache.
      </Text>

      {result.warnings.map((warning) => (
        <View key={warning} style={styles.warningRow}>
          <Ionicons name="warning-outline" size={13} color="#FFB300" />
          <Text style={styles.warningText}>{warning}</Text>
        </View>
      ))}

      <View style={styles.list}>
        {result.capabilities.map(renderCapability)}
      </View>

      {result.recommendedDownloads.length > 0 ? (
        <View style={styles.downloads}>
          <Text style={styles.sectionTitle}>Recommended downloads</Text>
          {result.recommendedDownloads.map((item) => (
            <Text key={item} style={styles.downloadText}>- {item}</Text>
          ))}
        </View>
      ) : null}

      {result.productionReadiness.status === 'blocked_android_no_network_evidence_required' ? (
        <View style={styles.blocker}>
          <Ionicons name="phone-portrait-outline" size={13} color="#FFB300" />
          <Text style={styles.blockerText}>
            Production remains blocked until Android no-network device evidence is captured.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function renderCapability(item: OfflineDrillCapabilityResult) {
  const meta = STATUS_META[item.status];
  return (
    <View key={item.capabilityId} style={styles.row}>
      <Ionicons name={meta.icon as any} size={15} color={meta.color} />
      <View style={styles.rowBody}>
        <View style={styles.rowHeader}>
          <Text style={styles.capabilityName}>{item.capabilityName}</Text>
          <Text style={[styles.status, { color: meta.color }]}>
            {STATUS_LABELS[item.status]}
          </Text>
        </View>
        <Text style={styles.message}>{item.userMessage}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>Source: {item.sourceOfTruth}</Text>
          {item.lastCachedAt ? <Text style={styles.metaText}>lastCachedAt: {item.lastCachedAt}</Text> : null}
        </View>
        {item.recommendedDownloads.length > 0 ? (
          <Text style={styles.recommendation} numberOfLines={2}>
            {item.recommendedDownloads.join(' / ')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    overflow: 'hidden',
  },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  compactText: {
    color: '#A0A0A0',
    flex: 1,
    fontSize: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  title: {
    color: '#E0E0E0',
    fontSize: 13,
    fontWeight: '800',
  },
  readiness: {
    color: '#888',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  subtitle: {
    color: '#A0A0A0',
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  warningText: {
    color: '#FFB300',
    flex: 1,
    fontSize: 11,
  },
  list: {
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#2A2A2A',
  },
  rowBody: {
    flex: 1,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  capabilityName: {
    color: '#D0D0D0',
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  status: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  message: {
    color: '#A0A0A0',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 3,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  metaText: {
    color: '#777',
    fontSize: 9,
  },
  recommendation: {
    color: '#C48A2C',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
  downloads: {
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sectionTitle: {
    color: '#C48A2C',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  downloadText: {
    color: '#B0B0B0',
    fontSize: 11,
    lineHeight: 16,
  },
  blocker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFB30010',
    borderTopWidth: 1,
    borderTopColor: '#FFB30030',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  blockerText: {
    color: '#FFB300',
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
  },
});
