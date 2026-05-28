import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeIcon as Ionicons } from './SafeIcon';
import ECSModalShell from './ECSModalShell';
import WeatherIntelPanel from './weather/WeatherIntelPanel';
import { EMERGENCY_PROTOCOLS } from './emergency/EmergencyData';
import FieldUseProtocolDetail, { type FieldUseGuideProtocol } from './emergency/FieldUseProtocolDetail';
import RecoveryProtocolDetail from './emergency/RecoveryProtocolDetail';
import { RECOVERY_PROTOCOLS, isRecoveryProtocol, type ProtocolDefinition } from './emergency/RecoveryProtocolData';
import { getTacticalGlyph } from './emergency/TacticalGlyphs';
import DocumentPreviewModal from './intel/DocumentPreviewModal';
import DocumentationCenter from './intel/DocumentationCenter';
import PermitsAccessPanel from './intel/PermitsAccessPanel';
import TripSummaries from './intel/TripSummaries';
import { useApp } from '../context/AppContext';
import { calculateRisk, getPackingStats, getRiskColor } from '../lib/calculations';
import { getBuilderState, getCachedExpeditions } from '../lib/expeditionCache';
import { missionEventStore, missionNoteStore } from '../lib/missionStore';
import { expeditionStateStore } from '../lib/expeditionStateStore';
import { dispatchStore } from '../lib/dispatchStore';
import { commsStore, type CustomCommsData } from '../lib/commsStore';
import { routeStore, type ImportedRoute } from '../lib/routeStore';
import type { EcsExpedition } from '../lib/expeditionTypes';
import { hapticMicro } from '../lib/haptics';
import { TACTICAL, ECS } from '../lib/theme';
import { ECS_TOAST_COPY } from '../lib/ecsStateCopy';
import {
  ECS_TOP_SHELL_COMMAND_PILL_HEIGHT,
  getShellBottomClearance,
  getShellHeaderTopPadding,
} from '../lib/shellLayout';
import { useOperationalWeather } from '../lib/useOperationalWeather';
import type { WeatherCoordinate } from '../lib/weatherTypes';

type FieldUtilitiesView =
  | 'menu'
  | 'quickNote'
  | 'emergencyComms'
  | 'intel'
  | 'protocols'
  | 'protocolDetail'
  | 'recoveryProtocols'
  | 'recoveryProtocolDetail'
  | 'permitsAccess'
  | 'tripSummaries'
  | 'documentation'
  | 'team';

type FieldUtilitiesReturnTarget = 'dashboard' | 'quickActions' | 'map' | string;
type FieldUtilityActionView = Exclude<FieldUtilitiesView, 'menu' | 'protocolDetail' | 'recoveryProtocolDetail'>;

type FieldUtilitiesState = {
  isOpen: boolean;
  activeView: FieldUtilitiesView;
  returnTarget?: FieldUtilitiesReturnTarget;
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
const DEFAULT_EMERGENCY_CONTACTS = [
  { label: 'Emergency', value: '911' },
  { label: 'Poison Control', value: '800-222-1222' },
  { label: 'Search & Rescue', value: '911 -> SAR' },
];

type EditableCommsSection = 'frequencies' | 'signals' | 'contacts';

type EditableCommsEntry = {
  id: string;
  label: string;
  detail: string;
};

type EditingCommsEntry = EditableCommsEntry & {
  section: EditableCommsSection;
};

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

function resolveRouteTrailheadCoordinate(route: ImportedRoute | null): WeatherCoordinate | null {
  if (!route) return null;
  const firstSegmentPoint = route.segments
    ?.find((segment) => Array.isArray(segment.points) && segment.points.length > 0)
    ?.points?.[0];
  const firstWaypoint = route.waypoints?.[0];
  const lat = firstSegmentPoint?.lat ?? firstWaypoint?.lat;
  const lng = firstSegmentPoint?.lon ?? firstWaypoint?.lon;
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }

  return {
    lat,
    lng,
    label: `${route.name || 'Active Route'} Trailhead`,
  };
}

function buildEmergencyFieldUseGuide(protocol: ProtocolDefinition): FieldUseGuideProtocol {
  return {
    id: protocol.id,
    title: protocol.title,
    subtitle: protocol.subtitle,
    accentColor: protocol.accentColor,
    image: protocol.fieldUtilityImage ?? protocol.image ?? null,
    beforeLabel: 'BEFORE YOU ACT',
    beforeItems: protocol.beforeYouPull,
    stepCards: protocol.stepCards,
    warningLabel: 'DO NOT',
    warningItems: protocol.doNot,
    completionLabel: 'SAFETY CHECK',
    completionItems: protocol.completionCheck,
  };
}

function mergeCommsDefaultsWithOverrides(
  prefix: string,
  defaults: { label: string; detail: string }[],
  overrides: EditableCommsEntry[],
): EditableCommsEntry[] {
  const overrideById = new Map(overrides.map((entry) => [entry.id, entry]));
  const defaultIds = new Set<string>();
  const mergedDefaults = defaults.map((entry, index) => {
    const id = `default_${prefix}_${index}`;
    defaultIds.add(id);
    return overrideById.get(id) ?? { id, ...entry };
  });

  return [
    ...mergedDefaults,
    ...overrides.filter((entry) => !defaultIds.has(entry.id)),
  ];
}

interface Props {
  visible: boolean;
  onClose: (returnTarget?: FieldUtilitiesReturnTarget) => void;
  returnTarget?: FieldUtilitiesReturnTarget;
}

export default function QuickActionsSheet({ visible, onClose, returnTarget = 'dashboard' }: Props) {
  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();
  const {
    showToast,
    activeTrip,
    user,
    loadItems,
    riskScore,
    refreshActiveTrip,
  } = useApp();
  const [fieldUtilitiesState, setFieldUtilitiesState] = useState<FieldUtilitiesState>({
    isOpen: visible,
    activeView: 'menu',
    returnTarget,
  });
  const [builderState, setBuilderState] = useState(() => getBuilderState());
  const [activeRoute, setActiveRoute] = useState<ImportedRoute | null>(() => routeStore.getActive());
  const [expeditions, setExpeditions] = useState<EcsExpedition[]>(() => getCachedExpeditions());
  const [docPreviewVisible, setDocPreviewVisible] = useState(false);
  const [docPreviewId, setDocPreviewId] = useState('');
  const [docPreviewTitle, setDocPreviewTitle] = useState('');
  const [docPreviewCategory, setDocPreviewCategory] = useState<'system' | 'operational'>('system');
  const [docPreviewContent, setDocPreviewContent] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [dispatchComms, setDispatchComms] = useState<CustomCommsData>(() => commsStore.getAll());
  const [editingCommsEntry, setEditingCommsEntry] = useState<EditingCommsEntry | null>(null);
  const [selectedProtocol, setSelectedProtocol] = useState<ProtocolDefinition | null>(null);
  const [savedNotes, setSavedNotes] = useState(() =>
    missionNoteStore.getByExpeditionId(activeTrip?.id ?? 'general'),
  );
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const expeditionState = expeditionStateStore.getState();
  const hasTeam = (activeTrip?.team_size ?? 1) > 1;
  const missionId = activeTrip?.id ?? 'general';
  const fieldUtilitiesTopClearance = getShellHeaderTopPadding(insets.top) + ECS_TOP_SHELL_COMMAND_PILL_HEIGHT + 10;
  const fieldUtilitiesBottomClearance = getShellBottomClearance(insets.bottom, 2);
  const activeView = fieldUtilitiesState.activeView;
  const protocolDetailActive = activeView === 'protocolDetail';
  const recoveryProtocolDetailActive = activeView === 'recoveryProtocolDetail';
  const protocolStaticActive =
    activeView === 'protocols' ||
    protocolDetailActive ||
    activeView === 'recoveryProtocols' ||
    recoveryProtocolDetailActive;
  const commsStaticActive = activeView === 'emergencyComms';
  const fixedStaticActive = protocolStaticActive || commsStaticActive;
  const protocolCompactMode = viewportHeight < 760;
  const frequencyCards = useMemo(
    () => mergeCommsDefaultsWithOverrides('freq', DEFAULT_FREQUENCIES, dispatchComms.frequencies),
    [dispatchComms.frequencies],
  );
  const signalCards = useMemo(
    () => mergeCommsDefaultsWithOverrides('signal', DEFAULT_SIGNALS, dispatchComms.signals),
    [dispatchComms.signals],
  );
  const emergencyContactCards = useMemo(
    () => mergeCommsDefaultsWithOverrides(
      'contact',
      [
        ...(activeTrip?.emergency_contact?.trim()
          ? [{ label: 'Primary Contact', detail: activeTrip.emergency_contact.trim() }]
          : []),
        ...DEFAULT_EMERGENCY_CONTACTS.map((entry) => ({ label: entry.label, detail: entry.value })),
      ],
      dispatchComms.contacts,
    ),
    [activeTrip?.emergency_contact, dispatchComms.contacts],
  );
  const mainPanelActive = activeView === 'menu';
  const intelWeatherGps = useMemo(
    () => ({
      lat: gpsCoords?.lat ?? null,
      lng: gpsCoords?.lng ?? null,
      hasFix: gpsCoords != null,
      permissionDenied: false,
    }),
    [gpsCoords],
  );
  const trailheadWeatherCoordinate = useMemo(
    () => resolveRouteTrailheadCoordinate(activeRoute),
    [activeRoute],
  );
  const fieldUtilitiesWeather = useOperationalWeather({
    enabled: visible && activeView === 'intel',
    gps: intelWeatherGps,
    units: 'imperial',
  });
  const risk = useMemo(() => {
    if (riskScore) {
      return calculateRisk(riskScore);
    }

    return { score: 0, level: 'N/A' as any };
  }, [riskScore]);
  const loadoutStats = useMemo(() => {
    if (activeTrip) {
      return getPackingStats(loadItems, activeTrip.active_mode || 'Trip');
    }

    return { totalActive: 0, packedActive: 0, pct: 0 };
  }, [activeTrip, loadItems]);

  const refreshSavedNotes = useCallback(() => {
    const notes = missionNoteStore.getByExpeditionId(missionId);
    setSavedNotes(notes);
    setSelectedNoteId((prev) => (prev && notes.some((note) => note.id === prev) ? prev : notes[0]?.id ?? null));
  }, [missionId]);

  const openFieldUtilities = useCallback((nextReturnTarget: FieldUtilitiesReturnTarget = returnTarget) => {
    setFieldUtilitiesState({
      isOpen: true,
      activeView: 'menu',
      returnTarget: nextReturnTarget,
    });
  }, [returnTarget]);

  // Main Field Utilities X closes the panel and returns to the parent menu,
  // normally Dashboard for the dock long-press flow.
  const closeFieldUtilities = useCallback(() => {
    const nextReturnTarget = fieldUtilitiesState.returnTarget ?? returnTarget;
    setFieldUtilitiesState((prev) => ({
      ...prev,
      isOpen: false,
      activeView: 'menu',
    }));
    setNoteText('');
    setSelectedNoteId(null);
    setSelectedProtocol(null);
    setEditingCommsEntry(null);
    setGpsCoords(null);
    setGpsLoading(false);
    setBusy(false);
    onClose(nextReturnTarget);
  }, [fieldUtilitiesState.returnTarget, onClose, returnTarget]);

  const openFieldUtilityAction = useCallback((action: FieldUtilityActionView) => {
    setFieldUtilitiesState((prev) => ({
      ...prev,
      isOpen: true,
      activeView: action,
    }));
  }, []);

  // Child X keeps Field Utilities open and returns to its main action menu.
  const closeFieldUtilityAction = useCallback(() => {
    setFieldUtilitiesState((prev) => ({
      ...prev,
      activeView: 'menu',
    }));
    setSelectedProtocol(null);
    setEditingCommsEntry(null);
  }, []);

  const handleShellClose = useCallback(() => {
    if (activeView === 'menu') {
      closeFieldUtilities();
      return;
    }

    closeFieldUtilityAction();
  }, [activeView, closeFieldUtilities, closeFieldUtilityAction]);

  const handleShellBack = useCallback(() => {
    if (activeView === 'menu') {
      closeFieldUtilities();
      return;
    }

    if (activeView === 'protocolDetail') {
      openFieldUtilityAction('protocols');
      return;
    }

    if (activeView === 'recoveryProtocolDetail') {
      openFieldUtilityAction('recoveryProtocols');
      return;
    }

    closeFieldUtilityAction();
  }, [activeView, closeFieldUtilities, closeFieldUtilityAction, openFieldUtilityAction]);

  useEffect(() => {
    if (!visible) {
      setFieldUtilitiesState({
        isOpen: false,
        activeView: 'menu',
        returnTarget,
      });
      setNoteText('');
      setGpsCoords(null);
      setGpsLoading(false);
      setSelectedNoteId(null);
      setSelectedProtocol(null);
      setEditingCommsEntry(null);
      return;
    }

    openFieldUtilities(returnTarget);
  }, [openFieldUtilities, returnTarget, visible]);

  useEffect(() => {
    if (!visible) return;
    refreshSavedNotes();
    refreshActiveTrip();
    setBuilderState(getBuilderState());
    setActiveRoute(routeStore.getActive());
    setExpeditions(getCachedExpeditions());
  }, [refreshActiveTrip, refreshSavedNotes, visible]);

  useEffect(() => {
    if (!visible) return undefined;
    return routeStore.subscribe(() => {
      setActiveRoute(routeStore.getActive());
    });
  }, [visible]);

  useEffect(() => {
    if (!visible || activeView !== 'quickNote') return;
    refreshSavedNotes();
  }, [activeView, refreshSavedNotes, visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    void commsStore.waitForHydration().then(() => {
      if (!cancelled) {
        setDispatchComms(commsStore.getAll());
      }
    });

    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || (activeView !== 'emergencyComms' && activeView !== 'intel')) return;
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
  }, [activeView, visible]);

  const handleSaveNote = useCallback(async () => {
    if (!noteText.trim()) return;
    setBusy(true);

    try {
      const text = noteText.trim();
      const savedNote = missionNoteStore.create(missionId, text, 'quick_note');
      missionEventStore.append(missionId, 'NOTE_ADDED', {
        text,
        source: 'quick_actions',
        createdBy: user?.email ?? null,
        timestamp: new Date().toISOString(),
      });
      refreshSavedNotes();
      setSelectedNoteId(savedNote.id);
      setNoteText('');
      showToast(ECS_TOAST_COPY.quickNoteSaved);
    } catch {
      showToast('Unable to save note');
    } finally {
      setBusy(false);
    }
  }, [missionId, noteText, refreshSavedNotes, showToast, user?.email]);

  const handleDeleteNote = useCallback((noteId: string) => {
    hapticMicro();
    const removed = missionNoteStore.remove(noteId);
    if (!removed) {
      showToast('Unable to delete note');
      return;
    }

    refreshSavedNotes();
    showToast('Note deleted');
  }, [refreshSavedNotes, showToast]);

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

  const handleViewDocument = useCallback((
    id: string,
    title: string,
    category: 'system' | 'operational',
    content?: string,
  ) => {
    setDocPreviewId(id);
    setDocPreviewTitle(title);
    setDocPreviewCategory(category);
    setDocPreviewContent(content);
    setDocPreviewVisible(true);
  }, []);

  const handleCloseDocPreview = useCallback(() => {
    setDocPreviewVisible(false);
  }, []);

  const handleExportContent = useCallback((content: string, filename?: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename || 'ecs-export'}-${new Date().toISOString().split('T')[0]}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('DOCUMENT EXPORTED');
      return;
    }

    showToast('Export available on web');
  }, [showToast]);

  const handleTripSummaryViewDoc = useCallback((id: string, title: string, content: string) => {
    handleViewDocument(id, title, 'operational', content);
  }, [handleViewDocument]);

  const handleTripSummaryExport = useCallback((content: string) => {
    handleExportContent(content, 'ecs-trip-summary');
  }, [handleExportContent]);

  const handleStartEditCommsEntry = useCallback((
    section: EditableCommsSection,
    entry: EditableCommsEntry,
  ) => {
    void hapticMicro();
    setEditingCommsEntry({ section, id: entry.id, label: entry.label, detail: entry.detail });
  }, []);

  const handleCancelEditCommsEntry = useCallback(() => {
    setEditingCommsEntry(null);
  }, []);

  const handleSaveEditCommsEntry = useCallback(() => {
    if (!editingCommsEntry) return;

    const label = editingCommsEntry.label.trim();
    const detail = editingCommsEntry.detail.trim();
    if (!label) {
      showToast('Comms title is required');
      return;
    }

    const data = commsStore.getAll();
    const currentColumn = data[editingCommsEntry.section];
    const nextEntry = {
      id: editingCommsEntry.id,
      label,
      detail: detail || '-',
    };
    const nextColumn = currentColumn.some((entry) => entry.id === editingCommsEntry.id)
      ? currentColumn.map((entry) => (entry.id === editingCommsEntry.id ? nextEntry : entry))
      : [...currentColumn, nextEntry];

    const nextData = commsStore.replaceColumn(editingCommsEntry.section, nextColumn);
    setDispatchComms(nextData);
    setEditingCommsEntry(null);
    showToast('Comms entry saved');
  }, [editingCommsEntry, showToast]);

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
      closeFieldUtilities();
    } catch {
      showToast('Unable to send team ping');
    } finally {
      setBusy(false);
    }
  }, [activeTrip, closeFieldUtilities, hasTeam, showToast]);

  const tileItems: readonly QuickActionTile[] = [
    {
      key: 'intel',
      label: 'Weather',
      subtitle: 'Current weather and trail conditions',
      icon: 'cloud-outline',
      color: '#FFB300',
      onPress: () => openFieldUtilityAction('intel'),
      disabled: false,
      availabilityLabel: 'AVAILABLE',
    },
    {
      key: 'note',
      label: 'Quick Note',
      subtitle: 'Capture a fast field note',
      icon: 'create-outline',
      color: TACTICAL.amber,
      onPress: () => openFieldUtilityAction('quickNote'),
      disabled: false,
      availabilityLabel: 'AVAILABLE',
    },
    {
      key: 'comms',
      label: 'Comms',
      subtitle: 'Emergency comms and coordinates',
      icon: 'radio-outline',
      color: '#EF5350',
      onPress: () => openFieldUtilityAction('emergencyComms'),
      disabled: false,
      availabilityLabel: 'AVAILABLE',
    },
    {
      key: 'team',
      label: 'Team Ping',
      subtitle: hasTeam ? 'Send a rapid dispatch update' : 'Trip team required',
      icon: 'people-outline',
      color: '#42A5F5',
      onPress: () => openFieldUtilityAction('team'),
      disabled: !hasTeam,
      availabilityLabel: hasTeam ? 'AVAILABLE' : 'TEAM REQUIRED',
    },
    {
      key: 'recovery-protocol',
      label: 'Recovery Protocol',
      subtitle: 'Vehicle recovery procedures for field extraction.',
      icon: 'car-sport-outline',
      color: TACTICAL.amber,
      onPress: () => openFieldUtilityAction('recoveryProtocols'),
      disabled: false,
      availabilityLabel: 'AVAILABLE',
    },
    {
      key: 'protocols',
      label: 'Emergency Protocol',
      subtitle: 'Field stabilization steps',
      icon: 'medkit-outline',
      color: TACTICAL.danger,
      onPress: () => openFieldUtilityAction('protocols'),
      disabled: false,
      availabilityLabel: 'AVAILABLE',
    },
    {
      key: 'permits-access',
      label: 'Permits & Access',
      subtitle: 'Permits, restrictions, and closure notes',
      icon: 'key-outline',
      color: '#9CCC65',
      onPress: () => openFieldUtilityAction('permitsAccess'),
      disabled: false,
      availabilityLabel: 'AVAILABLE',
    },
    {
      key: 'trip-summaries',
      label: 'Trip Summaries',
      subtitle: 'Expedition reports and history',
      icon: 'analytics-outline',
      color: '#64B5F6',
      onPress: () => openFieldUtilityAction('tripSummaries'),
      disabled: false,
      availabilityLabel: 'AVAILABLE',
    },
  ] as const;

  const documentationTile: QuickActionTile = {
    key: 'documentation',
    label: 'Documentation',
    subtitle: 'System and operational documents',
    icon: 'folder-open-outline',
    color: '#BCAAA4',
    onPress: () => openFieldUtilityAction('documentation'),
    disabled: false,
    availabilityLabel: 'AVAILABLE',
  };

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
            style={[
              styles.tile,
              item.key === 'protocols' && styles.emergencyProtocolTile,
              item.key === 'recovery-protocol' && styles.recoveryProtocolTile,
              item.disabled && styles.tileDisabled,
            ]}
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
      <TouchableOpacity
        key={documentationTile.key}
        style={[styles.tile, styles.documentationTile]}
        onPress={documentationTile.onPress}
        activeOpacity={0.78}
        disabled={busy}
      >
        <View style={[styles.tileIconWrap, { borderColor: `${documentationTile.color}35`, backgroundColor: `${documentationTile.color}12` }]}>
          <Ionicons name={documentationTile.icon as any} size={20} color={documentationTile.color} />
        </View>
        <View style={styles.documentationTileCopy}>
          <Text style={styles.tileLabel}>{documentationTile.label}</Text>
          <Text style={styles.tileSubLabel}>{documentationTile.subtitle}</Text>
        </View>
        <View style={styles.tileStateBadge}>
          <Text style={styles.tileStateText}>{documentationTile.availabilityLabel}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderPanelIntro = (title: string, subtitle: string) => (
    <View style={styles.panelIntro}>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.panelSubtitle}>{subtitle}</Text>
    </View>
  );

  const renderNotePanel = () => (
    <View style={[styles.panelBody, styles.notePanelBody]}>
      {renderPanelIntro('Quick Note', 'Capture a fast field note without leaving Dashboard.')}
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

      <View style={styles.savedNotesSection}>
        <View style={styles.savedNotesHeader}>
          <Text style={styles.savedNotesTitle}>Saved Notes</Text>
          <Text style={styles.metaText}>{savedNotes.length}</Text>
        </View>

        {savedNotes.length > 0 ? (
          <View style={styles.savedNotesList}>
            {savedNotes.map((note) => {
              const selected = note.id === selectedNoteId;
              return (
                <TouchableOpacity
                  key={note.id}
                  style={[styles.savedNoteCard, selected && styles.savedNoteCardSelected]}
                  activeOpacity={0.84}
                  onPress={() => setSelectedNoteId(note.id)}
                >
                  <View style={styles.savedNoteCopy}>
                    <Text style={styles.savedNoteText}>{note.text}</Text>
                    <Text style={styles.savedNoteMeta}>
                      {new Date(note.createdAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.savedNoteDeleteBtn}
                    onPress={() => handleDeleteNote(note.id)}
                    hitSlop={8}
                    activeOpacity={0.78}
                  >
                    <Ionicons name="trash-outline" size={14} color="#EF5350" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={22} color={TACTICAL.textMuted} />
            <Text style={styles.emptyStateText}>
              Saved field notes will appear here after you press Save Note.
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderLiveCoordinatesCard = () => (
    <View style={[styles.infoCard, styles.commsCoordinatesCard]}>
      <Text style={styles.cardTitle}>Live Coordinates</Text>
      {gpsLoading ? (
        <View style={styles.stateRow}>
          <ActivityIndicator size="small" color={TACTICAL.amber} />
          <Text style={styles.stateText}>Waiting for GPS</Text>
        </View>
      ) : gpsCoords ? (
        <View style={styles.coordinatesActionRow}>
          <Text selectable style={styles.coordsText} numberOfLines={1} adjustsFontSizeToFit>
            {formatCoords(gpsCoords.lat, gpsCoords.lng)}
          </Text>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleCopyCoords} activeOpacity={0.78}>
            <Ionicons name="copy-outline" size={13} color={TACTICAL.amber} />
            <Text style={styles.secondaryBtnText}>COPY</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.stateText}>Coordinates unavailable</Text>
      )}
    </View>
  );

  const renderIntelPanel = () => (
    <View style={[styles.panelBody, styles.intelPanelBody]}>
      {renderPanelIntro('Weather', 'Current weather, forecast, alerts, and trail conditions.')}
      {gpsLoading && !gpsCoords ? (
        <View style={styles.stateRow}>
          <ActivityIndicator size="small" color={TACTICAL.amber} />
          <Text style={styles.stateText}>Waiting for GPS</Text>
        </View>
      ) : null}
      <WeatherIntelPanel
        latitude={gpsCoords?.lat ?? null}
        longitude={gpsCoords?.lng ?? null}
        compact={false}
        autoFetch={false}
        weatherSnapshot={fieldUtilitiesWeather.snapshot}
        onRefreshWeather={fieldUtilitiesWeather.refresh}
        mergeForecastIntoConditions
        trailCoordinate={trailheadWeatherCoordinate}
        trailAssessmentActive={trailheadWeatherCoordinate != null}
        frameless
      />
    </View>
  );

  const renderEditableCommsEntry = (
    section: EditableCommsSection,
    entry: EditableCommsEntry,
  ) => {
    const editing =
      editingCommsEntry?.section === section &&
      editingCommsEntry.id === entry.id;

    if (editing) {
      return (
        <View key={entry.id} style={[styles.commsEditRow, styles.commsEntryRowEditing]}>
          <View style={styles.commsEditFields}>
            <TextInput
              style={[styles.commsEditInput, styles.commsEditTitleInput]}
              value={editingCommsEntry.label}
              onChangeText={(label) => setEditingCommsEntry((current) =>
                current ? { ...current, label } : current,
              )}
              placeholder="Title"
              placeholderTextColor={TACTICAL.textMuted}
              autoFocus
            />
            <TextInput
              style={[styles.commsEditInput, styles.commsEditDetailInput]}
              value={editingCommsEntry.detail}
              onChangeText={(detail) => setEditingCommsEntry((current) =>
                current ? { ...current, detail } : current,
              )}
              placeholder="Info"
              placeholderTextColor={TACTICAL.textMuted}
            />
          </View>
          <View style={styles.commsEditActions}>
            <TouchableOpacity
              style={styles.commsCancelBtn}
              onPress={handleCancelEditCommsEntry}
              activeOpacity={0.78}
            >
              <Text style={styles.commsCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.commsSaveBtn}
              onPress={handleSaveEditCommsEntry}
              activeOpacity={0.78}
            >
              <Text style={styles.commsSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <TouchableOpacity
        key={entry.id}
        style={styles.commsEntryRow}
        onLongPress={() => handleStartEditCommsEntry(section, entry)}
        delayLongPress={420}
        activeOpacity={0.86}
      >
        <Text style={styles.commsEntryLabel} numberOfLines={2}>{entry.label}</Text>
        <Text style={styles.commsEntryDetail} numberOfLines={2}>{entry.detail}</Text>
      </TouchableOpacity>
    );
  };

  const renderCommsSection = (
    title: string,
    section: EditableCommsSection,
    entries: EditableCommsEntry[],
  ) => (
    <View style={[styles.infoCard, styles.commsSectionCard]}>
      <View style={styles.commsSectionHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <ScrollView
        style={styles.commsEntryScroller}
        contentContainerStyle={styles.commsEntryList}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {entries.map((entry) => renderEditableCommsEntry(section, entry))}
      </ScrollView>
    </View>
  );

  const renderCommsPanel = () => (
    <View style={[styles.panelBody, styles.commsPanelBody]}>
      {renderPanelIntro('Emergency Comms', 'Frequencies, field signals, emergency numbers, and shareable live coordinates.')}
      <View style={styles.commsReferenceGrid}>
        {renderCommsSection('Frequencies', 'frequencies', frequencyCards)}
        {renderCommsSection('Signals', 'signals', signalCards)}
        {renderCommsSection('Emergency Numbers', 'contacts', emergencyContactCards)}
      </View>
      {renderLiveCoordinatesCard()}
      <Text style={styles.commsAdvisoryText}>
        Long press to edit frequencies, signals, or emergency numbers.
      </Text>
    </View>
  );

  const renderTeamPanel = () => (
    <View style={styles.panelBody}>
      {renderPanelIntro('Team Ping', hasTeam ? 'Send a fast dispatch check-in to the active team.' : 'Team Ping requires an active team.')}
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

  const openProtocolDetail = useCallback((protocol: ProtocolDefinition) => {
    void hapticMicro();
    setSelectedProtocol(protocol);
    setFieldUtilitiesState((prev) => ({
      ...prev,
      isOpen: true,
      activeView: 'protocolDetail',
    }));
  }, []);

  const openRecoveryProtocolDetail = useCallback((protocol: ProtocolDefinition) => {
    void hapticMicro();
    setSelectedProtocol(protocol);
    setFieldUtilitiesState((prev) => ({
      ...prev,
      isOpen: true,
      activeView: 'recoveryProtocolDetail',
    }));
  }, []);

  const renderProtocolsPanel = () => (
    <View style={[styles.panelBody, styles.protocolsPanelBody, styles.emergencyProtocolsPanelBody]}>
      {renderPanelIntro('Emergency Protocol', 'Tap any card for immediate field stabilization steps.')}
      <ProtocolActionGrid onSelectProtocol={openProtocolDetail} />
    </View>
  );

  const renderRecoveryProtocolsPanel = () => (
    <View style={[styles.panelBody, styles.protocolsPanelBody, styles.recoveryProtocolsPanelBody]}>
      {renderPanelIntro('Vehicle Recovery Protocols', 'Tap any card for common recovery guidance.')}
      <ProtocolActionGrid
        protocols={RECOVERY_PROTOCOLS}
        onSelectProtocol={openRecoveryProtocolDetail}
      />
    </View>
  );

  const renderPermitsAccessPanel = () => (
    <View style={styles.panelBody}>
      {renderPanelIntro('Permits & Access', 'Permits, restrictions, closures, and access notes for field planning.')}
      <PermitsAccessPanel onToast={showToast} />
    </View>
  );

  const renderTripSummariesPanel = () => (
    <View style={styles.panelBody}>
      {renderPanelIntro('Trip Summaries', 'Generate and review expedition reports from the current ECS context.')}
      <TripSummaries
        builderState={builderState}
        activeRoute={activeRoute}
        riskScore={riskScore ? risk.score : null}
        riskLevel={risk.level}
        riskColor={getRiskColor(risk.level)}
        loadoutStats={loadoutStats}
        expeditions={expeditions}
        onExport={handleTripSummaryExport}
        onViewDocument={handleTripSummaryViewDoc}
        onToast={showToast}
      />
    </View>
  );

  const renderDocumentationPanel = () => (
    <View style={styles.panelBody}>
      {renderPanelIntro('Documentation', 'System policy documents and operational exports.')}
      <DocumentationCenter
        builderState={builderState}
        activeRoute={activeRoute}
        loadoutStats={loadoutStats}
        onViewDocument={handleViewDocument}
        onExportDocument={handleExportContent}
        onToast={showToast}
      />
    </View>
  );

  const renderProtocolDetailPanel = () => {
    if (!selectedProtocol) {
      return (
        <View style={[styles.panelBody, styles.protocolDetailPanelBody]}>
          {renderPanelIntro('Protocol Detail', 'Select a protocol to view stabilization steps.')}
          <View style={styles.emptyState}>
            <Ionicons name="medkit-outline" size={22} color={TACTICAL.textMuted} />
            <Text style={styles.emptyStateText}>No field protocol is selected.</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.panelBody, styles.protocolDetailPanelBody, protocolCompactMode && styles.protocolDetailPanelBodyCompact]}>
        <FieldUseProtocolDetail protocol={buildEmergencyFieldUseGuide(selectedProtocol)} />
      </View>
    );
  };

  const renderRecoveryProtocolDetailPanel = () => {
    if (!isRecoveryProtocol(selectedProtocol)) {
      return (
        <View style={[styles.panelBody, styles.protocolDetailPanelBody]}>
          {renderPanelIntro('Recovery Protocol Detail', 'Select a recovery card to view field extraction steps.')}
          <View style={styles.emptyState}>
            <Ionicons name="car-sport-outline" size={22} color={TACTICAL.textMuted} />
            <Text style={styles.emptyStateText}>No recovery protocol is selected.</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.panelBody, styles.protocolDetailPanelBody, protocolCompactMode && styles.protocolDetailPanelBodyCompact]}>
        <RecoveryProtocolDetail protocol={selectedProtocol} />
      </View>
    );
  };

  const panelContent = (() => {
    switch (activeView) {
      case 'quickNote':
        return renderNotePanel();
      case 'intel':
        return renderIntelPanel();
      case 'emergencyComms':
        return renderCommsPanel();
      case 'protocols':
        return renderProtocolsPanel();
      case 'protocolDetail':
        return renderProtocolDetailPanel();
      case 'recoveryProtocols':
        return renderRecoveryProtocolsPanel();
      case 'recoveryProtocolDetail':
        return renderRecoveryProtocolDetailPanel();
      case 'permitsAccess':
        return renderPermitsAccessPanel();
      case 'tripSummaries':
        return renderTripSummariesPanel();
      case 'documentation':
        return renderDocumentationPanel();
      case 'team':
        return renderTeamPanel();
      default:
        return renderMainPanel();
    }
  })();

  return (
    <>
      <ECSModalShell
        visible={visible}
        onClose={handleShellClose}
        title="Field Utilities"
        subtitle={
          mainPanelActive
            ? 'Fast field controls stay dock-safe and ready inside the ECS body.'
            : 'Focused utility actions stay inside Field Utilities without changing tabs.'
        }
        icon="flash-outline"
        eyebrow="QUICK ACTIONS"
        overlayClass="workflow"
        maxWidth={980}
        maxHeightFraction={1}
        minHeightFraction={1}
        scrollable={!fixedStaticActive}
        keyboardAware={activeView === 'quickNote'}
        showHandle={false}
        dismissOnBackdrop={false}
        allowSwipeDismiss={false}
        onBack={mainPanelActive ? undefined : handleShellBack}
        closeGuardKey={activeView}
        topClearanceOverride={fieldUtilitiesTopClearance}
        bottomClearanceOverride={fieldUtilitiesBottomClearance}
        bodyStyle={protocolStaticActive ? styles.quickProtocolStaticBody : commsStaticActive ? styles.quickCommsStaticBody : undefined}
        contentContainerStyle={fixedStaticActive ? styles.sheetStaticContent : styles.sheetScrollContentMain}
      >
        {panelContent}
      </ECSModalShell>
      <DocumentPreviewModal
        visible={docPreviewVisible}
        onClose={handleCloseDocPreview}
        documentId={docPreviewId}
        documentTitle={docPreviewTitle}
        documentCategory={docPreviewCategory}
        customContent={docPreviewContent}
        onExport={(content) => handleExportContent(content, `ecs-${docPreviewId}`)}
      />
    </>
  );
}

function ProtocolActionGrid({
  onSelectProtocol,
  protocols = EMERGENCY_PROTOCOLS,
}: {
  onSelectProtocol: (protocol: ProtocolDefinition) => void;
  protocols?: readonly ProtocolDefinition[];
}) {
  return (
    <View style={styles.protocolActionGrid}>
      {protocols.map((protocol) => (
        <ProtocolActionCard
          key={protocol.id}
          protocol={protocol}
          onSelectProtocol={onSelectProtocol}
        />
      ))}
    </View>
  );
}

function ProtocolActionCard({
  protocol,
  onSelectProtocol,
}: {
  protocol: ProtocolDefinition;
  onSelectProtocol: (protocol: ProtocolDefinition) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const protocolCardImage = protocol.image ?? protocol.fieldUtilityImage ?? protocol.badgeImage;
  const protocolCardSource = typeof protocolCardImage === 'string' ? { uri: protocolCardImage } : protocolCardImage;
  const showProtocolImage = Boolean(protocolCardSource && !imageFailed);

  return (
    <TouchableOpacity
      style={[
        styles.protocolActionCard,
        { borderColor: `${protocol.accentColor}38`, backgroundColor: `${protocol.accentColor}0F` },
      ]}
      onPress={() => onSelectProtocol(protocol)}
      activeOpacity={0.78}
    >
      {/* Protocol cards intentionally use full-card images; failed assets fall back to accent card styling. */}
      {showProtocolImage && protocolCardSource ? (
        <Image
          source={protocolCardSource}
          style={styles.protocolActionImage}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <View style={styles.protocolActionFallback}>
          <View style={[styles.protocolActionFallbackIcon, { borderColor: `${protocol.accentColor}40`, backgroundColor: `${protocol.accentColor}12` }]}>
            {getTacticalGlyph(protocol.id, protocol.accentColor, 24) ?? (
              <Ionicons name={getProtocolFallbackIconName(protocol.id)} size={23} color={protocol.accentColor} />
            )}
          </View>
        </View>
      )}
      <View style={styles.protocolActionScrim} />
      <View style={styles.protocolActionCopy}>
        <Text style={[styles.protocolActionTitle, { color: protocol.accentColor }]} numberOfLines={2}>
          {getFieldUtilityProtocolTitle(protocol)}
        </Text>
        <Text style={styles.protocolActionSubtitle} numberOfLines={2}>{protocol.subtitle}</Text>
      </View>
    </TouchableOpacity>
  );
}

function getFieldUtilityProtocolTitle(protocol: ProtocolDefinition): string {
  if (protocol.id === 'hypothermia') {
    // Keep the existing protocol id/content intact; Field Utilities uses the
    // product-facing action label requested for this cold exposure workflow.
    return 'Cold Exposure Stabilization';
  }

  return protocol.title;
}

function getProtocolFallbackIconName(protocolId: string): React.ComponentProps<typeof Ionicons>['name'] {
  if (protocolId.includes('winch') || protocolId.includes('snatch') || protocolId.includes('deadman')) {
    return 'git-pull-request-outline';
  }
  if (protocolId.includes('vehicle') || protocolId.includes('kinetic') || protocolId.includes('multi')) {
    return 'car-sport-outline';
  }
  return 'shield-checkmark-outline';
}

const styles = StyleSheet.create({
  sheetScrollContentMain: {
    justifyContent: 'flex-start',
    flexGrow: 1,
    minHeight: '100%',
    paddingBottom: 12,
  },
  sheetStaticContent: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'flex-start',
  },
  quickProtocolStaticBody: {
    padding: 10,
  },
  quickCommsStaticBody: {
    padding: 10,
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
  emergencyProtocolTile: {
    borderColor: 'rgba(239,83,80,0.24)',
    backgroundColor: 'rgba(239,83,80,0.055)',
  },
  recoveryProtocolTile: {
    borderColor: 'rgba(196,138,44,0.24)',
    backgroundColor: 'rgba(196,138,44,0.06)',
  },
  documentationTile: {
    width: '100%',
    minHeight: 82,
    flexDirection: 'row',
    gap: 12,
    marginTop: 0,
  },
  documentationTileCopy: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
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
    flexGrow: 1,
    minHeight: '100%',
    gap: 12,
  },
  notePanelBody: {
    minHeight: '100%',
  },
  intelPanelBody: {
    gap: 10,
  },
  commsPanelBody: {
    flex: 1,
    minHeight: 0,
    gap: 8,
  },
  protocolsPanelBody: {
    flex: 1,
    minHeight: 0,
    gap: 8,
  },
  emergencyProtocolsPanelBody: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.16)',
    backgroundColor: 'rgba(239,83,80,0.035)',
    padding: 8,
  },
  recoveryProtocolsPanelBody: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.15)',
    backgroundColor: 'rgba(76,175,80,0.032)',
    padding: 8,
  },
  protocolDetailPanelBody: {
    flex: 1,
    minHeight: 0,
    gap: 7,
  },
  protocolDetailPanelBodyCompact: {
    gap: 5,
  },
  panelIntro: {
    gap: 4,
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
  savedNotesSection: {
    gap: 10,
    marginTop: 6,
  },
  savedNotesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  savedNotesTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  savedNotesList: {
    gap: 8,
  },
  savedNoteCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.14)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  savedNoteCardSelected: {
    borderColor: 'rgba(196,138,44,0.34)',
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  savedNoteCopy: {
    flex: 1,
    gap: 6,
  },
  savedNoteText: {
    color: TACTICAL.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  savedNoteMeta: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  savedNoteDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,83,80,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.18)',
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
  commsReferenceGrid: {
    flex: 1,
    minHeight: 0,
    gap: 8,
  },
  commsSectionCard: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 7,
  },
  commsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  commsEntryScroller: {
    flex: 1,
    minHeight: 0,
  },
  commsEntryList: {
    gap: 7,
    paddingBottom: 2,
  },
  commsEntryRow: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.14)',
    backgroundColor: 'rgba(0,0,0,0.16)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  commsEntryRowEditing: {
    borderColor: 'rgba(196,138,44,0.38)',
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  commsEntryLabel: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    color: TACTICAL.text,
  },
  commsEntryDetail: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    textAlign: 'right',
  },
  commsEditRow: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 9,
  },
  commsEditFields: {
    flexDirection: 'row',
    gap: 10,
  },
  commsEditInput: {
    minHeight: 42,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.22)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: TACTICAL.text,
  },
  commsEditTitleInput: {
    flex: 1,
    fontSize: 11,
    fontWeight: '900',
  },
  commsEditDetailInput: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    textAlign: 'right',
  },
  commsEditActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  commsCancelBtn: {
    minHeight: 34,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commsCancelText: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  commsSaveBtn: {
    minHeight: 34,
    borderRadius: 9,
    backgroundColor: TACTICAL.amber,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commsSaveText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  commsCoordinatesCard: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 7,
  },
  coordinatesActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  commsAdvisoryText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  protocolActionGrid: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'space-between',
    justifyContent: 'space-between',
    rowGap: 8,
    columnGap: 8,
  },
  protocolActionCard: {
    width: '48.5%',
    height: '31.2%',
    minHeight: 86,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 9,
    justifyContent: 'flex-start',
  },
  protocolActionImage: {
    ...StyleSheet.absoluteFillObject,
    top: -10,
    right: -10,
    bottom: -10,
    left: -10,
    width: undefined,
    height: undefined,
    opacity: 0.88,
    transform: [{ scale: 1.08 }],
  },
  protocolActionFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,8,10,0.92)',
  },
  protocolActionFallbackIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.78,
  },
  protocolActionScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,8,10,0.42)',
  },
  protocolActionCopy: {
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 5,
  },
  protocolActionTitle: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
    letterSpacing: 0.4,
    textAlign: 'left',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  protocolActionSubtitle: {
    fontSize: 9,
    lineHeight: 12,
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'left',
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.6,
  },
  coordsText: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
  },
  secondaryBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}40`,
    backgroundColor: `${TACTICAL.amber}10`,
    paddingHorizontal: 10,
  },
  secondaryBtnText: {
    fontSize: 9,
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
});
