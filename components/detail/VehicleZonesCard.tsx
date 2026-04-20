import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  Switch,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type { VehicleZoneTreeNode, VehicleZone } from '../../lib/types';
import { isDeployedEdgeFunction, supabase } from '../../lib/supabase';

// ============================================================
// ZONE TYPE CONFIG
// ============================================================
const ZONE_TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  area:      { icon: 'map-outline',       color: '#5B8DEF', label: 'AREA' },
  container: { icon: 'cube-outline',      color: '#4CAF50', label: 'CONTAINER' },
  slot:      { icon: 'grid-outline',      color: TACTICAL.amber, label: 'SLOT' },
  drawer:    { icon: 'file-tray-outline', color: '#9B59B6', label: 'DRAWER' },
  rack:      { icon: 'layers-outline',    color: '#E67E22', label: 'RACK' },
};

function getZoneTypeConfig(zoneType: string) {
  return ZONE_TYPE_CONFIG[zoneType] || ZONE_TYPE_CONFIG.area;
}

// ============================================================
// HELPERS
// ============================================================
function confirmDialog(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS === 'web') {
      resolve(confirm(`${title}\n\n${message}`));
    } else {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'OK', style: 'default', onPress: () => resolve(true) },
      ]);
    }
  });
}

function toIntOrNull(v: string): number | null {
  if (v == null) return null;
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

// ============================================================
// TREE NODE COMPONENT (recursive)
// - Tap row selects (opens edit modal)
// - Chevron toggles expand/collapse
// ============================================================
function ZoneTreeNode({
  node,
  depth = 0,
  onSelect,
}: {
  node: VehicleZoneTreeNode;
  depth?: number;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1); // auto-expand first level
  const hasChildren = node.children && node.children.length > 0;

  const config = getZoneTypeConfig((node as any).zone_type || 'area');
  const nodeColor = (node as any).color || config.color;
  const displayName = (node as any).name ?? (node as any).zone_name ?? 'Unnamed Zone';
  const slotCount = Number((node as any).slot_count ?? 0);

  return (
    <View style={[s.nodeContainer, { marginLeft: depth * 16 }]}>
      <View style={[s.nodeRow, depth === 0 && s.nodeRowRoot]}>
        {/* Expand/collapse chevron */}
        <TouchableOpacity
          style={s.nodeChevronWrap}
          onPress={() => hasChildren && setExpanded(!expanded)}
          activeOpacity={hasChildren ? 0.7 : 1}
        >
          {hasChildren ? (
            <Ionicons
              name={expanded ? 'chevron-down' : 'chevron-forward'}
              size={14}
              color={TACTICAL.textMuted}
            />
          ) : (
            <View style={[s.depthDot, { backgroundColor: nodeColor }]} />
          )}
        </TouchableOpacity>

        {/* Main tap area selects the node */}
        <TouchableOpacity
          style={s.nodeTapArea}
          onPress={() => onSelect(node.id)}
          activeOpacity={0.75}
        >
          {/* Zone icon */}
          <View style={[s.nodeIconWrap, { borderColor: nodeColor }]}>
            <Ionicons name={((node as any).icon || config.icon) as any} size={14} color={nodeColor} />
          </View>

          {/* Zone info */}
          <View style={s.nodeInfo}>
            <Text style={s.nodeName}>{displayName}</Text>
            <View style={s.nodeMetaRow}>
              <View style={[s.typeBadge, { borderColor: nodeColor }]}>
                <Text style={[s.typeBadgeText, { color: nodeColor }]}>{config.label}</Text>
              </View>

              {slotCount > 0 && (
                <Text style={s.slotCount}>{slotCount} slots</Text>
              )}

              {hasChildren && (
                <Text style={s.childCount}>
                  {node.children.length} sub-zone{node.children.length !== 1 ? 's' : ''}
                </Text>
              )}
            </View>
          </View>

          {/* Color swatch */}
          {(node as any).color && (
            <View style={[s.colorSwatch, { backgroundColor: (node as any).color }]} />
          )}
        </TouchableOpacity>
      </View>

      {/* Notes */}
      {(node as any).notes && expanded && (
        <View style={[s.notesWrap, { marginLeft: 44 }]}>
          <Text style={s.notesText}>{(node as any).notes}</Text>
        </View>
      )}

      {/* Children */}
      {expanded && hasChildren && (
        <View style={s.childrenContainer}>
          {node.children.map((child) => (
            <ZoneTreeNode key={child.id} node={child} depth={depth + 1} onSelect={onSelect} />
          ))}
        </View>
      )}
    </View>
  );
}

// ============================================================
// MAIN CARD
// ============================================================
interface Props {
  zonesTree: VehicleZoneTreeNode[];
  zonesFlat: VehicleZone[];
  loading: boolean;
  error: string | null;
  vehicleName?: string | null;

  // Called to refetch zones after save (you already pass this from expedition-detail)
  onRetry?: () => void;
}

export default function VehicleZonesCard({
  zonesTree,
  zonesFlat,
  loading,
  error,
  vehicleName,
  onRetry,
}: Props) {
  const [showFlat, setShowFlat] = useState(false);

  // Selection + editing
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Local edit fields
  const [zoneName, setZoneName] = useState('');
  const [zoneType, setZoneType] = useState('area');
  const [sortOrder, setSortOrder] = useState('0');
  const [notes, setNotes] = useState('');
  const [isExternal, setIsExternal] = useState(false);
  const [exposureRating, setExposureRating] = useState(''); // optional int
  const [maxLoadLbs, setMaxLoadLbs] = useState('');         // optional int
  const [rearBias, setRearBias] = useState(false);

  const zoneById = useMemo(() => {
    const m = new Map<string, VehicleZone>();
    zonesFlat.forEach((z) => m.set(z.id, z));
    return m;
  }, [zonesFlat]);

  // Summary stats
  const totalZones = zonesFlat.length;
  const totalSlots = zonesFlat.reduce((sum, z: any) => sum + Number(z.slot_count || 0), 0);
  const topLevelCount = zonesTree.length;
  const zoneTypes = [...new Set(zonesFlat.map((z: any) => z.zone_type).filter(Boolean))];

  function openEditor(zoneId: string) {
    const z: any = zoneById.get(zoneId);
    if (!z) return;

    setSelectedZoneId(zoneId);

    setZoneName(z.name ?? z.zone_name ?? '');
    setZoneType(z.zone_type ?? 'area');
    setSortOrder(String(z.sort_order ?? 0));
    setNotes(z.notes ?? '');
    setIsExternal(Boolean(z.is_external));
    setExposureRating(z.exposure_rating == null ? '' : String(z.exposure_rating));
    setMaxLoadLbs(z.max_load_lbs == null ? '' : String(z.max_load_lbs));
    setRearBias(Boolean(z.rear_bias));

    setEditOpen(true);
  }

  function closeEditor() {
    setEditOpen(false);
    setSelectedZoneId(null);
  }

  async function saveEdits() {
    if (!selectedZoneId) return;

    if (!isDeployedEdgeFunction('update-vehicle-zone')) {
      Alert.alert(
        'Zone Editing Unavailable',
        'This ECS build does not include cloud zone editing. Vehicle zones remain viewable, but edits cannot be synced from this screen.'
      );
      return;
    }

    const trimmedName = zoneName.trim();
    if (!trimmedName) {
      Alert.alert('Missing Name', 'Zone name is required.');
      return;
    }

    // Build patch (only include fields you want editable)
    const patch: Record<string, any> = {
      zone_name: trimmedName,
      zone_type: zoneType,
      sort_order: toIntOrNull(sortOrder) ?? 0,
      notes: notes?.trim() ? notes.trim() : null,
      is_external: Boolean(isExternal),
      rear_bias: Boolean(rearBias),
      exposure_rating: toIntOrNull(exposureRating),
      max_load_lbs: toIntOrNull(maxLoadLbs),
    };

    const ok = await confirmDialog(
      'Save Changes',
      'Apply these changes to this zone?'
    );
    if (!ok) return;

    setSaving(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('update-vehicle-zone', {
        body: {
          zone_id: selectedZoneId,
          patch,
        },
      });

      if (fnError) {
        console.error('[VehicleZones] update edge error:', fnError);
        throw fnError;
      }

      // Optional: you can inspect data.updated if you want
      // console.log('updated zone:', data?.updated);

      closeEditor();

      // Refresh zones from parent
      onRetry?.();
    } catch (e: any) {
      console.error('[VehicleZones] save failed:', e);
      Alert.alert('Save Failed', e?.message || 'Unable to save zone changes.');
    } finally {
      setSaving(false);
    }
  }

  const selectedZone: any = selectedZoneId ? zoneById.get(selectedZoneId) : null;

  return (
    <View style={s.card}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Ionicons name="car-outline" size={18} color={TACTICAL.amber} />
          <View>
            <Text style={s.headerTitle}>VEHICLE ZONES</Text>
            {vehicleName && <Text style={s.headerSubtitle}>{vehicleName}</Text>}
          </View>
        </View>

        {zonesFlat.length > 0 && (
          <TouchableOpacity style={s.viewToggle} onPress={() => setShowFlat(!showFlat)}>
            <Ionicons
              name={showFlat ? 'git-branch-outline' : 'list-outline'}
              size={14}
              color={TACTICAL.textMuted}
            />
            <Text style={s.viewToggleText}>{showFlat ? 'TREE' : 'FLAT'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Loading */}
      {loading && (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="small" color={TACTICAL.accent} />
          <Text style={s.loadingText}>LOADING ZONES...</Text>
        </View>
      )}

      {/* Error */}
      {error && !loading && (
        <View style={s.errorWrap}>
          <Ionicons name="alert-circle-outline" size={20} color={TACTICAL.danger} />
          <Text style={s.errorText}>{error}</Text>
          {onRetry && (
            <TouchableOpacity style={s.retryBtn} onPress={onRetry}>
              <Text style={s.retryText}>RETRY</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Empty state */}
      {!loading && !error && zonesFlat.length === 0 && (
        <View style={s.emptyWrap}>
          <Ionicons name="cube-outline" size={32} color={TACTICAL.textMuted} />
          <Text style={s.emptyTitle}>NO ZONES CONFIGURED</Text>
          <Text style={s.emptySubtitle}>Add vehicle zones in the database to organize storage areas</Text>
        </View>
      )}

      {/* Stats strip */}
      {!loading && !error && zonesFlat.length > 0 && (
        <>
          <View style={s.statsStrip}>
            <View style={s.statItem}>
              <Text style={s.statValue}>{totalZones}</Text>
              <Text style={s.statLabel}>ZONES</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={[s.statValue, { color: TACTICAL.amber }]}>{totalSlots}</Text>
              <Text style={s.statLabel}>TOTAL SLOTS</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statValue}>{topLevelCount}</Text>
              <Text style={s.statLabel}>TOP LEVEL</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statValue}>{zoneTypes.length}</Text>
              <Text style={s.statLabel}>TYPES</Text>
            </View>
          </View>

          {/* Tree view */}
          {!showFlat && (
            <View style={s.treeContainer}>
              <Text style={s.hintText}>Tap any zone to edit</Text>
              {zonesTree.map((node) => (
                <ZoneTreeNode key={node.id} node={node} depth={0} onSelect={openEditor} />
              ))}
            </View>
          )}

          {/* Flat view */}
          {showFlat && (
            <View style={s.flatContainer}>
              <Text style={s.hintText}>Tap any zone to edit</Text>
              {zonesFlat.map((zone: any) => {
                const cfg = getZoneTypeConfig(zone.zone_type || 'area');
                const zColor = zone.color || cfg.color;
                const displayName = zone.name ?? zone.zone_name ?? 'Unnamed Zone';
                const slotCount = Number(zone.slot_count ?? 0);

                return (
                  <TouchableOpacity
                    key={zone.id}
                    style={s.flatRow}
                    activeOpacity={0.75}
                    onPress={() => openEditor(zone.id)}
                  >
                    <View style={[s.flatIndicator, { backgroundColor: zColor }]} />
                    <View style={s.flatInfo}>
                      <Text style={s.flatName}>{displayName}</Text>
                      <View style={s.flatMeta}>
                        <View style={[s.typeBadge, { borderColor: zColor }]}>
                          <Text style={[s.typeBadgeText, { color: zColor }]}>{cfg.label}</Text>
                        </View>
                        {slotCount > 0 && <Text style={s.slotCount}>{slotCount} slots</Text>}
                        {zone.parent_zone_id && (
                          <View style={s.nestedBadge}>
                            <Ionicons name="return-down-forward-outline" size={10} color={TACTICAL.textMuted} />
                            <Text style={s.nestedText}>NESTED</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </>
      )}

      {/* =========================
          EDIT MODAL
         ========================= */}
      <Modal visible={editOpen} transparent animationType="slide" onRequestClose={closeEditor}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitle}>EDIT ZONE</Text>
                <Text style={s.modalSubtitle} numberOfLines={1}>
                  {(selectedZone?.name ?? selectedZone?.zone_name ?? '').toString()}
                </Text>
              </View>
              <TouchableOpacity onPress={closeEditor} style={s.modalCloseBtn}>
                <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={s.modalBody} contentContainerStyle={{ paddingBottom: 18 }} showsVerticalScrollIndicator={false}>
              {/* Name */}
              <Text style={s.fieldLabel}>Zone Name</Text>
              <TextInput
                value={zoneName}
                onChangeText={setZoneName}
                placeholder="e.g., Cab, Right Drawer, Roof Rack"
                placeholderTextColor={TACTICAL.textMuted}
                style={s.input}
              />

              {/* Type */}
              <Text style={[s.fieldLabel, { marginTop: 12 }]}>Zone Type</Text>
              <View style={s.typeRow}>
                {Object.keys(ZONE_TYPE_CONFIG).map((k) => {
                  const cfg = getZoneTypeConfig(k);
                  const active = zoneType === k;
                  return (
                    <TouchableOpacity
                      key={k}
                      style={[
                        s.typePill,
                        active && { borderColor: cfg.color, backgroundColor: 'rgba(0,0,0,0.25)' },
                      ]}
                      onPress={() => setZoneType(k)}
                    >
                      <Ionicons name={cfg.icon as any} size={14} color={active ? cfg.color : TACTICAL.textMuted} />
                      <Text style={[s.typePillText, { color: active ? cfg.color : TACTICAL.textMuted }]}>
                        {cfg.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Sort Order */}
              <Text style={[s.fieldLabel, { marginTop: 12 }]}>Sort Order</Text>
              <TextInput
                value={sortOrder}
                onChangeText={setSortOrder}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={TACTICAL.textMuted}
                style={s.input}
              />

              {/* Notes */}
              <Text style={[s.fieldLabel, { marginTop: 12 }]}>Notes</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional notes shown in the tree"
                placeholderTextColor={TACTICAL.textMuted}
                style={[s.input, s.textArea]}
                multiline
              />

              {/* Toggles */}
              <View style={s.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.switchLabel}>External</Text>
                  <Text style={s.switchHint}>Exposed to weather / outside vehicle</Text>
                </View>
                <Switch value={isExternal} onValueChange={setIsExternal} />
              </View>

              <View style={s.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.switchLabel}>Rear Bias</Text>
                  <Text style={s.switchHint}>Weight bias toward rear</Text>
                </View>
                <Switch value={rearBias} onValueChange={setRearBias} />
              </View>

              {/* Optional numeric fields */}
              <Text style={[s.fieldLabel, { marginTop: 12 }]}>Exposure Rating (optional)</Text>
              <TextInput
                value={exposureRating}
                onChangeText={setExposureRating}
                keyboardType="numeric"
                placeholder="e.g., 1-10"
                placeholderTextColor={TACTICAL.textMuted}
                style={s.input}
              />

              <Text style={[s.fieldLabel, { marginTop: 12 }]}>Max Load (lbs) (optional)</Text>
              <TextInput
                value={maxLoadLbs}
                onChangeText={setMaxLoadLbs}
                keyboardType="numeric"
                placeholder="e.g., 150"
                placeholderTextColor={TACTICAL.textMuted}
                style={s.input}
              />
            </ScrollView>

            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={closeEditor} disabled={saving}>
                <Text style={s.cancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={saveEdits} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color={TACTICAL.text} />
                ) : (
                  <Text style={s.saveText}>SAVE</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
  card: {
    backgroundColor: TACTICAL.panel,
    borderRadius: TACTICAL.radius,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    marginBottom: 14,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.2)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  headerSubtitle: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },
  viewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: TACTICAL.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  viewToggleText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  loadingWrap: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 8,
  },
  loadingText: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  errorWrap: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.danger,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: TACTICAL.accent,
    borderRadius: 8,
  },
  retryText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  emptySubtitle: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    paddingHorizontal: 20,
  },

  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  statLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(62, 79, 60, 0.3)',
  },

  hintText: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    marginBottom: 8,
    letterSpacing: 0.6,
  },

  treeContainer: {
    padding: 12,
  },
  nodeContainer: {
    marginBottom: 2,
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 2,
    borderRadius: 8,
  },
  nodeRowRoot: {
    backgroundColor: 'rgba(0,0,0,0.10)',
    marginBottom: 4,
  },
  nodeChevronWrap: {
    width: 28,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeTapArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    gap: 8,
  },
  depthDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  nodeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  nodeInfo: {
    flex: 1,
  },
  nodeName: {
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  nodeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  slotCount: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  childCount: {
    fontSize: 10,
    color: TACTICAL.textMuted,
  },
  colorSwatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  notesWrap: {
    paddingVertical: 4,
    paddingRight: 12,
  },
  notesText: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  childrenContainer: {
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(62, 79, 60, 0.25)',
    marginLeft: 14,
    paddingLeft: 6,
  },

  flatContainer: {
    padding: 12,
    gap: 4,
  },
  flatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 8,
    gap: 10,
  },
  flatIndicator: {
    width: 4,
    height: 28,
    borderRadius: 2,
  },
  flatInfo: {
    flex: 1,
  },
  flatName: {
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  flatMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  nestedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  nestedText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.2)',
    gap: 10,
  },
  modalTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  modalSubtitle: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    marginTop: 3,
  },
  modalCloseBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  modalBody: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: TACTICAL.text,
    fontSize: 13,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },

  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  typePillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  switchLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.text,
  },
  switchHint: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    marginTop: 2,
  },

  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.2)',
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  cancelText: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  saveBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: TACTICAL.accent,
  },
  saveText: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },
});


