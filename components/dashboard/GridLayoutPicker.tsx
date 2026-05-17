/**
 * GridLayoutPicker — Visual grid layout selector
 *
 * Shows a dropdown/popover with 6 layout options:
 * 1x1, 1x2, 1x3, 2x1, 2x2, 2x3
 *
 * Each option shows a mini visual preview of the grid arrangement
 * with the active layout highlighted in amber.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import ECSModal from '../ECSModal';

import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import {
  GRID_LAYOUT_CONFIG,
  GRID_LAYOUTS_ORDERED,
  type GridLayout,
} from '../../lib/dashboardStore';
import { useStableAnimatedValue } from '../../lib/ecsAnimations';

interface GridLayoutPickerProps {
  currentLayout: GridLayout;
  onSelect: (layout: GridLayout) => void;
  disabled?: boolean;
}

// Mini grid preview dimensions
const PREVIEW_W = 44;
const PREVIEW_H = 52;
const CELL_GAP = 2;

function MiniGridPreview({ layout, isActive }: { layout: GridLayout; isActive: boolean }) {
  const config = GRID_LAYOUT_CONFIG[layout];
  const { cols, rows } = config;

  const cellW = (PREVIEW_W - CELL_GAP * (cols - 1)) / cols;
  const cellH = (PREVIEW_H - CELL_GAP * (rows - 1)) / rows;

  const cells: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push(
        <View
          key={`${r}-${c}`}
          style={[
            miniStyles.cell,
            {
              width: cellW,
              height: cellH,
              left: c * (cellW + CELL_GAP),
              top: r * (cellH + CELL_GAP),
              backgroundColor: isActive
                ? 'rgba(196,138,44,0.35)'
                : 'rgba(255,255,255,0.08)',
              borderColor: isActive
                ? 'rgba(196,138,44,0.6)'
                : 'rgba(255,255,255,0.12)',
            },
          ]}
        />
      );
    }
  }

  return (
    <View style={[miniStyles.previewContainer, { width: PREVIEW_W, height: PREVIEW_H }]}>
      {cells}
    </View>
  );
}

const miniStyles = StyleSheet.create({
  previewContainer: {
    position: 'relative',
  },
  cell: {
    position: 'absolute',
    borderRadius: 3,
    borderWidth: 1,
  },
});

export default function GridLayoutPicker({ currentLayout, onSelect, disabled }: GridLayoutPickerProps) {
  const [pickerVisible, setPickerVisible] = useState(false);
  const fadeAnim = useStableAnimatedValue(0);
  const scaleAnim = useStableAnimatedValue(0.9);

  useEffect(() => {
    if (pickerVisible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 100, useNativeDriver: true }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.9);
    }
  }, [pickerVisible, fadeAnim, scaleAnim]);

  const handleSelect = (layout: GridLayout) => {
    onSelect(layout);
    setPickerVisible(false);
  };

  const currentConfig = GRID_LAYOUT_CONFIG[currentLayout];

  return (
    <>
      {/* Trigger Button */}
      <TouchableOpacity
        style={styles.triggerBtn}
        onPress={() => setPickerVisible(true)}
        activeOpacity={0.7}
        disabled={disabled}
      >
        <View style={styles.triggerPreview}>
          <MiniGridPreview layout={currentLayout} isActive={true} />
        </View>
        <View style={styles.triggerInfo}>
          <Text style={styles.triggerLabel}>{currentConfig.label}</Text>
          <Text style={styles.triggerSub}>GRID</Text>
        </View>
        <Ionicons name="chevron-down" size={12} color={TACTICAL.amber} />
      </TouchableOpacity>

      {/* Picker Modal */}
      <ECSModal visible={pickerVisible} onClose={() => setPickerVisible(false)} tier="global" stackBehavior="replace">

        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setPickerVisible(false)}
        >
          <Animated.View
            style={[
              styles.pickerPanel,
              {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            {/* Header */}
            <View style={styles.pickerHeader}>
              <Ionicons name="grid-outline" size={16} color={TACTICAL.amber} />
              <Text style={styles.pickerTitle}>GRID LAYOUT</Text>
              <TouchableOpacity
                style={styles.pickerClose}
                onPress={() => setPickerVisible(false)}
              >
                <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.pickerSubtitle}>
              Choose how widgets are arranged on your dashboard
            </Text>

            <View style={styles.divider} />

            {/* Layout Options */}
            <View style={styles.optionsGrid}>
              {GRID_LAYOUTS_ORDERED.map((layout) => {
                const config = GRID_LAYOUT_CONFIG[layout];
                const isActive = layout === currentLayout;

                return (
                  <TouchableOpacity
                    key={layout}
                    style={[
                      styles.optionCard,
                      isActive && styles.optionCardActive,
                    ]}
                    onPress={() => handleSelect(layout)}
                    activeOpacity={0.6}
                  >
                    {/* Active indicator */}
                    {isActive && (
                      <View style={styles.activeCheck}>
                        <Ionicons name="checkmark-circle" size={14} color={TACTICAL.amber} />
                      </View>
                    )}

                    {/* Mini Preview */}
                    <View style={styles.optionPreview}>
                      <MiniGridPreview layout={layout} isActive={isActive} />
                    </View>

                    {/* Label */}
                    <Text style={[styles.optionLabel, isActive && styles.optionLabelActive]}>
                      {config.label}
                    </Text>

                    {/* Slot count */}
                    <Text style={[styles.optionSlots, isActive && styles.optionSlotsActive]}>
                      {config.total} {config.total === 1 ? 'SLOT' : 'SLOTS'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Footer hint */}
            <View style={styles.pickerFooter}>
              <Ionicons name="information-circle-outline" size={12} color={TACTICAL.textMuted} />
              <Text style={styles.footerText}>
                Widgets are preserved when switching layouts. Extra slots are added or hidden as needed.
              </Text>
            </View>
          </Animated.View>
        </TouchableOpacity>
      </ECSModal>

    </>
  );
}

const styles = StyleSheet.create({
  // ── Trigger Button ──────────────────────────────────
  triggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(196,138,44,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.2)',
  },
  triggerPreview: {
    transform: [{ scale: 0.42 }],
    marginHorizontal: -8,
    marginVertical: -10,
  },
  triggerInfo: {
    alignItems: 'center',
    marginLeft: 2,
  },
  triggerLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 0.5,
  },
  triggerSub: {
    fontSize: 6,
    fontWeight: '700',
    color: 'rgba(196,138,44,0.5)',
    letterSpacing: 1.5,
    marginTop: -1,
  },

  // ── Backdrop ────────────────────────────────────────
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  // ── Picker Panel ────────────────────────────────────
  pickerPanel: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: TACTICAL.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickerTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 2,
    flex: 1,
  },
  pickerClose: {
    padding: 4,
  },
  pickerSubtitle: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    backgroundColor: TACTICAL.border,
    marginBottom: 16,
  },

  // ── Options Grid ────────────────────────────────────
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  optionCard: {
    width: 92,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    position: 'relative',
  },
  optionCardActive: {
    borderColor: TACTICAL.amber + '60',
    backgroundColor: 'rgba(181,139,58,0.05)',
    // Phase 8: Dark shadow only — no amber glow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },

  activeCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  optionPreview: {
    marginBottom: 8,
  },
  optionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  optionLabelActive: {
    color: TACTICAL.amber,
  },
  optionSlots: {
    fontSize: 8,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.2)',
    letterSpacing: 1.5,
  },
  optionSlotsActive: {
    color: 'rgba(196,138,44,0.5)',
  },

  // ── Footer ──────────────────────────────────────────
  pickerFooter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  footerText: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    lineHeight: 14,
    flex: 1,
  },
});



