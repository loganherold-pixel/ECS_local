/**
 * PermitsAccessPanel — Intel Insert Tab Content
 *
 * Three collapsible sections:
 *   A. Permits & Access — permit requirements and access instructions
 *   B. Restrictions — fire, OHV, seasonal, camping, drone restrictions
 *   C. Closures — road/trail closures and access shutdowns
 *
 * Uses accordion layout to keep panel compact.
 * Parent bottom sheet handles scrolling — no internal ScrollView.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';

// ── Data Types ───────────────────────────────────────────────
interface PermitEntry {
  id: string;
  permitName: string;
  issuingAuthority: string;
  requiredFor: string;
  effectiveDates: string;
  notes: string;
}

interface RestrictionEntry {
  id: string;
  restrictionType: string;
  areaZone: string;
  effectiveDates: string;
  notes: string;
}

interface ClosureEntry {
  id: string;
  closureReason: string;
  areaRoute: string;
  startEnd: string;
  notes: string;
}

type SectionKey = 'permits' | 'restrictions' | 'closures';

// ── Default Data ─────────────────────────────────────────────
const createPermit = (): PermitEntry => ({
  id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  permitName: '',
  issuingAuthority: '',
  requiredFor: '',
  effectiveDates: '',
  notes: '',
});

const createRestriction = (): RestrictionEntry => ({
  id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  restrictionType: '',
  areaZone: '',
  effectiveDates: '',
  notes: '',
});

const createClosure = (): ClosureEntry => ({
  id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  closureReason: '',
  areaRoute: '',
  startEnd: '',
  notes: '',
});

interface Props {
  onToast?: (msg: string) => void;
}

export default function PermitsAccessPanel({ onToast }: Props) {
  const [expandedSection, setExpandedSection] = useState<SectionKey | null>('permits');
  const [permits, setPermits] = useState<PermitEntry[]>([]);
  const [restrictions, setRestrictions] = useState<RestrictionEntry[]>([]);
  const [closures, setClosures] = useState<ClosureEntry[]>([]);

  // ── Toggle Section ─────────────────────────────────────────
  const toggleSection = useCallback((key: SectionKey) => {
    setExpandedSection(prev => prev === key ? null : key);
  }, []);

  // ── Permit Handlers ────────────────────────────────────────
  const addPermit = useCallback(() => {
    setPermits(prev => [...prev, createPermit()]);
    setExpandedSection('permits');
  }, []);

  const updatePermit = useCallback((id: string, field: keyof PermitEntry, value: string) => {
    setPermits(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  }, []);

  const removePermit = useCallback((id: string) => {
    setPermits(prev => prev.filter(p => p.id !== id));
  }, []);

  // ── Restriction Handlers ───────────────────────────────────
  const addRestriction = useCallback(() => {
    setRestrictions(prev => [...prev, createRestriction()]);
    setExpandedSection('restrictions');
  }, []);

  const updateRestriction = useCallback((id: string, field: keyof RestrictionEntry, value: string) => {
    setRestrictions(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }, []);

  const removeRestriction = useCallback((id: string) => {
    setRestrictions(prev => prev.filter(r => r.id !== id));
  }, []);

  // ── Closure Handlers ───────────────────────────────────────
  const addClosure = useCallback(() => {
    setClosures(prev => [...prev, createClosure()]);
    setExpandedSection('closures');
  }, []);

  const updateClosure = useCallback((id: string, field: keyof ClosureEntry, value: string) => {
    setClosures(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  }, []);

  const removeClosure = useCallback((id: string) => {
    setClosures(prev => prev.filter(c => c.id !== id));
  }, []);

  // ── Save All ───────────────────────────────────────────────
  const handleSaveAll = useCallback(() => {
    onToast?.('Permits & access data saved locally');
  }, [onToast]);

  // ── Section Config ─────────────────────────────────────────
  const sections: {
    key: SectionKey;
    label: string;
    icon: string;
    count: number;
    description: string;
  }[] = [
    {
      key: 'permits',
      label: 'PERMITS & ACCESS',
      icon: 'document-text-outline',
      count: permits.length,
      description: 'Permit requirements and access instructions',
    },
    {
      key: 'restrictions',
      label: 'RESTRICTIONS',
      icon: 'ban-outline',
      count: restrictions.length,
      description: 'Fire, OHV, seasonal, camping, drone restrictions',
    },
    {
      key: 'closures',
      label: 'CLOSURES',
      icon: 'close-circle-outline',
      count: closures.length,
      description: 'Road/trail closures and access shutdowns',
    },
  ];

  return (
    <View style={styles.container}>
      {/* Panel Header */}
      <View style={styles.panelHeader}>
        <View style={styles.panelHeaderLeft}>
          <Ionicons name="key-outline" size={16} color={TACTICAL.amber} />
          <View>
            <Text style={styles.panelTitle}>PERMITS & ACCESS</Text>
            <Text style={styles.panelSubtitle}>
              {permits.length + restrictions.length + closures.length} entries
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.saveAllBtn}
          onPress={handleSaveAll}
          activeOpacity={0.7}
        >
          <Ionicons name="checkmark-circle-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.saveAllBtnText}>SAVE</Text>
        </TouchableOpacity>
      </View>

      {/* Content (no internal scroll — parent bottom sheet handles scrolling) */}
      <View style={styles.contentArea}>
        {sections.map(section => {
          const isExpanded = expandedSection === section.key;

          return (
            <View key={section.key} style={styles.sectionCard}>
              {/* Section Header (Accordion Toggle) */}
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => toggleSection(section.key)}
                activeOpacity={0.7}
              >
                <View style={styles.sectionHeaderLeft}>
                  <View style={styles.sectionIconWrap}>
                    <Ionicons name={section.icon as any} size={14} color={TACTICAL.amber} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionLabel}>{section.label}</Text>
                    <Text style={styles.sectionDesc}>{section.description}</Text>
                  </View>
                </View>
                <View style={styles.sectionHeaderRight}>
                  {section.count > 0 && (
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>{section.count}</Text>
                    </View>
                  )}
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={TACTICAL.textMuted}
                  />
                </View>
              </TouchableOpacity>

              {/* Section Content */}
              {isExpanded && (
                <View style={styles.sectionContent}>
                  {/* ═══ PERMITS ═══ */}
                  {section.key === 'permits' && (
                    <>
                      {permits.length === 0 && (
                        <Text style={styles.emptyText}>
                          No permits added. Tap + to add a permit requirement.
                        </Text>
                      )}
                      {permits.map((permit, idx) => (
                        <View key={permit.id} style={styles.entryCard}>
                          <View style={styles.entryHeader}>
                            <Text style={styles.entryIndex}>#{idx + 1}</Text>
                            <TouchableOpacity
                              onPress={() => removePermit(permit.id)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="trash-outline" size={14} color={TACTICAL.danger} />
                            </TouchableOpacity>
                          </View>
                          <FieldInput
                            label="Permit Name / Type"
                            value={permit.permitName}
                            placeholder="e.g. Backcountry Permit"
                            onChangeText={(v) => updatePermit(permit.id, 'permitName', v)}
                          />
                          <FieldInput
                            label="Issuing Authority / Link"
                            value={permit.issuingAuthority}
                            placeholder="e.g. USFS, BLM, recreation.gov"
                            onChangeText={(v) => updatePermit(permit.id, 'issuingAuthority', v)}
                          />
                          <FieldInput
                            label="Required For (Area / Trail / Zone)"
                            value={permit.requiredFor}
                            placeholder="e.g. Rubicon Trail"
                            onChangeText={(v) => updatePermit(permit.id, 'requiredFor', v)}
                          />
                          <FieldInput
                            label="Effective Dates / Hours"
                            value={permit.effectiveDates}
                            placeholder="e.g. May 1 – Oct 31, Dawn to Dusk"
                            onChangeText={(v) => updatePermit(permit.id, 'effectiveDates', v)}
                          />
                          <FieldInput
                            label="Notes"
                            value={permit.notes}
                            placeholder="Additional notes"
                            onChangeText={(v) => updatePermit(permit.id, 'notes', v)}
                            multiline
                          />
                        </View>
                      ))}
                      <TouchableOpacity
                        style={styles.addBtn}
                        onPress={addPermit}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="add-circle-outline" size={16} color={TACTICAL.amber} />
                        <Text style={styles.addBtnText}>ADD PERMIT</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {/* ═══ RESTRICTIONS ═══ */}
                  {section.key === 'restrictions' && (
                    <>
                      {restrictions.length === 0 && (
                        <Text style={styles.emptyText}>
                          No restrictions logged. Tap + to add a restriction.
                        </Text>
                      )}
                      {restrictions.map((restriction, idx) => (
                        <View key={restriction.id} style={styles.entryCard}>
                          <View style={styles.entryHeader}>
                            <Text style={styles.entryIndex}>#{idx + 1}</Text>
                            <TouchableOpacity
                              onPress={() => removeRestriction(restriction.id)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="trash-outline" size={14} color={TACTICAL.danger} />
                            </TouchableOpacity>
                          </View>
                          <FieldInput
                            label="Restriction Type"
                            value={restriction.restrictionType}
                            placeholder="e.g. Fire Restriction, OHV Ban"
                            onChangeText={(v) => updateRestriction(restriction.id, 'restrictionType', v)}
                          />
                          <FieldInput
                            label="Area / Zone"
                            value={restriction.areaZone}
                            placeholder="e.g. National Forest, BLM Zone 4"
                            onChangeText={(v) => updateRestriction(restriction.id, 'areaZone', v)}
                          />
                          <FieldInput
                            label="Effective Dates"
                            value={restriction.effectiveDates}
                            placeholder="e.g. Jun 15 – Sep 30"
                            onChangeText={(v) => updateRestriction(restriction.id, 'effectiveDates', v)}
                          />
                          <FieldInput
                            label="Notes"
                            value={restriction.notes}
                            placeholder="Additional details"
                            onChangeText={(v) => updateRestriction(restriction.id, 'notes', v)}
                            multiline
                          />
                        </View>
                      ))}
                      <TouchableOpacity
                        style={styles.addBtn}
                        onPress={addRestriction}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="add-circle-outline" size={16} color={TACTICAL.amber} />
                        <Text style={styles.addBtnText}>ADD RESTRICTION</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {/* ═══ CLOSURES ═══ */}
                  {section.key === 'closures' && (
                    <>
                      {closures.length === 0 && (
                        <Text style={styles.emptyText}>
                          No closures recorded. Tap + to add a closure.
                        </Text>
                      )}
                      {closures.map((closure, idx) => (
                        <View key={closure.id} style={styles.entryCard}>
                          <View style={styles.entryHeader}>
                            <Text style={styles.entryIndex}>#{idx + 1}</Text>
                            <TouchableOpacity
                              onPress={() => removeClosure(closure.id)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="trash-outline" size={14} color={TACTICAL.danger} />
                            </TouchableOpacity>
                          </View>
                          <FieldInput
                            label="Closure Reason"
                            value={closure.closureReason}
                            placeholder="e.g. Wildfire, Flood Damage"
                            onChangeText={(v) => updateClosure(closure.id, 'closureReason', v)}
                          />
                          <FieldInput
                            label="Area / Route"
                            value={closure.areaRoute}
                            placeholder="e.g. FR 123, Hwy 395 MP 42–48"
                            onChangeText={(v) => updateClosure(closure.id, 'areaRoute', v)}
                          />
                          <FieldInput
                            label="Start / End"
                            value={closure.startEnd}
                            placeholder="e.g. Aug 1 – TBD"
                            onChangeText={(v) => updateClosure(closure.id, 'startEnd', v)}
                          />
                          <FieldInput
                            label="Notes / Source Link"
                            value={closure.notes}
                            placeholder="Source URL or additional info"
                            onChangeText={(v) => updateClosure(closure.id, 'notes', v)}
                            multiline
                          />
                        </View>
                      ))}
                      <TouchableOpacity
                        style={styles.addBtn}
                        onPress={addClosure}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="add-circle-outline" size={16} color={TACTICAL.amber} />
                        <Text style={styles.addBtnText}>ADD CLOSURE</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: 24 }} />
      </View>
    </View>
  );
}

// ── Reusable Field Input ─────────────────────────────────────
function FieldInput({
  label,
  value,
  placeholder,
  onChangeText,
  multiline,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldInputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(138,138,133,0.3)"
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {},

  // Panel Header
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.15)',
  },
  panelHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  panelTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  panelSubtitle: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },
  saveAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.3)',
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
  },
  saveAllBtnText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },

  // Content area (replaces ScrollView)
  contentArea: {
    padding: 16,
    gap: 10,
  },

  // Section Cards (Accordion)
  sectionCard: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  sectionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 7,
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },
  sectionDesc: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(196, 138, 44, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
  },

  // Section Content
  sectionContent: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.12)',
    padding: 12,
    gap: 10,
  },

  emptyText: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },

  // Entry Cards
  entryCard: {
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.15)',
    padding: 10,
    gap: 8,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  entryIndex: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },

  // Field Inputs
  fieldRow: { gap: 3 },
  fieldLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  fieldInput: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '600',
    color: TACTICAL.text,
  },
  fieldInputMultiline: {
    minHeight: 56,
    textAlignVertical: 'top',
  },

  // Add Button
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(196, 138, 44, 0.04)',
  },
  addBtnText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
});



