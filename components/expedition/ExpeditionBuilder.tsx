// ============================================================
// EXPEDITION BUILDER — Guided Step-Driven Workflow
// ============================================================
// The "cool part" — a progressive, step-driven builder that
// guides users through expedition preparation:
//
//   Step 1: Select Vehicle Profile
//   Step 2: Configure Vehicle Framework / Type
//   Step 3: Set Up Vehicle Zones & Containers
//   Step 4: Build Loadout → SET TO READY (manual confirmation)
//
// Features:
//   • Completed steps show green checkmark
//   • Step 4 requires manual "Set to Ready" from Loadout screen
//   • All state persists via expeditionCache
//   • Taps expand into sub-step detail
//   • Works offline with cached data
//   • 100% green state when loadoutReady === true
//   • SAVE AS TEMPLATE when all 4 steps complete + items exist
//   • LOAD TEMPLATE with vehicle-type suggestions
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import FooterNav from '../FooterNav';

import { TACTICAL } from '../../lib/theme';
import { useWizardState } from '../../context/WizardStateContext';
import { vehicleStore } from '../../lib/vehicleStore';
import { fetchVehicleZones } from '../../lib/fetchVehicleZones';
import {
  getBuilderState,
  setBuilderState,
  resetBuilderState,
  setCachedVehicleZones,
  getCachedVehicleZones,
  type BuilderStepState,
  type CachedZone,
} from '../../lib/expeditionCache';
import { loadoutItemStore } from '../../lib/loadoutStore';
import type { Vehicle } from '../../lib/types';
import SaveTemplateModal from '../templates/SaveTemplateModal';
import LoadTemplateModal from '../templates/LoadTemplateModal';


const TAG = '[EXPEDITION_BUILDER]';

function logExpeditionBuilderDev(...args: unknown[]) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(...args);
  }
}

// ── Step definitions ─────────────────────────────────────────
interface BuilderStep {
  key: string;
  label: string;
  sublabel: string;
  icon: string;
  completedIcon: string;
  route?: string;
  checkField: keyof BuilderStepState;
}

const BUILDER_STEPS: BuilderStep[] = [
  {
    key: 'vehicle',
    label: 'SELECT VEHICLE',
    sublabel: 'Choose your expedition vehicle profile',
    icon: 'car-sport-outline',
    completedIcon: 'car-sport',
    route: '/(tabs)/vehicle-config',
    checkField: 'vehicleSelected',
  },
  {
    key: 'framework',
    label: 'VEHICLE FRAMEWORK',
    sublabel: 'Configure type, hitch, and accessories',
    icon: 'construct-outline',
    completedIcon: 'construct',
    route: '/(tabs)/vehicle-config',
    checkField: 'frameworkConfigured',
  },
  {
    key: 'zones',
    label: 'ZONES & CONTAINERS',
    sublabel: 'Cab, bed, roof, hitch, drawers',
    icon: 'grid-outline',
    completedIcon: 'grid',
    route: '/(tabs)/loadmap',
    checkField: 'zonesConfigured',
  },
  {
    key: 'loadout',
    label: 'BUILD LOADOUT',
    sublabel: 'Configure loadout via Fleet tab, then SET TO READY',
    icon: 'cube-outline',
    completedIcon: 'cube',
    route: '/fleet',
    checkField: 'loadoutReady',
  },

];

// ── Pulse animation for incomplete steps ─────────────────────
function PulseIndicator() {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  return (
    <Animated.View style={[styles.pulseIndicator, { opacity: pulseAnim }]}>
      <View style={styles.pulseDot} />
    </Animated.View>
  );
}

// ── Green glow animation for completed state ─────────────────
function GreenGlow() {
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.8,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.3,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [glowAnim]);

  return (
    <Animated.View style={[styles.greenGlow, { opacity: glowAnim }]} />
  );
}

// ── Individual Step Card ─────────────────────────────────────
function StepCard({
  step,
  index,
  isCompleted,
  isActive,
  isLocked,
  isAllComplete,
  onPress,
  detail,
}: {
  step: BuilderStep;
  index: number;
  isCompleted: boolean;
  isActive: boolean;
  isLocked: boolean;
  isAllComplete: boolean;
  onPress: () => void;
  detail?: string | null;
}) {
  const borderColor = isCompleted
    ? isAllComplete
      ? 'rgba(76, 175, 80, 0.6)'
      : 'rgba(76, 175, 80, 0.45)'
    : isActive
    ? 'rgba(196, 138, 44, 0.5)'
    : 'rgba(62, 79, 60, 0.25)';

  const bgColor = isCompleted
    ? isAllComplete
      ? 'rgba(76, 175, 80, 0.10)'
      : 'rgba(76, 175, 80, 0.06)'
    : isActive
    ? 'rgba(196, 138, 44, 0.06)'
    : 'rgba(0,0,0,0.12)';

  const iconColor = isCompleted
    ? '#4CAF50'
    : isActive
    ? TACTICAL.amber
    : isLocked
    ? 'rgba(138,138,133,0.35)'
    : TACTICAL.textMuted;

  const textColor = isLocked ? 'rgba(138,138,133,0.35)' : TACTICAL.text;
  const subColor = isLocked ? 'rgba(138,138,133,0.25)' : TACTICAL.textMuted;

  return (
    <TouchableOpacity
      style={[styles.stepCard, { borderColor, backgroundColor: bgColor }]}
      onPress={onPress}
      activeOpacity={isLocked ? 1 : 0.75}
      disabled={isLocked}
    >
      <View style={[
        styles.stepNumberContainer,
        isCompleted && styles.stepNumberCompleted,
        isAllComplete && isCompleted && styles.stepNumberAllComplete,
      ]}>
        {isCompleted ? (
          <Ionicons name="checkmark" size={16} color="#4CAF50" />
        ) : (
          <Text style={[styles.stepNumber, { color: iconColor }]}>{index + 1}</Text>
        )}
      </View>

      <View style={[styles.stepIconContainer, { borderColor: `${iconColor}40` }]}>
        <Ionicons
          name={(isCompleted ? step.completedIcon : step.icon) as any}
          size={20}
          color={iconColor}
        />
      </View>

      <View style={styles.stepContent}>
        <Text style={[styles.stepLabel, { color: textColor }]}>{step.label}</Text>
        <Text style={[styles.stepSublabel, { color: subColor }]}>
          {detail || step.sublabel}
        </Text>
      </View>

      <View style={styles.stepRight}>
        {isCompleted ? (
          <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
        ) : isActive ? (
          <PulseIndicator />
        ) : isLocked ? (
          <Ionicons name="lock-closed-outline" size={16} color="rgba(138,138,133,0.25)" />
        ) : (
          <Ionicons name="chevron-forward" size={18} color={TACTICAL.textMuted} />
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── Main Builder Component ───────────────────────────────────
interface Props {
  userId: string | null;
  isOnline: boolean;
  activeExpeditionTitle?: string | null;
}

export default function ExpeditionBuilder({ userId, isOnline, activeExpeditionTitle }: Props) {
  const router = useRouter();
  const { setExpeditionReady } = useWizardState();

  const [builderState, setLocalBuilderState] = useState<BuilderStepState>(getBuilderState());
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showLoadTemplate, setShowLoadTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [loadoutItemCount, setLoadoutItemCount] = useState(0);
  const mountedRef = useRef(true);


  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // ── Auto-detect zone completion on focus ────────────────────
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const detectProgress = async () => {
        try {
          const currentState = getBuilderState();
          const vehicleId = currentState.vehicleId;

          if (!vehicleId) {
            logExpeditionBuilderDev(TAG, 'No vehicleId in builder state — skipping zone detection');
            return;
          }

          logExpeditionBuilderDev(TAG, `Focus detected — checking zones for vehicle ${vehicleId}`);

          // ── Step 3: Zone detection ────────────────────────
          let cachedZones = getCachedVehicleZones(vehicleId);
          let zonesFromFetch: CachedZone[] = [];

          if (cachedZones.length === 0) {
            try {
              const result = await fetchVehicleZones(vehicleId);
              const flatZones = result?.flat || [];

              if (flatZones.length > 0 && !cancelled) {
                zonesFromFetch = flatZones.map((z: any, i: number) => ({
                  id: z.id || `zone_${i}`,
                  name: z.name || z.zone_name || 'Zone',
                  zone_type: z.zone_type || 'area',
                  slot_count: typeof z.slot_count === 'number' ? z.slot_count : 0,
                  color: z.color || null,
                  icon: z.icon || null,
                  sort_order: typeof z.sort_order === 'number' ? z.sort_order : i,
                }));

                setCachedVehicleZones(vehicleId, zonesFromFetch);
                logExpeditionBuilderDev(TAG, `Cached ${zonesFromFetch.length} zones from fetch for vehicle ${vehicleId}`);
              }
            } catch (fetchErr) {
              console.warn(TAG, 'Zone fetch failed (may be offline):', fetchErr);
            }
          }

          const resolvedZones = cachedZones.length > 0 ? cachedZones : zonesFromFetch;
          const hasZones = resolvedZones.length > 0;

          if (hasZones && !currentState.zonesConfigured && !cancelled) {
            const zoneUpdate: Partial<BuilderStepState> = {
              zonesConfigured: true,
              zoneCount: resolvedZones.length,
            };
            setBuilderState(zoneUpdate);
            if (mountedRef.current && !cancelled) {
              setLocalBuilderState(prev => ({
                ...prev,
                ...zoneUpdate,
                lastUpdated: new Date().toISOString(),
              }));
            }
            logExpeditionBuilderDev(TAG, `Step 3 auto-completed: ${resolvedZones.length} zones detected`);
          }

          // ── Count loadout items for template save eligibility ──
          if (currentState.loadoutId && !cancelled) {
            try {
              const items = await loadoutItemStore.getByLoadoutId(currentState.loadoutId, userId);
              if (mountedRef.current && !cancelled) {
                setLoadoutItemCount(items.length);
              }
            } catch (e) {
              console.warn(TAG, 'Failed to count loadout items:', e);
            }
          }

          // ── Refresh local state from persisted builder state ─
          if (mountedRef.current && !cancelled) {
            const freshState = getBuilderState();
            setLocalBuilderState(freshState);
          }

        } catch (err) {
          console.warn(TAG, 'detectProgress error:', err);
        }
      };

      detectProgress();

      return () => {
        cancelled = true;
      };
    }, [userId])
  );


  // Load vehicles to check step 1 completion
  useEffect(() => {
    let cancelled = false;
    const loadVehicles = async () => {
      setLoadingVehicles(true);
      try {
        const { vehicles: v } = await vehicleStore.getAll(userId);
        if (!cancelled && mountedRef.current) {
          setVehicles(v || []);

          const hasVehicle = (v || []).length > 0;
          const currentState = getBuilderState();

          if (hasVehicle && !currentState.vehicleSelected) {
            const firstVehicle = v[0];
            const update: Partial<BuilderStepState> = {
              vehicleSelected: true,
              vehicleId: firstVehicle.id,
              vehicleName: firstVehicle.name,
            };
            setBuilderState(update);
            setLocalBuilderState(prev => ({ ...prev, ...update, lastUpdated: new Date().toISOString() }));
          }
        }
      } catch (e) {
        console.warn(TAG, 'loadVehicles error:', e);
      }
      if (!cancelled && mountedRef.current) setLoadingVehicles(false);
    };
    loadVehicles();
    return () => { cancelled = true; };
  }, [userId]);
  const completedCount = BUILDER_STEPS.filter(s => builderState[s.checkField]).length;
  const progressPct = Math.round((completedCount / BUILDER_STEPS.length) * 100);
  const isAllComplete = completedCount === BUILDER_STEPS.length;

  // ── Auto-collapse when expedition is ready ─────────────
  useEffect(() => {
    if (isAllComplete && expanded) {
      // Auto-collapse builder when all steps complete
      setExpanded(false);
    }
  }, [expanded, isAllComplete]);


  // Save template eligibility: all 4 steps complete + at least 1 loadout item
  const canSaveTemplate = isAllComplete && loadoutItemCount > 0;

  const handleStepPress = useCallback((step: BuilderStep, index: number) => {
    logExpeditionBuilderDev(TAG, `Step pressed: ${step.key} (index ${index})`);

    // Bug A fix: If framework step is already complete, route to Fleet tab for loadout configuration
    if (step.key === 'framework' && builderState.frameworkConfigured === true) {
      logExpeditionBuilderDev(TAG, 'Framework already configured — routing to Fleet tab for loadout configuration');
      router.push('/fleet' as any);
      return;
    }


    // Framework step (not yet complete) → route to vehicle-config Step 3 with vehicleId
    if (step.key === 'framework' && builderState.vehicleId) {
      logExpeditionBuilderDev(TAG, `Framework step → routing to vehicle-config Step 3 for vehicle ${builderState.vehicleId}`);
      router.push({
        pathname: '/(tabs)/vehicle-config',
        params: { vehicleId: builderState.vehicleId, startAtStep: 'accessoryConfiguration', referrer: 'expeditions' },
      } as any);
      return;
    }


    if (step.route) {
      router.push(step.route as any);
    }
  }, [router, builderState.frameworkConfigured, builderState.vehicleId]);



  const handleReset = useCallback(() => {
    resetBuilderState();
    setLocalBuilderState(getBuilderState());
    setLoadoutItemCount(0);
  }, []);

  const handleTemplateApplied = useCallback((_template: any, _action: string) => {
    // Refresh builder state after template is applied
    const freshState = getBuilderState();
    setLocalBuilderState(freshState);
    setShowLoadTemplate(false);
  }, []);


  const getStepDetail = (step: BuilderStep): string | null => {
    switch (step.key) {
      case 'vehicle':
        if (builderState.vehicleSelected && builderState.vehicleName) {
          return builderState.vehicleName;
        }
        if (vehicles.length > 0) return `${vehicles.length} vehicle(s) available`;
        return null;
      case 'framework':
        if (builderState.frameworkConfigured && builderState.frameworkType) {
          return builderState.frameworkType;
        }
        return null;
      case 'zones':
        if (builderState.zonesConfigured && builderState.zoneCount > 0) {
          return `${builderState.zoneCount} zones configured`;
        }
        return null;
      case 'loadout':
        if (builderState.loadoutReady) {
          return 'MISSION READY';
        }
        if (builderState.loadoutBuilt) {
          return 'Items loaded — Set to Ready when complete';
        }
        return null;
      default:
        return null;
    }
  };

  const activeStepIndex = BUILDER_STEPS.findIndex(s => !builderState[s.checkField]);
  const progressBarColor = isAllComplete ? '#4CAF50' : TACTICAL.amber;
  const progressBadgeColor = isAllComplete ? '#4CAF50' : TACTICAL.amber;

  return (
    <View style={[
      styles.container,
      isAllComplete && styles.containerAllComplete,
    ]}>
      {isAllComplete && <GreenGlow />}

      {/* Builder Header */}
      <TouchableOpacity
        style={styles.builderHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.8}
      >
        <View style={styles.builderHeaderLeft}>
          <View style={[
            styles.builderIconContainer,
            isAllComplete && styles.builderIconContainerComplete,
          ]}>
            <Ionicons
              name={isAllComplete ? 'shield-checkmark' : 'compass'}
              size={18}
              color={isAllComplete ? '#4CAF50' : TACTICAL.amber}
            />
          </View>
          <View>
            <Text style={[
              styles.builderTitle,
              isAllComplete && styles.builderTitleComplete,
            ]}>
              EXPEDITION BUILDER
            </Text>
            <Text style={[
              styles.builderSubtitle,
              isAllComplete && styles.builderSubtitleComplete,
            ]}>
              {isAllComplete
                ? 'ALL STEPS COMPLETE — MISSION READY'
                : `${completedCount}/${BUILDER_STEPS.length} STEPS COMPLETE`}
            </Text>
          </View>
        </View>
        <View style={styles.builderHeaderRight}>
          <View style={[
            styles.progressBadge,
            isAllComplete && styles.progressBadgeComplete,
          ]}>
            <Text style={[
              styles.progressBadgeText,
              { color: progressBadgeColor },
            ]}>
              {progressPct}%
            </Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={isAllComplete ? '#4CAF50' : TACTICAL.textMuted}
          />
        </View>
      </TouchableOpacity>

      {/* Progress Bar */}
      <View style={styles.progressTrack}>
        <View style={[
          styles.progressFill,
          {
            width: `${progressPct}%`,
            backgroundColor: progressBarColor,
          },
          isAllComplete && styles.progressFillComplete,
        ]} />
      </View>


      {!expanded && isAllComplete && (
        <View style={styles.collapsedReadyCard}>
          <View style={styles.collapsedReadyRow}>
            <View style={styles.collapsedReadyIconWrap}>
              <Ionicons name="shield-checkmark" size={22} color="#0B0F12" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.collapsedReadyTitle}>EXPEDITION READY</Text>
              <Text style={styles.collapsedReadySub}>
                All {BUILDER_STEPS.length} preparation steps complete
              </Text>
            </View>
          </View>
          <View style={styles.collapsedReadyActions}>
            <TouchableOpacity
              style={styles.collapsedEditBtn}
              onPress={() => setExpanded(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="create-outline" size={14} color={TACTICAL.amber} />
              <Text style={styles.collapsedEditText}>EDIT</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Collapsed State: Resume Card (incomplete) ────── */}
      {!expanded && !isAllComplete && (
        <View style={styles.collapsedResumeCard}>
          <View style={styles.collapsedResumeRow}>
            <View style={styles.collapsedResumeSteps}>
              {BUILDER_STEPS.map((step, i) => {
                const done = builderState[step.checkField] === true;
                return (
                  <View
                    key={step.key}
                    style={[
                      styles.collapsedStepDot,
                      done && styles.collapsedStepDotDone,
                      i === activeStepIndex && !done && styles.collapsedStepDotActive,
                    ]}
                  >
                    {done ? (
                      <Ionicons name="checkmark" size={8} color="#4CAF50" />
                    ) : (
                      <Text style={[
                        styles.collapsedStepDotText,
                        i === activeStepIndex && styles.collapsedStepDotTextActive,
                      ]}>
                        {i + 1}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.collapsedResumeTitle}>
                {activeStepIndex >= 0 ? BUILDER_STEPS[activeStepIndex].label : 'NEXT STEP'}
              </Text>
              <Text style={styles.collapsedResumeSub}>
                {activeStepIndex >= 0 ? BUILDER_STEPS[activeStepIndex].sublabel : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.collapsedResumeBtn}
              onPress={() => {
                if (activeStepIndex >= 0 && BUILDER_STEPS[activeStepIndex].route) {
                  router.push(BUILDER_STEPS[activeStepIndex].route as any);
                } else {
                  setExpanded(true);
                }
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.collapsedResumeBtnText}>RESUME</Text>
              <Ionicons name="arrow-forward" size={12} color="#0B0F12" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Steps (expanded) */}
      {expanded && (

        <View style={styles.stepsContainer}>
          {loadingVehicles ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={TACTICAL.amber} />
              <Text style={styles.loadingText}>Checking vehicle data...</Text>
            </View>
          ) : (
            BUILDER_STEPS.map((step, index) => {
              const isCompleted = builderState[step.checkField] === true;
              const isActive = index === activeStepIndex;

              return (
                <StepCard
                  key={step.key}
                  step={step}
                  index={index}
                  isCompleted={isCompleted}
                  isActive={isActive}
                  isLocked={false}
                  isAllComplete={isAllComplete}
                  onPress={() => handleStepPress(step, index)}
                  detail={getStepDetail(step)}
                />
              );
            })
          )}

          {/* All Complete Card */}
          {isAllComplete && (
            <View style={styles.allCompleteCard}>
              <Ionicons name="shield-checkmark" size={24} color="#4CAF50" />
              <Text style={styles.allCompleteTitle}>EXPEDITION READY</Text>
              <Text style={styles.allCompleteSub}>
                All preparation steps are complete. Deploy or save as a reusable template.
              </Text>
            </View>
          )}

          {/* ── Template Actions ─────────────────────────── */}
          <View style={styles.templateActions}>
            {/* Save as Template (Primary) */}
            <TouchableOpacity
              style={[
                styles.saveTemplateBtn,
                templateSaved && styles.saveTemplateBtnSaved,
                !canSaveTemplate && !templateSaved && styles.saveTemplateBtnDisabled,
              ]}
              onPress={() => {
                if (canSaveTemplate && !templateSaved) setShowSaveTemplate(true);
              }}
              activeOpacity={canSaveTemplate && !templateSaved ? 0.85 : 1}
              disabled={!canSaveTemplate || templateSaved}
            >
              <Ionicons
                name={templateSaved ? 'checkmark-circle' : 'bookmark-outline'}
                size={16}
                color={templateSaved ? '#4CAF50' : canSaveTemplate ? TACTICAL.amber : TACTICAL.textMuted}
              />
              <Text style={[
                styles.saveTemplateText,
                templateSaved && styles.saveTemplateTextSaved,
                !canSaveTemplate && !templateSaved && styles.saveTemplateTextDisabled,
              ]}>
                {templateSaved ? 'TEMPLATE SAVED' : 'SAVE AS TEMPLATE'}
              </Text>
            </TouchableOpacity>

            {/* Load Template (Secondary) */}
            <TouchableOpacity
              style={styles.loadTemplateBtn}
              onPress={() => setShowLoadTemplate(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="albums-outline" size={16} color={TACTICAL.amber} />
              <Text style={styles.loadTemplateText}>LOAD TEMPLATE</Text>
            </TouchableOpacity>
          </View>

          {/* Helper text when save is disabled */}
          {!canSaveTemplate && !templateSaved && (
            <Text style={styles.templateHelperText}>
              {!isAllComplete
                ? 'Complete all 4 Builder steps to save a reusable template.'
                : 'Add at least one loadout item to save as template.'}
            </Text>
          )}

          {/* Reset link */}
          {completedCount > 0 && (
            <TouchableOpacity style={styles.resetLink} onPress={handleReset} activeOpacity={0.6}>
              <Ionicons name="refresh-outline" size={12} color={TACTICAL.textMuted} />
              <Text style={styles.resetLinkText}>RESET BUILDER PROGRESS</Text>
            </TouchableOpacity>
          )}

          {/* ── FooterNav — Consistent wizard navigation ──── */}
          <FooterNav
            canGoBack={activeStepIndex > 0 || isAllComplete}
            canGoNext={!loadingVehicles}
            backLabel="BACK"
            nextLabel={isAllComplete ? 'FINALIZE EXPEDITION' : 'NEXT STEP'}
            nextIcon={isAllComplete ? 'shield-checkmark-outline' : 'chevron-forward'}
            primaryMode={isAllComplete ? 'deploy' : 'next'}
            onBack={() => {
              if (activeStepIndex > 0) {
                const prevStep = BUILDER_STEPS[activeStepIndex - 1];
                if (prevStep?.route) router.push(prevStep.route as any);
              }
            }}
            onNext={() => {
              if (isAllComplete) {
                setExpeditionReady(true);
                router.push('/expedition-wizard' as any);
              } else if (activeStepIndex >= 0) {
                const nextStep = BUILDER_STEPS[activeStepIndex];
                if (nextStep?.route) router.push(nextStep.route as any);
              }
            }}
          />
        </View>

      )}

      {/* Save Template Modal */}
      <SaveTemplateModal
        visible={showSaveTemplate}
        onClose={() => setShowSaveTemplate(false)}
        userId={userId}
        onSaved={(templateId) => {
          logExpeditionBuilderDev(TAG, `Template saved: ${templateId}`);
          setTemplateSaved(true);
          setTimeout(() => {
            if (mountedRef.current) setTemplateSaved(false);
          }, 10000);
        }}
      />

      {/* Load Template Modal */}
      <LoadTemplateModal
        visible={showLoadTemplate}
        onClose={() => setShowLoadTemplate(false)}
        userId={userId}
        onTemplateApplied={handleTemplateApplied}
      />
    </View>
  );
}


// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    overflow: 'hidden',
    position: 'relative',
  },
  containerAllComplete: {
    borderColor: 'rgba(76, 175, 80, 0.5)',
    backgroundColor: 'rgba(76, 175, 80, 0.04)',
  },
  greenGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(76, 175, 80, 0.06)',
    zIndex: 0,
  },
  builderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    zIndex: 1,
  },
  builderHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  builderIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  builderIconContainerComplete: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderColor: 'rgba(76, 175, 80, 0.5)',
  },
  builderTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },
  builderTitleComplete: {
    color: '#4CAF50',
  },
  builderSubtitle: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  builderSubtitleComplete: {
    color: 'rgba(76, 175, 80, 0.8)',
  },
  builderHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBadge: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  progressBadgeComplete: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.4)',
  },
  progressBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.amber,
    fontFamily: 'Courier',
  },

  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(138,138,133,0.12)',
    marginHorizontal: 14,
    zIndex: 1,
  },
  progressFill: {
    height: 3,
  },
  progressFillComplete: {
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },

  stepsContainer: {
    padding: 14,
    paddingTop: 10,
    gap: 8,
    zIndex: 1,
  },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  loadingText: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // Step Card
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  stepNumberContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(138,138,133,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberCompleted: {
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    borderColor: 'rgba(76, 175, 80, 0.4)',
  },
  stepNumberAllComplete: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    borderColor: 'rgba(76, 175, 80, 0.6)',
  },
  stepNumber: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Courier',
  },
  stepIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepContent: {
    flex: 1,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  stepSublabel: {
    fontSize: 10,
    marginTop: 2,
  },
  stepRight: {
    width: 24,
    alignItems: 'center',
  },

  // Pulse
  pulseIndicator: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: TACTICAL.amber,
  },

  // All Complete
  allCompleteCard: {
    alignItems: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.4)',
    marginTop: 4,
  },
  allCompleteTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#4CAF50',
    letterSpacing: 1.5,
  },
  allCompleteSub: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },

  // Template Actions
  templateActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  saveTemplateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.35)',
    paddingVertical: 12,
    borderRadius: 10,
  },
  saveTemplateBtnSaved: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderColor: 'rgba(76, 175, 80, 0.35)',
  },
  saveTemplateBtnDisabled: {
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderColor: 'rgba(138,138,133,0.15)',
    opacity: 0.6,
  },
  saveTemplateText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },
  saveTemplateTextSaved: {
    color: '#4CAF50',
  },
  saveTemplateTextDisabled: {
    color: TACTICAL.textMuted,
  },
  loadTemplateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
    paddingVertical: 12,
    borderRadius: 10,
  },
  loadTemplateText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },

  // Template helper text
  templateHelperText: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
    opacity: 0.7,
  },

  // Reset
  resetLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    marginTop: 4,
  },
  resetLinkText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },



  // ── Collapsed Ready Card ──────────────────────────────
  collapsedReadyCard: {
    margin: 14,
    marginTop: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.4)',
    zIndex: 1,
  },
  collapsedReadyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  collapsedReadyIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedReadyTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#4CAF50',
    letterSpacing: 1.3,
  },
  collapsedReadySub: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    marginTop: 2,
  },
  collapsedReadyActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    gap: 10,
  },
  collapsedEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.35)',
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
  },
  collapsedEditText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },

  // ── Collapsed Resume Card ─────────────────────────────
  collapsedResumeCard: {
    margin: 14,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.3)',
    zIndex: 1,
  },
  collapsedResumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  collapsedResumeSteps: {
    flexDirection: 'row',
    gap: 4,
  },
  collapsedStepDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(138,138,133,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedStepDotDone: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderColor: 'rgba(76, 175, 80, 0.5)',
  },
  collapsedStepDotActive: {
    borderColor: 'rgba(196, 138, 44, 0.6)',
    backgroundColor: 'rgba(196, 138, 44, 0.1)',
  },
  collapsedStepDotText: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  collapsedStepDotTextActive: {
    color: TACTICAL.amber,
  },
  collapsedResumeTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1,
  },
  collapsedResumeSub: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },
  collapsedResumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: TACTICAL.amber,
  },
  collapsedResumeBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1,
  },
});



