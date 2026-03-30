/**
 * LayoutPresetsModal — Preset layout template picker with custom preset saving
 *
 * Shows ALL built-in presets grouped by grid layout so users can switch
 * both grid dimensions and widget sizes in one action.
 *
 * Features:
 * - "Save Current" button to capture current layout as a named custom preset
 * - Icon picker from a curated set of Ionicons
 * - "My Presets" section above built-in presets with long-press delete
 * - Mini visual diagram for each preset using the placement algorithm
 * - Active/last-used preset highlighted with amber glow
 * - Animated entrance via ECSModal
 * - Max 5 custom presets per profile
 * - All presets shown grouped by grid layout (not filtered)
 */
import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Animated,
} from 'react-native';

import ECSModal from '../ECSModal';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import {
  GRID_LAYOUT_CONFIG,
  GRID_LAYOUTS_ORDERED,
  WIDGET_SIZE_CONFIG,
  LAYOUT_PRESETS,
  getPresetsForLayout,
  customPresetStore,
  type GridLayout,
  type WidgetSize,
  type WidgetSlot,
  type LayoutPreset,
  type DashboardProfile,
  type CustomPreset,
} from '../../lib/dashboardStore';

// ── Icon Picker Options ─────────────────────────────────────
const ICON_OPTIONS: { name: string; label: string }[] = [
  { name: 'bookmark-outline', label: 'Bookmark' },
  { name: 'star-outline', label: 'Star' },
  { name: 'heart-outline', label: 'Heart' },
  { name: 'flash-outline', label: 'Flash' },
  { name: 'rocket-outline', label: 'Rocket' },
  { name: 'compass-outline', label: 'Compass' },
  { name: 'shield-outline', label: 'Shield' },
  { name: 'flag-outline', label: 'Flag' },
  { name: 'diamond-outline', label: 'Diamond' },
  { name: 'trophy-outline', label: 'Trophy' },
  { name: 'cube-outline', label: 'Cube' },
  { name: 'planet-outline', label: 'Planet' },
];

interface LayoutPresetsModalProps {
  visible: boolean;
  gridLayout: GridLayout;
  lastUsedPresetId?: string;
  currentSlots: WidgetSlot[];
  activeProfile: DashboardProfile;
  onSelectPreset: (presetId: string) => void;
  onSelectCustomPreset: (preset: CustomPreset) => void;
  onClose: () => void;
}


// ── Mini Preset Diagram ─────────────────────────────────────
const DIAGRAM_W = 64;
const DIAGRAM_H = 56;
const DIAGRAM_GAP = 2;
const DIAGRAM_RADIUS = 3;

const SLOT_COLORS = [
  'rgba(196,138,44,0.55)',
  'rgba(100,180,200,0.50)',
  'rgba(80,170,150,0.50)',
  'rgba(140,100,180,0.50)',
  'rgba(200,120,80,0.50)',
  'rgba(80,140,220,0.50)',
];

const SLOT_BORDERS = [
  'rgba(196,138,44,0.75)',
  'rgba(100,180,200,0.70)',
  'rgba(80,170,150,0.70)',
  'rgba(140,100,180,0.70)',
  'rgba(200,120,80,0.70)',
  'rgba(80,140,220,0.70)',
];

interface DiagramPlacement {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

function computeDiagramPlacements(
  slotSizes: WidgetSize[],
  gridLayout: GridLayout,
): DiagramPlacement[] {
  const config = GRID_LAYOUT_CONFIG[gridLayout];
  const gridCols = config.cols;
  const gridRows = config.rows;
  const maxRows = gridRows * 3;

  const occupied: boolean[][] = Array.from({ length: maxRows }, () =>
    Array(gridCols).fill(false)
  );

  const placements: DiagramPlacement[] = [];

  for (let i = 0; i < slotSizes.length; i++) {
    const sizeKey = slotSizes[i] || '1x1';
    const sizeConfig = WIDGET_SIZE_CONFIG[sizeKey];

    let colSpan = Math.min(sizeConfig.colSpan, gridCols);
    let rowSpan = Math.min(sizeConfig.rowSpan, gridRows);

    let placed = false;
    for (let r = 0; r < maxRows - rowSpan + 1 && !placed; r++) {
      for (let c = 0; c <= gridCols - colSpan && !placed; c++) {
        let fits = true;
        for (let dr = 0; dr < rowSpan && fits; dr++) {
          for (let dc = 0; dc < colSpan && fits; dc++) {
            if (occupied[r + dr][c + dc]) fits = false;
          }
        }
        if (fits) {
          for (let dr = 0; dr < rowSpan; dr++) {
            for (let dc = 0; dc < colSpan; dc++) {
              occupied[r + dr][c + dc] = true;
            }
          }
          placements.push({ col: c, row: r, colSpan, rowSpan });
          placed = true;
        }
      }
    }

    if (!placed) {
      for (let r = 0; r < maxRows && !placed; r++) {
        for (let c = 0; c < gridCols && !placed; c++) {
          if (!occupied[r][c]) {
            occupied[r][c] = true;
            placements.push({ col: c, row: r, colSpan: 1, rowSpan: 1 });
            placed = true;
          }
        }
      }
    }
  }

  return placements;
}

function PresetDiagram({
  slotSizes,
  gridLayout,
  isActive,
}: {
  slotSizes: WidgetSize[];
  gridLayout: GridLayout;
  isActive: boolean;
}) {
  const config = GRID_LAYOUT_CONFIG[gridLayout];
  const gridCols = config.cols;
  const gridRows = config.rows;

  const placements = useMemo(
    () => computeDiagramPlacements(slotSizes, gridLayout),
    [slotSizes, gridLayout]
  );

  const cellW = (DIAGRAM_W - DIAGRAM_GAP * (gridCols - 1)) / gridCols;
  const cellH = (DIAGRAM_H - DIAGRAM_GAP * (gridRows - 1)) / gridRows;

  return (
    <View style={[diagramStyles.container, { width: DIAGRAM_W, height: DIAGRAM_H }]}>
      {placements.map((p, idx) => {
        if (p.row >= gridRows) return null;

        const x = p.col * (cellW + DIAGRAM_GAP);
        const y = p.row * (cellH + DIAGRAM_GAP);
        const w = p.colSpan * cellW + (p.colSpan - 1) * DIAGRAM_GAP;
        const h = p.rowSpan * cellH + (p.rowSpan - 1) * DIAGRAM_GAP;

        const colorIdx = idx % SLOT_COLORS.length;
        const bgColor = isActive ? SLOT_COLORS[colorIdx] : `rgba(255,255,255,${0.06 + idx * 0.02})`;
        const borderColor = isActive ? SLOT_BORDERS[colorIdx] : `rgba(255,255,255,${0.10 + idx * 0.02})`;

        return (
          <View
            key={idx}
            style={[
              diagramStyles.cell,
              {
                left: x,
                top: y,
                width: w,
                height: h,
                backgroundColor: bgColor,
                borderColor: borderColor,
              },
            ]}
          >
            <Text style={[
              diagramStyles.cellLabel,
              { color: isActive ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)' },
            ]}>
              {idx + 1}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const diagramStyles = StyleSheet.create({
  container: { position: 'relative' },
  cell: {
    position: 'absolute',
    borderRadius: DIAGRAM_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});

// ── Built-in Preset Card ────────────────────────────────────
function PresetCard({
  preset,
  isActive,
  isCurrentGrid,
  onPress,
}: {
  preset: LayoutPreset;
  isActive: boolean;
  isCurrentGrid: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.presetCard, isActive && styles.presetCardActive]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      {isActive && (
        <View style={styles.activeCheck}>
          <Ionicons name="checkmark-circle" size={14} color={TACTICAL.amber} />
        </View>
      )}
      <View style={styles.diagramContainer}>
        <PresetDiagram slotSizes={preset.slotSizes} gridLayout={preset.gridLayout} isActive={isActive} />
      </View>
      <Text style={[styles.presetName, isActive && styles.presetNameActive]} numberOfLines={1}>
        {preset.name}
      </Text>
      <Text style={[styles.presetDesc, isActive && styles.presetDescActive]} numberOfLines={2}>
        {preset.description}
      </Text>
    </TouchableOpacity>
  );
}

// ── Custom Preset Card ──────────────────────────────────────
function CustomPresetCard({
  preset,
  isActive,
  onPress,
  onDelete,
}: {
  preset: CustomPreset;
  isActive: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  const handleLongPress = useCallback(() => {
    Alert.alert(
      'Delete Preset',
      `Delete "${preset.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]
    );
  }, [preset.name, onDelete]);

  return (
    <TouchableOpacity
      style={[styles.presetCard, styles.customPresetCard, isActive && styles.presetCardActive]}
      onPress={onPress}
      onLongPress={handleLongPress}
      delayLongPress={500}
      activeOpacity={0.6}
    >
      {isActive && (
        <View style={styles.activeCheck}>
          <Ionicons name="checkmark-circle" size={14} color={TACTICAL.amber} />
        </View>
      )}

      <View style={styles.customBadge}>
        <Ionicons name={(preset.icon || 'bookmark-outline') as any} size={10} color={TACTICAL.amber} />
      </View>

      <View style={styles.diagramContainer}>
        <PresetDiagram slotSizes={preset.slotSizes} gridLayout={preset.gridLayout} isActive={isActive} />
      </View>
      <Text style={[styles.presetName, isActive && styles.presetNameActive]} numberOfLines={1}>
        {preset.name}
      </Text>
      <Text style={[styles.presetDesc, styles.customPresetHint]}>
        Hold to delete
      </Text>
    </TouchableOpacity>
  );
}

// ── Save Current Form ───────────────────────────────────────
function SaveCurrentForm({
  canSave,
  currentCount,
  maxCount,
  onSave,
  onCancel,
}: {
  canSave: boolean;
  currentCount: number;
  maxCount: number;
  onSave: (name: string, icon: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('bookmark-outline');

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter a name for your preset.');
      return;
    }
    onSave(name.trim(), selectedIcon);
  }, [name, selectedIcon, onSave]);

  if (!canSave) {
    return (
      <View style={styles.saveForm}>
        <View style={styles.limitReached}>
          <Ionicons name="warning-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.limitText}>
            Maximum {maxCount} custom presets reached. Delete one to save a new preset.
          </Text>
        </View>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
          <Text style={styles.cancelBtnText}>CLOSE</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.saveForm}>
      <View style={styles.nameInputRow}>
        <Ionicons name="create-outline" size={14} color={TACTICAL.textMuted} />
        <TextInput
          style={styles.nameInput}
          placeholder="Preset name..."
          placeholderTextColor={TACTICAL.textMuted + '60'}
          value={name}
          onChangeText={setName}
          maxLength={24}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />
        <Text style={styles.charCount}>{name.length}/24</Text>
      </View>

      <Text style={styles.iconPickerLabel}>CHOOSE ICON</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.iconPickerRow}
      >
        {ICON_OPTIONS.map((opt) => {
          const isSelected = selectedIcon === opt.name;
          return (
            <TouchableOpacity
              key={opt.name}
              style={[
                styles.iconOption,
                isSelected && styles.iconOptionSelected,
              ]}
              onPress={() => setSelectedIcon(opt.name)}
              activeOpacity={0.6}
            >
              <Ionicons
                name={opt.name as any}
                size={18}
                color={isSelected ? TACTICAL.amber : TACTICAL.textMuted}
              />
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={styles.saveHint}>
        {currentCount}/{maxCount} custom presets saved
      </Text>

      <View style={styles.saveActions}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
          <Text style={styles.cancelBtnText}>CANCEL</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveBtn, !name.trim() && styles.saveBtnDisabled]}
          onPress={handleSave}
          activeOpacity={0.7}
          disabled={!name.trim()}
        >
          <Ionicons name="save-outline" size={12} color={name.trim() ? '#0B0F12' : TACTICAL.textMuted} />
          <Text style={[styles.saveBtnText, !name.trim() && styles.saveBtnTextDisabled]}>SAVE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main Modal ──────────────────────────────────────────────
export default function LayoutPresetsModal({
  visible,
  gridLayout,
  lastUsedPresetId,
  currentSlots,
  activeProfile,
  onSelectPreset,
  onSelectCustomPreset,
  onClose,
}: LayoutPresetsModalProps) {
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [customPresetsVersion, setCustomPresetsVersion] = useState(0);

  // Show ALL presets grouped by grid layout
  const presetsByLayout = useMemo(() => {
    const grouped: { layout: GridLayout; config: typeof GRID_LAYOUT_CONFIG[GridLayout]; presets: LayoutPreset[] }[] = [];
    for (const layout of GRID_LAYOUTS_ORDERED) {
      const presets = getPresetsForLayout(layout);
      if (presets.length > 0) {
        grouped.push({ layout, config: GRID_LAYOUT_CONFIG[layout], presets });
      }
    }
    return grouped;
  }, []);

  const customPresets = useMemo(
    () => customPresetStore.getPresets(activeProfile),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProfile, customPresetsVersion]
  );

  const canSaveMore = useMemo(
    () => customPresetStore.canSaveMore(activeProfile),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProfile, customPresetsVersion]
  );

  const totalCustomCount = useMemo(
    () => customPresetStore.getCount(activeProfile),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProfile, customPresetsVersion]
  );

  const totalPresets = LAYOUT_PRESETS.length + customPresets.length;

  const handleSavePreset = useCallback((name: string, icon: string) => {
    const result = customPresetStore.savePreset(
      activeProfile,
      name,
      icon,
      gridLayout,
      currentSlots,
    );
    if (result) {
      setCustomPresetsVersion(v => v + 1);
      setShowSaveForm(false);
    } else {
      Alert.alert('Limit Reached', 'Maximum 5 custom presets per profile.');
    }
  }, [activeProfile, gridLayout, currentSlots]);

  const handleDeleteCustomPreset = useCallback((presetId: string) => {
    customPresetStore.deletePreset(activeProfile, presetId);
    setCustomPresetsVersion(v => v + 1);
  }, [activeProfile]);

  const handleApplyCustomPreset = useCallback((preset: CustomPreset) => {
    onSelectCustomPreset(preset);
  }, [onSelectCustomPreset]);


  const handleClose = useCallback(() => {
    setShowSaveForm(false);
    onClose();
  }, [onClose]);

  return (
    <ECSModal visible={visible} onClose={handleClose} tier="global">
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
      >
        <View
          style={styles.panel}
          onStartShouldSetResponder={() => true}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="copy-outline" size={18} color={TACTICAL.amber} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>LAYOUT PRESETS</Text>
              <Text style={styles.subtitle}>
                Current: {GRID_LAYOUT_CONFIG[gridLayout].label} grid {'\u2014'} {totalPresets} presets
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={20} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Save Current Button */}
          {!showSaveForm && (
            <TouchableOpacity
              style={styles.saveCurrentBtn}
              onPress={() => setShowSaveForm(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={16} color={TACTICAL.amber} />
              <Text style={styles.saveCurrentBtnText}>SAVE CURRENT LAYOUT</Text>
              <Text style={styles.saveCurrentCount}>{totalCustomCount}/5</Text>
            </TouchableOpacity>
          )}

          {/* Save Form (expanded) */}
          {showSaveForm && (
            <SaveCurrentForm
              canSave={canSaveMore}
              currentCount={totalCustomCount}
              maxCount={customPresetStore.MAX_PRESETS}
              onSave={handleSavePreset}
              onCancel={() => setShowSaveForm(false)}
            />
          )}

          <View style={styles.divider} />

          {/* Presets Grid — ALL presets grouped by grid layout */}
          <ScrollView
            style={styles.presetsScroll}
            contentContainerStyle={styles.presetsContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* My Presets Section */}
            {customPresets.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Ionicons name="person-outline" size={11} color={TACTICAL.amber} />
                  <Text style={styles.sectionTitle}>MY PRESETS</Text>
                  <View style={styles.sectionLine} />
                </View>
                <View style={styles.presetsGrid}>
                  {customPresets.map((preset) => (
                    <CustomPresetCard
                      key={preset.id}
                      preset={preset}
                      isActive={lastUsedPresetId === preset.id}
                      onPress={() => handleApplyCustomPreset(preset)}
                      onDelete={() => handleDeleteCustomPreset(preset.id)}
                    />
                  ))}
                </View>
              </>
            )}

            {/* Built-in Presets — grouped by grid layout */}
            {presetsByLayout.map(({ layout, config, presets }) => {
              const isCurrent = layout === gridLayout;
              return (
                <View key={layout}>
                  <View style={styles.sectionHeader}>
                    <Ionicons
                      name="grid-outline"
                      size={11}
                      color={isCurrent ? TACTICAL.amber : TACTICAL.textMuted}
                    />
                    <Text style={[
                      styles.sectionTitle,
                      { color: isCurrent ? TACTICAL.amber : TACTICAL.textMuted },
                    ]}>
                      {config.label} GRID
                    </Text>
                    {isCurrent && (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>CURRENT</Text>
                      </View>
                    )}
                    <View style={styles.sectionLine} />
                  </View>
                  <View style={styles.presetsGrid}>
                    {presets.map((preset) => {
                      const isActive = preset.id === lastUsedPresetId;
                      return (
                        <PresetCard
                          key={preset.id}
                          preset={preset}
                          isActive={isActive}
                          isCurrentGrid={isCurrent}
                          onPress={() => onSelectPreset(preset.id)}
                        />
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Ionicons name="information-circle-outline" size={12} color={TACTICAL.textMuted} />
            <Text style={styles.footerText}>
              Selecting a preset changes grid layout and widget sizes. Existing widgets are preserved in order.
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </ECSModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  panel: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    backgroundColor: TACTICAL.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
    overflow: 'hidden',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: TACTICAL.amber + '10',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '25',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  title: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 3,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    marginTop: 2,
  },
  closeBtn: { padding: 4 },

  saveCurrentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: TACTICAL.amber + '30',
    borderStyle: 'dashed',
    backgroundColor: TACTICAL.amber + '06',
  },
  saveCurrentBtnText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  saveCurrentCount: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },

  saveForm: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '25',
    backgroundColor: TACTICAL.amber + '04',
  },
  nameInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginBottom: 10,
  },
  nameInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: TACTICAL.text,
    paddingVertical: 8,
  },
  charCount: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted + '60',
  },
  iconPickerLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 3,
    marginBottom: 6,
  },
  iconPickerRow: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 8,
  },
  iconOption: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOptionSelected: {
    borderColor: TACTICAL.amber + '50',
    backgroundColor: TACTICAL.amber + '10',
  },
  saveHint: {
    fontSize: 9,
    fontWeight: '500',
    color: TACTICAL.textMuted + '80',
    marginTop: 4,
    marginBottom: 10,
  },
  saveActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  cancelBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 7,
    backgroundColor: TACTICAL.amber,
  },
  saveBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  saveBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0B0F12',
    letterSpacing: 1,
  },
  saveBtnTextDisabled: {
    color: TACTICAL.textMuted,
  },
  limitReached: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  limitText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    lineHeight: 16,
  },

  divider: {
    height: 1,
    backgroundColor: TACTICAL.border,
    marginHorizontal: 16,
  },

  presetsScroll: {
    maxHeight: 400,
  },
  presetsContainer: {
    padding: 16,
    paddingBottom: 8,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 3,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginLeft: 6,
  },
  currentBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: TACTICAL.amber + '15',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
  },
  currentBadgeText: {
    fontSize: 6,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },

  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 14,
  },

  presetCard: {
    width: 108,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    position: 'relative',
  },
  customPresetCard: {
    borderColor: TACTICAL.amber + '15',
    backgroundColor: TACTICAL.amber + '03',
  },
  presetCardActive: {
    borderColor: TACTICAL.amber + '50',
    backgroundColor: TACTICAL.amber + '05',
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

  customBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
  },

  diagramContainer: {
    marginBottom: 8,
  },

  presetName: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 2,
  },
  presetNameActive: {
    color: TACTICAL.amber,
  },

  presetDesc: {
    fontSize: 8,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
    lineHeight: 11,
  },
  presetDescActive: {
    color: TACTICAL.amber + '70',
  },
  customPresetHint: {
    color: TACTICAL.amber + '40',
    fontStyle: 'italic',
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
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



