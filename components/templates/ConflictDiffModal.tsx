// ============================================================
// CONFLICT DIFF MODAL — Template Merge Conflict Resolution
// ============================================================
// Shows a side-by-side diff of local vs cloud template versions.
// User can choose: Keep Local, Keep Cloud, or Keep Both.
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import ECSModal from '../ECSModal';

import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type { ExpeditionTemplate } from '../../lib/templateStore';
import type { TemplateConflict, ConflictResolution } from '../../lib/templateSyncEngine';

interface Props {
  visible: boolean;
  conflict: TemplateConflict | null;
  onResolve: (templateId: string, resolution: ConflictResolution) => Promise<void>;
  onClose: () => void;
}

interface DiffField {
  label: string;
  localValue: string;
  cloudValue: string;
  isDifferent: boolean;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '--';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: '2-digit',
    hour: 'numeric', minute: '2-digit',
  });
}

function buildDiffFields(local: ExpeditionTemplate, cloud: ExpeditionTemplate): DiffField[] {
  const fields: DiffField[] = [];

  const add = (label: string, lv: any, cv: any) => {
    const ls = String(lv ?? '--');
    const cs = String(cv ?? '--');
    fields.push({ label, localValue: ls, cloudValue: cs, isDifferent: ls !== cs });
  };

  add('Name', local.name, cloud.name);
  add('Description', local.description, cloud.description);
  add('Vehicle', local.vehicle_name, cloud.vehicle_name);
  add('Framework', local.framework_type, cloud.framework_type);
  add('Zones', local.zone_count || local.zones_snapshot?.length || 0, cloud.zone_count || cloud.zones_snapshot?.length || 0);
  add('Loadout Items', local.items_snapshot?.length || 0, cloud.items_snapshot?.length || 0);
  add('People', local.people_count, cloud.people_count);
  add('Trip Days', local.trip_length_days, cloud.trip_length_days);
  add('Operating Profile', local.operating_profile, cloud.operating_profile);
  add('Use Count', local.use_count, cloud.use_count);
  add('Last Updated', formatDate(local.updated_at), formatDate(cloud.updated_at));

  // Detailed zone comparison
  const localZones = (local.zones_snapshot || []).map(z => z.name).join(', ') || '--';
  const cloudZones = (cloud.zones_snapshot || []).map(z => z.name).join(', ') || '--';
  add('Zone Names', localZones, cloudZones);

  // Item categories comparison
  const localCats = [...new Set((local.items_snapshot || []).map(i => i.category))].join(', ') || '--';
  const cloudCats = [...new Set((cloud.items_snapshot || []).map(i => i.category))].join(', ') || '--';
  add('Item Categories', localCats, cloudCats);

  return fields;
}

export default function ConflictDiffModal({ visible, conflict, onResolve, onClose }: Props) {
  const [resolving, setResolving] = useState<ConflictResolution | null>(null);
  const [selectedTab, setSelectedTab] = useState<'diff' | 'local' | 'cloud'>('diff');

  if (!conflict) return null;

  const { localVersion, cloudVersion, templateId } = conflict;
  const diffFields = buildDiffFields(localVersion, cloudVersion);
  const changedCount = diffFields.filter(f => f.isDifferent).length;

  const handleResolve = async (resolution: ConflictResolution) => {
    setResolving(resolution);
    try {
      await onResolve(templateId, resolution);
    } catch (e) {
      console.error('[ConflictDiff] resolve error:', e);
    }
    setResolving(null);
  };

  return (
    <ECSModal visible={visible} onClose={onClose} tier="global">

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIcon}>
                <Ionicons name="git-merge" size={18} color="#C0392B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>MERGE CONFLICT</Text>
                <Text style={styles.headerSub} numberOfLines={1}>
                  {localVersion.name} — {changedCount} field{changedCount !== 1 ? 's' : ''} differ
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Conflict Info Banner */}
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle" size={16} color="#5B8DEF" />
            <Text style={styles.infoText}>
              This template was edited on multiple devices since last sync. Choose which version to keep.
            </Text>
          </View>

          {/* Tab Selector */}
          <View style={styles.tabRow}>
            {(['diff', 'local', 'cloud'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, selectedTab === tab && styles.tabActive]}
                onPress={() => setSelectedTab(tab)}
              >
                <Ionicons
                  name={tab === 'diff' ? 'git-compare' : tab === 'local' ? 'phone-portrait' : 'cloud'}
                  size={12}
                  color={selectedTab === tab ? TACTICAL.amber : TACTICAL.textMuted}
                />
                <Text style={[styles.tabText, selectedTab === tab && styles.tabTextActive]}>
                  {tab === 'diff' ? 'DIFF VIEW' : tab === 'local' ? 'THIS DEVICE' : 'CLOUD'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.divider} />

          {/* Content */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {selectedTab === 'diff' && (
              <View style={styles.diffContainer}>
                {/* Column headers */}
                <View style={styles.diffHeaderRow}>
                  <Text style={styles.diffHeaderLabel}>FIELD</Text>
                  <View style={styles.diffHeaderCols}>
                    <View style={styles.diffColHeader}>
                      <Ionicons name="phone-portrait" size={10} color="#5B8DEF" />
                      <Text style={[styles.diffColHeaderText, { color: '#5B8DEF' }]}>LOCAL</Text>
                    </View>
                    <View style={styles.diffColHeader}>
                      <Ionicons name="cloud" size={10} color="#7EC8E3" />
                      <Text style={[styles.diffColHeaderText, { color: '#7EC8E3' }]}>CLOUD</Text>
                    </View>
                  </View>
                </View>

                {diffFields.map((field, idx) => (
                  <View
                    key={field.label}
                    style={[
                      styles.diffRow,
                      field.isDifferent && styles.diffRowChanged,
                      idx === diffFields.length - 1 && { borderBottomWidth: 0 },
                    ]}
                  >
                    <View style={styles.diffLabelCol}>
                      {field.isDifferent && (
                        <View style={styles.changeDot} />
                      )}
                      <Text style={[styles.diffLabel, field.isDifferent && styles.diffLabelChanged]}>
                        {field.label}
                      </Text>
                    </View>
                    <View style={styles.diffValueCols}>
                      <View style={[styles.diffValueCol, field.isDifferent && styles.diffValueColLocal]}>
                        <Text style={[styles.diffValue, field.isDifferent && styles.diffValueChanged]} numberOfLines={2}>
                          {field.localValue}
                        </Text>
                      </View>
                      <View style={[styles.diffValueCol, field.isDifferent && styles.diffValueColCloud]}>
                        <Text style={[styles.diffValue, field.isDifferent && styles.diffValueChanged]} numberOfLines={2}>
                          {field.cloudValue}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {selectedTab === 'local' && (
              <VersionDetail version={localVersion} label="LOCAL VERSION" color="#5B8DEF" icon="phone-portrait" />
            )}

            {selectedTab === 'cloud' && (
              <VersionDetail version={cloudVersion} label="CLOUD VERSION" color="#7EC8E3" icon="cloud" />
            )}

            {/* Resolution Actions */}
            <View style={styles.resolutionSection}>
              <Text style={styles.resolutionTitle}>RESOLVE CONFLICT</Text>

              <TouchableOpacity
                style={[styles.resolveBtn, styles.resolveBtnLocal]}
                onPress={() => handleResolve('keep_local')}
                disabled={!!resolving}
                activeOpacity={0.7}
              >
                {resolving === 'keep_local' ? (
                  <ActivityIndicator size="small" color="#5B8DEF" />
                ) : (
                  <Ionicons name="phone-portrait" size={16} color="#5B8DEF" />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resolveBtnTitle, { color: '#5B8DEF' }]}>KEEP LOCAL VERSION</Text>
                  <Text style={styles.resolveBtnSub}>Overwrite cloud with this device's version</Text>
                </View>
                <Ionicons name="arrow-forward" size={14} color="#5B8DEF" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.resolveBtn, styles.resolveBtnCloud]}
                onPress={() => handleResolve('keep_cloud')}
                disabled={!!resolving}
                activeOpacity={0.7}
              >
                {resolving === 'keep_cloud' ? (
                  <ActivityIndicator size="small" color="#7EC8E3" />
                ) : (
                  <Ionicons name="cloud" size={16} color="#7EC8E3" />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resolveBtnTitle, { color: '#7EC8E3' }]}>KEEP CLOUD VERSION</Text>
                  <Text style={styles.resolveBtnSub}>Update this device with the cloud version</Text>
                </View>
                <Ionicons name="arrow-forward" size={14} color="#7EC8E3" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.resolveBtn, styles.resolveBtnBoth]}
                onPress={() => handleResolve('keep_both')}
                disabled={!!resolving}
                activeOpacity={0.7}
              >
                {resolving === 'keep_both' ? (
                  <ActivityIndicator size="small" color="#4CAF50" />
                ) : (
                  <Ionicons name="copy" size={16} color="#4CAF50" />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resolveBtnTitle, { color: '#4CAF50' }]}>KEEP BOTH VERSIONS</Text>
                  <Text style={styles.resolveBtnSub}>Save local as a copy, keep cloud original</Text>
                </View>
                <Ionicons name="arrow-forward" size={14} color="#4CAF50" />
              </TouchableOpacity>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </ECSModal>

  );
}

// ── Version Detail View ──────────────────────────────────────

function VersionDetail({ version, label, color, icon }: {
  version: ExpeditionTemplate; label: string; color: string; icon: string;
}) {
  const itemCount = version.items_snapshot?.length || 0;
  const zoneCount = version.zones_snapshot?.length || version.zone_count || 0;

  return (
    <View style={styles.versionContainer}>
      <View style={styles.versionHeader}>
        <Ionicons name={icon as any} size={14} color={color} />
        <Text style={[styles.versionLabel, { color }]}>{label}</Text>
        <Text style={styles.versionDate}>{formatDate(version.updated_at)}</Text>
      </View>

      <View style={styles.versionGrid}>
        <VersionRow label="Name" value={version.name} />
        <VersionRow label="Description" value={version.description || '--'} />
        <VersionRow label="Vehicle" value={version.vehicle_name || '--'} />
        <VersionRow label="Framework" value={version.framework_type || '--'} />
        <VersionRow label="Zones" value={zoneCount > 0 ? `${zoneCount} configured` : '--'} />
        <VersionRow label="Items" value={itemCount > 0 ? `${itemCount} items` : '--'} />
        <VersionRow label="People" value={String(version.people_count || 1)} />
        <VersionRow label="Trip Days" value={version.trip_length_days ? `${version.trip_length_days} days` : '--'} />
        <VersionRow label="Use Count" value={String(version.use_count || 0)} />
      </View>

      {/* Zone chips */}
      {version.zones_snapshot && version.zones_snapshot.length > 0 && (
        <View style={styles.versionZones}>
          <Text style={styles.versionZonesLabel}>ZONES</Text>
          <View style={styles.versionZoneChips}>
            {version.zones_snapshot.map((z, i) => (
              <View key={z.id || i} style={styles.versionZoneChip}>
                <Text style={styles.versionZoneChipText}>{z.name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Item categories */}
      {version.items_snapshot && version.items_snapshot.length > 0 && (
        <View style={styles.versionZones}>
          <Text style={styles.versionZonesLabel}>ITEM CATEGORIES</Text>
          <View style={styles.versionZoneChips}>
            {[...new Set(version.items_snapshot.map(i => i.category))].map((cat, i) => (
              <View key={i} style={[styles.versionZoneChip, { borderColor: 'rgba(196, 138, 44, 0.25)' }]}>
                <Text style={[styles.versionZoneChipText, { color: TACTICAL.amber }]}>{cat}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function VersionRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.versionRow}>
      <Text style={styles.versionRowLabel}>{label}</Text>
      <Text style={styles.versionRowValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '95%',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(192, 57, 43, 0.30)',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 18,
    paddingBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(192, 57, 43, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(192, 57, 43, 0.30)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#C0392B',
    letterSpacing: 1.5,
  },
  headerSub: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    marginTop: 2,
  },
  closeBtn: { padding: 4 },

  // Info banner
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 18,
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(91, 141, 239, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(91, 141, 239, 0.20)',
  },
  infoText: {
    flex: 1,
    fontSize: 11,
    color: TACTICAL.textMuted,
    lineHeight: 16,
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 18,
    gap: 6,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabActive: {
    borderColor: 'rgba(196, 138, 44, 0.30)',
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
  },
  tabText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
  },
  tabTextActive: {
    color: TACTICAL.amber,
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(192, 57, 43, 0.15)',
    marginHorizontal: 18,
  },

  body: { flex: 1 },
  bodyContent: { padding: 18, paddingTop: 14 },

  // Diff view
  diffContainer: {
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.25)',
    overflow: 'hidden',
  },
  diffHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.20)',
  },
  diffHeaderLabel: {
    width: '30%',
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  diffHeaderCols: {
    flex: 1,
    flexDirection: 'row',
  },
  diffColHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  diffColHeaderText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },

  diffRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.12)',
  },
  diffRowChanged: {
    backgroundColor: 'rgba(192, 57, 43, 0.05)',
  },
  diffLabelCol: {
    width: '30%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  changeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#C0392B',
  },
  diffLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  diffLabelChanged: {
    color: TACTICAL.text,
  },
  diffValueCols: {
    flex: 1,
    flexDirection: 'row',
  },
  diffValueCol: {
    flex: 1,
    paddingHorizontal: 4,
  },
  diffValueColLocal: {
    backgroundColor: 'rgba(91, 141, 239, 0.05)',
    borderRadius: 4,
  },
  diffValueColCloud: {
    backgroundColor: 'rgba(126, 200, 227, 0.05)',
    borderRadius: 4,
  },
  diffValue: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  diffValueChanged: {
    color: TACTICAL.text,
  },

  // Version detail
  versionContainer: {
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.25)',
    padding: 14,
    gap: 12,
  },
  versionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  versionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    flex: 1,
  },
  versionDate: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  versionGrid: { gap: 6 },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  versionRowLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    width: '35%',
  },
  versionRowValue: {
    fontSize: 11,
    fontWeight: '600',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    flex: 1,
    textAlign: 'right',
  },
  versionZones: { gap: 6 },
  versionZonesLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  versionZoneChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  versionZoneChip: {
    backgroundColor: 'rgba(62, 79, 60, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.30)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  versionZoneChipText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.3,
  },

  // Resolution section
  resolutionSection: {
    marginTop: 18,
    gap: 10,
  },
  resolutionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    marginBottom: 2,
  },
  resolveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  resolveBtnLocal: {
    backgroundColor: 'rgba(91, 141, 239, 0.06)',
    borderColor: 'rgba(91, 141, 239, 0.25)',
  },
  resolveBtnCloud: {
    backgroundColor: 'rgba(126, 200, 227, 0.06)',
    borderColor: 'rgba(126, 200, 227, 0.25)',
  },
  resolveBtnBoth: {
    backgroundColor: 'rgba(76, 175, 80, 0.06)',
    borderColor: 'rgba(76, 175, 80, 0.25)',
  },
  resolveBtnTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  resolveBtnSub: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginTop: 2,
  },
});



