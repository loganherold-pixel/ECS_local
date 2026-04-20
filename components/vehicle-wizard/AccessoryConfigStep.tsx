/**
 * AccessoryConfigStep — Step 2 of the Vehicle Configuration Wizard
 *
 * ACCESSORY FRAMEWORK
 *   Subtitle: "Define your vehicle container system"
 *
 * This is the single user-facing screen for defining the vehicle's
 * accessory/container ecosystem. When saved, ECS automatically derives
 * the vehicle's container structure behind the scenes — no separate
 * container or loadout wizard step is needed.
 *
 * UI: Non-scrolling 2-column tile grid (fit screen)
 * 10 accessory categories, each toggleable with Installed/Planned status
 * Quick presets: Minimal, Standard, Full Overland
 *
 * ICONS: Each tile uses a category-specific icon from AccessoryIcons.tsx
 * (MaterialCommunityIcons with Ionicons fallback).
 *
 * FOOTER: Persistent bottom action bar with Back + Finish buttons,
 * positioned above the tab bar. Includes loading/disabled states.
 *
 * ECS dark theme — no white screens.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { AccessoryIcon } from './AccessoryIcons';
import { TACTICAL } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';

// ── ECS Gold Constants ──────────────────────────────────────
const ECS_GOLD = '#C48A2C';
const ECS_GOLD_BG = 'rgba(196, 138, 44, 0.06)';
const ECS_GOLD_BORDER = 'rgba(196, 138, 44, 0.5)';
const FINISH_GREEN = '#66BB6A';

// ── Accessory Category Definition ───────────────────────────
export interface AccessoryCategory {
  id: string;
  label: string;
  icon: string;
  color: string;
}

export const ACCESSORY_CATEGORIES: AccessoryCategory[] = [
  { id: 'cab_rack', label: 'Cab Rack', icon: 'barbell-outline', color: '#FF6B6B' },
  { id: 'cab_rack_acc', label: 'Cab Rack Acc.', icon: 'layers-outline', color: '#FF8A5B' },
  { id: 'bed_drawer', label: 'Bed / Drawer', icon: 'server-outline', color: '#96CEB4' },
  { id: 'roof_rack', label: 'Roof / Crossbars', icon: 'resize-outline', color: '#4FC3F7' },
  { id: 'rtt', label: 'RTT', icon: 'trail-sign-outline', color: '#C77DFF' },
  { id: 'interior_storage', label: 'Interior Storage', icon: 'file-tray-stacked-outline', color: '#4ECDC4' },
  { id: 'fridge_slide', label: 'Fridge / Slide', icon: 'snow-outline', color: '#64DFDF' },
  { id: 'recovery_mount', label: 'Recovery Mount', icon: 'construct-outline', color: '#AB47BC' },
  { id: 'water_storage', label: 'Water Storage', icon: 'water-outline', color: '#26A69A' },
  { id: 'power_system', label: 'Power / Battery', icon: 'flash-outline', color: '#FFB74D' },
];

// ── Accessory State ─────────────────────────────────────────
export type AccessoryStatus = 'installed' | 'planned';

export interface AccessoryState {
  enabled: boolean;
  status: AccessoryStatus;
}

export type AccessorySelections = Record<string, AccessoryState>;

// ── Presets ──────────────────────────────────────────────────
interface Preset {
  id: string;
  label: string;
  icon: string;
  description: string;
  categories: Record<string, AccessoryState>;
}

const PRESETS: Preset[] = [
  {
    id: 'minimal',
    label: 'MINIMAL',
    icon: 'remove-circle-outline',
    description: 'Basic essentials only',
    categories: {
      interior_storage: { enabled: true, status: 'installed' },
      power_system: { enabled: true, status: 'installed' },
    },
  },
  {
    id: 'standard',
    label: 'STANDARD',
    icon: 'options-outline',
    description: 'Common overland setup',
    categories: {
      roof_rack: { enabled: true, status: 'installed' },
      interior_storage: { enabled: true, status: 'installed' },
      fridge_slide: { enabled: true, status: 'installed' },
      recovery_mount: { enabled: true, status: 'installed' },
      water_storage: { enabled: true, status: 'installed' },
      power_system: { enabled: true, status: 'installed' },
    },
  },
  {
    id: 'full_overland',
    label: 'FULL OVERLAND',
    icon: 'shield-checkmark-outline',
    description: 'Complete expedition rig',
    categories: Object.fromEntries(
      ACCESSORY_CATEGORIES.map(c => [c.id, { enabled: true, status: 'installed' }])
    ),
  },
];

// ── Default empty state ─────────────────────────────────────
export function getDefaultAccessorySelections(): AccessorySelections {
  const result: AccessorySelections = {};
  for (const cat of ACCESSORY_CATEGORIES) {
    result[cat.id] = { enabled: false, status: 'installed' };
  }
  return result;
}

// ── Props ───────────────────────────────────────────────────
interface Props {
  accessories: AccessorySelections;
  onAccessoriesChange: (accessories: AccessorySelections) => void;
  onBack: () => void;
  onNext: () => void;
  /** When true, the NEXT button shows "FINISH" instead of "NEXT" */
  isLastStep?: boolean;
}


// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function AccessoryConfigStep({
  accessories,
  onAccessoriesChange,
  onBack,
  onNext,
  isLastStep = false,
}: Props) {

  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Count enabled accessories ─────────────────────────────
  const enabledCount = useMemo(() => {
    return Object.values(accessories).filter(a => a.enabled).length;
  }, [accessories]);

  // ── Toggle accessory enabled/disabled ─────────────────────
  const toggleAccessory = useCallback((catId: string) => {
    hapticMicro();
    const updated = { ...accessories };
    updated[catId] = {
      ...updated[catId],
      enabled: !updated[catId].enabled,
    };
    onAccessoriesChange(updated);
    setActivePreset(null); // Clear preset when manually toggling
    setSaveError(null);
  }, [accessories, onAccessoriesChange]);

  // ── Toggle status (Installed / Planned) ───────────────────
  const toggleStatus = useCallback((catId: string) => {
    hapticMicro();
    const updated = { ...accessories };
    const current = updated[catId];
    if (!current.enabled) return; // Only toggle status for enabled items
    updated[catId] = {
      ...current,
      status: current.status === 'installed' ? 'planned' : 'installed',
    };
    onAccessoriesChange(updated);
    setActivePreset(null);
    setSaveError(null);
  }, [accessories, onAccessoriesChange]);

  // ── Apply preset ──────────────────────────────────────────
  const applyPreset = useCallback((preset: Preset) => {
    hapticMicro();
    const updated = getDefaultAccessorySelections();
    for (const [catId, state] of Object.entries(preset.categories)) {
      if (updated[catId]) {
        updated[catId] = { ...state };
      }
    }
    onAccessoriesChange(updated);
    setActivePreset(preset.id);
    setSaveError(null);
  }, [onAccessoriesChange]);

  // ── Handle Finish with loading state ──────────────────────
  const handleFinish = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      // Small delay for UX feedback
      await new Promise(resolve => setTimeout(resolve, 200));
      onNext();
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to save configuration');
    } finally {
      // Always reset saving state so button is never stuck in loading
      setSaving(false);
    }
  }, [onNext]);

  // ── Handle Back (preserves state) ─────────────────────────
  const handleBack = useCallback(() => {
    hapticMicro();
    onBack();
  }, [onBack]);

  // ── Build 2-column grid rows ──────────────────────────────
  const rows: AccessoryCategory[][] = [];
  for (let i = 0; i < ACCESSORY_CATEGORIES.length; i += 2) {
    rows.push(ACCESSORY_CATEGORIES.slice(i, i + 2));
  }

  return (
    <View style={styles.container}>
      {/* ── Step 3 Sub-Header (lightweight, no duplication) ──── */}
      <View style={styles.subHeader}>
        <View style={styles.subHeaderLeft}>
          <View style={styles.subHeaderIconWrap}>
            <Ionicons name="layers-outline" size={12} color={ECS_GOLD} />
          </View>
          <View>
            <Text style={styles.subHeaderTitle}>Accessory Framework</Text>
            <Text style={styles.subHeaderSubtitle}>Define your vehicle container system</Text>
          </View>
        </View>
        {enabledCount > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{enabledCount}</Text>
          </View>
        )}
      </View>

      {/* ── Quick Presets ───────────────────────────────────── */}
      <View style={styles.presetsRow}>
        {PRESETS.map((preset) => {
          const isActive = activePreset === preset.id;
          return (
            <TouchableOpacity
              key={preset.id}
              style={[
                styles.presetBtn,
                isActive && styles.presetBtnActive,
              ]}
              onPress={() => applyPreset(preset)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={preset.icon as any}
                size={10}
                color={isActive ? ECS_GOLD : TACTICAL.textMuted}
              />
              <Text style={[
                styles.presetLabel,
                isActive && styles.presetLabelActive,
              ]}>
                {preset.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Accessory Tile Grid (2 columns) ─────────────────── */}
      <View style={styles.gridContainer}>
        {rows.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.gridRow}>
            {row.map((cat) => {
              const state = accessories[cat.id];
              const isEnabled = state?.enabled ?? false;
              const status = state?.status ?? 'installed';

              return (
                <View key={cat.id} style={styles.tileWrapper}>
                  <TouchableOpacity
                    style={[
                      styles.tile,
                      isEnabled && styles.tileEnabled,
                    ]}
                    onPress={() => toggleAccessory(cat.id)}
                    activeOpacity={0.7}
                  >
                    {/* Category-specific Icon */}
                    <View style={[
                      styles.tileIconWrap,
                      isEnabled && { backgroundColor: cat.color + '18', borderColor: cat.color + '40' },
                    ]}>
                      <AccessoryIcon
                        categoryId={cat.id}
                        size={14}
                        color={isEnabled ? cat.color : TACTICAL.textMuted}
                      />
                    </View>

                    {/* Label */}
                    <Text
                      style={[
                        styles.tileLabel,
                        isEnabled && styles.tileLabelEnabled,
                      ]}
                      numberOfLines={1}
                    >
                      {cat.label}
                    </Text>

                    {/* Toggle indicator */}
                    <View style={styles.tileToggleRow}>
                      <Ionicons
                        name={isEnabled ? 'checkmark-circle' : 'ellipse-outline'}
                        size={12}
                        color={isEnabled ? '#66BB6A' : 'rgba(138,138,133,0.25)'}
                      />
                      {isEnabled && (
                        <TouchableOpacity
                          style={[
                            styles.statusChip,
                            status === 'planned' && styles.statusChipPlanned,
                          ]}
                          onPress={() => toggleStatus(cat.id)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={[
                            styles.statusText,
                            status === 'planned' && styles.statusTextPlanned,
                          ]}>
                            {status === 'installed' ? 'INSTALLED' : 'PLANNED'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {/* ── Error message (if save failed) ──────────────────── */}
      {saveError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={12} color="#FF6B6B" />
          <Text style={styles.errorText}>{saveError}</Text>
        </View>
      )}

      {/* ── Footer Action Bar (Back + Next) ───────────────── */}
      <View style={styles.footerBar}>
        {/* Back Button */}
        <TouchableOpacity
          style={styles.footerBackBtn}
          onPress={handleBack}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={18} color={TACTICAL.textMuted} />
          <Text style={styles.footerBackText}>BACK</Text>
        </TouchableOpacity>

        {/* Next / Finish Button — shows FINISH when isLastStep */}
        <TouchableOpacity
          style={[
            styles.footerNextBtn,
            isLastStep && styles.footerFinishBtn,
            saving && styles.footerNextBtnSaving,
          ]}
          onPress={handleFinish}
          disabled={saving}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={isLastStep ? 'Finish' : 'Next'}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#0B0F12" />
          ) : isLastStep ? (
            <>
              <Ionicons name="shield-checkmark-outline" size={18} color="#0B0F12" />
              <Text style={styles.footerNextText}>FINISH SETUP</Text>
            </>
          ) : (
            <>
              <Text style={styles.footerNextText}>NEXT</Text>
              <Ionicons name="chevron-forward" size={18} color="#0B0F12" />
            </>
          )}
        </TouchableOpacity>
      </View>

    </View>
  );
}


// STYLES — Compact layout to fit all 10 tiles without scrolling
// ═══════════════════════════════════════════════════════════════
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TILE_GAP = 5;
const GRID_PAD = 10;
const TILE_WIDTH = (SCREEN_WIDTH - GRID_PAD * 2 - TILE_GAP) / 2;
const FOOTER_HEIGHT = 56;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ── Sub-Header (compact) ──────────────────────────────────
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.2)',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  subHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  subHeaderIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(196, 138, 44, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subHeaderTitle: {
    fontSize: 13,
    fontWeight: '800' as const,
    color: TACTICAL.text,
    letterSpacing: 0.3,
  },
  subHeaderSubtitle: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
    marginTop: 1,
  },

  countBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(102, 187, 106, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(102, 187, 106, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#66BB6A',
  },

  // ── Presets Row (compact) ─────────────────────────────────
  presetsRow: {
    flexDirection: 'row',
    paddingHorizontal: GRID_PAD,
    paddingVertical: 6,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.12)',
  },
  presetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 34,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.3)',
    backgroundColor: 'rgba(62, 79, 60, 0.08)',
  },
  presetBtnActive: {
    borderColor: ECS_GOLD_BORDER,
    backgroundColor: ECS_GOLD_BG,
  },
  presetLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.6,
  },
  presetLabelActive: {
    color: ECS_GOLD,
  },

  // ── Grid Container (compact, with bottom padding for footer) ──
  gridContainer: {
    flex: 1,
    paddingHorizontal: GRID_PAD,
    paddingTop: 8,
    paddingBottom: 6,
    gap: TILE_GAP,
    justifyContent: 'space-evenly',
  },
  gridRow: {
    flexDirection: 'row',
    gap: TILE_GAP,
    flex: 1,
  },
  tileWrapper: {
    flex: 1,
  },

  // ── Tile (compact) ────────────────────────────────────────
  tile: {
    flex: 1,
    minHeight: 76,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(62, 79, 60, 0.25)',
    backgroundColor: TACTICAL.panel,
    gap: 4,
    justifyContent: 'space-between',
  },
  tileEnabled: {
    borderColor: 'rgba(196, 138, 44, 0.45)',
    backgroundColor: 'rgba(18, 24, 29, 0.98)',
  },

  // ── Tile Icon (compact) ───────────────────────────────────
  tileIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: 'rgba(62, 79, 60, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Tile Label ────────────────────────────────────────────
  tileLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.4,
    lineHeight: 13,
  },
  tileLabelEnabled: {
    color: TACTICAL.text,
  },

  // ── Tile Toggle Row (compact) ─────────────────────────────
  tileToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 14,
  },

  // ── Status Chip (compact) ─────────────────────────────────
  statusChip: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(102, 187, 106, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(102, 187, 106, 0.3)',
  },
  statusChipPlanned: {
    backgroundColor: 'rgba(255, 183, 77, 0.12)',
    borderColor: 'rgba(255, 183, 77, 0.3)',
  },
  statusText: {
    fontSize: 6,
    fontWeight: '900',
    color: '#66BB6A',
    letterSpacing: 0.8,
  },
  statusTextPlanned: {
    color: '#FFB74D',
  },

  // ── Error Banner ──────────────────────────────────────────
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: GRID_PAD + 4,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 107, 107, 0.08)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 107, 107, 0.2)',
  },
  errorText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#FF6B6B',
    letterSpacing: 0.3,
    flex: 1,
  },

  // ── Footer Action Bar ─────────────────────────────────────
  footerBar: {
    height: FOOTER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(196, 138, 44, 0.35)',
    backgroundColor: 'rgba(11, 15, 18, 0.98)',
  },


  // ── Footer Back Button ────────────────────────────────────
  footerBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.4)',
    backgroundColor: 'rgba(62, 79, 60, 0.1)',
  },
  footerBackText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  // ── Footer Next Button (was Finish — now advances to Step 4) ──
  footerNextBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 40,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
    shadowColor: TACTICAL.amber,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  footerNextBtnSaving: {
    opacity: 0.7,
  },
  footerNextText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.2,
  },
  // ── Footer Finish Button (green accent for final step) ─────
  footerFinishBtn: {
    backgroundColor: '#66BB6A',
    shadowColor: '#66BB6A',
  },
});



