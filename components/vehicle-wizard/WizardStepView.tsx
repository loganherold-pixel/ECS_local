/**
 * WizardStepView — ADAPTIVE SELECTION PAD
 *
 * MICRO UI SPEC — USES REUSABLE FooterNav:
 *   Header:          48px fixed — step badge + title + subtitle
 *   Preview Zone:    44% of usable height — image/icon, centered, bottom-aligned
 *   Selection Zone:  56% of usable height — button grid
 *     - 2 options:   Enlarged buttons (minHeight: 64px), larger text to fill space
 *     - 3–4 options: Standard single column (minHeight: 52px)
 *     - 5+ options:  ScrollView fallback inside selection zone for small screens
 *
 * GRID RULES:
 *   1–4 options  → single column (full width)
 *   5–8 options  → 2-column grid
 *   9–12 options → 3-column grid (compact)
 *
 * BUTTON SPEC:
 *   Sparse (2 opts): minHeight 64px, fontSize 13, generous padding
 *   Standard (3-4):  minHeight 52px (single col) / 48px (grid)
 *   Dense (5+):      ScrollView wrapper, standard sizing
 *   Corner radius: 14px
 *   Title: 1–2 lines max, ellipsis
 *
 * FOOTER SPEC:
 *   Uses shared FooterNav component (56px height)
 *   Back: always enabled — on first step (stepIndex === 0) exits wizard
 *   Next: disabled until valid selection, ECS gold when enabled
 *   Subtle ECS gold border-top

 *
 * ECS STYLING:
 *   Black/dark base, subtle gold accents, clean agency-ready look
 */
import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Animated,
  AccessibilityInfo,
  Platform,
  Dimensions,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import FooterNav from '../FooterNav';

import { TACTICAL } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import type { WizardStep } from './WizardData';
import { resolveWizardIconKey } from './WizardIconMap';
import { resolveProductIconUrl } from './EcsIconRegistry';

// ── Vehicle Type Image Map ──────────────────────────────
const VEHICLE_TYPE_IMAGES: Record<string, string> = {
  jeep: 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771721081960_272ca2d8.jpg',
  car_crossover: 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771721082418_ed8cdfc2.jpg',
  suv_van: 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771721082973_2552c42d.jpg',
  truck: 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771721083425_c7d37125.jpg',
};

// ── ECS Gold for selection ──────────────────────────────
const ECS_GOLD = '#C48A2C';
const ECS_GOLD_BORDER = 'rgba(196, 138, 44, 0.85)';
const ECS_GOLD_BG = 'rgba(196, 138, 44, 0.06)';
const ECS_GOLD_GLOW = 'rgba(196, 138, 44, 0.25)';

// ── Step Complete Tick Constants ─────────────────────────
const TICK_DISPLAY_MS = 700;
const TICK_FADE_MS = 200;

// ── Layout Constants (Micro UI Spec) ────────────────────
const HEADER_HEIGHT = 48;
const FOOTER_HEIGHT = 56;
const ZONE_PADDING_H = 16;
const ZONE_PADDING_V = 10;
const ITEM_GAP = 10;
const COL_GAP = 10;

// ── Adaptive sizing thresholds ──────────────────────────
const SPARSE_THRESHOLD = 2;   // ≤2 options → enlarged buttons
const DENSE_THRESHOLD = 5;    // ≥5 options → ScrollView fallback

interface Props {
  step: WizardStep;
  selectedId: string | null;
  onSelect: (optionId: string) => void;
  stepIndex: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  canGoNext: boolean;
  isLastStep: boolean;
  onSaveExit?: () => void;
  draftSavedVisible?: boolean;
  phaseNumber?: number;
  totalPhases?: number;
  subStepLabel?: string;
  /** Optional: Called when user wants to skip remaining resource profile steps → Step 3 */
  onSkip?: () => void;
}




// ═══════════════════════════════════════════════════════════
// STEP COMPLETE TICK
// ═══════════════════════════════════════════════════════════
function StepCompleteTick({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (visible) {
      Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }).start();
      timerRef.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: TICK_FADE_MS, useNativeDriver: true }).start();
      }, TICK_DISPLAY_MS);
    } else {
      opacity.setValue(0);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [visible]);

  return (
    <Animated.View style={[styles.tickContainer, { opacity }]} pointerEvents="none">
      <Ionicons name="checkmark" size={14} color={ECS_GOLD} />
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function WizardStepView({
  step,
  selectedId,
  onSelect,
  stepIndex,
  totalSteps,
  onBack,
  onNext,
  canGoNext,
  isLastStep,
  onSaveExit,
  draftSavedVisible,
  phaseNumber,
  totalPhases = 3,
  subStepLabel,
  onSkip,
}: Props) {


  // Vehicle type step is no longer shown in the wizard flow
  const isVehicleTypeStep = false;
  const isFirstStep = stepIndex === 0;
  const optionCount = step.options.length;

  // ── Adaptive sizing flags ─────────────────────────────
  const isSparse = optionCount <= SPARSE_THRESHOLD;   // 2 options → enlarged
  const isDense = optionCount >= DENSE_THRESHOLD;      // 5+ options → scrollable

  // ── Grid layout decision ──────────────────────────────
  // 1-4: single column, 5-8: 2-col, 9-12: 3-col
  const columns = optionCount <= 4 ? 1 : optionCount <= 8 ? 2 : 3;
  const isGrid = columns > 1;

  // ── Multi-select count (for accessories steps) ────────
  const isMultiSelect = step.id.includes('accessories') || step.id.includes('setup');

  // ── Step complete tick state ───────────────────────────
  const [showTick, setShowTick] = useState(false);
  const lastCompletedStepRef = useRef<string | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Content transition animation ──────────────────────
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentTranslateY = useRef(new Animated.Value(0)).current;
  const prevStepId = useRef(step.id);

  // ── Reduced motion detection ──────────────────────────
  const reducedMotion = useRef(false);
  useEffect(() => {
    if (Platform.OS === 'web') {
      try {
        const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        reducedMotion.current = mq?.matches ?? false;
      } catch { reducedMotion.current = false; }
    } else {
      AccessibilityInfo.isReduceMotionEnabled?.().then((val) => {
        reducedMotion.current = val;
      }).catch(() => {});
    }
  }, []);

  // ── Step transition ───────────────────────────────────
  useEffect(() => {
    if (prevStepId.current !== step.id) {
      prevStepId.current = step.id;
      setShowTick(false);
      lastCompletedStepRef.current = null;

      if (!reducedMotion.current) {
        contentOpacity.setValue(0);
        contentTranslateY.setValue(8);
        Animated.parallel([
          Animated.timing(contentOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
          Animated.timing(contentTranslateY, { toValue: 0, duration: 180, useNativeDriver: true }),
        ]).start();
      } else {
        contentOpacity.setValue(0);
        contentTranslateY.setValue(0);
        Animated.timing(contentOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      }
    }
  }, [step.id]);

  // ── Step complete detection + haptic ──────────────────
  useEffect(() => {
    if (selectedId && lastCompletedStepRef.current !== `${step.id}:${selectedId}`) {
      lastCompletedStepRef.current = `${step.id}:${selectedId}`;
      setShowTick(true);
      if (!reducedMotion.current) hapticMicro();
      if (tickTimerRef.current) clearTimeout(tickTimerRef.current);
      tickTimerRef.current = setTimeout(() => setShowTick(false), TICK_DISPLAY_MS + TICK_FADE_MS + 50);
    }
    return () => { if (tickTimerRef.current) clearTimeout(tickTimerRef.current); };
  }, [selectedId, step.id]);

  // ── Option press handler ──────────────────────────────
  const handleSelect = useCallback((optionId: string) => {
    onSelect(optionId);
  }, [onSelect]);

  // ── Resolve ECS product image for the selected option ──
  // Uses the WizardIconMap to map (stepId, optionId) → icon key,
  // then EcsIconRegistry to resolve the key → image URL.
  // This ensures the displayed image ALWAYS matches the selected option.
  const getOptionImageUrl = useCallback((optionId: string): string | null => {
    const iconKey = resolveWizardIconKey(step.id, optionId);
    if (!iconKey) return null;
    return resolveProductIconUrl(iconKey);
  }, [step.id]);

  // ── Selected option's product image URL ───────────────
  const selectedImageUrl = selectedId ? getOptionImageUrl(selectedId) : null;

  // ── Build the options list (shared between scroll/non-scroll) ──
  const renderOptions = () => (
    <View style={[
      styles.optionsContainer,
      isGrid && styles.optionsContainerGrid,
    ]}>
      {step.options.map((option) => {
        const isSelected = selectedId === option.id;

        // Resolve ECS product image for THIS specific option
        const optionImageUrl = getOptionImageUrl(option.id);

        // Determine button size based on columns + adaptive sizing
        const btnStyle = columns === 1
          ? (isSparse ? styles.optionBtnSparse : styles.optionBtnSingle)
          : columns === 2
            ? styles.optionBtnTwo
            : styles.optionBtnThree;

        return (
          <TouchableOpacity
            key={option.id}
            style={[
              styles.optionBtn,
              btnStyle,
              isSelected && styles.optionBtnSelected,
            ]}
            onPress={() => handleSelect(option.id)}
            activeOpacity={0.75}
          >
            {/* Icon / Product Image — show ECS product image when available */}
            <View style={[
              styles.optionIconWrap,
              isSelected && styles.optionIconWrapSelected,
              columns === 3 && styles.optionIconWrapCompact,
            ]}>
              {optionImageUrl ? (
                <Image
                  source={{ uri: optionImageUrl }}
                  style={columns === 3 ? styles.optionThumbCompact : styles.optionThumb}
                  resizeMode="contain"
                />
              ) : (
                <Ionicons
                  name={option.icon as any}
                  size={columns === 3 ? 14 : columns === 2 ? 16 : 18}
                  color={isSelected ? ECS_GOLD : TACTICAL.textMuted}
                />
              )}
            </View>

            {/* Label + Description */}
            <View style={styles.optionTextWrap}>
              <Text
                style={[
                  styles.optionLabel,
                  isSparse && columns === 1 && styles.optionLabelSparse,
                  isSelected && styles.optionLabelSelected,
                  columns === 3 && styles.optionLabelCompact,
                ]}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {option.label}
              </Text>
              {columns === 1 && (
                <Text
                  style={[
                    styles.optionDesc,
                    isSparse && styles.optionDescSparse,
                  ]}
                  numberOfLines={2}
                >
                  {option.description}
                </Text>
              )}
            </View>

            {/* Selection indicator — larger for sparse */}
            {columns <= 2 && (
              <Ionicons
                name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                size={isSparse && columns === 1 ? 22 : 18}
                color={isSelected ? ECS_GOLD : 'rgba(138,138,133,0.2)'}
              />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* ═══════════════════════════════════════════════════ */}
      {/* HEADER — 48px fixed                                */}
      {/* ═══════════════════════════════════════════════════ */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {/* Phase badge (high-level 3-step indicator) */}
          {phaseNumber != null ? (
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>
                STEP {phaseNumber}/{totalPhases}
              </Text>
            </View>
          ) : (
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>
                {stepIndex + 1}/{totalSteps}
              </Text>
            </View>
          )}
          <View style={styles.headerTextWrap}>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={1}>{step.title}</Text>
              <StepCompleteTick visible={showTick} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.subtitle} numberOfLines={1}>{step.subtitle}</Text>
              {/* Sub-step indicator within the phase (e.g., "2 of 5") */}
              {subStepLabel ? (
                <Text style={[styles.subtitle, { color: TACTICAL.amber, fontWeight: '800', letterSpacing: 0.8 }]} numberOfLines={1}>
                  ({subStepLabel})
                </Text>
              ) : null}
            </View>
          </View>
        </View>
        {isMultiSelect && selectedId && (
          <View style={styles.selectedChip}>
            <Ionicons name="checkmark-circle" size={10} color="#4CAF50" />
            <Text style={styles.selectedChipText}>SELECTED</Text>
          </View>
        )}
      </View>


      {/* ═══════════════════════════════════════════════════ */}
      {/* CONTENT AREA — fills between header and footer      */}
      {/* ═══════════════════════════════════════════════════ */}
      <View style={styles.contentArea}>
        {/* ─── PREVIEW ZONE — shows ECS product image ─────── */}
        <View style={styles.previewZone}>
          <View style={styles.previewPlaceholder}>
            {selectedImageUrl ? (
              /* Show the selected option's ECS product image */
              <View style={styles.previewImageContainer}>
                <Image
                  source={{ uri: selectedImageUrl }}
                  style={styles.previewImage}
                  resizeMode="contain"
                />
              </View>
            ) : (
              /* No selection yet — show step icon as placeholder */
              <View style={styles.previewIconCircle}>
                <Ionicons name={step.icon as any} size={36} color={TACTICAL.amber} />
              </View>
            )}
            {selectedId && (
              <View style={styles.previewSelectedBadge}>
                <Ionicons name="checkmark-circle" size={12} color="#4CAF50" />
                <Text style={styles.previewSelectedText}>
                  {step.options.find(o => o.id === selectedId)?.label || ''}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ─── SELECTION ZONE ─────────────────────────────── */}
        {/* Dense steps (5+) get ScrollView fallback           */}
        <Animated.View
          style={[
            styles.selectionZone,
            {
              opacity: contentOpacity,
              transform: [{ translateY: contentTranslateY }],
            },
          ]}
        >
          {isDense ? (
            <ScrollView
              style={styles.scrollFallback}
              contentContainerStyle={styles.scrollFallbackContent}
              showsVerticalScrollIndicator={true}
              bounces={false}
              overScrollMode="never"
              indicatorStyle="white"
            >
              {renderOptions()}
            </ScrollView>
          ) : (
            renderOptions()
          )}
        </Animated.View>
      </View>


      {/* ═══════════════════════════════════════════════════ */}
      {/* SAVE & EXIT — optional, above FooterNav             */}
      {/* ═══════════════════════════════════════════════════ */}
      {onSaveExit && (
        <View style={styles.saveExitRow}>
          <TouchableOpacity
            style={styles.saveExitBtn}
            onPress={onSaveExit}
            activeOpacity={0.7}
          >
            <Ionicons name="bookmark-outline" size={13} color={TACTICAL.textMuted} />
            <Text style={styles.saveExitText}>SAVE & EXIT</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* FOOTER NAVIGATION — Reusable FooterNav component    */}
      {/* ═══════════════════════════════════════════════════ */}
      <FooterNav
        canGoBack={true}
        canGoNext={canGoNext}
        backLabel="BACK"
        nextLabel={isLastStep ? 'REVIEW' : 'NEXT'}
        onBack={onBack}
        onNext={onNext}
        primaryMode="next"
        nextIcon={isLastStep ? 'checkmark-outline' : 'chevron-forward'}
      />
    </View>
  );
}





// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ── HEADER — 48px fixed ───────────────────────────────
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ZONE_PADDING_H,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.2)',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerTextWrap: {
    flex: 1,
  },
  stepBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
  },
  stepBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  title: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
    marginTop: 1,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  selectedChipText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#4CAF50',
    letterSpacing: 0.8,
  },

  // ── Step Complete Tick ────────────────────────────────
  tickContainer: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── CONTENT AREA — fills between header and footer ────
  contentArea: {
    flex: 1,
  },

  // ── PREVIEW ZONE — 44% of content area ────────────────
  previewZone: {
    flex: 0.44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: ZONE_PADDING_H,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.15)',
  },

  previewImageContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
  },
  previewImage: {
    width: '85%',
    height: '90%',
  },

  previewPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  previewIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(196, 138, 44, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPlaceholderText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  previewSelectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.25)',
  },
  previewSelectedText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#4CAF50',
    letterSpacing: 0.8,
  },

  // ── SELECTION ZONE — 56% of content area ──────────────
  selectionZone: {
    flex: 0.56,
    paddingHorizontal: ZONE_PADDING_H,
    paddingTop: ZONE_PADDING_V,
    paddingBottom: ZONE_PADDING_V,
    justifyContent: 'center',
  },

  selectionZoneFull: {
    flex: 1,
    paddingHorizontal: ZONE_PADDING_H,
    paddingTop: ZONE_PADDING_V,
    paddingBottom: ZONE_PADDING_V,
    justifyContent: 'center',
  },

  // ── ScrollView fallback for dense steps (5+ options) ──
  scrollFallback: {
    flex: 1,
  },
  scrollFallbackContent: {
    paddingBottom: 4,
    justifyContent: 'center',
    flexGrow: 1,
  },

  // ── Options Container ─────────────────────────────────
  optionsContainer: {
    gap: ITEM_GAP,
  },
  optionsContainerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ITEM_GAP,
  },

  // ── Option Button Base ────────────────────────────────
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: TACTICAL.panel,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(62, 79, 60, 0.25)',
  },

  // ── SPARSE: 2 options → enlarged buttons to fill space ─
  optionBtnSparse: {
    minHeight: 64,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },

  // Single column: full width, min 52px (standard 3-4 options)
  optionBtnSingle: {
    minHeight: 52,
  },

  // 2-column grid: ~48% width, min 48px
  optionBtnTwo: {
    width: `${(100 - (ITEM_GAP / (Dimensions.get('window').width - ZONE_PADDING_H * 2)) * 100) / 2}%` as any,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: '48%',
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },

  // 3-column grid: ~31% width, min 44px
  optionBtnThree: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: '31%',
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 6,
    flexDirection: 'column',
    alignItems: 'center',
  },

  optionBtnSelected: {
    borderColor: ECS_GOLD_BORDER,
    backgroundColor: 'rgba(18, 24, 29, 0.98)',
    shadowColor: ECS_GOLD,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },

  // ── Option Icon ───────────────────────────────────────
  optionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(62, 79, 60, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  optionIconWrapSelected: {
    backgroundColor: 'rgba(196, 138, 44, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
  },
  optionIconWrapCompact: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  optionThumb: {
    width: 30,
    height: 30,
  },
  optionThumbCompact: {
    width: 24,
    height: 24,
  },
  optionIconImage: {
    width: 26,
    height: 26,
  },
  optionIconImageCompact: {
    width: 20,
    height: 20,
  },

  // ── Option Text ───────────────────────────────────────
  optionTextWrap: {
    flex: 1,
    gap: 1,
  },
  optionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.6,
  },
  // ── SPARSE: larger label for 2-option steps ───────────
  optionLabelSparse: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  optionLabelSelected: {
    color: ECS_GOLD,
  },
  optionLabelCompact: {
    fontSize: 8,
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  optionDesc: {
    fontSize: 9,
    color: 'rgba(138, 138, 133, 0.55)',
    letterSpacing: 0.2,
  },
  // ── SPARSE: larger description for 2-option steps ─────
  optionDescSparse: {
    fontSize: 11,
    marginTop: 2,
    color: 'rgba(138, 138, 133, 0.65)',
    letterSpacing: 0.3,
  },

  // ── Save & Exit Row ───────────────────────────────────
  saveExitRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.1)',
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  saveExitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 6,
  },
  saveExitText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.2,
  },
});



