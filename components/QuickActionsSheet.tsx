import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from './SafeIcon';
import ECSModalShell from './ECSModalShell';
import { useApp } from '../context/AppContext';
import { missionEventStore, missionNoteStore } from '../lib/missionStore';
import { expeditionStateStore } from '../lib/expeditionStateStore';
import {
  loadOpportunitiesWithCompatibility,
  filterByRadius,
  type DistanceRadius,
} from '../lib/discoverEngine';
import { selectHiddenGemRoutes } from '../lib/discoverCategoryEngine';
import { dispatchStore } from '../lib/dispatchStore';
import { commsStore } from '../lib/commsStore';
import { hapticMicro } from '../lib/haptics';
import { TACTICAL, ECS } from '../lib/theme';
import { ECS_TOAST_COPY } from '../lib/ecsStateCopy';

type QuickPanel = 'main' | 'note' | 'beacon' | 'team' | 'proximity';

type ProximityPick = {
  id: string;
  name: string;
  region: string;
  distanceFromUserMiles?: number;
  discoveryScore?: number;
  hiddenGem?: boolean;
};

type QuickActionTile = {
  key: string;
  label: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  onPress: () => void;
  disabled: boolean;
  availabilityLabel?: string;
};

const RADIUS_OPTIONS: readonly DistanceRadius[] = [25, 50, 100, 250, 500] as const;
const DEFAULT_RADIUS: DistanceRadius = 50;
const DEFAULT_EMERGENCY_CONTACTS = [
  { label: 'Emergency', value: '911' },
  { label: 'Poison Control', value: '800-222-1222' },
  { label: 'Search & Rescue', value: '911 -> SAR' },
];
const TEAM_PING_OPTIONS = [
  { key: 'check-in', label: 'CHECK-IN', detail: 'Team check-in. All systems normal.', eventType: 'status_update' as const },
  { key: 'holding', label: 'HOLDING', detail: 'Holding position. Awaiting next update.', eventType: 'location_checkin' as const },
  { key: 'support', label: 'NEED SUPPORT', detail: 'Need field support. Review latest position.', eventType: 'safety_notice' as const },
];

async function getGPSPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    if (Platform.OS !== 'web') {
      const Location = await import('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 },
        );
      });
    }
  } catch {}

  return null;
}

function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function getEmergencyContacts(
  primaryContact: string | null | undefined,
  dispatchContacts: Array<{ label: string; detail: string }>,
) {
  const merged = [
    ...(primaryContact?.trim()
      ? [{ label: 'Primary Contact', value: primaryContact.trim() }]
      : []),
    ...dispatchContacts.map((contact) => ({
      label: contact.label,
      value: contact.detail,
    })),
    ...DEFAULT_EMERGENCY_CONTACTS,
  ];

  const deduped: Array<{ label: string; value: string }> = [];
  const seen = new Set<string>();

  merged.forEach((entry) => {
    const value = entry.value?.trim();
    if (!value) return;
    const key = `${entry.label.trim().toLowerCase()}::${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push({ label: entry.label, value });
  });

  return deduped.slice(0, 6);
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function QuickActionsSheet({ visible, onClose }: Props) {
  const router = useRouter();
  const { showToast, activeTrip, user } = useApp();
  const [activePanel, setActivePanel] = useState<QuickPanel>('main');
  const [busy, setBusy] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [dispatchContacts, setDispatchContacts] = useState(() => commsStore.getAll().contacts);
  const [radius, setRadius] = useState<DistanceRadius>(DEFAULT_RADIUS);
  const [proximityLoading, setProximityLoading] = useState(false);
  const [proximityResults, setProximityResults] = useState<ProximityPick[]>([]);

  const expeditionState = expeditionStateStore.getState();
  const hasTeam = (activeTrip?.team_size ?? 1) > 1;
  const emergencyContacts = useMemo(
    () => getEmergencyContacts(activeTrip?.emergency_contact, dispatchContacts),
    [activeTrip?.emergency_contact, dispatchContacts],
  );
  const mainPanelActive = activePanel === 'main';

  const dismiss = useCallback((force = false) => {
    if (busy && !force) return;
    setActivePanel('main');
    setNoteText('');
    setGpsCoords(null);
    setGpsLoading(false);
    setProximityLoading(false);
    onClose();
  }, [busy, onClose]);

  useEffect(() => {
    if (!visible) {
      setActivePanel('main');
      setNoteText('');
      setGpsCoords(null);
      setGpsLoading(false);
      setRadius(DEFAULT_RADIUS);
      setProximityLoading(false);
      setProximityResults([]);
      return;
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    void commsStore.waitForHydration().then(() => {
      if (!cancelled) {
        setDispatchContacts(commsStore.getAll().contacts);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || activePanel !== 'beacon') return;
    let cancelled = false;

    (async () => {
      setGpsLoading(true);
      const coords = await getGPSPosition();
      if (!cancelled) {
        setGpsCoords(coords);
        setGpsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activePanel, visible]);

  useEffect(() => {
    if (!visible || activePanel !== 'proximity') return;
    let cancelled = false;

    (async () => {
      setProximityLoading(true);
      const coords = (await getGPSPosition()) ?? null;
      if (cancelled) return;

      const lat = coords?.lat;
      const lng = coords?.lng;

      const { opportunities, results } = loadOpportunitiesWithCompatibility(undefined, lat, lng);
      const filtered = filterByRadius(opportunities, radius);
      const picks = selectHiddenGemRoutes(filtered, results, radius, 10, 5)
        .slice(0, 10)
        .map((route) => ({
          id: route.id,
          name: route.name,
          region: route.region,
          distanceFromUserMiles: route.distanceFromUserMiles,
          discoveryScore: route.discoveryScore,
          hiddenGem: route.hiddenGem,
        }));

      if (!cancelled) {
        setGpsCoords(coords);
        setProximityResults(picks);
        setProximityLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activePanel, radius, visible]);

  const handleRoute = useCallback((path: '/power' | '/power/blu', failureMessage: string) => {
    hapticMicro();
    dismiss();
    setTimeout(() => {
      try {
        router.push(path);
      } catch {
        showToast(failureMessage);
      }
    }, 80);
  }, [dismiss, router, showToast]);

  const handleSaveNote = useCallback(async () => {
    if (!noteText.trim()) return;
    setBusy(true);

    try {
      const text = noteText.trim();
      const missionId = activeTrip?.id ?? 'general';
      missionNoteStore.create(missionId, text, 'quick_note');
      missionEventStore.append(missionId, 'NOTE_ADDED', {
        text,
        source: 'quick_actions',
        createdBy: user?.email ?? null,
        timestamp: new Date().toISOString(),
      });
      showToast(ECS_TOAST_COPY.quickNoteSaved);
      dismiss(true);
    } catch {
      showToast('Unable to save note');
    } finally {
      setBusy(false);
    }
  }, [activeTrip?.id, dismiss, noteText, showToast, user?.email]);

  const handleCopyCoords = useCallback(async () => {
    if (!gpsCoords) return;
    const value = formatCoords(gpsCoords.lat, gpsCoords.lng);

    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        showToast(ECS_TOAST_COPY.coordinatesCopied);
        return;
      }
    } catch {}

    showToast(`Coordinates ready: ${value}`);
  }, [gpsCoords, showToast]);

  const handleTeamPing = useCallback(async (headline: string, detail: string, eventType: 'status_update' | 'location_checkin' | 'safety_notice') => {
    if (!activeTrip || !hasTeam) return;

    setBusy(true);
    try {
      const coords = await getGPSPosition();
      const { error } = await dispatchStore.createEvent(activeTrip.id, {
        event_type: eventType,
        priority: eventType === 'safety_notice' ? 'critical' : 'normal',
        headline,
        detail,
        location_enabled: Boolean(coords),
        location_label: coords ? 'Current Position' : '',
        latitude: coords ? String(coords.lat) : '',
        longitude: coords ? String(coords.lng) : '',
        metadata: { source: 'quick_actions' },
      });

      if (error) {
        showToast('Unable to send team ping');
        return;
      }

      showToast(ECS_TOAST_COPY.teamPingSent);
      dismiss(true);
    } catch {
      showToast('Unable to send team ping');
    } finally {
      setBusy(false);
    }
  }, [activeTrip, dismiss, hasTeam, showToast]);

  const tileItems: readonly QuickActionTile[] = [
    {
      key: 'power',
      label: 'Power',
      subtitle: 'Open ECS power controls',
      icon: 'battery-charging-outline',
      color: '#AB47BC',
      onPress: () => handleRoute('/power', 'Unable to open power controls'),
      disabled: false,
      availabilityLabel: 'AVAILABLE',
    },
    {
      key: 'note',
      label: 'Quick Note',
      subtitle: 'Capture a fast field note',
      icon: 'create-outline',
      color: TACTICAL.amber,
      onPress: () => setActivePanel('note'),
      disabled: false,
      availabilityLabel: 'AVAILABLE',
    },
    {
      key: 'beacon',
      label: 'Field Readiness',
      subtitle: 'Contacts and current coordinates',
      icon: 'locate-outline',
      color: '#EF5350',
      onPress: () => setActivePanel('beacon'),
      disabled: false,
      availabilityLabel: 'AVAILABLE',
    },
    {
      key: 'team',
      label: 'Team Ping',
      subtitle: hasTeam ? 'Send a rapid dispatch update' : 'Trip team required',
      icon: 'people-outline',
      color: '#42A5F5',
      onPress: () => setActivePanel('team'),
      disabled: !hasTeam,
      availabilityLabel: hasTeam ? 'AVAILABLE' : 'TEAM REQUIRED',
    },
    {
      key: 'bluetooth',
      label: 'Bluetooth',
      subtitle: 'Open device connections',
      icon: 'bluetooth-outline',
      color: '#5AC8FA',
      onPress: () => handleRoute('/power/blu', 'Unable to open Bluetooth connections'),
      disabled: false,
      availabilityLabel: 'AVAILABLE',
    },
    {
      key: 'proximity',
      label: 'Trail Scan',
      subtitle: 'Scan nearby route intelligence',
      icon: 'trail-sign-outline',
      color: '#66BB6A',
      onPress: () => setActivePanel('proximity'),
      disabled: false,
      availabilityLabel: 'AVAILABLE',
    },
  ] as const;

  const renderMainPanel = () => (
    <View style={styles.mainPanel}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryEyebrow}>ACTION STACK</Text>
        <Text style={styles.summaryTitle}>Operational shortcuts</Text>
        <Text style={styles.summaryText}>
          {expeditionState === 'active' || expeditionState === 'paused'
            ? 'Fast field controls stay aligned with the current ECS session context.'
            : 'Fast field controls stay available even when no route is active.'}
        </Text>
      </View>

      <Text style={styles.sectionLabel}>AVAILABLE ACTIONS</Text>

      <View style={styles.tileGrid}>
        {tileItems.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[styles.tile, item.disabled && styles.tileDisabled]}
            onPress={item.onPress}
            activeOpacity={0.78}
            disabled={item.disabled || busy}
          >
            <View style={[styles.tileIconWrap, { borderColor: `${item.color}35`, backgroundColor: `${item.color}12` }]}>
              <Ionicons name={item.icon as any} size={20} color={item.disabled ? ECS.muted : item.color} />
            </View>
            <Text style={[styles.tileLabel, item.disabled && styles.tileLabelDisabled]}>
              {item.label}
            </Text>
            <Text style={[styles.tileSubLabel, item.disabled && styles.tileSubLabelDisabled]}>
              {item.subtitle}
            </Text>
            <View style={[styles.tileStateBadge, item.disabled && styles.tileStateBadgeDisabled]}>
              <Text style={[styles.tileStateText, item.disabled && styles.tileStateTextDisabled]}>
                {item.availabilityLabel ?? (item.disabled ? 'UNAVAILABLE' : 'AVAILABLE')}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderBackRow = (title: string, subtitle: string) => (
    <View style={styles.panelIntro}>
      <TouchableOpacity style={styles.backBtn} onPress={() => setActivePanel('main')} activeOpacity={0.78}>
        <Ionicons name="arrow-back" size={14} color={TACTICAL.textMuted} />
        <Text style={styles.backText}>BACK</Text>
      </TouchableOpacity>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.panelSubtitle}>{subtitle}</Text>
    </View>
  );

  const renderNotePanel = () => (
    <View style={styles.panelBody}>
      {renderBackRow('Quick Note', 'Capture a fast field note without leaving Dashboard.')}
      <TextInput
        style={styles.noteInput}
        value={noteText}
        onChangeText={setNoteText}
        placeholder="Observation, reminder, trail note..."
        placeholderTextColor={TACTICAL.textMuted}
        multiline
        textAlignVertical="top"
        maxLength={240}
        autoFocus
      />
      <View style={styles.noteFooter}>
        <Text style={styles.metaText}>{noteText.length}/240</Text>
        <TouchableOpacity
          style={[styles.primaryBtn, !noteText.trim() && styles.primaryBtnDisabled]}
          onPress={handleSaveNote}
          activeOpacity={0.78}
          disabled={!noteText.trim() || busy}
        >
          {busy ? <ActivityIndicator size="small" color="#0B0F12" /> : null}
          <Text style={styles.primaryBtnText}>SAVE NOTE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderBeaconPanel = () => (
    <View style={styles.panelBody}>
      {renderBackRow('Field Readiness', 'Keep emergency contacts and current coordinates ready to share.')}
      <View style={styles.infoCard}>
        <Text style={styles.cardTitle}>Emergency Contacts</Text>
        {emergencyContacts.map((contact) => (
          <View key={`${contact.label}-${contact.value}`} style={styles.listRow}>
            <Text style={styles.listLabel}>{contact.label}</Text>
            <Text style={styles.listValue}>{contact.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.cardTitle}>Live Coordinates</Text>
        {gpsLoading ? (
          <View style={styles.stateRow}>
            <ActivityIndicator size="small" color={TACTICAL.amber} />
            <Text style={styles.stateText}>Waiting for GPS</Text>
          </View>
        ) : gpsCoords ? (
          <>
            <Text selectable style={styles.coordsText}>
              {formatCoords(gpsCoords.lat, gpsCoords.lng)}
            </Text>
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleCopyCoords} activeOpacity={0.78}>
              <Ionicons name="copy-outline" size={14} color={TACTICAL.amber} />
              <Text style={styles.secondaryBtnText}>COPY COORDINATES</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.stateText}>Coordinates unavailable</Text>
        )}
      </View>
    </View>
  );

  const renderTeamPanel = () => (
    <View style={styles.panelBody}>
      {renderBackRow('Team Ping', hasTeam ? 'Send a fast dispatch check-in to the active team.' : 'Team Ping requires an active team.')}
      {!hasTeam ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={22} color={TACTICAL.textMuted} />
          <Text style={styles.emptyStateText}>No active team is configured for this trip.</Text>
        </View>
      ) : (
        <View style={styles.optionList}>
          {TEAM_PING_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={styles.optionCard}
              onPress={() => handleTeamPing(option.label, option.detail, option.eventType)}
              activeOpacity={0.78}
              disabled={busy}
            >
              <View style={styles.optionCardHeader}>
                <Text style={styles.optionCardTitle}>{option.label}</Text>
                <Ionicons name="send-outline" size={14} color={TACTICAL.amber} />
              </View>
              <Text style={styles.optionCardText}>{option.detail}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  const renderProximityPanel = () => (
    <View style={styles.panelBody}>
      {renderBackRow('Trail Scan', 'Scan nearby hidden gems and trail options around your current area.')}
      <View style={styles.radiusRow}>
        {RADIUS_OPTIONS.map((option) => {
          const active = option === radius;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.radiusChip, active && styles.radiusChipActive]}
              onPress={() => setRadius(option)}
              activeOpacity={0.78}
            >
              <Text style={[styles.radiusChipText, active && styles.radiusChipTextActive]}>{option} MI</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {proximityLoading ? (
        <View style={styles.stateRow}>
          <ActivityIndicator size="small" color={TACTICAL.amber} />
          <Text style={styles.stateText}>Scanning nearby Hidden Gems</Text>
        </View>
      ) : (
        <View style={styles.resultsListContent}>
          {proximityResults.slice(0, 10).map((result, index) => (
            <View key={result.id} style={styles.resultRow}>
              <View style={styles.resultRank}>
                <Text style={styles.resultRankText}>{index + 1}</Text>
              </View>
              <View style={styles.resultCopy}>
                <Text style={styles.resultName}>{result.name}</Text>
                <Text style={styles.resultRegion}>
                  {result.region}
                  {typeof result.distanceFromUserMiles === 'number' ? ` • ${result.distanceFromUserMiles} mi` : ''}
                </Text>
              </View>
              <View style={styles.resultMeta}>
                <Text style={styles.resultScore}>{result.discoveryScore ?? '--'}</Text>
                <Text style={[styles.resultTag, { color: result.hiddenGem ? TACTICAL.amber : TACTICAL.textMuted }]}>
                  {result.hiddenGem ? 'GEM' : 'ALT'}
                </Text>
              </View>
            </View>
          ))}
          {proximityResults.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="trail-sign-outline" size={22} color={TACTICAL.textMuted} />
              <Text style={styles.emptyStateText}>No nearby trail intelligence is available inside {radius} miles yet.</Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );

  const panelContent = (() => {
    switch (activePanel) {
      case 'note':
        return renderNotePanel();
      case 'beacon':
        return renderBeaconPanel();
      case 'team':
        return renderTeamPanel();
      case 'proximity':
        return renderProximityPanel();
      default:
        return renderMainPanel();
    }
  })();

  return (
    <ECSModalShell
      visible={visible}
      onClose={() => dismiss()}
      title="Field Utilities"
      subtitle={
        mainPanelActive
          ? 'Fast field controls stay dock-safe and ready without taking over the full screen.'
          : 'Focused utility actions stay readable with enough height for the current task.'
      }
      icon="flash-outline"
      eyebrow="QUICK ACTIONS"
      overlayClass="editor"
      maxWidth={mainPanelActive ? 760 : 820}
      maxHeightFraction={mainPanelActive ? 0.93 : 0.84}
      minHeightFraction={mainPanelActive ? 0.9 : 0.76}
      scrollable={!mainPanelActive}
      keyboardAware={!mainPanelActive}
      showHandle
      dismissOnBackdrop
      allowSwipeDismiss
      contentContainerStyle={mainPanelActive ? styles.sheetScrollContentMain : undefined}
    >
      {panelContent}
    </ECSModalShell>
  );
}

const styles = StyleSheet.create({
  sheetScrollContentMain: {
    justifyContent: 'flex-start',
    flexGrow: 1,
    paddingBottom: 10,
  },
  mainPanel: {
    flexGrow: 1,
    minHeight: 0,
    gap: 10,
  },
  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.14)',
    backgroundColor: 'rgba(196,138,44,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  summaryEyebrow: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.8,
  },
  summaryText: {
    fontSize: 9,
    lineHeight: 13,
    color: TACTICAL.textMuted,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignContent: 'flex-start',
    justifyContent: 'space-between',
  },
  tile: {
    width: '48%',
    minHeight: 82,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tileDisabled: {
    opacity: 0.6,
  },
  tileIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.text,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  tileLabelDisabled: {
    color: TACTICAL.textMuted,
  },
  tileSubLabel: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    textAlign: 'center',
    letterSpacing: 0.4,
    lineHeight: 11,
    minHeight: 22,
  },
  tileSubLabelDisabled: {
    color: ECS.muted,
  },
  tileStateBadge: {
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.22)',
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  tileStateBadgeDisabled: {
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  tileStateText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.1,
  },
  tileStateTextDisabled: {
    color: ECS.muted,
  },
  panelBody: {
    flex: 1,
    gap: 12,
  },
  panelIntro: {
    gap: 6,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.4,
  },
  panelTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 0.8,
  },
  panelSubtitle: {
    fontSize: 11,
    lineHeight: 16,
    color: TACTICAL.textMuted,
  },
  noteInput: {
    minHeight: 150,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    color: TACTICAL.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 13,
  },
  noteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  metaText: {
    fontSize: 10,
    color: TACTICAL.textMuted,
  },
  primaryBtn: {
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnDisabled: {
    opacity: 0.45,
  },
  primaryBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.6,
  },
  infoCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    padding: 12,
    gap: 10,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.6,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  listLabel: {
    flex: 1,
    fontSize: 11,
    color: TACTICAL.text,
  },
  listValue: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.textMuted,
  },
  coordsText: {
    fontSize: 16,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
  },
  secondaryBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}40`,
    backgroundColor: `${TACTICAL.amber}10`,
    paddingHorizontal: 12,
  },
  secondaryBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.2,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stateText: {
    fontSize: 11,
    color: TACTICAL.textMuted,
  },
  emptyState: {
    minHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    gap: 8,
  },
  emptyStateText: {
    fontSize: 11,
    lineHeight: 16,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
  optionList: {
    gap: 10,
  },
  optionCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    padding: 12,
    gap: 6,
  },
  optionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionCardTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.1,
  },
  optionCardText: {
    fontSize: 11,
    lineHeight: 16,
    color: TACTICAL.textMuted,
  },
  radiusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  radiusChip: {
    minWidth: 72,
    minHeight: 34,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  radiusChipActive: {
    borderColor: `${TACTICAL.amber}45`,
    backgroundColor: `${TACTICAL.amber}16`,
  },
  radiusChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.7,
  },
  radiusChipTextActive: {
    color: TACTICAL.amber,
  },
  resultsListContent: {
    gap: 8,
    paddingBottom: 8,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  resultRank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${TACTICAL.amber}12`,
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}28`,
  },
  resultRankText: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
  },
  resultCopy: {
    flex: 1,
    gap: 2,
  },
  resultName: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  resultRegion: {
    fontSize: 10,
    color: TACTICAL.textMuted,
  },
  resultMeta: {
    alignItems: 'flex-end',
    gap: 2,
  },
  resultScore: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
  },
  resultTag: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
});
