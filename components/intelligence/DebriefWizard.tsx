/**
 * Debrief Wizard — 3-Step Micro-Wizard (No Scroll)
 *
 * Step 1: Outcomes (SUCCESS / MODIFIED / ABORTED + reason)
 * Step 2: Performance (fuel/water/power deltas + toggles)
 * Step 3: Lessons Learned (went_well / went_wrong / change_next_time)
 *
 * On complete:
 *   1. ACT_UpsertDebrief  → debriefStore.saveDebrief()
 *   2. RPC_CloseAndGenerateAAR → debriefStore.closeAndGenerateAAR()
 *   3. Toast "Expedition closed. AAR generated." → onComplete() (routes to AAR tab)
 *
 * Fallback: if chain fails, shows "Finalize" button to retry RPC separately.
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
  Platform, ActivityIndicator, Modal, FlatList,
} from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { TACTICAL } from '../../lib/theme';
import {
  debriefStore,
  type DebriefOutcome,
  type DebriefData,
  OUTCOME_REASONS,
} from '../../lib/debriefStore';

// ── Props ────────────────────────────────────────────────────

interface DebriefWizardProps {
  expedition: any;
  userId: string | null;
  onComplete: () => void;  // called after debrief saved + AAR generated → routes to AAR
  showToast: (msg: string) => void;
  isReadOnly: boolean;
}

// ── Outcome metadata ─────────────────────────────────────────

const OUTCOMES: { value: DebriefOutcome; label: string; icon: string; color: string; desc: string }[] = [
  { value: 'SUCCESS',  label: 'SUCCESS',  icon: 'checkmark-circle-outline', color: '#66BB6A', desc: 'Completed as planned' },
  { value: 'MODIFIED', label: 'MODIFIED', icon: 'swap-horizontal-outline',  color: '#FFB74D', desc: 'Route or plan changed' },
  { value: 'ABORTED',  label: 'ABORTED',  icon: 'close-circle-outline',    color: '#EF5350', desc: 'Expedition terminated early' },
];

// ── Saving phase labels ──────────────────────────────────────
type SavingPhase = 'idle' | 'saving_debrief' | 'closing_expedition' | 'done';

// ── Component ────────────────────────────────────────────────

export default function DebriefWizard({ expedition, userId, onComplete, showToast, isReadOnly }: DebriefWizardProps) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [savingPhase, setSavingPhase] = useState<SavingPhase>('idle');
  const [reasonPicker, setReasonPicker] = useState(false);

  // Track if debrief was saved but RPC failed (show "Finalize" fallback)
  const [debriefSavedButRpcFailed, setDebriefSavedButRpcFailed] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // ── Form state ─────────────────────────────────────────────
  const [outcome, setOutcome] = useState<DebriefOutcome>('SUCCESS');
  const [outcomeReason, setOutcomeReason] = useState<string | null>(null);
  const [outcomeReasonText, setOutcomeReasonText] = useState('');

  const [fuelDelta, setFuelDelta] = useState(0);
  const [waterDelta, setWaterDelta] = useState(0);
  const [powerDelta, setPowerDelta] = useState(0);
  const [consumablesMatch, setConsumablesMatch] = useState(true);
  const [vehiclePerformed, setVehiclePerformed] = useState(true);
  const [routeMatched, setRouteMatched] = useState(true);

  const [wentWell, setWentWell] = useState('');
  const [wentWrong, setWentWrong] = useState('');
  const [changeNext, setChangeNext] = useState('');

  // ── Load existing debrief if read-only ─────────────────────
  useEffect(() => {
    if (!expedition?.id) return;
    const cached = debriefStore.getDebrief(expedition.id);
    if (cached) {
      setOutcome(cached.outcome);
      setOutcomeReason(cached.outcome_reason);
      setFuelDelta(cached.fuel_delta_pct);
      setWaterDelta(cached.water_delta_pct);
      setPowerDelta(cached.power_delta_pct);
      setConsumablesMatch(cached.consumables_matched_plan);
      setVehiclePerformed(cached.vehicle_performed_expected);
      setRouteMatched(cached.route_matched_expected);
      setWentWell(cached.went_well || '');
      setWentWrong(cached.went_wrong || '');
      setChangeNext(cached.change_next_time || '');
    }
    // Also try loading from server
    debriefStore.loadDebrief(expedition.id).then(d => {
      if (d) {
        setOutcome(d.outcome);
        setOutcomeReason(d.outcome_reason);
        setFuelDelta(d.fuel_delta_pct);
        setWaterDelta(d.water_delta_pct);
        setPowerDelta(d.power_delta_pct);
        setConsumablesMatch(d.consumables_matched_plan);
        setVehiclePerformed(d.vehicle_performed_expected);
        setRouteMatched(d.route_matched_expected);
        setWentWell(d.went_well || '');
        setWentWrong(d.went_wrong || '');
        setChangeNext(d.change_next_time || '');
      }
    });
  }, [expedition?.id]);

  // ── Build debrief payload ──────────────────────────────────
  const buildDebrief = useCallback((): DebriefData => ({
    expedition_id: expedition?.id || '',
    outcome,
    outcome_reason: (outcome !== 'SUCCESS') ? (outcomeReason || outcomeReasonText || null) : null,
    fuel_delta_pct: fuelDelta,
    water_delta_pct: waterDelta,
    power_delta_pct: powerDelta,
    consumables_matched_plan: consumablesMatch,
    vehicle_performed_expected: vehiclePerformed,
    route_matched_expected: routeMatched,
    went_well: wentWell.trim(),
    went_wrong: wentWrong.trim(),
    change_next_time: changeNext.trim(),
    created_by: userId,
  }), [expedition, outcome, outcomeReason, outcomeReasonText, fuelDelta, waterDelta, powerDelta,
       consumablesMatch, vehiclePerformed, routeMatched, wentWell, wentWrong, changeNext, userId]);

  // ── Validation ─────────────────────────────────────────────
  const needsReason = outcome === 'MODIFIED' || outcome === 'ABORTED';
  const isValid = !needsReason || !!outcomeReason;

  // ── Complete Debrief: chain saveDebrief → closeAndGenerateAAR
  const handleComplete = useCallback(async () => {
    if (!expedition?.id || !isValid) return;
    setSaving(true);
    setDebriefSavedButRpcFailed(false);

    // Phase 1: Save debrief (ACT_UpsertDebrief)
    setSavingPhase('saving_debrief');
    const debrief = buildDebrief();
    const result = await debriefStore.saveDebrief(debrief, (msg) => showToast(msg));

    if (!result.success) {
      // Debrief saved locally only — still try the RPC
      showToast('Debrief saved locally. Attempting to close expedition...');
    } else {
      showToast('Debrief saved. Closing expedition...');
    }

    // Phase 2: Close expedition + generate AAR (RPC_CloseAndGenerateAAR)
    setSavingPhase('closing_expedition');
    const aar = await debriefStore.closeAndGenerateAAR(expedition.id, (msg) => showToast(msg));

    if (aar) {
      // Full success: debrief saved + expedition closed + AAR generated
      setSavingPhase('done');
      showToast('Expedition closed. AAR generated.');
      setSaving(false);
      onComplete();
    } else {
      // RPC failed — debrief is saved but expedition not closed
      setSavingPhase('idle');
      setSaving(false);
      setDebriefSavedButRpcFailed(true);
      showToast('Debrief saved. Close & AAR failed — tap Finalize to retry.');
    }
  }, [expedition, isValid, buildDebrief, showToast, onComplete]);

  // ── Finalize fallback: retry RPC only ──────────────────────
  const handleFinalize = useCallback(async () => {
    if (!expedition?.id) return;
    setFinalizing(true);
    showToast('Retrying close & AAR generation...');

    const aar = await debriefStore.closeAndGenerateAAR(expedition.id, (msg) => showToast(msg));

    if (aar) {
      showToast('Expedition closed. AAR generated.');
      setFinalizing(false);
      setDebriefSavedButRpcFailed(false);
      onComplete();
    } else {
      showToast('Still failed. Check connection and retry.');
      setFinalizing(false);
    }
  }, [expedition, showToast, onComplete]);


  // ── No expedition ──────────────────────────────────────────
  if (!expedition) {
    return (
      <View style={s.empty}>
        <Ionicons name="document-text-outline" size={28} color="rgba(138,138,133,0.3)" />
        <Text style={s.emptyText}>Select an expedition to begin debrief</Text>
      </View>
    );
  }

  // ── Step indicators ────────────────────────────────────────
  const steps = [
    { num: 1, label: 'OUTCOMES' },
    { num: 2, label: 'PERFORMANCE' },
    { num: 3, label: 'LESSONS' },
  ];


  return (
    <View style={s.wizard}>
      {/* ── Step Indicator ──────────────────────────────── */}
      <View style={s.stepBar}>
        {steps.map((st, idx) => {
          const active = step === st.num;
          const done = step > st.num;
          return (
            <React.Fragment key={st.num}>
              {idx > 0 && <View style={[s.stepLine, done && s.stepLineDone]} />}
              <TouchableOpacity
                style={[s.stepDot, active && s.stepDotActive, done && s.stepDotDone]}
                onPress={() => !isReadOnly && setStep(st.num)}
                activeOpacity={0.7}
              >
                {done
                  ? <Ionicons name="checkmark" size={10} color="#0B0F12" />
                  : <Text style={[s.stepNum, active && s.stepNumActive]}>{st.num}</Text>
                }
              </TouchableOpacity>
              <Text style={[s.stepLabel, active && s.stepLabelActive]}>{st.label}</Text>
            </React.Fragment>
          );
        })}
      </View>

      {/* ── Step Content ────────────────────────────────── */}
      <View style={s.stepContent}>
        {step === 1 && (
          <View style={s.stepInner}>
            <Text style={s.sectionTitle}>EXPEDITION OUTCOME</Text>
            <View style={s.outcomeRow}>
              {OUTCOMES.map(o => {
                const active = outcome === o.value;
                return (
                  <TouchableOpacity
                    key={o.value}
                    style={[s.outcomeCard, active && { borderColor: o.color, backgroundColor: `${o.color}10` }]}
                    onPress={() => !isReadOnly && setOutcome(o.value)}
                    activeOpacity={0.7}
                    disabled={isReadOnly}
                  >
                    <Ionicons name={o.icon as any} size={18} color={active ? o.color : TACTICAL.textMuted} />
                    <Text style={[s.outcomeLabel, active && { color: o.color }]}>{o.label}</Text>
                    <Text style={s.outcomeDesc}>{o.desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {needsReason && (
              <View style={s.reasonSection}>
                <Text style={s.fieldLabel}>REASON</Text>
                <TouchableOpacity
                  style={s.reasonPicker}
                  onPress={() => !isReadOnly && setReasonPicker(true)}
                  disabled={isReadOnly}
                >
                  <Text style={[s.reasonPickerText, !outcomeReason && { color: TACTICAL.textMuted }]}>
                    {outcomeReason || 'Select reason...'}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={TACTICAL.textMuted} />
                </TouchableOpacity>
                {outcomeReason === 'Other' && (
                  <TextInput
                    style={s.reasonInput}
                    placeholder="Describe reason..."
                    placeholderTextColor="rgba(138,138,133,0.5)"
                    value={outcomeReasonText}
                    onChangeText={setOutcomeReasonText}
                    maxLength={120}
                    editable={!isReadOnly}
                  />
                )}
              </View>
            )}
          </View>
        )}

        {step === 2 && (
          <View style={s.stepInner}>
            <Text style={s.sectionTitle}>PERFORMANCE DELTAS</Text>
            <View style={s.deltaGrid}>
              <DeltaSlider label="FUEL" icon="flame-outline" color="#FF9500" value={fuelDelta} onChange={isReadOnly ? undefined : setFuelDelta} />
              <DeltaSlider label="WATER" icon="water-outline" color="#4FC3F7" value={waterDelta} onChange={isReadOnly ? undefined : setWaterDelta} />
              <DeltaSlider label="POWER" icon="battery-half-outline" color="#66BB6A" value={powerDelta} onChange={isReadOnly ? undefined : setPowerDelta} />
            </View>

            <Text style={[s.sectionTitle, { marginTop: 10 }]}>SYSTEM CHECKS</Text>
            <View style={s.toggleGrid}>
              <ToggleRow label="Consumables matched plan" value={consumablesMatch} onToggle={isReadOnly ? undefined : () => setConsumablesMatch(!consumablesMatch)} />
              <ToggleRow label="Vehicle performed as expected" value={vehiclePerformed} onToggle={isReadOnly ? undefined : () => setVehiclePerformed(!vehiclePerformed)} />
              <ToggleRow label="Route matched expected" value={routeMatched} onToggle={isReadOnly ? undefined : () => setRouteMatched(!routeMatched)} />
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={s.stepInner}>
            <Text style={s.sectionTitle}>LESSONS LEARNED</Text>
            <View style={s.lessonField}>
              <View style={s.lessonHeader}>
                <Ionicons name="checkmark-circle-outline" size={13} color="#66BB6A" />
                <Text style={[s.lessonLabel, { color: '#66BB6A' }]}>WHAT WENT WELL</Text>
              </View>
              <TextInput
                style={s.lessonInput}
                placeholder="Key successes..."
                placeholderTextColor="rgba(138,138,133,0.4)"
                value={wentWell}
                onChangeText={setWentWell}
                maxLength={200}
                multiline
                numberOfLines={2}
                editable={!isReadOnly}
              />
            </View>
            <View style={s.lessonField}>
              <View style={s.lessonHeader}>
                <Ionicons name="alert-circle-outline" size={13} color="#EF5350" />
                <Text style={[s.lessonLabel, { color: '#EF5350' }]}>WHAT WENT WRONG</Text>
              </View>
              <TextInput
                style={s.lessonInput}
                placeholder="Issues encountered..."
                placeholderTextColor="rgba(138,138,133,0.4)"
                value={wentWrong}
                onChangeText={setWentWrong}
                maxLength={200}
                multiline
                numberOfLines={2}
                editable={!isReadOnly}
              />
            </View>
            <View style={s.lessonField}>
              <View style={s.lessonHeader}>
                <Ionicons name="arrow-forward-circle-outline" size={13} color={TACTICAL.amber} />
                <Text style={[s.lessonLabel, { color: TACTICAL.amber }]}>CHANGE NEXT TIME</Text>
              </View>
              <TextInput
                style={s.lessonInput}
                placeholder="Improvements for next expedition..."
                placeholderTextColor="rgba(138,138,133,0.4)"
                value={changeNext}
                onChangeText={setChangeNext}
                maxLength={200}
                multiline
                numberOfLines={2}
                editable={!isReadOnly}
              />
            </View>
          </View>
        )}
      </View>

      {/* ── Saving Phase Indicator ───────────────────────── */}
      {saving && savingPhase !== 'idle' && (
        <View style={s.phaseBar}>
          <ActivityIndicator size="small" color={TACTICAL.amber} />
          <Text style={s.phaseText}>
            {savingPhase === 'saving_debrief' ? 'Saving debrief...' :
             savingPhase === 'closing_expedition' ? 'Closing expedition & generating AAR...' :
             'Complete'}
          </Text>
        </View>
      )}

      {/* ── Finalize Fallback Button ────────────────────── */}
      {debriefSavedButRpcFailed && !saving && (
        <View style={s.finalizeBar}>
          <View style={s.finalizeInfo}>
            <Ionicons name="warning-outline" size={13} color="#FF9500" />
            <Text style={s.finalizeInfoText}>Debrief saved. Expedition not yet closed.</Text>
          </View>
          <TouchableOpacity
            style={[s.finalizeBtn, finalizing && s.btnDisabled]}
            onPress={handleFinalize}
            disabled={finalizing}
            activeOpacity={0.7}
          >
            {finalizing
              ? <ActivityIndicator size="small" color="#0B0F12" />
              : <>
                  <Ionicons name="checkmark-done-outline" size={13} color="#0B0F12" />
                  <Text style={s.finalizeBtnText}>FINALIZE</Text>
                </>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* ── Navigation Buttons ──────────────────────────── */}
      {!isReadOnly && !debriefSavedButRpcFailed && (
        <View style={s.navRow}>
          {step > 1 && (
            <TouchableOpacity style={s.backBtn} onPress={() => setStep(step - 1)} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={14} color={TACTICAL.textMuted} />
              <Text style={s.backBtnText}>BACK</Text>
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }} />
          {step < 3 ? (
            <TouchableOpacity
              style={[s.nextBtn, (step === 1 && needsReason && !outcomeReason) && s.btnDisabled]}
              onPress={() => setStep(step + 1)}
              disabled={step === 1 && needsReason && !outcomeReason}
              activeOpacity={0.7}
            >
              <Text style={s.nextBtnText}>NEXT</Text>
              <Ionicons name="chevron-forward" size={14} color="#0B0F12" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[s.completeBtn, saving && s.btnDisabled]}
              onPress={handleComplete}
              disabled={saving}
              activeOpacity={0.7}
            >
              {saving
                ? <ActivityIndicator size="small" color="#0B0F12" />
                : <>
                    <Ionicons name="checkmark-done-outline" size={14} color="#0B0F12" />
                    <Text style={s.completeBtnText}>COMPLETE DEBRIEF</Text>
                  </>
              }
            </TouchableOpacity>
          )}
        </View>
      )}

      {isReadOnly && (
        <View style={s.readOnlyBar}>
          <Ionicons name="lock-closed-outline" size={13} color={TACTICAL.textMuted} />
          <Text style={s.readOnlyText}>Debrief locked — expedition completed</Text>
        </View>
      )}


      {/* ── Reason Picker Modal ─────────────────────────── */}
      <Modal visible={reasonPicker} transparent animationType="fade" onRequestClose={() => setReasonPicker(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setReasonPicker(false)}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>SELECT REASON</Text>
            {OUTCOME_REASONS.map(r => (
              <TouchableOpacity
                key={r}
                style={[s.modalItem, outcomeReason === r && s.modalItemActive]}
                onPress={() => { setOutcomeReason(r); setReasonPicker(false); }}
              >
                <Text style={[s.modalItemText, outcomeReason === r && { color: TACTICAL.amber }]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// DELTA SLIDER (compact +/- stepper)
// ══════════════════════════════════════════════════════════════

function DeltaSlider({ label, icon, color, value, onChange }: {
  label: string; icon: string; color: string; value: number; onChange?: (v: number) => void;
}) {
  const clamp = (v: number) => Math.max(-50, Math.min(50, v));
  const isNeg = value < 0;
  const displayColor = isNeg ? '#EF5350' : value > 0 ? '#66BB6A' : TACTICAL.textMuted;

  return (
    <View style={s.deltaRow}>
      <View style={s.deltaLeft}>
        <Ionicons name={icon as any} size={13} color={color} />
        <Text style={s.deltaLabel}>{label}</Text>
      </View>
      <View style={s.deltaControls}>
        {onChange && (
          <TouchableOpacity style={s.deltaBtn} onPress={() => onChange(clamp(value - 5))} activeOpacity={0.6}>
            <Ionicons name="remove" size={12} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        )}
        <Text style={[s.deltaValue, { color: displayColor }]}>
          {value > 0 ? '+' : ''}{value}%
        </Text>
        {onChange && (
          <TouchableOpacity style={s.deltaBtn} onPress={() => onChange(clamp(value + 5))} activeOpacity={0.6}>
            <Ionicons name="add" size={12} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// TOGGLE ROW
// ══════════════════════════════════════════════════════════════

function ToggleRow({ label, value, onToggle }: { label: string; value: boolean; onToggle?: () => void }) {
  return (
    <TouchableOpacity style={s.toggleRow} onPress={onToggle} disabled={!onToggle} activeOpacity={0.7}>
      <Text style={s.toggleLabel}>{label}</Text>
      <View style={[s.toggleTrack, value && s.toggleTrackOn]}>
        <View style={[s.toggleThumb, value && s.toggleThumbOn]} />
      </View>
    </TouchableOpacity>
  );
}

// ══════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  wizard: { flex: 1, paddingHorizontal: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { fontSize: 12, color: TACTICAL.textMuted },

  // Step bar
  stepBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, gap: 4,
  },
  stepLine: { width: 20, height: 1, backgroundColor: 'rgba(62,79,60,0.3)' },
  stepLineDone: { backgroundColor: TACTICAL.amber },
  stepDot: {
    width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.3)', backgroundColor: 'rgba(0,0,0,0.2)',
  },
  stepDotActive: { borderColor: TACTICAL.amber, backgroundColor: 'rgba(196,138,44,0.1)' },
  stepDotDone: { borderColor: TACTICAL.amber, backgroundColor: TACTICAL.amber },
  stepNum: { fontSize: 9, fontWeight: '800', color: TACTICAL.textMuted },
  stepNumActive: { color: TACTICAL.amber },
  stepLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, marginRight: 6 },
  stepLabelActive: { color: TACTICAL.amber },

  // Step content
  stepContent: { flex: 1 },
  stepInner: { flex: 1 },

  sectionTitle: {
    fontSize: 9, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 2, marginBottom: 8,
  },

  // Outcomes
  outcomeRow: { flexDirection: 'row', gap: 8 },
  outcomeCard: {
    flex: 1, alignItems: 'center', padding: 10, borderRadius: 10, gap: 5,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)', backgroundColor: 'rgba(0,0,0,0.15)',
  },
  outcomeLabel: { fontSize: 9, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1 },
  outcomeDesc: { fontSize: 8, color: TACTICAL.textMuted, textAlign: 'center', lineHeight: 11 },

  // Reason
  reasonSection: { marginTop: 10, gap: 6 },
  fieldLabel: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1.5 },
  reasonPicker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)',
  },
  reasonPickerText: { fontSize: 12, color: TACTICAL.text },
  reasonInput: {
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)', color: TACTICAL.text, fontSize: 12,
  },

  // Delta grid
  deltaGrid: { gap: 6 },
  deltaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.15)',
  },
  deltaLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deltaLabel: { fontSize: 10, fontWeight: '700', color: TACTICAL.text, letterSpacing: 1 },
  deltaControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deltaBtn: {
    width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(62,79,60,0.15)', borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)',
  },
  deltaValue: {
    fontSize: 13, fontWeight: '800', fontFamily: 'Courier', minWidth: 42, textAlign: 'center',
  },

  // Toggle grid
  toggleGrid: { gap: 6 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.1)',
  },
  toggleLabel: { fontSize: 11, color: TACTICAL.text, flex: 1 },
  toggleTrack: {
    width: 34, height: 18, borderRadius: 9, backgroundColor: 'rgba(62,79,60,0.3)',
    justifyContent: 'center', paddingHorizontal: 2,
  },
  toggleTrackOn: { backgroundColor: 'rgba(102,187,106,0.3)' },
  toggleThumb: {
    width: 14, height: 14, borderRadius: 7, backgroundColor: TACTICAL.textMuted,
  },
  toggleThumbOn: { backgroundColor: '#66BB6A', alignSelf: 'flex-end' },

  // Lessons
  lessonField: { marginBottom: 8 },
  lessonHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  lessonLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 1.5 },
  lessonInput: {
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.15)', color: TACTICAL.text, fontSize: 12,
    minHeight: 36, maxHeight: 50, textAlignVertical: 'top',
  },

  // Nav row
  navRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8,
  },
  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.25)', backgroundColor: 'rgba(0,0,0,0.15)',
  },
  backBtnText: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: TACTICAL.amber, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8,
  },
  nextBtnText: { fontSize: 10, fontWeight: '800', color: '#0B0F12', letterSpacing: 2 },
  completeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: TACTICAL.amber, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8,
  },
  completeBtnText: { fontSize: 9, fontWeight: '800', color: '#0B0F12', letterSpacing: 1.5 },
  btnDisabled: { opacity: 0.4 },

  // Saving phase indicator
  phaseBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 8, marginBottom: 4,
    backgroundColor: 'rgba(196,138,44,0.06)', borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(196,138,44,0.15)',
  },
  phaseText: { fontSize: 10, fontWeight: '700', color: TACTICAL.amber, letterSpacing: 0.5 },

  // Finalize fallback
  finalizeBar: {
    gap: 8, paddingVertical: 8,
  },
  finalizeInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,149,0,0.06)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,149,0,0.2)',
  },
  finalizeInfoText: { fontSize: 10, color: '#FF9500', flex: 1 },
  finalizeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: TACTICAL.amber, borderRadius: 8, paddingVertical: 10,
  },
  finalizeBtnText: { fontSize: 10, fontWeight: '800', color: '#0B0F12', letterSpacing: 1.5 },


  // Read-only
  readOnlyBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center',
    paddingVertical: 8,
  },
  readOnlyText: { fontSize: 10, color: TACTICAL.textMuted },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center',
  },
  modalSheet: {
    width: '80%', maxWidth: 320, backgroundColor: '#151A1E', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.3)', padding: 16,
  },
  modalTitle: {
    fontSize: 10, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 2, marginBottom: 10,
  },
  modalItem: {
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, marginBottom: 2,
  },
  modalItemActive: { backgroundColor: 'rgba(196,138,44,0.08)' },
  modalItemText: { fontSize: 13, color: TACTICAL.text },
});



