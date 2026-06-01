/**
 * Safety Tab — Emergency + Comms Mode (NO-SCROLL LAYOUT)
 *
 * The unified Alert tab now keeps Safety focused on field protocols
 * and emergency communications only. Risk and readiness moved out of
 * this surface to reduce duplication with the mission brief.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import TabErrorBoundary from '../../components/TabErrorBoundary';
import { useFocusEffect } from '@react-navigation/native';
import { TACTICAL, GOLD_RAIL } from '../../lib/theme';
import { useApp } from '../../context/AppContext';
import TopoBackground from '../../components/TopoBackground';
import EmergencyGrid from '../../components/emergency/EmergencyGrid';
import EditCommsModal from '../../components/emergency/EditCommsModal';
import { commsStore } from '../../lib/commsStore';
import type { CommsColumnType } from '../../components/emergency/EditCommsModal';
import { getShellBottomClearance, getShellHeaderTopPadding } from '../../lib/shellLayout';
import { useAdaptiveLayout } from '../../lib/useAdaptiveLayout';

const { height: SCREEN_H } = Dimensions.get('window');
const isSmallDevice = SCREEN_H < 700;
const vGap = isSmallDevice ? 5 : 7;

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

const DEFAULT_CONTACTS_FOR_MODAL = EMERGENCY_CONTACTS.map((c) => ({
  label: c.label,
  detail: c.number,
}));
type SafetySection = 'protocols' | 'comms';

export function SafetyScreenInner({ embedded = false }: { embedded?: boolean }) {
  const { refreshActiveTrip, isOnline } = useApp();
  const insets = useSafeAreaInsets();
  const adaptive = useAdaptiveLayout();
  const headerTopPadding = getShellHeaderTopPadding(insets.top);
  const contentBottomPadding = getShellBottomClearance(insets.bottom, embedded ? 0 : 6);
  const [activeSection, setActiveSection] = useState<SafetySection>('protocols');
  const [commsEditVisible, setCommsEditVisible] = useState(false);
  const [commsEditColumn, setCommsEditColumn] = useState<CommsColumnType>('frequencies');
  const [customComms, setCustomComms] = useState(commsStore.getAll());

  useFocusEffect(
    useCallback(() => {
      let active = true;
      refreshActiveTrip();
      void commsStore.waitForHydration().then(() => {
        if (active) {
          setCustomComms(commsStore.getAll());
        }
      });
      return () => {
        active = false;
      };
    }, [refreshActiveTrip]),
  );

  const sections: { key: SafetySection; label: string; icon: string }[] = [
    { key: 'protocols', label: 'Protocols', icon: 'medkit-outline' },
    { key: 'comms', label: 'Comms', icon: 'radio-outline' },
  ];

  const openCommsEditor = useCallback((column: CommsColumnType) => {
    setCommsEditColumn(column);
    setCommsEditVisible(true);
  }, []);

  const handleCommsDataChanged = useCallback(() => {
    setCustomComms(commsStore.getAll());
  }, []);

  const allFrequencies = [
    ...DEFAULT_FREQUENCIES,
    ...customComms.frequencies.map((f) => ({ label: f.label, detail: f.detail })),
  ];
  const allSignals = [
    ...DEFAULT_SIGNALS,
    ...customComms.signals.map((s) => ({ label: s.label, detail: s.detail })),
  ];
  const allContacts = [
    ...EMERGENCY_CONTACTS.map((contact) => ({
      label: contact.label,
      detail: contact.number,
    })),
    ...customComms.contacts.map((contact) => ({
      label: contact.label,
      detail: contact.detail,
    })),
  ];
  const frequencyCards = allFrequencies;
  const signalCards = allSignals;
  const contactCards = allContacts;
  const frequencyNeedsScroll = allFrequencies.length > 6;
  const signalNeedsScroll = allSignals.length > 6;
  const contactNeedsScroll = allContacts.length > 4;
  const readinessTone = isOnline
    ? {
        label: 'ONLINE',
        dot: '#4CAF50',
        color: '#4CAF50',
        background: 'rgba(76, 175, 80, 0.08)',
        border: 'rgba(76, 175, 80, 0.25)',
      }
    : {
        label: 'OFFLINE SUPPORT',
        dot: TACTICAL.amber,
        color: TACTICAL.amber,
        background: 'rgba(196, 138, 44, 0.08)',
        border: 'rgba(196, 138, 44, 0.25)',
      };

  const Wrapper = embedded ? View : TopoBackground;

  return (
    <Wrapper style={embedded ? { flex: 1 } : undefined}>
      <View style={styles.container}>
        {!embedded && (
          <View style={[styles.header, { paddingTop: headerTopPadding }]}>
            <View style={styles.headerLeft}>
              <Ionicons name="shield-checkmark" size={18} color={TACTICAL.danger} />
              <View>
                <Text style={styles.headerBrand}>RESPONSE MODE</Text>
                <Text style={styles.headerTitle}>SAFETY</Text>
              </View>
            </View>
            <View
              style={[
                styles.offlineBadge,
                {
                  backgroundColor: readinessTone.background,
                  borderColor: readinessTone.border,
                },
              ]}
            >
              <View style={[styles.offlineDot, { backgroundColor: readinessTone.dot }]} />
              <Text style={[styles.offlineText, { color: readinessTone.color }]}>
                {readinessTone.label}
              </Text>
            </View>
          </View>
        )}

        <View style={[styles.sectionTabs, embedded && styles.sectionTabsEmbedded]}>
          {sections.map((section) => {
            const isActive = activeSection === section.key;
            return (
              <TouchableOpacity
                key={section.key}
                style={[styles.sectionTab, isActive && styles.sectionTabActive]}
                onPress={() => setActiveSection(section.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={section.icon as any}
                  size={13}
                  color={isActive ? TACTICAL.amber : TACTICAL.textMuted}
                />
                <Text style={[styles.sectionTabText, isActive && styles.sectionTabTextActive]}>
                  {section.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.content, { paddingBottom: contentBottomPadding }]}>
          {activeSection === 'protocols' && (
            <View style={[styles.sectionFill, embedded && styles.sectionFillEmbedded]}>
              <View style={[styles.sectionHeaderRow, embedded && styles.sectionHeaderRowEmbedded]}>
                <Ionicons name="medkit-outline" size={14} color={TACTICAL.danger} />
                <Text style={[styles.sectionTitle, { color: TACTICAL.danger }]}>
                  FIELD STABILIZATION PROTOCOLS
                </Text>
              </View>
              <Text style={[styles.sectionDesc, embedded && styles.sectionDescEmbedded]}>
                Tap any card for immediate field steps. Saved protocols remain readable offline.
              </Text>
              <View style={styles.gridFill}>
                <EmergencyGrid />
              </View>
            </View>
          )}

          {activeSection === 'comms' && (
            <View style={[styles.sectionFill, embedded && styles.sectionFillEmbedded]}>
              <View style={[styles.sectionHeaderRow, embedded && styles.sectionHeaderRowEmbedded]}>
                <Ionicons name="radio-outline" size={14} color={TACTICAL.amber} />
                <Text style={styles.sectionTitle}>EMERGENCY COMMS REFERENCE</Text>
              </View>
              <View style={[styles.commsHint, embedded && styles.commsHintEmbedded]}>
                <Ionicons name="finger-print-outline" size={10} color={TACTICAL.textMuted} />
                <Text style={styles.commsHintText}>
                  Tap Edit to update saved entries. Long-press still works when you need it.
                </Text>
              </View>
              <View
                style={[
                  styles.commsColumns,
                  adaptive.alert.dualPane ? styles.commsColumnsTablet : styles.commsColumnsPhone,
                  embedded && styles.commsColumnsEmbedded,
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.commsColumn,
                    adaptive.alert.dualPane ? styles.commsColumnTablet : styles.commsColumnPhone,
                    embedded && !adaptive.alert.dualPane && styles.commsColumnPhoneEmbedded,
                  ]}
                  onPress={() => openCommsEditor('frequencies')}
                  onLongPress={() => openCommsEditor('frequencies')}
                  delayLongPress={500}
                  activeOpacity={0.9}
                >
                  <View style={styles.commsGroupTitleRow}>
                    <View>
                      <Text style={styles.commsGroupTitle}>FREQUENCIES</Text>
                      <Text style={styles.commsGroupMeta}>{allFrequencies.length} channels ready</Text>
                    </View>
                    <View style={styles.commsEditBadge}>
                      <Ionicons name="create-outline" size={11} color={TACTICAL.amber} />
                      <Text style={styles.commsEditBadgeText}>Edit</Text>
                    </View>
                  </View>
                  <ScrollView
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                    style={frequencyNeedsScroll ? styles.commsGridScroll : undefined}
                    contentContainerStyle={styles.commsGridScrollContent}
                  >
                    <View style={styles.commsGrid}>
                      {frequencyCards.map((item, index) => (
                        <View key={`${item.label}-${index}`} style={styles.commsGridCell}>
                          <Text style={styles.commsGridLabel}>{item.label}</Text>
                          <Text style={styles.commsGridDetail}>{item.detail}</Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.commsColumn,
                    adaptive.alert.dualPane ? styles.commsColumnTablet : styles.commsColumnPhone,
                    embedded && !adaptive.alert.dualPane && styles.commsColumnPhoneEmbedded,
                  ]}
                  onPress={() => openCommsEditor('signals')}
                  onLongPress={() => openCommsEditor('signals')}
                  delayLongPress={500}
                  activeOpacity={0.9}
                >
                  <View style={styles.commsGroupTitleRow}>
                    <View>
                      <Text style={styles.commsGroupTitle}>SIGNALS</Text>
                      <Text style={styles.commsGroupMeta}>{allSignals.length} signals ready</Text>
                    </View>
                    <View style={styles.commsEditBadge}>
                      <Ionicons name="create-outline" size={11} color={TACTICAL.amber} />
                      <Text style={styles.commsEditBadgeText}>Edit</Text>
                    </View>
                  </View>
                  <ScrollView
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                    style={signalNeedsScroll ? styles.commsGridScroll : undefined}
                    contentContainerStyle={styles.commsGridScrollContent}
                  >
                    <View style={styles.commsGrid}>
                      {signalCards.map((item, index) => (
                        <View key={`${item.label}-${index}`} style={styles.commsGridCell}>
                          <Text style={styles.commsGridLabel}>{item.label}</Text>
                          <Text style={styles.commsGridDetail}>{item.detail}</Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.emergencyCard, embedded && styles.emergencyCardEmbedded]}
                onPress={() => openCommsEditor('contacts')}
                onLongPress={() => openCommsEditor('contacts')}
                delayLongPress={500}
                activeOpacity={0.9}
              >
                <View style={styles.emergencyCardHeader}>
                  <View style={styles.emergencyHeaderCopy}>
                    <View style={styles.emergencyTitleRow}>
                      <Ionicons name="call-outline" size={13} color={TACTICAL.danger} />
                      <Text style={styles.emergencyCardTitle}>EMERGENCY NUMBERS</Text>
                    </View>
                    <Text style={styles.emergencyCardMeta}>{allContacts.length} numbers ready</Text>
                  </View>
                  <View style={[styles.commsEditBadge, styles.commsEditBadgeDanger]}>
                    <Ionicons name="create-outline" size={11} color={TACTICAL.danger} />
                    <Text style={[styles.commsEditBadgeText, styles.commsEditBadgeTextDanger]}>Edit</Text>
                  </View>
                </View>
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  style={contactNeedsScroll ? styles.contactGridScroll : undefined}
                  contentContainerStyle={styles.commsGridScrollContent}
                >
                  <View style={styles.contactGrid}>
                    {contactCards.map((contact, index) => (
                      <View key={`${contact.label}-${index}`} style={styles.contactCell}>
                        <Text style={styles.contactLabel}>{contact.label}</Text>
                        <Text style={styles.contactNumber}>{contact.detail}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </TouchableOpacity>

              <View style={styles.commsFooterNotice}>
                <Ionicons name="cloud-offline-outline" size={11} color={TACTICAL.textMuted} />
                <Text style={styles.commsFooterText}>
                  Saved references stay readable offline, and local edits remain available in the field.
                </Text>
              </View>
            </View>
          )}
        </View>

        <EditCommsModal
          visible={commsEditVisible}
          columnType={commsEditColumn}
          defaultEntries={
            commsEditColumn === 'frequencies'
              ? DEFAULT_FREQUENCIES
              : commsEditColumn === 'signals'
                ? DEFAULT_SIGNALS
                : DEFAULT_CONTACTS_FOR_MODAL
          }
          customEntries={
            commsEditColumn === 'frequencies'
              ? customComms.frequencies
              : commsEditColumn === 'signals'
                ? customComms.signals
                : customComms.contacts
          }
          onClose={() => setCommsEditVisible(false)}
          onDataChanged={handleCommsDataChanged}
        />
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerBrand: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: TACTICAL.danger,
    letterSpacing: 1.5,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.25)',
  },
  offlineDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
  },
  offlineText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#4CAF50',
    letterSpacing: 1,
  },
  sectionTabs: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 5,
    marginBottom: 4,
  },
  sectionTabsEmbedded: {
    paddingHorizontal: 10,
    marginBottom: 2,
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
  sectionTabText: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  sectionTabTextActive: {
    color: TACTICAL.amber,
  },
  content: {
    flex: 1,
  },
  sectionFill: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 2,
  },
  sectionFillEmbedded: {
    paddingHorizontal: 12,
    paddingTop: 0,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  sectionHeaderRowEmbedded: {
    marginBottom: 2,
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
    marginBottom: 4,
  },
  sectionDescEmbedded: {
    marginBottom: 2,
  },
  gridFill: {
    flex: 1,
  },
  commsHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  commsHintEmbedded: {
    marginTop: 0,
    marginBottom: 2,
  },
  commsHintText: {
    fontSize: 8,
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
    letterSpacing: 0.3,
  },
  commsColumns: {
    gap: 6,
    minHeight: 0,
    flexGrow: 0,
    flexShrink: 1,
  },
  commsColumnsEmbedded: {
    gap: 5,
  },
  commsColumnsPhone: {
    flexDirection: 'column',
  },
  commsColumnsTablet: {
    flexDirection: 'row',
  },
  commsColumn: {
    minHeight: 0,
    minWidth: 0,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    padding: isSmallDevice ? 4 : 6,
    gap: 4,
  },
  commsColumnPhone: {
    flexGrow: 0,
    flexShrink: 1,
  },
  commsColumnPhoneEmbedded: {
    minHeight: isSmallDevice ? 132 : 144,
  },
  commsColumnTablet: {
    flex: 1,
  },
  commsGroupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 1,
  },
  commsGroupTitle: {
    fontSize: isSmallDevice ? 7 : 8,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  commsGroupMeta: {
    fontSize: 7.5,
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
  },
  commsEditBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
  },
  commsEditBadgeDanger: {
    borderColor: 'rgba(192, 57, 43, 0.22)',
    backgroundColor: 'rgba(192, 57, 43, 0.08)',
  },
  commsEditBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 0.8,
  },
  commsEditBadgeTextDanger: {
    color: TACTICAL.danger,
  },
  commsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    alignContent: 'flex-start',
  },
  commsGridScroll: {
    maxHeight: isSmallDevice ? 138 : 154,
  },
  commsGridScrollContent: {
    paddingBottom: 1,
  },
  commsGridCell: {
    flexBasis: '31%',
    maxWidth: '31%',
    minWidth: 0,
    minHeight: isSmallDevice ? 54 : 60,
    paddingHorizontal: 5,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.14)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    gap: 2,
  },
  commsGridLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.text,
    lineHeight: 10,
    flexShrink: 1,
  },
  commsGridDetail: {
    fontSize: 7.5,
    color: TACTICAL.textMuted,
    lineHeight: 9,
    flexShrink: 1,
  },
  emergencyCard: {
    backgroundColor: 'rgba(192, 57, 43, 0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(192, 57, 43, 0.25)',
    padding: isSmallDevice ? 7 : 8,
    marginTop: isSmallDevice ? 6 : vGap,
    overflow: 'hidden',
    minHeight: 0,
    flexShrink: 1,
  },
  emergencyCardEmbedded: {
    marginTop: 5,
  },
  emergencyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  emergencyHeaderCopy: {
    flex: 1,
    gap: 3,
  },
  emergencyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emergencyCardTitle: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.danger,
    letterSpacing: 2,
  },
  emergencyCardMeta: {
    fontSize: 7.5,
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
  },
  contactGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    alignContent: 'flex-start',
  },
  contactGridScroll: {
    maxHeight: isSmallDevice ? 116 : 128,
  },
  contactCell: {
    flexBasis: '31%',
    maxWidth: '31%',
    minWidth: 0,
    minHeight: isSmallDevice ? 54 : 60,
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 5,
    backgroundColor: 'rgba(192, 57, 43, 0.04)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(192, 57, 43, 0.1)',
    gap: 2,
  },
  contactLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.text,
    flexShrink: 1,
    lineHeight: 10,
  },
  contactNumber: {
    fontSize: 7.5,
    fontWeight: '800',
    color: TACTICAL.danger,
    fontFamily: 'Courier',
    flexShrink: 1,
    lineHeight: 9,
  },
  commsFooterNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: isSmallDevice ? 5 : 6,
    paddingHorizontal: 4,
  },
  commsFooterText: {
    fontSize: 8.5,
    color: TACTICAL.textMuted,
    flex: 1,
  },
});
