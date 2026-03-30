/**
 * Safety Tab — Emergency + Risk Mode (NO-SCROLL LAYOUT)
 *
 * All 4 sections (Protocols, Risk, Comms, Readiness) fit
 * on a single screen with zero vertical scrolling.
 * Fixed command-interface panels.
 *
 * Comms section: Long-press on Frequencies, Signals, or
 * Emergency Numbers opens an editor to add/delete custom
 * entries. Default entries are read-only.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import TabErrorBoundary from '../../components/TabErrorBoundary';


import { useFocusEffect } from '@react-navigation/native';
import { TACTICAL, GOLD_RAIL } from '../../lib/theme';

import { useApp } from '../../context/AppContext';
import { calculateRisk, getRiskColor } from '../../lib/calculations';
import { riskScoreStore } from '../../lib/storage';
import { getBuilderState, setBuilderState } from '../../lib/expeditionCache';
import { isLoadoutReadyForBuild } from '../../lib/loadoutStore';

import TopoBackground from '../../components/TopoBackground';
import EmergencyGrid from '../../components/emergency/EmergencyGrid';
import EditCommsModal from '../../components/emergency/EditCommsModal';
import { commsStore, type CommsEntry } from '../../lib/commsStore';
import type { RiskScore } from '../../lib/types';
import type { CommsColumnType } from '../../components/emergency/EditCommsModal';

const { height: SCREEN_H } = Dimensions.get('window');
const isSmallDevice = SCREEN_H < 700;
const vGap = isSmallDevice ? 5 : 7;

// ── Risk Factor Labels ──────────────────────────────────────
const RISK_FACTORS = [
  { key: 'terrain_complexity', label: 'Terrain', icon: 'trail-sign-outline' },
  { key: 'weather_exposure', label: 'Weather', icon: 'thunderstorm-outline' },
  { key: 'remoteness', label: 'Remote', icon: 'locate-outline' },
  { key: 'recovery_availability', label: 'Recovery', icon: 'construct-outline' },
  { key: 'comms_coverage', label: 'Comms', icon: 'radio-outline' },
] as const;

// ── Default Comms Data (immutable) ──────────────────────────
const DEFAULT_FREQUENCIES = [
  { label: 'CB Ch 9', detail: 'Emergency' },
  { label: 'CB Ch 19', detail: 'Highway' },
  { label: 'FRS Ch 1', detail: 'General' },
  { label: 'GMRS 462.675', detail: 'Repeater' },
  { label: 'HAM 146.520', detail: 'VHF Call' },
];

const DEFAULT_SIGNALS = [
  { label: '3 of Anything', detail: 'Distress' },
  { label: 'SOS', detail: '3S 3L 3S' },
  { label: 'Ground V', detail: 'Need help' },
  { label: 'Ground X', detail: 'Medical' },
];

const EMERGENCY_CONTACTS = [
  { label: 'Emergency', number: '911' },
  { label: 'Poison Ctrl', number: '800-222-1222' },
  { label: 'Coast Guard', number: 'VHF Ch 16' },
  { label: 'SAR', number: '911 → SAR' },
];

// Default contacts mapped for the EditCommsModal (label/detail format)
const DEFAULT_CONTACTS_FOR_MODAL = EMERGENCY_CONTACTS.map(c => ({
  label: c.label,
  detail: c.number,
}));


// ── Readiness Checks ────────────────────────────────────────
const READINESS_CHECKS = [
  {
    label: 'Vehicle Selected',
    icon: 'car-sport-outline',
    check: (bs: any) => bs.vehicleSelected === true,
    warning: 'No vehicle configured',
  },
  {
    label: 'Framework Set',
    icon: 'construct-outline',
    check: (bs: any) => bs.frameworkConfigured === true,
    warning: 'Framework not set',
  },
  {
    label: 'Zones Configured',
    icon: 'grid-outline',
    check: (bs: any) => bs.zonesConfigured === true,
    warning: 'No zones defined',
  },
  {
    label: 'Loadout Ready',
    icon: 'checkbox-outline',
    check: (bs: any) => bs.loadoutReady === true,
    warning: 'No saved loadout items',
  },
];



type SafetySection = 'protocols' | 'risk' | 'comms' | 'readiness';

// Export inner component for use in unified Alert tab
// When embedded=true, skip TopoBackground and header (Alert tab provides those)
export function SafetyScreenInner({ embedded = false }: { embedded?: boolean }) {


  const { activeTrip, riskScore, refreshActiveTrip } = useApp();
  const [activeSection, setActiveSection] = useState<SafetySection>('protocols');
  const [builderState, setBuilderStateLocal] = useState<any>({});
  const [riskSaved, setRiskSaved] = useState(false);

  // Comms editing state
  const [commsEditVisible, setCommsEditVisible] = useState(false);
  const [commsEditColumn, setCommsEditColumn] = useState<CommsColumnType>('frequencies');
  const [customComms, setCustomComms] = useState(commsStore.getAll());

  const [riskFields, setRiskFields] = useState({
    terrain_complexity: 1,
    weather_exposure: 1,
    remoteness: 1,
    recovery_availability: 1,
    comms_coverage: 1,
  });

  useFocusEffect(
    useCallback(() => {

      refreshActiveTrip();
      const bs = getBuilderState();

      // ── Compute loadout readiness from actual saved items ──
      // Instead of relying solely on the manual loadoutReady flag,
      // check whether the active build has at least 1 saved loadout item.
      // This ensures the readiness card transitions to PASS automatically
      // when the user adds items to the loadout.
      const computedLoadoutReady = isLoadoutReadyForBuild(
        bs.vehicleId,
        bs.loadoutId,
      );

      // If the computed value differs from the persisted value,
      // update the persisted builder state so it stays in sync
      // across screens (Expedition Builder, Templates, etc.)
      if (computedLoadoutReady !== bs.loadoutReady) {
        setBuilderState({ loadoutReady: computedLoadoutReady });
        bs.loadoutReady = computedLoadoutReady;
      }

      setBuilderStateLocal(bs);
      setRiskSaved(false);
      setCustomComms(commsStore.getAll());

      if (riskScore) {
        setRiskFields({
          terrain_complexity: riskScore.terrain_complexity,
          weather_exposure: riskScore.weather_exposure,
          remoteness: riskScore.remoteness,
          recovery_availability: riskScore.recovery_availability,
          comms_coverage: riskScore.comms_coverage,
        });
      }
    }, [])

  );

  const risk = calculateRisk(riskFields as RiskScore);
  const riskColor = getRiskColor(risk.level);

  const readinessResults = READINESS_CHECKS.map(item => ({
    ...item,
    passed: item.check(builderState),
  }));
  const readinessScore = readinessResults.filter(r => r.passed).length;
  const totalChecks = readinessResults.length;

  const sections: { key: SafetySection; label: string; icon: string }[] = [
    { key: 'protocols', label: 'Protocols', icon: 'medkit-outline' },
    { key: 'risk', label: 'Risk', icon: 'shield-outline' },
    { key: 'comms', label: 'Comms', icon: 'radio-outline' },
    { key: 'readiness', label: 'Ready', icon: 'checkmark-circle-outline' },
  ];

  // Handlers for comms editing
  const handleCommsLongPress = useCallback((column: CommsColumnType) => {
    setCommsEditColumn(column);
    setCommsEditVisible(true);
  }, []);

  const handleCommsDataChanged = useCallback(() => {
    setCustomComms(commsStore.getAll());
  }, []);

  const allFrequencies = [
    ...DEFAULT_FREQUENCIES,
    ...customComms.frequencies.map(f => ({ label: f.label, detail: f.detail })),
  ];
  const allSignals = [
    ...DEFAULT_SIGNALS,
    ...customComms.signals.map(s => ({ label: s.label, detail: s.detail })),
  ];

  const Wrapper = embedded ? View : TopoBackground;

  return (
    <Wrapper style={embedded ? { flex: 1 } : undefined}>
      <View style={styles.container}>
        {!embedded && (
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="shield-checkmark" size={18} color={TACTICAL.danger} />
              <View>
                <Text style={styles.headerBrand}>RESPONSE MODE</Text>
                <Text style={styles.headerTitle}>SAFETY</Text>
              </View>
            </View>
            <View style={styles.offlineBadge}>
              <View style={styles.offlineDot} />
              <Text style={styles.offlineText}>OFFLINE READY</Text>
            </View>
          </View>
        )}
        <View style={styles.sectionTabs}>
          {sections.map(s => {
            const isActive = activeSection === s.key;
            return (
              <TouchableOpacity key={s.key} style={[styles.sectionTab, isActive && styles.sectionTabActive]} onPress={() => setActiveSection(s.key)} activeOpacity={0.7}>
                <Ionicons name={s.icon as any} size={13} color={isActive ? TACTICAL.amber : TACTICAL.textMuted} />
                <Text style={[styles.sectionTabText, isActive && styles.sectionTabTextActive]}>{s.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.content}>
          {activeSection === 'protocols' && (
            <View style={styles.sectionFill}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="medkit-outline" size={14} color={TACTICAL.danger} />
                <Text style={[styles.sectionTitle, { color: TACTICAL.danger }]}>FIELD STABILIZATION PROTOCOLS</Text>
              </View>
              <Text style={styles.sectionDesc}>Tap any card for step-by-step response. RECOGNIZE → STABILIZE → EVACUATE IF.</Text>
              <View style={styles.gridFill}><EmergencyGrid /></View>
            </View>
          )}
          {activeSection === 'risk' && (
            <View style={styles.sectionFill}>
              <View style={[styles.riskBanner, { borderColor: `${riskColor}40` }]}>
                <View style={styles.riskBannerLeft}>
                  <Ionicons name="shield-outline" size={14} color={TACTICAL.amber} />
                  <Text style={styles.riskBannerLabel}>RISK ASSESSMENT</Text>
                </View>
                <View style={styles.riskBannerRight}>
                  <Text style={[styles.riskBannerScore, { color: riskColor }]}>{risk.score.toFixed(2)}</Text>
                  <View style={[styles.riskLevelBadge, { backgroundColor: `${riskColor}20`, borderColor: `${riskColor}40` }]}>
                    <Text style={[styles.riskLevelText, { color: riskColor }]}>{risk.level}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.riskFactorsContainer}>
                {RISK_FACTORS.map(factor => {
                  const val = (riskFields as any)[factor.key] as number;
                  return (
                    <View key={factor.key} style={styles.riskFactorRow}>
                      <View style={styles.riskFactorLabelRow}>
                        <Ionicons name={factor.icon as any} size={12} color={TACTICAL.amber} />
                        <Text style={styles.riskFactorLabel}>{factor.label}</Text>
                        <Text style={styles.riskFactorValue}>{val}/5</Text>
                      </View>
                      <View style={styles.riskButtonRow}>
                        {[1, 2, 3, 4, 5].map(v => {
                          const isSelected = val === v;
                          const btnColor = v <= 2 ? '#4CAF50' : v <= 3 ? TACTICAL.amber : TACTICAL.danger;
                          return (
                            <TouchableOpacity key={v} style={[styles.riskBtn, isSelected && { backgroundColor: btnColor, borderColor: btnColor }]} onPress={() => setRiskFields(prev => ({ ...prev, [factor.key]: v }))} activeOpacity={0.7}>
                              <Text style={[styles.riskBtnText, isSelected && { color: '#0B0F12' }]}>{v}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
              <View style={styles.riskFooter}>
                {activeTrip ? (
                  <TouchableOpacity style={[styles.saveRiskBtn, riskSaved && styles.saveRiskBtnSaved]} onPress={async () => { await riskScoreStore.upsert(activeTrip.id, riskFields); refreshActiveTrip(); setRiskSaved(true); }} activeOpacity={0.8}>
                    <Ionicons name={riskSaved ? 'checkmark-circle' : 'save-outline'} size={14} color={riskSaved ? '#4CAF50' : '#0B0F12'} />
                    <Text style={[styles.saveRiskBtnText, riskSaved && { color: '#4CAF50' }]}>{riskSaved ? 'SAVED' : 'SAVE RISK ASSESSMENT'}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.noTripNotice}>
                    <Ionicons name="information-circle-outline" size={12} color={TACTICAL.textMuted} />
                    <Text style={styles.noTripNoticeText}>Create or select a trip to persist risk assessments.</Text>
                  </View>
                )}
              </View>
            </View>
          )}
          {activeSection === 'comms' && (
            <View style={styles.sectionFill}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="radio-outline" size={14} color={TACTICAL.amber} />
                <Text style={styles.sectionTitle}>EMERGENCY COMMS REFERENCE</Text>
              </View>
              <View style={styles.commsHint}>
                <Ionicons name="finger-print-outline" size={10} color={TACTICAL.textMuted} />
                <Text style={styles.commsHintText}>Long-press a column to add or remove custom entries</Text>
              </View>
              <View style={styles.commsColumns}>
                <TouchableOpacity style={styles.commsColumn} onLongPress={() => handleCommsLongPress('frequencies')} delayLongPress={500} activeOpacity={0.9}>
                  <View style={styles.commsGroupTitleRow}>
                    <Text style={styles.commsGroupTitle}>FREQUENCIES</Text>
                  </View>
                  {allFrequencies.map((item, i) => (<View key={i} style={styles.commsRow}><View style={styles.commsDot} /><View style={styles.commsRowText}><Text style={styles.commsLabel}>{item.label}</Text><Text style={styles.commsDetail}>{item.detail}</Text></View></View>))}
                </TouchableOpacity>
                <TouchableOpacity style={styles.commsColumn} onLongPress={() => handleCommsLongPress('signals')} delayLongPress={500} activeOpacity={0.9}>
                  <View style={styles.commsGroupTitleRow}>
                    <Text style={styles.commsGroupTitle}>SIGNALS</Text>
                  </View>
                  {allSignals.map((item, i) => (<View key={i} style={styles.commsRow}><View style={styles.commsDot} /><View style={styles.commsRowText}><Text style={styles.commsLabel}>{item.label}</Text><Text style={styles.commsDetail}>{item.detail}</Text></View></View>))}
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.emergencyCard} onLongPress={() => handleCommsLongPress('contacts')} delayLongPress={500} activeOpacity={0.9}>
                <View style={styles.emergencyCardHeader}>
                  <Ionicons name="call-outline" size={13} color={TACTICAL.danger} />
                  <Text style={styles.emergencyCardTitle}>EMERGENCY NUMBERS</Text>
                </View>
                <View style={styles.contactRows}>
                  <View style={styles.contactRow}>{EMERGENCY_CONTACTS.slice(0, 2).map((c, i) => (<View key={`d-${i}`} style={styles.contactCell}><Text style={styles.contactLabel}>{c.label}</Text><Text style={styles.contactNumber}>{c.number}</Text></View>))}</View>
                  <View style={styles.contactRow}>{EMERGENCY_CONTACTS.slice(2, 4).map((c, i) => (<View key={`d2-${i}`} style={styles.contactCell}><Text style={styles.contactLabel}>{c.label}</Text><Text style={styles.contactNumber}>{c.number}</Text></View>))}</View>
                </View>
              </TouchableOpacity>
              <View style={styles.commsFooterNotice}>
                <Ionicons name="cloud-offline-outline" size={11} color={TACTICAL.textMuted} />
                <Text style={styles.commsFooterText}>All frequencies and protocols available offline.</Text>
              </View>
            </View>
          )}
          {activeSection === 'readiness' && (
            <View style={styles.sectionFill}>
              <View style={styles.readinessBanner}>
                <View style={styles.readinessBannerLeft}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={TACTICAL.amber} />
                  <Text style={styles.readinessBannerLabel}>BUILD READINESS</Text>
                </View>
                <View style={styles.readinessBannerRight}>
                  <Text style={[styles.readinessBannerScore, { color: readinessScore === totalChecks ? '#4CAF50' : TACTICAL.amber }]}>{readinessScore}/{totalChecks}</Text>
                </View>
              </View>
              <View style={styles.readinessGrid}>
                {[readinessResults.slice(0, 2), readinessResults.slice(2, 4)].map((row, ri) => (
                  <View key={ri} style={styles.readinessRow}>
                    {row.map((item, idx) => (
                      <View key={idx} style={[styles.readinessCard, item.passed && styles.readinessCardPassed]}>
                        <View style={styles.readinessCardTop}>
                          <Ionicons name={item.passed ? 'checkmark-circle' : 'alert-circle-outline'} size={18} color={item.passed ? '#4CAF50' : TACTICAL.amber} />
                        </View>
                        <Text style={[styles.readinessCardLabel, item.passed && { color: '#4CAF50' }]}>{item.label}</Text>
                        {!item.passed ? <Text style={styles.readinessCardWarning}>{item.warning}</Text> : <Text style={styles.readinessCardOk}>PASS</Text>}
                      </View>
                    ))}
                  </View>
                ))}
              </View>
              <View style={styles.terrainWarningCard}>
                <View style={styles.terrainWarningHeader}>
                  <Ionicons name="warning-outline" size={13} color={TACTICAL.amber} />
                  <Text style={styles.terrainWarningTitle}>TERRAIN AWARENESS</Text>
                </View>
                <Text style={styles.terrainWarningText}>Ensure loadout matches terrain. Verify water reserves for desert/remote ops.</Text>
                {risk.score >= 3 && (<View style={styles.terrainAlert}><Ionicons name="alert-circle" size={12} color={TACTICAL.danger} /><Text style={styles.terrainAlertText}>HIGH RISK ({risk.score.toFixed(1)})</Text></View>)}
              </View>
            </View>
          )}
        </View>
        <EditCommsModal visible={commsEditVisible} columnType={commsEditColumn} defaultEntries={commsEditColumn === 'frequencies' ? DEFAULT_FREQUENCIES : commsEditColumn === 'signals' ? DEFAULT_SIGNALS : DEFAULT_CONTACTS_FOR_MODAL} customEntries={commsEditColumn === 'frequencies' ? customComms.frequencies : commsEditColumn === 'signals' ? customComms.signals : customComms.contacts} onClose={() => setCommsEditVisible(false)} onDataChanged={handleCommsDataChanged} />
      </View>
    </Wrapper>
  );
}


export default function SafetyScreen() {
  return (
    <TabErrorBoundary tabName="SAFETY">
      <SafetyScreenInner />
    </TabErrorBoundary>
  );
}



const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ── Header ────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 12 : 52,
    paddingBottom: 8,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerBrand: { fontSize: 8, fontWeight: '600', color: TACTICAL.textMuted, letterSpacing: 2 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: TACTICAL.danger, letterSpacing: 1.5 },
  offlineBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
    borderWidth: 1, borderColor: 'rgba(76, 175, 80, 0.25)',
  },
  offlineDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#4CAF50' },
  offlineText: { fontSize: 7, fontWeight: '800', color: '#4CAF50', letterSpacing: 1 },

  // ── Section Tabs ──────────────────────────────────────
  sectionTabs: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 5,
    marginBottom: 6,
  },
  sectionTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  sectionTabActive: {
    borderColor: 'rgba(196, 138, 44, 0.4)',
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
  },
  sectionTabText: { fontSize: 8, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 0.5 },
  sectionTabTextActive: { color: TACTICAL.amber },

  // ── Content (NO SCROLL) ───────────────────────────────
  content: {
    flex: 1,
    paddingBottom: Platform.OS === 'web' ? 80 : 100,
  },

  // ── Shared Section Layout ─────────────────────────────
  sectionFill: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  sectionDesc: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    lineHeight: 13,
    marginBottom: 6,
  },
  gridFill: {
    flex: 1,
  },

  // ═══ RISK ═════════════════════════════════════════════
  riskBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: isSmallDevice ? 8 : 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1.5,
    marginBottom: vGap,
  },
  riskBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  riskBannerLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  riskBannerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  riskBannerScore: {
    fontSize: 22,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  riskLevelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  riskLevelText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  riskFactorsContainer: {
    flex: 1,
    gap: isSmallDevice ? 4 : 5,
  },
  riskFactorRow: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: isSmallDevice ? 3 : 5,
    justifyContent: 'center',
  },
  riskFactorLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: isSmallDevice ? 3 : 4,
  },
  riskFactorLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  riskFactorValue: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.amber,
    fontFamily: 'Courier',
  },
  riskButtonRow: {
    flexDirection: 'row',
    gap: 5,
  },
  riskBtn: {
    flex: 1,
    height: isSmallDevice ? 28 : 32,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.4)',
    backgroundColor: 'rgba(62, 79, 60, 0.1)',
  },
  riskBtnText: {
    fontSize: isSmallDevice ? 12 : 14,
    fontWeight: '800',
    color: TACTICAL.textMuted,
  },

  riskFooter: {
    marginTop: vGap,
  },
  saveRiskBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: TACTICAL.amber,
    borderRadius: 8,
    paddingVertical: isSmallDevice ? 10 : 12,
  },
  saveRiskBtnSaved: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  saveRiskBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.2,
  },
  noTripNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(62, 79, 60, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
  },
  noTripNoticeText: {
    flex: 1,
    fontSize: 10,
    color: TACTICAL.textMuted,
    lineHeight: 14,
  },

  // ═══ COMMS ════════════════════════════════════════════
  commsHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  commsHintText: {
    fontSize: 8,
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
    letterSpacing: 0.3,
  },
  commsColumns: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  commsColumn: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    padding: isSmallDevice ? 6 : 8,
    gap: 4,
  },
  commsGroupTitle: {
    fontSize: isSmallDevice ? 7 : 8,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  commsGroupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },

  commsColumnEditHint: {
    fontSize: 7,
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
  },
  commsColumnLabel: {
    fontSize: isSmallDevice ? 7 : 8,
    fontWeight: '700',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  commsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingVertical: isSmallDevice ? 4 : 5,
    borderBottomWidth: GOLD_RAIL.subsectionWidth,
    borderBottomColor: GOLD_RAIL.internal,
  },

  commsDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: TACTICAL.textMuted,
    marginTop: 4,
  },
  commsRowText: {
    flex: 1,
  },
  commsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  commsDetail: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },

  emergencyCard: {
    backgroundColor: 'rgba(192, 57, 43, 0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(192, 57, 43, 0.25)',
    padding: 10,
    marginTop: vGap,
  },
  emergencyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  emergencyCardTitle: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.danger,
    letterSpacing: 2,
  },
  contactRows: {
    gap: 4,
  },
  contactRow: {
    flexDirection: 'row',
    gap: 6,
  },
  contactCell: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(192, 57, 43, 0.04)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(192, 57, 43, 0.1)',
  },
  contactLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.text,
  },
  contactNumber: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.danger,
    fontFamily: 'Courier',
  },
  customBadgeDanger: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(192,57,43,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.3)',
    marginLeft: 'auto',
  },
  customBadgeDangerText: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.danger,
  },
  contactCellCustom: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
  },
  contactLabelCustom: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.amber,
  },
  contactNumberCustom: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    fontFamily: 'Courier',
  },

  commsFooterNotice: {

    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: vGap,
    paddingHorizontal: 4,
  },
  commsFooterText: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    flex: 1,
  },

  // ═══ READINESS ════════════════════════════════════════
  readinessBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: isSmallDevice ? 8 : 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.3)',
    marginBottom: vGap,
  },
  readinessBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  readinessBannerLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  readinessBannerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  readinessBannerScore: {
    fontSize: 22,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  readinessMiniBar: {
    width: 50,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(138,138,133,0.15)',
    overflow: 'hidden',
  },
  readinessMiniBarFill: {
    height: '100%',
    borderRadius: 2,
  },

  readinessGrid: {
    flex: 1,
    gap: 8,
  },
  readinessRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  readinessCard: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
    padding: 10,
    justifyContent: 'center',
  },
  readinessCardPassed: {
    borderColor: 'rgba(76, 175, 80, 0.25)',
    backgroundColor: 'rgba(76, 175, 80, 0.04)',
  },
  readinessCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  readinessCardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  readinessCardWarning: {
    fontSize: 9,
    color: TACTICAL.amber,
    marginTop: 2,
  },
  readinessCardOk: {
    fontSize: 8,
    fontWeight: '900',
    color: '#4CAF50',
    letterSpacing: 2,
    marginTop: 2,
    opacity: 0.6,
  },

  terrainWarningCard: {
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
    padding: 10,
    marginTop: vGap,
  },
  terrainWarningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  terrainWarningTitle: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  terrainWarningText: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    lineHeight: 13,
  },
  terrainAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(192, 57, 43, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(192, 57, 43, 0.25)',
  },
  terrainAlertText: {
    flex: 1,
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.danger,
  },
});




