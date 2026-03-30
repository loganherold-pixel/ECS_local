// ============================================================
// TEMPLATE PICKER — Select a template to pre-populate builder
// ============================================================
// Used inside CreateExpeditionModal or expedition wizard to
// offer "FROM TEMPLATE" functionality.
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Animated,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { templateStore, type ExpeditionTemplate } from '../../lib/templateStore';
import {
  setBuilderState,
  setCachedVehicleZones,
  type BuilderStepState,
} from '../../lib/expeditionCache';

interface Props {
  userId: string | null;
  onTemplateApplied: (template: ExpeditionTemplate) => void;
  onCancel: () => void;
}

export default function TemplatePicker({ userId, onTemplateApplied, onCancel }: Props) {
  const [templates, setTemplates] = useState<ExpeditionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const result = await templateStore.list(userId);
        if (mountedRef.current) setTemplates(result);
      } catch (e) {
        console.warn('[TemplatePicker] load error:', e);
      }
      if (mountedRef.current) setLoading(false);
    };
    load();
  }, [userId]);

  const handleApply = async (template: ExpeditionTemplate) => {
    setApplying(template.id);

    try {
      // Restore builder state from template
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
        loadoutReady: false, // User must manually set ready
        loadoutId: bs.loadoutId || null,
        expeditionId: bs.expeditionId || null,
      };

      setBuilderState(builderUpdate);

      // Restore cached zones
      if (template.vehicle_id && template.zones_snapshot && template.zones_snapshot.length > 0) {
        setCachedVehicleZones(template.vehicle_id, template.zones_snapshot);
      }

      // Record template usage
      await templateStore.recordUse(template.id, userId);

      if (mountedRef.current) {
        onTemplateApplied(template);
      }
    } catch (e) {
      console.error('[TemplatePicker] apply error:', e);
    }

    if (mountedRef.current) setApplying(null);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={TACTICAL.amber} />
        <Text style={styles.loadingText}>Loading templates...</Text>
      </View>
    );
  }

  if (templates.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="bookmark-outline" size={28} color={TACTICAL.textMuted} />
        <Text style={styles.emptyTitle}>NO TEMPLATES AVAILABLE</Text>
        <Text style={styles.emptySub}>
          Complete the Expedition Builder and save a template first.
        </Text>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>BACK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onCancel} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={18} color={TACTICAL.textMuted} />
        </TouchableOpacity>
        <Text style={styles.title}>SELECT TEMPLATE</Text>
        <View style={{ width: 30 }} />
      </View>

      <Text style={styles.subtitle}>
        Choose a template to pre-populate all builder steps
      </Text>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {templates.map((template) => {
          const isApplying = applying === template.id;
          const itemCount = template.items_snapshot?.length || 0;
          const zoneCount = template.zones_snapshot?.length || template.zone_count || 0;

          return (
            <TouchableOpacity
              key={template.id}
              style={styles.templateCard}
              onPress={() => handleApply(template)}
              activeOpacity={0.75}
              disabled={!!applying}
            >
              <View style={styles.cardLeft}>
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
                      <Text style={styles.cardMetaText}>
                        {template.vehicle_name}
                      </Text>
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
              </View>
              <View style={styles.cardRight}>
                {template.use_count > 0 && (
                  <Text style={styles.useCount}>{template.use_count}x</Text>
                )}
                <Ionicons name="arrow-forward" size={16} color={TACTICAL.textMuted} />
              </View>
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 40,
  },
  loadingText: { fontSize: 12, color: TACTICAL.textMuted },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 30,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },
  emptySub: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    marginTop: 8,
  },
  cancelBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  backBtn: { padding: 4 },
  title: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  subtitle: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    marginBottom: 14,
  },

  // List
  list: { flex: 1 },

  // Card
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    marginBottom: 8,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
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
    gap: 8,
    marginTop: 3,
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
  cardRight: {
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
});



