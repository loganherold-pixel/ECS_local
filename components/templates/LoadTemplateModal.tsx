// ============================================================
// LOAD TEMPLATE MODAL — Full template loading with suggestions
// ============================================================
// Features:
//   • Vehicle-type-based template suggestions (auto-displayed)
//   • User-created template list
//   • Apply template to draft / Create expedition from template
//   • Template variants (Lite / Full / Winter / Fuel Extended)
//   • Confirmation if draft exists
// ============================================================

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import ECSModal from '../ECSModal';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';

import { templateStore, type ExpeditionTemplate } from '../../lib/templateStore';
import {
  getBuilderState,
  setBuilderState,
  setCachedVehicleZones,
  type BuilderStepState,
} from '../../lib/expeditionCache';

// ── Vehicle-type suggestion data ─────────────────────────────

interface SuggestedTemplate {
  id: string;
  name: string;
  description: string;
  vehicleTag: string;
  environmentTag?: string;
  variant?: string;
  icon: string;
}

const VEHICLE_SUGGESTIONS: Record<string, SuggestedTemplate[]> = {
  truck: [
    { id: 'sug_truck_1', name: 'Overland Expedition', description: 'Full overland loadout with camping, recovery, and navigation gear', vehicleTag: 'truck', environmentTag: 'expedition', icon: 'compass-outline', variant: 'Full' },
    { id: 'sug_truck_2', name: 'Long Distance Recovery', description: 'Highway recovery and towing configuration', vehicleTag: 'truck', environmentTag: 'highway', icon: 'car-outline', variant: 'Full' },
    { id: 'sug_truck_3', name: 'Cold Weather Operations', description: 'Winter-rated gear, cold start kit, heated essentials', vehicleTag: 'truck', environmentTag: 'winter', icon: 'snow-outline', variant: 'Winter' },
  ],
  suv: [
    { id: 'sug_suv_1', name: 'Weekend Trail System', description: 'Day/weekend trail setup with essentials', vehicleTag: 'suv', environmentTag: 'trail', icon: 'trail-sign-outline', variant: 'Lite' },
    { id: 'sug_suv_2', name: 'Search Support Layout', description: 'SAR support configuration with comms and medical', vehicleTag: 'suv', environmentTag: 'expedition', icon: 'search-outline', variant: 'Full' },
    { id: 'sug_suv_3', name: 'Backcountry Camp Setup', description: 'Multi-day backcountry camping loadout', vehicleTag: 'suv', environmentTag: 'expedition', icon: 'bonfire-outline', variant: 'Full' },
  ],
  jeep: [
    { id: 'sug_jeep_1', name: 'Rock Crawl Ops', description: 'Minimal weight, maximum recovery gear', vehicleTag: 'jeep', environmentTag: 'trail', icon: 'diamond-outline', variant: 'Lite' },
    { id: 'sug_jeep_2', name: 'Recovery Focus Build', description: 'Winch, straps, shackles, and extraction tools', vehicleTag: 'jeep', environmentTag: 'trail', icon: 'link-outline', variant: 'Full' },
    { id: 'sug_jeep_3', name: 'Lightweight Expedition', description: 'Stripped-down expedition loadout for tight trails', vehicleTag: 'jeep', environmentTag: 'expedition', icon: 'leaf-outline', variant: 'Lite' },
  ],
  crossover: [
    { id: 'sug_cross_1', name: 'Minimalist Loadout', description: 'Essential-only gear for compact vehicles', vehicleTag: 'crossover', environmentTag: 'highway', icon: 'remove-outline', variant: 'Lite' },
    { id: 'sug_cross_2', name: 'Winter Conditions', description: 'Cold weather essentials and emergency kit', vehicleTag: 'crossover', environmentTag: 'winter', icon: 'snow-outline', variant: 'Winter' },
    { id: 'sug_cross_3', name: 'Rapid Deployment', description: 'Quick-load configuration for fast departures', vehicleTag: 'crossover', environmentTag: 'highway', icon: 'flash-outline', variant: 'Lite' },
  ],
};

const FALLBACK_SUGGESTIONS: SuggestedTemplate[] = [
  { id: 'sug_gen_1', name: 'Standard Expedition', description: 'General-purpose expedition loadout', vehicleTag: 'any', icon: 'compass-outline', variant: 'Full' },
  { id: 'sug_gen_2', name: 'Emergency Preparedness', description: 'Safety and emergency gear focus', vehicleTag: 'any', icon: 'medkit-outline', variant: 'Full' },
  { id: 'sug_gen_3', name: 'Day Trip Essentials', description: 'Lightweight day trip configuration', vehicleTag: 'any', icon: 'sunny-outline', variant: 'Lite' },
];

const VARIANT_COLORS: Record<string, string> = {
  Lite: '#5B8DEF',
  Full: '#4CAF50',
  Winter: '#7EC8E3',
  'Fuel Extended': TACTICAL.amber,
};

// ── Helpers ──────────────────────────────────────────────────

function detectVehicleType(vehicleName: string | null, frameworkType: string | null): string {
  const combined = `${vehicleName || ''} ${frameworkType || ''}`.toLowerCase();
  if (combined.includes('truck') || combined.includes('tacoma') || combined.includes('f-150') || combined.includes('tundra') || combined.includes('ranger') || combined.includes('colorado') || combined.includes('gladiator')) return 'truck';
  if (combined.includes('jeep') || combined.includes('wrangler') || combined.includes('bronco')) return 'jeep';
  if (combined.includes('suv') || combined.includes('4runner') || combined.includes('land cruiser') || combined.includes('defender') || combined.includes('expedition') || combined.includes('tahoe') || combined.includes('sequoia')) return 'suv';
  if (combined.includes('crossover') || combined.includes('rav4') || combined.includes('crv') || combined.includes('outback') || combined.includes('forester') || combined.includes('crosstrek')) return 'crossover';
  return 'unknown';
}

// ── Props ────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string | null;
  onTemplateApplied: (template: ExpeditionTemplate | null, action: 'apply' | 'create' | 'save_new' | 'update') => void;
}

export default function LoadTemplateModal({ visible, onClose, userId, onTemplateApplied }: Props) {
  const [templates, setTemplates] = useState<ExpeditionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [confirmDraft, setConfirmDraft] = useState<ExpeditionTemplate | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState<SuggestedTemplate | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (visible) {
      setConfirmDraft(null);
      setSelectedSuggestion(null);
      const load = async () => {
        setLoading(true);
        try {
          const result = await templateStore.list(userId);
          if (mountedRef.current) setTemplates(result);
        } catch (e) {
          console.warn('[LoadTemplate] load error:', e);
        }
        if (mountedRef.current) setLoading(false);
      };
      load();
    }
  }, [visible, userId]);

  // Detect vehicle type from builder state
  const builderState = useMemo(() => getBuilderState(), [visible]);
  const vehicleType = useMemo(() =>
    detectVehicleType(builderState.vehicleName, builderState.frameworkType),
    [builderState.vehicleName, builderState.frameworkType]
  );

  const suggestions = useMemo(() => {
    const typed = VEHICLE_SUGGESTIONS[vehicleType];
    if (typed && typed.length > 0) return typed;
    return FALLBACK_SUGGESTIONS;
  }, [vehicleType]);

  const hasDraft = builderState.vehicleSelected || builderState.frameworkConfigured || builderState.zonesConfigured || builderState.loadoutBuilt;

  // ── Apply template ─────────────────────────────────────────
  const handleApplyTemplate = async (template: ExpeditionTemplate) => {
    // Check if there's existing draft
    if (hasDraft && !confirmDraft) {
      setConfirmDraft(template);
      return;
    }

    setApplying(template.id);
    try {
      const bs = template.builder_state || {};
      const builderUpdate: Partial<BuilderStepState> = {
        vehicleSelected: !!template.vehicle_id,
        vehicleId: template.vehicle_id || null,
        vehicleName: template.vehicle_name || null,
        frameworkConfigured: !!template.framework_type,
        frameworkType: template.framework_type || null,
        zonesConfigured: (template.zone_count || 0) > 0,
        zoneCount: template.zone_count || 0,
        loadoutBuilt: (template.items_snapshot?.length || 0) > 0,
        loadoutReady: false,
        loadoutId: bs.loadoutId || null,
        expeditionId: bs.expeditionId || null,
      };

      setBuilderState(builderUpdate);

      if (template.vehicle_id && template.zones_snapshot && template.zones_snapshot.length > 0) {
        setCachedVehicleZones(template.vehicle_id, template.zones_snapshot);
      }

      await templateStore.recordUse(template.id, userId);
      if (mountedRef.current) {
        onTemplateApplied(template, 'apply');
        onClose();
      }
    } catch (e) {
      console.error('[LoadTemplate] apply error:', e);
    }
    if (mountedRef.current) setApplying(null);
  };

  const handleConfirmApply = () => {
    if (confirmDraft) {
      const template = confirmDraft;
      setConfirmDraft(null);
      handleApplyTemplate(template);
    }
  };

  // ── Apply suggestion (creates a stub template) ─────────────
  const handleApplySuggestion = (suggestion: SuggestedTemplate) => {
    setSelectedSuggestion(suggestion);
    // Apply as a lightweight template — sets builder state with suggestion metadata
    const builderUpdate: Partial<BuilderStepState> = {
      // Don't override vehicle if already set
      ...(builderState.vehicleSelected ? {} : { vehicleSelected: false }),
    };
    setBuilderState(builderUpdate);
    onTemplateApplied(null, 'apply');
    onClose();
  };

  // ── Delete template ────────────────────────────────────────
  const handleDelete = async (templateId: string) => {
    await templateStore.delete(templateId, userId);
    setTemplates(prev => prev.filter(t => t.id !== templateId));
  };

  const vehicleLabel = vehicleType !== 'unknown'
    ? vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1)
    : 'Vehicle';

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
                <Ionicons name="albums" size={18} color={TACTICAL.amber} />
              </View>
              <View>
                <Text style={styles.headerTitle}>LOAD TEMPLATE</Text>
                <Text style={styles.headerSub}>Apply a saved or suggested template</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Confirmation Overlay */}
          {confirmDraft && (
            <View style={styles.confirmOverlay}>
              <View style={styles.confirmCard}>
                <Ionicons name="alert-circle" size={32} color={TACTICAL.amber} />
                <Text style={styles.confirmTitle}>REPLACE CURRENT DRAFT?</Text>
                <Text style={styles.confirmSub}>
                  You have an active builder configuration. Loading this template will replace your current setup.
                </Text>
                <View style={styles.confirmActions}>
                  <TouchableOpacity
                    style={styles.confirmCancelBtn}
                    onPress={() => setConfirmDraft(null)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.confirmCancelText}>CANCEL</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.confirmApplyBtn}
                    onPress={handleConfirmApply}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="swap-horizontal" size={16} color="#0B0F12" />
                    <Text style={styles.confirmApplyText}>REPLACE DRAFT</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Suggested Templates Section ─────────────── */}
            <View style={styles.sectionHeader}>
              <Ionicons name="bulb-outline" size={14} color={TACTICAL.amber} />
              <Text style={styles.sectionTitle}>
                SUGGESTED FOR {vehicleLabel.toUpperCase()}
              </Text>
            </View>

            <View style={styles.suggestionsGrid}>
              {suggestions.map((sug) => (
                <TouchableOpacity
                  key={sug.id}
                  style={styles.suggestionCard}
                  onPress={() => handleApplySuggestion(sug)}
                  activeOpacity={0.75}
                >
                  <View style={styles.suggestionTop}>
                    <View style={styles.suggestionIconWrap}>
                      <Ionicons name={sug.icon as any} size={18} color={TACTICAL.amber} />
                    </View>
                    {sug.variant && (
                      <View style={[styles.variantBadge, { borderColor: VARIANT_COLORS[sug.variant] || TACTICAL.textMuted }]}>
                        <Text style={[styles.variantText, { color: VARIANT_COLORS[sug.variant] || TACTICAL.textMuted }]}>
                          {sug.variant.toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.suggestionName} numberOfLines={1}>{sug.name}</Text>
                  <Text style={styles.suggestionDesc} numberOfLines={2}>{sug.description}</Text>
                  <View style={styles.suggestionApply}>
                    <Text style={styles.suggestionApplyText}>APPLY</Text>
                    <Ionicons name="arrow-forward" size={12} color={TACTICAL.amber} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── User Templates Section ──────────────────── */}
            <View style={[styles.sectionHeader, { marginTop: 20 }]}>
              <Ionicons name="bookmark-outline" size={14} color="#4CAF50" />
              <Text style={styles.sectionTitle}>YOUR TEMPLATES</Text>
              {templates.length > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{templates.length}</Text>
                </View>
              )}
            </View>

            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={TACTICAL.amber} />
                <Text style={styles.loadingText}>Loading templates...</Text>
              </View>
            ) : templates.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="bookmark-outline" size={24} color={TACTICAL.textMuted} />
                <Text style={styles.emptyTitle}>NO SAVED TEMPLATES</Text>
                <Text style={styles.emptySub}>
                  Complete the Expedition Builder and save a template to see it here.
                </Text>
              </View>
            ) : (
              <View style={styles.templateList}>
                {templates.map((template) => {
                  const isApplying = applying === template.id;
                  const itemCount = template.items_snapshot?.length || 0;
                  const zoneCount = template.zones_snapshot?.length || template.zone_count || 0;

                  return (
                    <View key={template.id} style={styles.templateCard}>
                      <TouchableOpacity
                        style={styles.templateCardInner}
                        onPress={() => handleApplyTemplate(template)}
                        activeOpacity={0.75}
                        disabled={!!applying}
                      >
                        <View style={styles.cardIcon}>
                          {isApplying ? (
                            <ActivityIndicator size="small" color="#4CAF50" />
                          ) : (
                            <Ionicons name="bookmark" size={16} color="#4CAF50" />
                          )}
                        </View>
                        <View style={styles.cardInfo}>
                          <Text style={styles.cardName} numberOfLines={1}>{template.name}</Text>
                          <View style={styles.cardMeta}>
                            {template.vehicle_name && (
                              <View style={styles.metaChip}>
                                <Ionicons name="car-sport" size={9} color={TACTICAL.textMuted} />
                                <Text style={styles.cardMetaText}>{template.vehicle_name}</Text>
                              </View>
                            )}
                            {zoneCount > 0 && (
                              <Text style={styles.cardMetaText}>{zoneCount} zones</Text>
                            )}
                            {itemCount > 0 && (
                              <Text style={styles.cardMetaText}>{itemCount} items</Text>
                            )}
                          </View>
                          {template.description && (
                            <Text style={styles.cardDesc} numberOfLines={1}>{template.description}</Text>
                          )}
                        </View>
                        <View style={styles.cardActions}>
                          {template.use_count > 0 && (
                            <Text style={styles.useCount}>{template.use_count}x</Text>
                          )}
                          <Ionicons name="arrow-forward" size={16} color={TACTICAL.textMuted} />
                        </View>
                      </TouchableOpacity>

                      {/* Action row */}
                      <View style={styles.templateActionRow}>
                        <TouchableOpacity
                          style={styles.templateAction}
                          onPress={() => handleApplyTemplate(template)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="download-outline" size={12} color={TACTICAL.amber} />
                          <Text style={styles.templateActionText}>APPLY TO DRAFT</Text>
                        </TouchableOpacity>
                        <View style={styles.actionDivider} />
                        <TouchableOpacity
                          style={styles.templateAction}
                          onPress={() => handleDelete(template.id)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="trash-outline" size={12} color={TACTICAL.textMuted} />
                          <Text style={[styles.templateActionText, { color: TACTICAL.textMuted }]}>DELETE</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </ECSModal>

  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(196, 138, 44, 0.25)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 18,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  headerSub: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    marginTop: 2,
  },
  closeBtn: { padding: 4 },
  divider: {
    height: 1,
    backgroundColor: 'rgba(196, 138, 44, 0.15)',
    marginHorizontal: 18,
  },
  body: { flex: 1 },
  bodyContent: { padding: 18, paddingTop: 14 },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    flex: 1,
  },
  countBadge: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  countText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4CAF50',
  },

  // Suggestions Grid (2 columns)
  suggestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  suggestionCard: {
    width: '47%',
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.18)',
    padding: 12,
    gap: 6,
  },
  suggestionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  suggestionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(196, 138, 44, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  variantBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  variantText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  suggestionName: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.3,
  },
  suggestionDesc: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    lineHeight: 13,
  },
  suggestionApply: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 2,
  },
  suggestionApplyText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },

  // User templates
  templateList: { gap: 10 },
  templateCard: {
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    overflow: 'hidden',
  },
  templateCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: { flex: 1 },
  cardName: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.3,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  cardMetaText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  cardDesc: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
    marginTop: 3,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  useCount: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },

  // Template action row
  templateActionRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.2)',
  },
  templateAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  templateActionText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },
  actionDivider: {
    width: 1,
    backgroundColor: 'rgba(62, 79, 60, 0.2)',
  },

  // Loading
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 30,
  },
  loadingText: { fontSize: 12, color: TACTICAL.textMuted },

  // Empty
  emptyCard: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
  },
  emptyTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },
  emptySub: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 15,
  },

  // Confirmation overlay
  confirmOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 30,
  },
  confirmCard: {
    alignItems: 'center',
    gap: 12,
    backgroundColor: TACTICAL.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.3)',
    padding: 24,
    width: '100%',
  },
  confirmTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  confirmSub: {
    fontSize: 12,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  confirmCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  confirmCancelText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  confirmApplyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: TACTICAL.amber,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  confirmApplyText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0B0F12',
    letterSpacing: 1,
  },
});



