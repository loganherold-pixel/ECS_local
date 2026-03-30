/**
 * ECS Expedition Wizard — Guided 3-Step Planning Flow
 *
 * Step 1: BASICS       (Name, Destination*, Date Range, Notes)
 * Step 2: CONFIGURE    (Segmented: Vehicle | Terrain | Systems)
 * Step 3: REVIEW       (Summary, Missing Requirements, Finalize)
 *
 * NON-NEGOTIABLE: No ScrollView. Fixed header + fixed footer. Viewport Fit Mode.
 * Auto-saves draft after each step. "Continue Planning" restores last step.
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  Platform, ActivityIndicator, Alert, ScrollView,
  Animated, KeyboardAvoidingView, useWindowDimensions, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../components/SafeIcon';

import { TACTICAL } from '../lib/theme';
import { useApp } from '../context/AppContext';
import { useWizardState } from '../context/WizardStateContext';

import TopoBackground from '../components/TopoBackground';
import FooterNav from '../components/FooterNav';

import { expeditionStore, checklistStore, snapshotStore } from '../lib/expeditionCommandStore';
import { vehicleStore } from '../lib/vehicleStore';
import { telemetryConfigStore } from '../lib/telemetryStore';
import { TERRAIN_OPTIONS } from '../lib/expeditionTypes';
import type { EcsTerrain } from '../lib/expeditionTypes';
import type { Vehicle } from '../lib/types';
import { defaultSystemsData, type SystemsPlanningData } from '../components/expedition/VehicleSystemsPlanning';
import SystemsMiniModal from '../components/expedition/SystemsMiniModal';
import {
  getWizardDraft,
  setWizardDraft,
  clearWizardDraft,
} from '../lib/expeditionCache';
import {
  deriveTerrainProfile,
  computeTerrainDifficulty,
  getDifficultyLabel,
  getDifficultyColor,
  TERRAIN_PROFILE_FIELDS,
  terrainProfileStore,
} from '../lib/terrainProfile';

import type { TerrainProfile } from '../lib/terrainProfile';


// ── Constants ────────────────────────────────────────────────
const STEPS = [
  { key: 'basics', label: 'BASICS', icon: 'flag-outline' },
  { key: 'configure', label: 'CONFIGURE', icon: 'settings-outline' },
  { key: 'review', label: 'REVIEW', icon: 'checkmark-done-outline' },
];

const COMPACT_THRESHOLD = 680;
const SEGMENTS = ['Vehicle', 'Terrain', 'Systems'] as const;
type Segment = typeof SEGMENTS[number];

// ── Main Component ───────────────────────────────────────────
export default function ExpeditionWizardScreen() {
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const router = useRouter();
  const { user, showToast } = useApp();
  const { setExpeditionReady } = useWizardState();

  const { height: windowHeight } = useWindowDimensions();
  const compact = windowHeight < COMPACT_THRESHOLD;

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // ── Draft fields ───────────────────────────────────────────
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [vehicleName, setVehicleName] = useState<string | null>(null);
  const [terrain, setTerrain] = useState<EcsTerrain | null>(null);
  const [systemsData, setSystemsData] = useState<SystemsPlanningData>(defaultSystemsData);
  // Phase 6A: Terrain profile state
  const [terrainProfile, setTerrainProfile] = useState<TerrainProfile>(() => deriveTerrainProfile(null));


  // ── UI state ───────────────────────────────────────────────
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [showSystemsModal, setShowSystemsModal] = useState(false);
  const [destError, setDestError] = useState(false);
  const [activeSegment, setActiveSegment] = useState<Segment>('Vehicle');
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // ── Restore draft on mount ─────────────────────────────────
  useEffect(() => {
    const draft = getWizardDraft();
    if (draft) {
      setStep(draft.step || 0);
      setName(draft.name || '');
      setDestination(draft.destination || '');
      setStartDate(draft.startDate || '');
      setEndDate(draft.endDate || '');
      setNotes(draft.notes || '');
      setVehicleId(draft.vehicleId || null);
      setVehicleName(draft.vehicleName || null);
      setTerrain((draft.terrain as EcsTerrain) || null);
      if (draft.systemsData && Object.keys(draft.systemsData).length > 0) {
        setSystemsData({ ...defaultSystemsData, ...draft.systemsData });
      }
      // Phase 6A: Restore terrain profile from draft
      if (draft.terrainProfile && Object.keys(draft.terrainProfile).length > 0) {
        setTerrainProfile(draft.terrainProfile as unknown as TerrainProfile);
      } else if (draft.terrain) {
        setTerrainProfile(deriveTerrainProfile(draft.terrain as EcsTerrain));
      }
    }
  }, []);

  // Phase 6A: Auto-derive terrain profile when biome changes
  useEffect(() => {
    setTerrainProfile(deriveTerrainProfile(terrain));
  }, [terrain]);

  // Phase 6A: Computed terrain difficulty
  const terrainDifficulty = useMemo(() => {
    const score = computeTerrainDifficulty(terrainProfile);
    return { score, label: getDifficultyLabel(score), color: getDifficultyColor(score) };
  }, [terrainProfile]);

  // Phase 6A: Update a single terrain profile field
  const updateTerrainField = useCallback((key: keyof TerrainProfile, value: string) => {
    setTerrainProfile(prev => ({ ...prev, [key]: value }));
  }, []);


  // ── Auto-save draft ────────────────────────────────────────
  const saveDraft = useCallback(() => {
    setWizardDraft({
      step,
      name,
      destination,
      startDate,
      endDate,
      notes,
      vehicleId,
      vehicleName,
      terrain,
      systemsData: systemsData as any,
      terrainProfile: terrainProfile as unknown as Record<string, string>,
    });
  }, [step, name, destination, startDate, endDate, notes, vehicleId, vehicleName, terrain, systemsData, terrainProfile]);


  // Save draft whenever step changes
  useEffect(() => {
    saveDraft();
  }, [step]);

  // ── Load vehicles ──────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    setLoadingVehicles(true);
    vehicleStore.getAll(user.id).then(({ vehicles: v }) => {
      if (mountedRef.current) {
        setVehicles(v);
        setLoadingVehicles(false);
      }
    }).catch(() => {
      if (mountedRef.current) setLoadingVehicles(false);
    });
  }, [user]);

  // ── Systems computed summaries ─────────────────────────────
  const systemsSummary = useMemo(() => {
    const tank = parseFloat(systemsData.fuelTankCapacity) || 0;
    const mpg = parseFloat(systemsData.fuelMpg) || 0;
    const fuelRange = tank > 0 && mpg > 0 ? `${Math.round(tank * mpg)} mi` : '--';

    const carried = parseFloat(systemsData.waterCarried) || 0;
    const people = parseFloat(systemsData.waterPeopleCount) || 0;
    const waterDays = carried > 0 && people > 0
      ? `${(carried / (people * 3.5)).toFixed(1)} days`
      : '--';

    const solar = parseFloat(systemsData.solarWatts) || 0;
    const usage = parseFloat(systemsData.avgDailyUsage) || 0;
    let powerBuffer = '--';
    if (solar > 0 && usage > 0) {
      const net = (solar * 5) - usage;
      powerBuffer = `${net > 0 ? '+' : ''}${net} Wh/day`;
    }

    return { fuelRange, waterDays, powerBuffer };
  }, [systemsData]);

  // ── Validation ─────────────────────────────────────────────
  const isStepValid = useCallback((s: number): boolean => {
    switch (s) {
      case 0: return destination.trim().length >= 2;
      case 1: return true; // Configure step has no required fields
      case 2: return true;
      default: return false;
    }
  }, [destination]);

  const nextEnabled = isStepValid(step);

  // ── Missing requirements for review ────────────────────────
  const missingItems = useMemo(() => {
    const items: { icon: string; label: string; color: string }[] = [];
    if (!vehicleId) items.push({ icon: 'car-sport-outline', label: 'No vehicle selected', color: TACTICAL.textMuted });
    if (!terrain) items.push({ icon: 'layers-outline', label: 'No terrain type set', color: TACTICAL.textMuted });
    if (systemsSummary.fuelRange === '--') items.push({ icon: 'flame-outline', label: 'Fuel range not configured', color: TACTICAL.textMuted });
    if (systemsSummary.waterDays === '--') items.push({ icon: 'water-outline', label: 'Water planning not set', color: TACTICAL.textMuted });
    return items;
  }, [vehicleId, terrain, systemsSummary]);

  // ── Shake animation ────────────────────────────────────────
  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  // ── Navigation ─────────────────────────────────────────────
  const handleNext = () => {
    if (step === 0 && destination.trim().length < 2) {
      setDestError(true);
      triggerShake();
      return;
    }
    setDestError(false);
    saveDraft();

    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleFinalize();
    }
  };

  const handleBack = () => {
    setDestError(false);
    saveDraft();
    if (step > 0) {
      setStep(step - 1);
    } else {
      handleClose();
    }
  };

  const handleClose = () => {
    // Draft is auto-saved, just go back
    router.back();
  };

  // ── Finalize Plan ──────────────────────────────────────────
  const handleFinalize = async () => {
    if (!user || saving) return;
    setSaving(true);

    try {
      const expTitle = name.trim() || destination.trim();
      const exp = await expeditionStore.create(user.id, {
        title: expTitle,
        vehicle_id: vehicleId,
        terrain,
        duration_days: computeDurationDays(),
        distance_from_services_mi: null,
        notes: buildNotesString(),
        status: 'draft',
      });

      if (!exp) {
        Alert.alert('Error', 'Failed to create expedition plan');
        setSaving(false);
        return;
      }

      // Capture loadout snapshot if vehicle selected
      if (vehicleId) {
        try {
          await snapshotStore.create(user.id, {
            vehicle_id: vehicleId,
            expedition_id: exp.id,
            label: `${expTitle} - Loadout Snapshot`,
            snapshot: { captured_at: new Date().toISOString(), vehicle_id: vehicleId, vehicle_name: vehicleName },
          });
        } catch (err) {
          console.warn('[ExpeditionWizard] snapshot error:', err);
        }
      }

      // Generate checklist from templates
      try {
        const count = await checklistStore.generateFromTemplates(
          user.id, exp.id, terrain, computeDurationDays()
        );
        if (!mountedRef.current) return;
        if (count > 0) {
          await expeditionStore.updateReadiness(exp.id, user.id);
        }
      } catch (err) {
        console.warn('[ExpeditionWizard] checklist generation error:', err);
      }

      // Initialize telemetry from systems planning data
      try {
        const fuelCapGal = parseFloat(systemsData.fuelTankCapacity) || undefined;
        const fuelMpg = parseFloat(systemsData.fuelMpg) || undefined;
        const waterCapL = parseFloat(systemsData.waterCarried) || undefined;
        const ppl = parseFloat(systemsData.waterPeopleCount) || undefined;
        const dailyBurn = ppl ? ppl * 3.5 : undefined;

        if (fuelCapGal || waterCapL) {
          telemetryConfigStore.initFromSnapshot(exp.id, {
            fuelCapacityGal: fuelCapGal,
            fuelMpg: fuelMpg,
            waterCapacityL: waterCapL,
            waterDailyBurnL: dailyBurn,
            peopleCount: ppl,
            tripLengthDays: computeDurationDays() ?? undefined,
          });
        }

        const batteryWh = parseFloat(systemsData.batteryCapacity) || 0;
        const avgDraw = parseFloat(systemsData.avgDailyUsage) || 0;
        if (batteryWh > 0 && avgDraw > 0) {
          telemetryConfigStore.configurePower(exp.id, batteryWh, avgDraw / 24);
        }
      } catch (e) {
        console.warn('[WIZARD] Telemetry init error:', e);
      }

      // Clear draft and mark ready
      clearWizardDraft();
      setExpeditionReady(true);

      setSaving(false);
      showToast?.('EXPEDITION PLAN FINALIZED');
      router.replace({ pathname: '/expedition-detail', params: { id: exp.id } } as any);

    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to finalize plan');
      setSaving(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────
  const computeDurationDays = (): number | null => {
    if (!startDate || !endDate) return null;
    try {
      const s = parseMMDDYYYY(startDate);
      const e = parseMMDDYYYY(endDate);
      if (s && e) {
        const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
        return diff > 0 ? diff : null;
      }
    } catch {}
    return null;
  };

  const parseMMDDYYYY = (str: string): Date | null => {
    const m = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!m) return null;
    const d = new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]));
    return isNaN(d.getTime()) ? null : d;
  };

  const buildNotesString = (): string | null => {
    const parts: string[] = [];
    if (notes.trim()) parts.push(notes.trim());
    if (destination.trim() && name.trim()) parts.push(`Destination: ${destination.trim()}`);
    if (startDate) parts.push(`Start: ${startDate}`);
    if (endDate) parts.push(`End: ${endDate}`);
    return parts.length > 0 ? parts.join(' | ') : null;
  };

  const formatDateInput = (raw: string): string => {
    const digits = raw.replace(/[^\d]/g, '');
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 8)}`;
  };

  if (!user) return null;

  const isLastStep = step === STEPS.length - 1;
  const isFirstStep = step === 0;
  const currentStep = STEPS[step];

  // ── Spacing tokens ─────────────────────────────────────────
  const sp = {
    pad: compact ? 12 : 16,
    gap: compact ? 6 : 10,
    labelSize: compact ? 9 : 10,
    inputHeight: compact ? 38 : 44,
    notesHeight: compact ? 36 : 48,
  };

  const durationDays = computeDurationDays();
  const terrainSelected = TERRAIN_OPTIONS.find(t => t.value === terrain);

  return (
    <TopoBackground>
      <KeyboardAvoidingView
        style={st.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* ═══ FIXED HEADER ═══════════════════════════════════ */}
        <View style={[st.header, compact && st.headerCompact]}>
          <TouchableOpacity onPress={handleBack} style={st.headerBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={18} color={TACTICAL.text} />
          </TouchableOpacity>
          <View style={st.headerCenter}>
            <Text style={st.headerStep}>STEP {step + 1} OF 3</Text>
          </View>
          <TouchableOpacity onPress={handleClose} style={st.headerBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Progress Bar — 3 segments */}
        <View style={[st.progressRow, { paddingHorizontal: sp.pad }]}>
          {STEPS.map((s, i) => (
            <View key={s.key} style={[st.progressSeg, i <= step && st.progressSegActive, i < step && st.progressSegDone]} />
          ))}
        </View>

        {/* Step Title */}
        <View style={[st.stepHeader, { paddingHorizontal: sp.pad, marginBottom: sp.gap }]}>
          <Ionicons name={currentStep.icon as any} size={compact ? 16 : 18} color={TACTICAL.amber} />
          <Text style={[st.stepTitle, compact && { fontSize: 13 }]}>{currentStep.label}</Text>
        </View>

        {/* ═══ FIXED CONTENT AREA (NO SCROLL) ═════════════════ */}
        <View style={[st.content, { paddingHorizontal: sp.pad }]}>

          {/* ── STEP 1: BASICS ──────────────────────────────── */}
          {step === 0 && (
            <View style={[st.stepBody, { gap: sp.gap }]}>
              {/* Destination (required) */}
              <View>
                <Text style={[st.fieldLabel, { fontSize: sp.labelSize }]}>
                  DESTINATION / AREA <Text style={st.requiredStar}>*</Text>
                </Text>
                <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
                  <TextInput
                    style={[st.textInput, { height: sp.inputHeight }, destError && st.textInputError]}
                    value={destination}
                    onChangeText={(v) => { setDestination(v); if (v.trim()) setDestError(false); }}
                    placeholder="e.g. Mojave Desert, Death Valley NP"
                    placeholderTextColor={TACTICAL.textMuted}
                    autoFocus
                  />
                </Animated.View>
                {destError && <Text style={st.errorText}>Destination required (min 2 characters)</Text>}
              </View>

              {/* Expedition Name (optional) */}
              <View>
                <Text style={[st.fieldLabel, { fontSize: sp.labelSize }]}>EXPEDITION NAME</Text>
                <TextInput
                  style={[st.textInput, { height: sp.inputHeight }]}
                  value={name}
                  onChangeText={setName}
                  placeholder="Optional — defaults to destination"
                  placeholderTextColor={TACTICAL.textMuted}
                />
              </View>

              {/* Date Range (optional) */}
              <View style={st.dualRow}>
                <View style={st.dualCol}>
                  <Text style={[st.fieldLabel, { fontSize: sp.labelSize }]}>START DATE</Text>
                  <TextInput
                    style={[st.textInput, { height: sp.inputHeight, fontFamily: 'Courier' }]}
                    value={startDate}
                    onChangeText={(v) => setStartDate(formatDateInput(v))}
                    placeholder="MM-DD-YYYY"
                    placeholderTextColor={TACTICAL.textMuted}
                    keyboardType="number-pad"
                    maxLength={10}
                  />
                </View>
                <View style={st.dualCol}>
                  <Text style={[st.fieldLabel, { fontSize: sp.labelSize }]}>END DATE</Text>
                  <TextInput
                    style={[st.textInput, { height: sp.inputHeight, fontFamily: 'Courier' }]}
                    value={endDate}
                    onChangeText={(v) => setEndDate(formatDateInput(v))}
                    placeholder="MM-DD-YYYY"
                    placeholderTextColor={TACTICAL.textMuted}
                    keyboardType="number-pad"
                    maxLength={10}
                  />
                </View>
              </View>
              {durationDays != null && durationDays > 0 && (
                <View style={st.durationChip}>
                  <Ionicons name="time-outline" size={12} color={TACTICAL.amber} />
                  <Text style={st.durationChipText}>{durationDays} DAY{durationDays !== 1 ? 'S' : ''}</Text>
                </View>
              )}

              {/* Notes (optional) */}
              <View>
                <Text style={[st.fieldLabel, { fontSize: sp.labelSize }]}>NOTES</Text>
                <TextInput
                  style={[st.textInput, { height: sp.notesHeight, textAlignVertical: 'top', paddingTop: 10 }]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Objectives, hazards, considerations..."
                  placeholderTextColor={TACTICAL.textMuted}
                  multiline
                  numberOfLines={2}
                />
              </View>
            </View>
          )}

          {/* ── STEP 2: CONFIGURE ───────────────────────────── */}
          {step === 1 && (
            <View style={[st.stepBody, { gap: sp.gap }]}>
              {/* Segmented Control */}
              <View style={st.segmentedControl}>
                {SEGMENTS.map(seg => {
                  const active = activeSegment === seg;
                  return (
                    <TouchableOpacity
                      key={seg}
                      style={[st.segmentTab, active && st.segmentTabActive]}
                      onPress={() => setActiveSegment(seg)}
                      activeOpacity={0.7}
                    >
                      <Text style={[st.segmentTabText, active && st.segmentTabTextActive]}>
                        {seg.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Vehicle Segment */}
              {activeSegment === 'Vehicle' && (
                <View style={st.segmentContent}>
                  <Text style={[st.fieldLabel, { fontSize: sp.labelSize, marginBottom: 6 }]}>
                    SELECT VEHICLE PROFILE
                  </Text>
                  {loadingVehicles ? (
                    <ActivityIndicator color={TACTICAL.accent} size="small" />
                  ) : (
                    <View style={st.vehicleOptions}>
                      <TouchableOpacity
                        style={[st.vehicleChip, !vehicleId && st.vehicleChipActive]}
                        onPress={() => { setVehicleId(null); setVehicleName(null); }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="remove-circle-outline" size={14} color={!vehicleId ? TACTICAL.amber : TACTICAL.textMuted} />
                        <Text style={[st.vehicleChipText, !vehicleId && { color: TACTICAL.amber }]}>No Vehicle</Text>
                      </TouchableOpacity>
                      {vehicles.slice(0, compact ? 3 : 4).map(v => {
                        const sel = vehicleId === v.id;
                        return (
                          <TouchableOpacity
                            key={v.id}
                            style={[st.vehicleChip, sel && st.vehicleChipActive]}
                            onPress={() => { setVehicleId(v.id); setVehicleName(v.name); }}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="car-sport-outline" size={14} color={sel ? TACTICAL.amber : TACTICAL.textMuted} />
                            <View style={{ flex: 1 }}>
                              <Text style={[st.vehicleChipText, sel && { color: TACTICAL.amber }]} numberOfLines={1}>{v.name}</Text>
                              <Text style={st.vehicleChipSub} numberOfLines={1}>
                                {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'No details'}
                              </Text>
                            </View>
                            {sel && <Ionicons name="checkmark-circle" size={14} color={TACTICAL.amber} />}
                          </TouchableOpacity>
                        );
                      })}
                      {vehicles.length > (compact ? 3 : 4) && (
                        <Text style={st.moreVehicles}>+{vehicles.length - (compact ? 3 : 4)} more</Text>
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* Terrain Segment — Phase 6A: Biome grid + terrain profile fields */}
              {activeSegment === 'Terrain' && (
                <ScrollView style={st.segmentContent} showsVerticalScrollIndicator={false}>
                  <Text style={[st.fieldLabel, { fontSize: sp.labelSize, marginBottom: 6 }]}>
                    TERRAIN TYPE
                  </Text>
                  <View style={st.terrainGrid}>
                    {TERRAIN_OPTIONS.map(t => {
                      const sel = terrain === t.value;
                      return (
                        <TouchableOpacity
                          key={t.value}
                          style={[
                            st.terrainCard,
                            sel && { borderColor: t.color, backgroundColor: `${t.color}15` },
                          ]}
                          onPress={() => setTerrain(sel ? null : t.value)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name={t.icon as any} size={compact ? 20 : 24} color={sel ? t.color : TACTICAL.textMuted} />
                          <Text style={[st.terrainText, sel && { color: t.color }]}>{t.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Phase 6A: Terrain Profile Detail Fields */}
                  <View style={{ marginTop: compact ? 8 : 12 }}>
                    {/* Difficulty badge */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: compact ? 6 : 10 }}>
                      <Text style={[st.fieldLabel, { fontSize: sp.labelSize, marginBottom: 0 }]}>
                        TERRAIN PROFILE
                      </Text>
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                        backgroundColor: `${terrainDifficulty.color}15`,
                        borderWidth: 1, borderColor: `${terrainDifficulty.color}30`,
                      }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: terrainDifficulty.color }} />
                        <Text style={{ fontSize: 8, fontWeight: '800', color: terrainDifficulty.color, letterSpacing: 1 }}>
                          {terrainDifficulty.label} ({terrainDifficulty.score})
                        </Text>
                      </View>
                    </View>

                    {/* Compact profile field rows — skip terrainType since biome grid handles it */}
                    {TERRAIN_PROFILE_FIELDS.filter(f => f.key !== 'terrainType').map(field => {
                      const currentValue = terrainProfile[field.key] as string;
                      return (
                        <View key={field.key} style={{
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                          paddingVertical: compact ? 5 : 7,
                          borderBottomWidth: 0.5, borderBottomColor: 'rgba(62, 79, 60, 0.12)',
                        }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name={field.icon as any} size={13} color={TACTICAL.textMuted} />
                            <Text style={{ fontSize: 9, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1.5 }}>
                              {field.label}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 4 }}>
                            {field.options.map(opt => {
                              const sel = currentValue === opt.value;
                              return (
                                <TouchableOpacity
                                  key={opt.value}
                                  onPress={() => updateTerrainField(field.key, opt.value)}
                                  activeOpacity={0.7}
                                  style={{
                                    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                                    backgroundColor: sel ? `${opt.color}20` : 'rgba(0,0,0,0.12)',
                                    borderWidth: 1,
                                    borderColor: sel ? `${opt.color}50` : 'transparent',
                                  }}
                                >
                                  <Text style={{
                                    fontSize: 8, fontWeight: '800', letterSpacing: 0.5,
                                    color: sel ? opt.color : TACTICAL.textMuted,
                                  }}>
                                    {opt.label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                  <View style={{ height: 16 }} />
                </ScrollView>
              )}

              {/* Systems Segment */}
              {activeSegment === 'Systems' && (
                <View style={st.segmentContent}>
                  <Text style={[st.fieldLabel, { fontSize: sp.labelSize, marginBottom: 6 }]}>
                    VEHICLE SYSTEMS
                  </Text>
                  {/* Summary chips */}
                  <View style={st.systemsChipRow}>
                    <View style={[st.systemsTile, { borderLeftColor: '#E57373' }]}>
                      <Ionicons name="flame-outline" size={14} color="#E57373" />
                      <Text style={st.tileLabel}>FUEL RANGE</Text>
                      <Text style={st.tileValue}>{systemsSummary.fuelRange}</Text>
                    </View>
                    <View style={[st.systemsTile, { borderLeftColor: '#4FC3F7' }]}>
                      <Ionicons name="water-outline" size={14} color="#4FC3F7" />
                      <Text style={st.tileLabel}>WATER</Text>
                      <Text style={st.tileValue}>{systemsSummary.waterDays}</Text>
                    </View>
                    <View style={[st.systemsTile, { borderLeftColor: '#FFB74D' }]}>
                      <Ionicons name="sunny-outline" size={14} color="#FFB74D" />
                      <Text style={st.tileLabel}>POWER</Text>
                      <Text style={st.tileValue}>{systemsSummary.powerBuffer}</Text>
                    </View>
                  </View>

                  {/* Edit Systems Button */}
                  <TouchableOpacity
                    style={st.editSystemsBtn}
                    onPress={() => setShowSystemsModal(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="create-outline" size={16} color={TACTICAL.amber} />
                    <Text style={st.editSystemsText}>CONFIGURE SYSTEMS</Text>
                    <Ionicons name="chevron-forward" size={14} color={TACTICAL.textMuted} />
                  </TouchableOpacity>

                  {/* Snapshot toggle */}
                  <View style={st.systemsNote}>
                    <Ionicons name="information-circle-outline" size={13} color={TACTICAL.textMuted} />
                    <Text style={st.systemsNoteText}>
                      Systems data initializes telemetry tracking when the expedition is activated.
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ── STEP 3: REVIEW ──────────────────────────────── */}
          {step === 2 && (
            <View style={[st.stepBody, { gap: sp.gap }]}>
              {/* Summary Card */}
              <View style={st.reviewCard}>
                <View style={st.reviewRow}>
                  <Text style={st.reviewLabel}>DESTINATION</Text>
                  <Text style={st.reviewValue} numberOfLines={1}>{destination || '--'}</Text>
                </View>
                {name.trim() ? (
                  <View style={st.reviewRow}>
                    <Text style={st.reviewLabel}>NAME</Text>
                    <Text style={st.reviewValue} numberOfLines={1}>{name}</Text>
                  </View>
                ) : null}
                <View style={st.reviewRow}>
                  <Text style={st.reviewLabel}>VEHICLE</Text>
                  <Text style={st.reviewValue}>{vehicleName || 'None'}</Text>
                </View>
                <View style={st.reviewRow}>
                  <Text style={st.reviewLabel}>TERRAIN</Text>
                  <Text style={st.reviewValue}>{terrain ? terrain.toUpperCase() : 'Not set'}</Text>
                </View>
                {durationDays != null && durationDays > 0 && (
                  <View style={st.reviewRow}>
                    <Text style={st.reviewLabel}>DURATION</Text>
                    <Text style={st.reviewValue}>{durationDays} days</Text>
                  </View>
                )}
                {startDate ? (
                  <View style={st.reviewRow}>
                    <Text style={st.reviewLabel}>DATES</Text>
                    <Text style={st.reviewValue}>{startDate}{endDate ? ` — ${endDate}` : ''}</Text>
                  </View>
                ) : null}
                <View style={[st.reviewRow, { borderBottomWidth: 0 }]}>
                  <Text style={st.reviewLabel}>SYSTEMS</Text>
                  <View style={st.reviewSystemsChips}>
                    <Text style={[st.reviewChip, systemsSummary.fuelRange !== '--' && st.reviewChipActive]}>
                      {systemsSummary.fuelRange !== '--' ? systemsSummary.fuelRange : 'N/A'}
                    </Text>
                    <Text style={[st.reviewChip, systemsSummary.waterDays !== '--' && st.reviewChipActive]}>
                      {systemsSummary.waterDays !== '--' ? systemsSummary.waterDays : 'N/A'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Missing Requirements */}
              {missingItems.length > 0 && (
                <View style={st.missingCard}>
                  <Text style={[st.fieldLabel, { fontSize: sp.labelSize, marginBottom: 6 }]}>
                    OPTIONAL — NOT CONFIGURED
                  </Text>
                  {missingItems.map((item, i) => (
                    <View key={i} style={st.missingRow}>
                      <Ionicons name={item.icon as any} size={13} color={item.color} />
                      <Text style={st.missingText}>{item.label}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* All good indicator */}
              {missingItems.length === 0 && (
                <View style={st.allGoodCard}>
                  <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                  <Text style={st.allGoodText}>All systems configured</Text>
                </View>
              )}

              {/* Notes preview */}
              {notes.trim() ? (
                <View style={st.notesPreview}>
                  <Text style={st.notesPreviewLabel}>NOTES</Text>
                  <Text style={st.notesPreviewText} numberOfLines={2}>{notes.trim()}</Text>
                </View>
              ) : null}
            </View>
          )}
        </View>

        {/* ═══ FIXED FOOTER ═══════════════════════════════════ */}
        <FooterNav
          canGoBack={true}
          canGoNext={nextEnabled}
          backLabel={isFirstStep ? 'CANCEL' : 'BACK'}
          backIcon={isFirstStep ? 'close' : 'chevron-back'}
          nextLabel={isLastStep ? 'FINALIZE PLAN' : 'NEXT STEP'}
          nextIcon={isLastStep ? 'checkmark-done' : 'chevron-forward'}
          primaryMode={isLastStep ? 'complete' : 'next'}
          loading={saving}
          onBack={handleBack}
          onNext={handleNext}
        />

      </KeyboardAvoidingView>

      {/* Systems Mini Modal */}
      <SystemsMiniModal
        visible={showSystemsModal}
        onClose={() => setShowSystemsModal(false)}
        data={systemsData}
        onChange={(d) => setSystemsData(d)}
        durationDays={durationDays != null ? String(durationDays) : ''}
      />
    </TopoBackground>
  );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const st = StyleSheet.create({
  container: { flex: 1 },

  // ── Header ─────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 14 : 52,
    paddingBottom: 10,
  },
  headerCompact: {
    paddingTop: Platform.OS === 'web' ? 10 : 46,
    paddingBottom: 6,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerStep: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },

  // ── Progress ───────────────────────────────────────────────
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  progressSeg: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(138,138,133,0.15)',
  },
  progressSegActive: {
    backgroundColor: TACTICAL.amber,
  },
  progressSegDone: {
    backgroundColor: 'rgba(196, 138, 44, 0.5)',
  },

  // ── Step Header ────────────────────────────────────────────
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },

  // ── Content ────────────────────────────────────────────────
  content: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  stepBody: {
    flex: 1,
  },

  // ── Shared field styles ────────────────────────────────────
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    marginBottom: 2,
  },
  requiredStar: {
    color: TACTICAL.danger,
    fontSize: 10,
  },
  textInput: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    color: TACTICAL.text,
    fontSize: 14,
    fontWeight: '600',
  },
  textInputError: {
    borderColor: TACTICAL.danger,
    borderWidth: 1.5,
    backgroundColor: 'rgba(192, 57, 43, 0.06)',
  },
  errorText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.danger,
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // ── Step 1: Date Range ─────────────────────────────────────
  dualRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dualCol: {
    flex: 1,
  },
  durationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(196, 138, 44, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
  },
  durationChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },

  // ── Step 2: Segmented Control ──────────────────────────────
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 3,
  },
  segmentTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  segmentTabActive: {
    backgroundColor: TACTICAL.amber,
  },
  segmentTabText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  segmentTabTextActive: {
    color: '#0B0F12',
  },
  segmentContent: {
    flex: 1,
  },

  // Vehicle
  vehicleOptions: {
    gap: 4,
  },
  vehicleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  vehicleChipActive: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
  },
  vehicleChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.text,
  },
  vehicleChipSub: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },
  moreVehicles: {
    fontSize: 10,
    color: TACTICAL.amber,
    fontWeight: '700',
    textAlign: 'center',
    paddingTop: 4,
  },

  // Terrain
  terrainGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  terrainCard: {
    width: '31%',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  terrainText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  // Systems
  systemsChipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  systemsTile: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
    borderLeftWidth: 3,
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  tileLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  tileValue: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  editSystemsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.3)',
    paddingVertical: 14,
    marginBottom: 10,
  },
  editSystemsText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  systemsNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 4,
  },
  systemsNoteText: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    lineHeight: 16,
    flex: 1,
  },

  // ── Step 3: Review ─────────────────────────────────────────
  reviewCard: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 12,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.15)',
  },
  reviewLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  reviewValue: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    maxWidth: '60%',
  },
  reviewSystemsChips: {
    flexDirection: 'row',
    gap: 6,
  },
  reviewChip: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.15)',
    overflow: 'hidden',
  },
  reviewChipActive: {
    color: TACTICAL.text,
    backgroundColor: 'rgba(62, 79, 60, 0.25)',
  },

  // Missing Requirements
  missingCard: {
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.15)',
    padding: 10,
  },
  missingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  missingText: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    fontWeight: '600',
    flex: 1,
  },

  // All good
  allGoodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.25)',
    paddingVertical: 12,
  },
  allGoodText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4CAF50',
    letterSpacing: 0.5,
  },

  // Notes Preview
  notesPreview: {
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.12)',
  },
  notesPreviewLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  notesPreviewText: {
    fontSize: 11,
    color: TACTICAL.text,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});




