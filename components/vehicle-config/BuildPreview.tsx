/**
 * BuildPreview — Modular Vehicle Preview Composer (Image-Based)
 *
 * Dynamically composes a vehicle preview by stacking PNG image
 * layers as the user makes selections in the vehicle configuration tree.
 *
 * User flow example:
 *   Select Truck → Select Roof Rack → Select Roof Storage
 *   ➡️ Preview updates to show truck + roof rack + roof cargo
 *
 * Uses the ECS Image system (not SVG vectors) for the vehicle
 * configuration viewing mode. Images are pre-aligned to a shared
 * 1024×1024 stacking grid.
 *
 * ANIMATION SYSTEM:
 *   1. Accessory layers: fade-in/fade-out (handled by ImageCompositor)
 *   2. Validation cycling: bounce animation on preview container
 *   3. Category preview: smooth fade transition on vehicle type change
 *
 * Includes:
 *   1. ECS Image Compositor (stacked PNG layers with animated transitions)
 *   2. "Build Preview" label with "Updates as you select options"
 *   3. Active module badges
 *   4. Compact Build Summary Bar
 *   5. Collapsible Weight Distribution
 *   6. Randomize Demo Build button (optional)
 *   7. Debug mode with anchor calibration overlay
 *   8. Validation test cycling with bounce animation
 *   9. Static category preview (non-interactive vehicle image)
 */
import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Animated, Easing } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import {
  calculateCG,
  type LoadoutZoneWeight,
} from '../../lib/weightEngine';
import BuildSummaryBar from './BuildSummaryBar';
import WeightDistribution from './WeightDistribution';
import ImageCompositor from '../ecs-images/ImageCompositor';
import CategoryPreview from './CategoryPreview';
import type {
  ImageVehicleConfig,
  ImageVehicleType,
  ImageRoofModule,
  ImageHitchModule,
  ImageBedModule,
} from '../ecs-images/AssetRegistry';
import {
  randomImageConfig,
  VEHICLE_DISPLAY_NAMES,
  ROOF_MODULE_NAMES,
  HITCH_MODULE_NAMES,
  BED_MODULE_NAMES,
  VALIDATION_CONFIGS,
} from '../ecs-images/AssetRegistry';

const SCREEN_W = Dimensions.get('window').width;

// ── Animation Constants ─────────────────────────────────
const BOUNCE_SPRING_CONFIG = {
  tension: 300,
  friction: 10,
  useNativeDriver: true,
};

const FADE_DURATION = 200;
const FADE_EASING = Easing.out(Easing.cubic);

// ── Re-export config type for external use ──────────────
export type { ImageVehicleConfig as EcsVehicleConfig };

interface Props {
  selections: Record<string, string>;
  currentStepId?: string;
  /** Show expanded version with all details (for completion screen) */
  expanded?: boolean;
  /** Optional loadout zone weights for combined CG computation */
  loadoutWeights?: LoadoutZoneWeight[];
  /** Show the randomize button */
  showRandomize?: boolean;
  /** Enable debug overlay mode for anchor calibration */
  debugMode?: boolean;
  /** Show static category preview instead of compositor */
  showCategoryPreview?: boolean;
}

// ── Map wizard selections to Image vehicle type ─────────
function mapToImageVehicleType(sel: Record<string, string>): ImageVehicleType {
  switch (sel.vehicle_type) {
    case 'truck':
      return 'truck';
    case 'suv_van':
      return 'suv';
    case 'jeep':
      return 'jeep';
    case 'car_crossover':
      return 'crossover';
    default:
      return 'truck';
  }
}

// ── Map wizard selections to Image bed module ───────────
function mapToImageBedModule(sel: Record<string, string>): ImageBedModule {
  if (sel.vehicle_type !== 'truck') return 'none';
  switch (sel.truck_bed) {
    case 'rack':
      return 'rack';
    case 'rsi_smart_cap':
    case 'alu_cab':
    case 'other_topper':
      return 'shell';
    case 'cover':
    case 'open_bed':
    default:
      return 'none';
  }
}

// ── Map wizard selections to Image roof module ──────────
function mapToImageRoofModule(sel: Record<string, string>): ImageRoofModule {
  const vt = sel.vehicle_type;

  // Helper: check if a rack setup includes storage
  const hasStorage = (setup?: string) =>
    setup === 'storage_boxes' || setup === 'both';
  const hasRTT = (setup?: string) =>
    setup === 'rtt' || setup === 'both';

  if (vt === 'truck') {
    if (sel.truck_cab_rack === 'yes') {
      const setup = sel.truck_cab_rack_setup;
      if (hasRTT(setup)) return 'tent';
      if (hasStorage(setup)) return 'storage';
      return 'rack';
    }
    // Check bed rack RTT
    if (sel.truck_bed === 'rack') {
      const setup = sel.truck_bed_rack_setup;
      if (hasRTT(setup)) return 'tent';
      if (hasStorage(setup)) return 'storage';
    }
    return 'none';
  }

  if (vt === 'suv_van') {
    if (sel.suv_roof_rack === 'yes') {
      const setup = sel.suv_roof_rack_setup;
      if (hasRTT(setup)) return 'tent';
      if (hasStorage(setup)) return 'storage';
      return 'rack';
    }
    return 'none';
  }

  if (vt === 'car_crossover') {
    if (sel.car_roof_rack === 'yes') {
      const setup = sel.car_roof_rack_setup;
      if (hasRTT(setup)) return 'tent';
      if (hasStorage(setup)) return 'storage';
      return 'rack';
    }
    return 'none';
  }

  if (vt === 'jeep') {
    if (sel.jeep_rack === 'yes') {
      const setup = sel.jeep_rack_setup;
      if (hasRTT(setup)) return 'tent';
      if (hasStorage(setup)) return 'storage';
      return 'rack';
    }
    const top = sel.jeep_top;
    if (top === 'hard_top') {
      const setup = sel.jeep_hardtop_setup;
      if (hasRTT(setup)) return 'tent';
      if (hasStorage(setup)) return 'storage';
    }
    return 'none';
  }

  return 'none';
}

// ── Map wizard selections to Image hitch module ─────────
function mapToImageHitchModule(sel: Record<string, string>): ImageHitchModule {
  const hitchKey =
    sel.truck_hitch || sel.suv_hitch || sel.car_hitch || sel.jeep_hitch;
  if (!hitchKey || hitchKey === 'none') return 'none';
  if (hitchKey === 'tire_carrier') return 'tire';
  if (hitchKey === 'hitch_box') return 'box';
  // bike_rack, recovery_mount → show as box
  return 'box';
}

export default function BuildPreview({
  selections,
  currentStepId,
  expanded = false,
  loadoutWeights,
  showRandomize = false,
  debugMode = false,
  showCategoryPreview = false,
}: Props) {
  const [showSilhouette, setShowSilhouette] = useState(true);
  const [randomOverride, setRandomOverride] = useState<ImageVehicleConfig | null>(null);
  const [debugOverlay, setDebugOverlay] = useState(debugMode);
  const [validationIndex, setValidationIndex] = useState<number | null>(null);

  // ── Animation Values ──────────────────────────────────
  const bounceScale = useRef(new Animated.Value(1)).current;
  const previewFade = useRef(new Animated.Value(1)).current;

  const cgResult = useMemo(
    () => calculateCG(selections, loadoutWeights),
    [selections, loadoutWeights]
  );

  // Derive Image config from wizard selections
  const wizardConfig = useMemo<ImageVehicleConfig>(() => ({
    vehicleType: mapToImageVehicleType(selections),
    bedModule: mapToImageBedModule(selections),
    roofModule: mapToImageRoofModule(selections),
    hitchModule: mapToImageHitchModule(selections),
  }), [selections]);

  // Determine which config to use: validation > random > wizard
  const imageConfig = useMemo(() => {
    if (validationIndex !== null && validationIndex >= 0 && validationIndex < VALIDATION_CONFIGS.length) {
      return VALIDATION_CONFIGS[validationIndex].config;
    }
    return randomOverride || wizardConfig;
  }, [validationIndex, randomOverride, wizardConfig]);

  // Clear random override when wizard selections change
  const prevSelectionsRef = React.useRef(selections);
  React.useEffect(() => {
    if (prevSelectionsRef.current !== selections) {
      setRandomOverride(null);
      setValidationIndex(null);
      prevSelectionsRef.current = selections;
    }
  }, [selections]);

  // ── Bounce Animation for Validation Cycling ───────────
  const triggerBounce = useCallback(() => {
    // Reset scale
    bounceScale.setValue(0.92);
    // Spring bounce back to 1.0
    Animated.spring(bounceScale, {
      toValue: 1,
      ...BOUNCE_SPRING_CONFIG,
    }).start();
  }, [bounceScale]);

  // ── Fade transition for config changes ────────────────
  const triggerFadeTransition = useCallback(() => {
    Animated.sequence([
      Animated.timing(previewFade, {
        toValue: 0.3,
        duration: FADE_DURATION / 2,
        easing: FADE_EASING,
        useNativeDriver: true,
      }),
      Animated.timing(previewFade, {
        toValue: 1,
        duration: FADE_DURATION,
        easing: FADE_EASING,
        useNativeDriver: true,
      }),
    ]).start();
  }, [previewFade]);

  const handleRandomize = useCallback(() => {
    setValidationIndex(null);
    setRandomOverride(randomImageConfig());
    triggerFadeTransition();
  }, [triggerFadeTransition]);

  const handleCycleValidation = useCallback(() => {
    setRandomOverride(null);
    setValidationIndex(prev => {
      if (prev === null) return 0;
      return (prev + 1) % VALIDATION_CONFIGS.length;
    });
    triggerBounce();
  }, [triggerBounce]);

  const handleClearOverride = useCallback(() => {
    setRandomOverride(null);
    setValidationIndex(null);
    triggerFadeTransition();
  }, [triggerFadeTransition]);

  // Don't show if no vehicle type selected (and no override)
  if (!selections.vehicle_type && !randomOverride && validationIndex === null) return null;

  // Silhouette container: 1:1 aspect ratio to match 1024×1024 image grid.
  const silhouetteW = Math.min(SCREEN_W - 32, 380);

  // Determine which modules are active for badge display
  const activeModules: { key: string; label: string; color: string }[] = [];

  // Base vehicle label
  const baseLabel = VEHICLE_DISPLAY_NAMES[imageConfig.vehicleType] || imageConfig.vehicleType;

  if (imageConfig.vehicleType === 'truck' && imageConfig.bedModule !== 'none') {
    activeModules.push({
      key: 'bed',
      label: BED_MODULE_NAMES[imageConfig.bedModule].toUpperCase(),
      color: '#4FC3F7',
    });
  }
  if (imageConfig.roofModule !== 'none') {
    activeModules.push({
      key: 'roof',
      label: ROOF_MODULE_NAMES[imageConfig.roofModule].toUpperCase(),
      color: '#FF6B6B',
    });
  }
  if (imageConfig.hitchModule !== 'none') {
    activeModules.push({
      key: 'hitch',
      label: HITCH_MODULE_NAMES[imageConfig.hitchModule].toUpperCase(),
      color: '#FFB74D',
    });
  }

  const currentValidationLabel = validationIndex !== null
    ? VALIDATION_CONFIGS[validationIndex]?.label
    : null;

  // Check if we're on the vehicle_type step (show category preview)
  const isOnVehicleTypeStep = currentStepId === 'vehicle_type';

  return (
    <View style={[styles.container, expanded && styles.containerExpanded]}>
      {/* Silhouette toggle */}
      <TouchableOpacity
        style={styles.silhouetteToggle}
        onPress={() => setShowSilhouette(!showSilhouette)}
        activeOpacity={0.7}
      >
        <Ionicons
          name={showSilhouette ? 'chevron-down' : 'chevron-up'}
          size={14}
          color={TACTICAL.textMuted}
        />
        <Text style={styles.silhouetteToggleText}>
          {showSilhouette ? 'HIDE PREVIEW' : 'SHOW PREVIEW'}
        </Text>
      </TouchableOpacity>

      {/* ECS Image Preview Card */}
      {showSilhouette && (
        <View style={styles.previewCard}>
          {/* Preview Header */}
          <View style={styles.previewHeader}>
            <View style={styles.previewHeaderLeft}>
              <View style={styles.previewIconWrap}>
                <Ionicons name="eye-outline" size={14} color="#D4AF37" />
              </View>
              <View>
                <Text style={styles.previewLabel}>BUILD PREVIEW</Text>
                <Text style={styles.previewSubtitle}>
                  {isOnVehicleTypeStep
                    ? 'Select a vehicle category'
                    : 'Updates as you select options'}
                </Text>
              </View>
            </View>
            <View style={styles.headerButtons}>
              {/* Debug Toggle */}
              <TouchableOpacity
                style={[styles.debugBtn, debugOverlay && styles.debugBtnActive]}
                onPress={() => setDebugOverlay(!debugOverlay)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="bug-outline"
                  size={12}
                  color={debugOverlay ? '#FF6B6B' : TACTICAL.textMuted}
                />
              </TouchableOpacity>
              {/* Validation Test Cycle */}
              <TouchableOpacity
                style={[styles.testBtn, validationIndex !== null && styles.testBtnActive]}
                onPress={handleCycleValidation}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="flask-outline"
                  size={12}
                  color={validationIndex !== null ? '#4FC3F7' : TACTICAL.textMuted}
                />
                <Text style={[
                  styles.testBtnText,
                  validationIndex !== null && styles.testBtnTextActive
                ]}>
                  {validationIndex !== null ? `${validationIndex + 1}/5` : 'TEST'}
                </Text>
              </TouchableOpacity>
              {showRandomize && (
                <TouchableOpacity
                  style={styles.randomizeBtn}
                  onPress={handleRandomize}
                  activeOpacity={0.7}
                >
                  <Ionicons name="shuffle-outline" size={14} color="#D4AF37" />
                  <Text style={styles.randomizeBtnText}>DEMO</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Validation Test Label */}
          {currentValidationLabel && (
            <View style={styles.validationLabel}>
              <Ionicons name="flask" size={10} color="#4FC3F7" />
              <Text style={styles.validationLabelText}>
                TEST {validationIndex! + 1}: {currentValidationLabel}
              </Text>
            </View>
          )}

          {/* Static Category Preview (shown on vehicle_type step) */}
          {(isOnVehicleTypeStep || showCategoryPreview) && !randomOverride && validationIndex === null && (
            <View style={styles.categoryPreviewContainer}>
              <CategoryPreview
                selectedVehicleType={selections.vehicle_type || null}
                compact
                showLabel
              />
            </View>
          )}

          {/* Image Compositor Render Area (with bounce animation) */}
          {(!isOnVehicleTypeStep || randomOverride || validationIndex !== null) && (
            <Animated.View
              style={[
                styles.silhouetteContainer,
                {
                  transform: [{ scale: bounceScale }],
                  opacity: previewFade,
                },
              ]}
            >
              <ImageCompositor
                config={imageConfig}
                width={silhouetteW}
                accessoryTint="#D4AF37"
                opacity={0.9}
                debugOverlay={debugOverlay}
              />
            </Animated.View>
          )}

          {/* Build Label */}
          <View style={styles.buildLabelRow}>
            <View style={styles.buildLabelAccent} />
            <Text style={styles.buildLabelPrefix}>BUILD</Text>
            <Text style={styles.buildLabelValue}>{baseLabel}</Text>
          </View>

          {/* Active Module Badges */}
          {activeModules.length > 0 && (
            <View style={styles.moduleLabels}>
              {activeModules.map((mod) => (
                <View
                  key={mod.key}
                  style={[
                    styles.moduleBadge,
                    { borderColor: `${mod.color}40`, backgroundColor: `${mod.color}12` },
                  ]}
                >
                  <View style={[styles.moduleBadgeDot, { backgroundColor: mod.color }]} />
                  <Text style={[styles.moduleBadgeText, { color: mod.color }]}>
                    {mod.label}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Override indicator (random or validation) */}
          {(randomOverride || validationIndex !== null) && (
            <View style={styles.overrideIndicator}>
              <Ionicons
                name={validationIndex !== null ? 'flask-outline' : 'shuffle-outline'}
                size={10}
                color={TACTICAL.textMuted}
              />
              <Text style={styles.overrideIndicatorText}>
                {validationIndex !== null ? 'VALIDATION TEST' : 'DEMO BUILD'}
              </Text>
              <TouchableOpacity
                onPress={handleClearOverride}
                style={styles.overrideClearBtn}
              >
                <Text style={styles.overrideClearText}>CLEAR</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <BuildSummaryBar selections={selections} />
      {cgResult.totalMass > 0 && (
        <WeightDistribution cgResult={cgResult} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  containerExpanded: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.3)',
    overflow: 'hidden',
  },

  // Toggle
  silhouetteToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    backgroundColor: 'rgba(62, 79, 60, 0.08)',
  },
  silhouetteToggleText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  // Preview Card
  previewCard: {
    backgroundColor: TACTICAL.bg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.15)',
  },

  // Preview Header
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  previewHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#D4AF37',
    letterSpacing: 2,
  },
  previewSubtitle: {
    fontSize: 8,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    marginTop: 1,
  },

  // Header Buttons
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  // Debug Button
  debugBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(138, 138, 133, 0.2)',
    backgroundColor: 'rgba(138, 138, 133, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  debugBtnActive: {
    borderColor: 'rgba(255, 107, 107, 0.4)',
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
  },

  // Test Button
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(138, 138, 133, 0.2)',
    backgroundColor: 'rgba(138, 138, 133, 0.06)',
  },
  testBtnActive: {
    borderColor: 'rgba(79, 195, 247, 0.4)',
    backgroundColor: 'rgba(79, 195, 247, 0.1)',
  },
  testBtnText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  testBtnTextActive: {
    color: '#4FC3F7',
  },

  // Randomize
  randomizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.25)',
    backgroundColor: 'rgba(212, 175, 55, 0.06)',
  },
  randomizeBtnText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#D4AF37',
    letterSpacing: 1,
  },

  // Validation Label
  validationLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(79, 195, 247, 0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(79, 195, 247, 0.15)',
  },
  validationLabelText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#4FC3F7',
    letterSpacing: 0.8,
  },

  // Category Preview Container
  categoryPreviewContainer: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 16,
  },

  // Silhouette
  silhouetteContainer: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
  },

  // Build Label
  buildLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 6,
    gap: 8,
  },
  buildLabelAccent: {
    width: 3,
    height: 14,
    borderRadius: 1.5,
    backgroundColor: '#D4AF37',
  },
  buildLabelPrefix: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  buildLabelValue: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1,
  },

  // Module Badges
  moduleLabels: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexWrap: 'wrap',
  },
  moduleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  moduleBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  moduleBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  // Override indicator
  overrideIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(212, 175, 55, 0.04)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.1)',
  },
  overrideIndicatorText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  overrideClearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(62, 79, 60, 0.2)',
  },
  overrideClearText: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
  },
});



