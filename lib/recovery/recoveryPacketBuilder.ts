export type PacketFreshnessLabel =
  | 'current'
  | 'stale'
  | 'unavailable'
  | 'user_entered';

export type RecoveryPacketCoordinateFormat =
  | 'decimal_degrees'
  | 'degrees_minutes_seconds'
  | 'utm';

export type RecoveryPacketIncidentType =
  | 'stuck'
  | 'disabled_vehicle'
  | 'injury_or_medical'
  | 'lost_or_disoriented'
  | 'delayed'
  | 'weather_or_exposure'
  | 'recovery_assist_needed'
  | 'other';

export type RecoveryPacketSourceKind =
  | 'user_entered'
  | 'device_gps'
  | 'last_shared_coordinate'
  | 'map_selected'
  | 'offline_cached'
  | 'fleet'
  | 'navigate'
  | 'dispatch_recovery'
  | 'offline_honesty'
  | 'field_utilities'
  | 'garmin_inreach_review_context'
  | 'unknown';

export type RecoveryPacketSourceLabel = {
  sourceKind: RecoveryPacketSourceKind;
  sourceName?: string;
  freshness: PacketFreshnessLabel;
  observedAt?: string;
  generatedAt?: string;
  updatedAt?: string;
  notes?: string[];
};

export type RecoveryPacketCoordinates = {
  latitude: number;
  longitude: number;
  altitudeMeters?: number;
  accuracyMeters?: number;
};

export type ConfirmedLocation = {
  confirmed: boolean;
  coordinates?: RecoveryPacketCoordinates;
  selectedFormat: RecoveryPacketCoordinateFormat;
  formattedCoordinate?: string;
  confirmedAt?: string;
  confirmingUserId?: string;
  confirmingUserDisplayName?: string;
  source: RecoveryPacketSourceLabel;
};

export type RecoveryPacketSectionId =
  | 'location'
  | 'incident'
  | 'vehicle_loadout'
  | 'recovery_gear'
  | 'team_status'
  | 'route_bailout_context'
  | 'comms_status'
  | 'data_freshness'
  | 'share_export';

export type RecoveryPacketField = {
  fieldId: string;
  label: string;
  value?: string;
  freshness: PacketFreshnessLabel;
  source: RecoveryPacketSourceLabel;
  unavailableReason?: string;
};

export type RecoveryPacketSection = {
  sectionId: RecoveryPacketSectionId;
  title: string;
  fields: RecoveryPacketField[];
  warnings?: string[];
};

export type RecoveryPacketWorkflowState =
  | 'not_started'
  | 'drafting'
  | 'blocked_missing_incident_type'
  | 'blocked_missing_confirmed_location'
  | 'ready_to_finalize'
  | 'finalized'
  | 'export_ready'
  | 'export_failed';

export type RecoveryPacketShareActionId = 'copy' | 'download_text' | 'approved_share';

export type RecoveryPacketShareAction = {
  action: RecoveryPacketShareActionId;
  label: string;
  enabled: boolean;
  reason?: string;
};

export type RecoveryPacketSourceField<T = unknown> = {
  value?: T;
  freshness?: PacketFreshnessLabel;
  source?: RecoveryPacketSourceLabel;
  unavailableReason?: string;
};

export type RecoveryPacketReviewSignal = {
  label: string;
  source: RecoveryPacketSourceLabel;
  observedAt?: string;
};

export type RecoveryPacketDraftInput = {
  packetId?: string;
  createdAt?: string;
  updatedAt?: string;
  incidentType?: RecoveryPacketIncidentType;
  incidentNotes?: string;
  confirmedLocation?: ConfirmedLocation;
  activeRoute?: RecoveryPacketSourceField<string> | string;
  vehicleProfile?: RecoveryPacketSourceField<string> | string;
  recoveryGear?: RecoveryPacketSourceField<string[] | string> | string[] | string;
  teamRoster?: RecoveryPacketSourceField<string[] | string> | string[] | string;
  lastKnownCommsStatus?: RecoveryPacketSourceField<string> | string;
  offlineAvailability?: RecoveryPacketSourceField<string> | string;
  weatherFreshness?: RecoveryPacketSourceField<string> | string;
  nearbyBailoutCandidates?: RecoveryPacketSourceField<string[] | string> | string[] | string;
  garminInreachReviewSignals?: RecoveryPacketReviewSignal[];
  networkShareAvailable?: boolean;
};

export type RecoveryPacketDraft = {
  packetId: string;
  maturityLabel: 'Current user-facing/internal beta';
  state: RecoveryPacketWorkflowState;
  incidentType?: RecoveryPacketIncidentType;
  incidentNotes?: string;
  confirmedLocation: ConfirmedLocation;
  activeRoute?: unknown;
  vehicleProfile?: unknown;
  recoveryGear?: unknown;
  teamRoster?: unknown;
  lastKnownCommsStatus?: unknown;
  offlineAvailability?: unknown;
  weatherFreshness?: unknown;
  nearbyBailoutCandidates?: unknown;
  garminInreachReviewSignals?: RecoveryPacketReviewSignal[];
  sections: RecoveryPacketSection[];
  shareActions: RecoveryPacketShareAction[];
  createdAt: string;
  updatedAt: string;
  warnings: string[];
};

export type RecoveryPacketExport = {
  packetId: string;
  exportedAt: string;
  exportedByUserId: string;
  coordinateConfirmedAt: string;
  incidentType: RecoveryPacketIncidentType;
  sections: RecoveryPacketSection[];
  safetyLabels: string[];
};

export type RecoveryPacketBuilderFeatureFlags = {
  recoveryPacketBuilder?: boolean | null;
};

export const RECOVERY_PACKET_SECTION_ORDER: RecoveryPacketSectionId[] = [
  'location',
  'incident',
  'vehicle_loadout',
  'recovery_gear',
  'team_status',
  'route_bailout_context',
  'comms_status',
  'data_freshness',
  'share_export',
];

export const RECOVERY_PACKET_SAFETY_LABELS = [
  'Coordinates user-confirmed',
  'Data may include stale or cached fields',
  'Garmin/inReach signals are review context only',
] as const;

const SECTION_TITLES: Record<RecoveryPacketSectionId, string> = {
  location: 'Location',
  incident: 'Incident',
  vehicle_loadout: 'Vehicle and Loadout',
  recovery_gear: 'Recovery Gear',
  team_status: 'Team Status',
  route_bailout_context: 'Route/Bailout Context',
  comms_status: 'Comms Status',
  data_freshness: 'Data Freshness',
  share_export: 'Share/Export',
};

const UNAVAILABLE_SOURCE: RecoveryPacketSourceLabel = {
  sourceKind: 'unknown',
  sourceName: 'Unavailable',
  freshness: 'unavailable',
};

function envFlagEnabled(key: string): boolean {
  const value = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  return value === '1' || value === 'true' || value === 'TRUE';
}

export function isRecoveryPacketBuilderFeatureEnabled(
  flags?: RecoveryPacketBuilderFeatureFlags | null,
): boolean {
  if (typeof flags?.recoveryPacketBuilder === 'boolean') return flags.recoveryPacketBuilder;
  const globalFlag = (globalThis as { __ECS_RECOVERY_PACKET_BUILDER__?: unknown }).__ECS_RECOVERY_PACKET_BUILDER__;
  if (globalFlag != null) return globalFlag === true || globalFlag === '1' || globalFlag === 'true';
  return envFlagEnabled('EXPO_PUBLIC_ECS_RECOVERY_PACKET_BUILDER') || envFlagEnabled('ECS_RECOVERY_PACKET_BUILDER');
}

function sourceWithFreshness(
  source: RecoveryPacketSourceLabel | undefined,
  fallbackKind: RecoveryPacketSourceKind,
  freshness: PacketFreshnessLabel,
): RecoveryPacketSourceLabel {
  return {
    sourceKind: source?.sourceKind ?? fallbackKind,
    sourceName: source?.sourceName,
    freshness: source?.freshness ?? freshness,
    observedAt: source?.observedAt,
    generatedAt: source?.generatedAt,
    updatedAt: source?.updatedAt,
    notes: source?.notes,
  };
}

export function validateRecoveryPacketCoordinates(
  coordinates: Partial<RecoveryPacketCoordinates> | null | undefined,
): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const latitude = Number(coordinates?.latitude);
  const longitude = Number(coordinates?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    reasons.push('latitude must be finite and between -90 and 90');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    reasons.push('longitude must be finite and between -180 and 180');
  }
  const altitude = coordinates?.altitudeMeters;
  if (altitude != null && !Number.isFinite(Number(altitude))) {
    reasons.push('altitudeMeters must be finite when provided');
  }
  const accuracy = coordinates?.accuracyMeters;
  if (accuracy != null && (!Number.isFinite(Number(accuracy)) || Number(accuracy) < 0)) {
    reasons.push('accuracyMeters must be finite and non-negative when provided');
  }
  return { valid: reasons.length === 0, reasons };
}

function formatDmsComponent(value: number, positive: string, negative: string): string {
  const direction = value >= 0 ? positive : negative;
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = (minutesFloat - minutes) * 60;
  return `${degrees}\u00b0${minutes}'${seconds.toFixed(1)}"${direction}`;
}

export function formatRecoveryPacketCoordinates(
  coordinates: RecoveryPacketCoordinates,
  format: RecoveryPacketCoordinateFormat = 'decimal_degrees',
): string {
  const validation = validateRecoveryPacketCoordinates(coordinates);
  if (!validation.valid) return 'Coordinates unavailable';
  if (format === 'degrees_minutes_seconds') {
    return `${formatDmsComponent(coordinates.latitude, 'N', 'S')}, ${formatDmsComponent(coordinates.longitude, 'E', 'W')}`;
  }
  if (format === 'utm') return 'UTM unavailable in this build';
  return `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`;
}

export function confirmRecoveryPacketLocation(input: {
  location: ConfirmedLocation;
  coordinates: RecoveryPacketCoordinates;
  selectedFormat?: RecoveryPacketCoordinateFormat;
  confirmedAt: string;
  confirmingUserId: string;
  confirmingUserDisplayName?: string;
  source?: RecoveryPacketSourceLabel;
}): ConfirmedLocation {
  const validation = validateRecoveryPacketCoordinates(input.coordinates);
  if (!validation.valid) throw new Error(`Invalid recovery packet coordinates: ${validation.reasons.join('; ')}`);
  if (!input.confirmedAt || !Number.isFinite(Date.parse(input.confirmedAt))) {
    throw new Error('Recovery packet coordinate confirmation requires confirmedAt.');
  }
  if (!input.confirmingUserId) {
    throw new Error('Recovery packet coordinate confirmation requires confirmingUserId.');
  }
  const selectedFormat = input.selectedFormat ?? input.location.selectedFormat ?? 'decimal_degrees';
  const source = sourceWithFreshness(input.source ?? input.location.source, 'user_entered', input.source?.freshness ?? input.location.source.freshness);
  return {
    confirmed: true,
    coordinates: input.coordinates,
    selectedFormat,
    formattedCoordinate: formatRecoveryPacketCoordinates(input.coordinates, selectedFormat),
    confirmedAt: input.confirmedAt,
    confirmingUserId: input.confirmingUserId,
    confirmingUserDisplayName: input.confirmingUserDisplayName,
    source,
  };
}

function makeUnavailableField(fieldId: string, label: string, unavailableReason: string): RecoveryPacketField {
  return {
    fieldId,
    label,
    value: 'Unavailable',
    freshness: 'unavailable',
    source: UNAVAILABLE_SOURCE,
    unavailableReason,
  };
}

function stringifyValue(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    const clean = value.map((entry) => String(entry ?? '').trim()).filter(Boolean);
    return clean.length ? clean.join('; ') : undefined;
  }
  if (typeof value === 'object') {
    const label = (value as { label?: unknown; name?: unknown; summary?: unknown }).label ??
      (value as { name?: unknown }).name ??
      (value as { summary?: unknown }).summary;
    if (typeof label === 'string' && label.trim()) return label.trim();
    return JSON.stringify(value);
  }
  const text = String(value).trim();
  return text || undefined;
}

function normalizeSourceField<T>(
  input: RecoveryPacketSourceField<T> | T | undefined,
  fallbackKind: RecoveryPacketSourceKind,
): { value?: string; freshness: PacketFreshnessLabel; source: RecoveryPacketSourceLabel; unavailableReason?: string } {
  const isField = input != null && typeof input === 'object' && !Array.isArray(input) &&
    ('freshness' in (input as Record<string, unknown>) || 'source' in (input as Record<string, unknown>) || 'value' in (input as Record<string, unknown>));
  if (isField) {
    const field = input as RecoveryPacketSourceField<T>;
    const freshness = field.freshness ?? field.source?.freshness ?? (field.value == null ? 'unavailable' : 'current');
    return {
      value: stringifyValue(field.value),
      freshness,
      source: sourceWithFreshness(field.source, fallbackKind, freshness),
      unavailableReason: field.unavailableReason,
    };
  }
  const value = stringifyValue(input);
  const freshness: PacketFreshnessLabel = value ? 'current' : 'unavailable';
  return {
    value,
    freshness,
    source: sourceWithFreshness(undefined, value ? fallbackKind : 'unknown', freshness),
  };
}

function sourceField(
  fieldId: string,
  label: string,
  input: RecoveryPacketSourceField | unknown,
  fallbackKind: RecoveryPacketSourceKind,
  unavailableReason: string,
): RecoveryPacketField {
  const normalized = normalizeSourceField(input as RecoveryPacketSourceField, fallbackKind);
  if (!normalized.value) return makeUnavailableField(fieldId, label, normalized.unavailableReason ?? unavailableReason);
  return {
    fieldId,
    label,
    value: normalized.value,
    freshness: normalized.freshness,
    source: normalized.source,
  };
}

function defaultLocation(): ConfirmedLocation {
  return {
    confirmed: false,
    selectedFormat: 'decimal_degrees',
    source: { sourceKind: 'unknown', sourceName: 'No location source', freshness: 'unavailable' },
  };
}

function locationFields(location: ConfirmedLocation): RecoveryPacketField[] {
  const coordinateValue = location.coordinates
    ? formatRecoveryPacketCoordinates(location.coordinates, location.selectedFormat)
    : undefined;
  const coordinateField = coordinateValue
    ? {
        fieldId: 'confirmed_coordinates',
        label: location.confirmed ? 'confirmed coordinates' : 'coordinates pending confirmation',
        value: coordinateValue,
        freshness: location.source.freshness,
        source: location.source,
      }
    : makeUnavailableField('confirmed_coordinates', 'confirmed coordinates', 'Coordinates must be entered and user-confirmed.');
  return [
    coordinateField,
    {
      fieldId: 'coordinate_confirmation',
      label: 'coordinate confirmation',
      value: location.confirmed && location.confirmedAt
        ? `user-confirmed location at ${location.confirmedAt}${location.confirmingUserDisplayName ? ` by ${location.confirmingUserDisplayName}` : ''}`
        : 'Coordinates must be user-confirmed before export.',
      freshness: location.confirmed ? 'user_entered' : 'unavailable',
      source: location.confirmed ? sourceWithFreshness(location.source, 'user_entered', 'user_entered') : UNAVAILABLE_SOURCE,
      unavailableReason: location.confirmed ? undefined : 'Coordinate confirmation is required before export.',
    },
    {
      fieldId: 'coordinate_format',
      label: 'coordinate format',
      value: location.selectedFormat === 'degrees_minutes_seconds'
        ? 'degrees/minutes/seconds'
        : location.selectedFormat === 'utm'
          ? 'UTM unavailable in this build'
          : 'decimal degrees',
      freshness: location.selectedFormat === 'utm' ? 'unavailable' : 'user_entered',
      source: location.selectedFormat === 'utm' ? UNAVAILABLE_SOURCE : sourceWithFreshness(location.source, 'user_entered', 'user_entered'),
      unavailableReason: location.selectedFormat === 'utm' ? 'UTM conversion is unavailable in this build.' : undefined,
    },
  ];
}

function incidentLabel(value: RecoveryPacketIncidentType | undefined): string | undefined {
  if (!value) return undefined;
  return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function incidentFields(input: RecoveryPacketDraftInput): RecoveryPacketField[] {
  const fields: RecoveryPacketField[] = [];
  if (input.incidentType) {
    fields.push({
      fieldId: 'incident_type',
      label: 'manual incident type',
      value: incidentLabel(input.incidentType),
      freshness: 'user_entered',
      source: { sourceKind: 'user_entered', sourceName: 'Packet workflow', freshness: 'user_entered' },
    });
  } else {
    fields.push(makeUnavailableField('incident_type', 'manual incident type', 'Manual incident type is required.'));
  }
  if (input.incidentNotes?.trim()) {
    fields.push({
      fieldId: 'incident_notes',
      label: 'incident notes',
      value: input.incidentNotes.trim(),
      freshness: 'user_entered',
      source: { sourceKind: 'user_entered', sourceName: 'Packet workflow', freshness: 'user_entered' },
    });
  } else {
    fields.push(makeUnavailableField('incident_notes', 'incident notes', 'No user-entered notes added.'));
  }
  const signals = input.garminInreachReviewSignals ?? [];
  if (signals.length) {
    fields.push({
      fieldId: 'garmin_inreach_review_signals',
      label: 'Garmin/inReach review signals',
      value: signals.map((signal) => signal.label).join('; '),
      freshness: signals.some((signal) => signal.source.freshness === 'stale') ? 'stale' : 'current',
      source: sourceWithFreshness(signals[0]?.source, 'garmin_inreach_review_context', signals[0]?.source.freshness ?? 'current'),
    });
  } else {
    fields.push(makeUnavailableField('garmin_inreach_review_signals', 'Garmin/inReach review signals', 'No approved Garmin/inReach review signal available.'));
  }
  return fields;
}

function buildDataFreshnessFields(sections: RecoveryPacketSection[]): RecoveryPacketField[] {
  const visibleFields = sections.flatMap((section) => section.fields);
  const stale = visibleFields.filter((field) => field.freshness === 'stale').map((field) => field.label);
  const unavailable = visibleFields.filter((field) => field.freshness === 'unavailable').map((field) => field.label);
  const userEntered = visibleFields.filter((field) => field.freshness === 'user_entered').map((field) => field.label);
  return [
    {
      fieldId: 'stale_fields',
      label: 'stale fields',
      value: stale.length ? stale.join('; ') : 'None listed',
      freshness: stale.length ? 'stale' : 'current',
      source: { sourceKind: 'offline_honesty', sourceName: 'Packet freshness rollup', freshness: stale.length ? 'stale' : 'current' },
    },
    {
      fieldId: 'unavailable_fields',
      label: 'unavailable fields',
      value: unavailable.length ? unavailable.join('; ') : 'None listed',
      freshness: unavailable.length ? 'unavailable' : 'current',
      source: { sourceKind: 'offline_honesty', sourceName: 'Packet freshness rollup', freshness: unavailable.length ? 'unavailable' : 'current' },
    },
    {
      fieldId: 'user_entered_fields',
      label: 'user-entered fields',
      value: userEntered.length ? userEntered.join('; ') : 'None listed',
      freshness: userEntered.length ? 'user_entered' : 'current',
      source: { sourceKind: 'user_entered', sourceName: 'Packet workflow', freshness: userEntered.length ? 'user_entered' : 'current' },
    },
  ];
}

function buildShareActions(canExport: boolean, networkShareAvailable: boolean | undefined, blockedReason: string | undefined): RecoveryPacketShareAction[] {
  return [
    {
      action: 'copy',
      label: 'Copy Packet',
      enabled: canExport,
      reason: canExport ? undefined : blockedReason,
    },
    {
      action: 'download_text',
      label: 'Download Text',
      enabled: canExport,
      reason: canExport ? undefined : blockedReason,
    },
    {
      action: 'approved_share',
      label: 'Approved Share',
      enabled: canExport && networkShareAvailable === true,
      reason: canExport
        ? networkShareAvailable === true
          ? undefined
          : 'Approved share unavailable in this build.'
        : blockedReason,
    },
  ];
}

function buildShareSection(actions: RecoveryPacketShareAction[]): RecoveryPacketSection {
  return {
    sectionId: 'share_export',
    title: SECTION_TITLES.share_export,
    fields: actions.map((action) => ({
      fieldId: `share_${action.action}`,
      label: action.label,
      value: action.enabled ? 'Enabled' : action.reason ?? 'Disabled',
      freshness: action.enabled ? 'current' : 'unavailable',
      source: action.enabled
        ? { sourceKind: 'field_utilities', sourceName: 'Packet workflow', freshness: 'current' }
        : UNAVAILABLE_SOURCE,
      unavailableReason: action.enabled ? undefined : action.reason,
    })),
  };
}

export function buildRecoveryPacketDraft(input: RecoveryPacketDraftInput): RecoveryPacketDraft {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const updatedAt = input.updatedAt ?? createdAt;
  const confirmedLocation = input.confirmedLocation ?? defaultLocation();
  const sections: RecoveryPacketSection[] = [
    {
      sectionId: 'location',
      title: SECTION_TITLES.location,
      fields: locationFields(confirmedLocation),
    },
    {
      sectionId: 'incident',
      title: SECTION_TITLES.incident,
      fields: incidentFields(input),
    },
    {
      sectionId: 'vehicle_loadout',
      title: SECTION_TITLES.vehicle_loadout,
      fields: [
        sourceField('vehicle_profile', 'vehicle profile', input.vehicleProfile, 'fleet', 'Vehicle profile unavailable.'),
      ],
    },
    {
      sectionId: 'recovery_gear',
      title: SECTION_TITLES.recovery_gear,
      fields: [
        sourceField('recovery_gear', 'recovery gear', input.recoveryGear, 'field_utilities', 'Recovery gear inventory unavailable.'),
      ],
    },
    {
      sectionId: 'team_status',
      title: SECTION_TITLES.team_status,
      fields: [
        sourceField('team_roster', 'team roster', input.teamRoster, 'dispatch_recovery', 'Team status unavailable or redacted.'),
      ],
    },
    {
      sectionId: 'route_bailout_context',
      title: SECTION_TITLES.route_bailout_context,
      fields: [
        sourceField('active_route', 'active route', input.activeRoute, 'navigate', 'Route context unavailable.'),
        sourceField('nearby_bailout_candidates', 'nearby bailout candidates', input.nearbyBailoutCandidates, 'navigate', 'Bailout context unavailable.'),
      ],
      warnings: ['Bailout candidates are informational context only.'],
    },
    {
      sectionId: 'comms_status',
      title: SECTION_TITLES.comms_status,
      fields: [
        sourceField('comms_status', 'comms status', input.lastKnownCommsStatus, 'dispatch_recovery', 'Comms status unavailable.'),
      ],
    },
  ];

  sections.push({
    sectionId: 'data_freshness',
    title: SECTION_TITLES.data_freshness,
    fields: [
      ...buildDataFreshnessFields(sections),
      sourceField('offline_availability', 'offline availability', input.offlineAvailability, 'offline_honesty', 'Offline availability unavailable.'),
      sourceField('weather_freshness', 'weather freshness', input.weatherFreshness, 'offline_cached', 'Weather freshness unavailable.'),
    ],
  });

  const state: RecoveryPacketWorkflowState = !input.incidentType
    ? 'blocked_missing_incident_type'
    : !confirmedLocation.confirmed || !confirmedLocation.coordinates || !confirmedLocation.confirmedAt || !confirmedLocation.confirmingUserId
      ? 'blocked_missing_confirmed_location'
      : 'ready_to_finalize';
  const exportCheck = canExportRecoveryPacket({
    packetId: input.packetId ?? `recovery-packet-${createdAt}`,
    maturityLabel: 'Current user-facing/internal beta',
    state,
    incidentType: input.incidentType,
    incidentNotes: input.incidentNotes,
    confirmedLocation,
    sections,
    shareActions: [],
    createdAt,
    updatedAt,
    warnings: [],
  });
  const shareActions = buildShareActions(
    exportCheck.canExport,
    input.networkShareAvailable,
    exportCheck.reasons[0],
  );
  sections.push(buildShareSection(shareActions));

  const warnings = Array.from(new Set([
    'Data may include stale or cached fields.',
    ...(input.garminInreachReviewSignals?.length ? ['Garmin/inReach signals are review context only.'] : []),
    ...sections.flatMap((section) => section.warnings ?? []),
  ]));

  return {
    packetId: input.packetId ?? `recovery-packet-${createdAt}`,
    maturityLabel: 'Current user-facing/internal beta',
    state,
    incidentType: input.incidentType,
    incidentNotes: input.incidentNotes,
    confirmedLocation,
    activeRoute: input.activeRoute,
    vehicleProfile: input.vehicleProfile,
    recoveryGear: input.recoveryGear,
    teamRoster: input.teamRoster,
    lastKnownCommsStatus: input.lastKnownCommsStatus,
    offlineAvailability: input.offlineAvailability,
    weatherFreshness: input.weatherFreshness,
    nearbyBailoutCandidates: input.nearbyBailoutCandidates,
    garminInreachReviewSignals: input.garminInreachReviewSignals,
    sections,
    shareActions,
    createdAt,
    updatedAt,
    warnings,
  };
}

export function canFinalizeRecoveryPacket(draft: RecoveryPacketDraft): {
  canFinalize: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (!draft.incidentType) reasons.push('manual incident type is required');
  return { canFinalize: reasons.length === 0, reasons };
}

export function canExportRecoveryPacket(draft: RecoveryPacketDraft): {
  canExport: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (!draft.incidentType) reasons.push('manual incident type is required');
  if (!draft.confirmedLocation.confirmed) reasons.push('coordinates must be user-confirmed before export');
  if (!draft.confirmedLocation.coordinates) reasons.push('confirmed coordinates are required');
  if (!draft.confirmedLocation.confirmedAt) reasons.push('coordinate confirmation timestamp is required');
  if (!draft.confirmedLocation.confirmingUserId) reasons.push('confirming user is required');
  if (draft.confirmedLocation.coordinates) {
    const validation = validateRecoveryPacketCoordinates(draft.confirmedLocation.coordinates);
    if (!validation.valid) reasons.push(...validation.reasons);
  }
  return { canExport: reasons.length === 0, reasons };
}

export function buildRecoveryPacketExport(
  draft: RecoveryPacketDraft,
  exportContext: { exportedByUserId: string; exportedAt: string },
): RecoveryPacketExport {
  const exportCheck = canExportRecoveryPacket(draft);
  if (!exportCheck.canExport) {
    throw new Error(`Recovery packet export blocked: ${exportCheck.reasons.join('; ')}`);
  }
  return {
    packetId: draft.packetId,
    exportedAt: exportContext.exportedAt,
    exportedByUserId: exportContext.exportedByUserId,
    coordinateConfirmedAt: draft.confirmedLocation.confirmedAt as string,
    incidentType: draft.incidentType as RecoveryPacketIncidentType,
    sections: draft.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => ({ ...field, source: { ...field.source } })),
      warnings: section.warnings ? [...section.warnings] : undefined,
    })),
    safetyLabels: [...RECOVERY_PACKET_SAFETY_LABELS],
  };
}

export function recoveryPacketExportToText(exported: RecoveryPacketExport): string {
  const lines = [
    'ECS recovery packet',
    `Packet ID: ${exported.packetId}`,
    `Exported: ${exported.exportedAt}`,
    `Coordinate confirmation: ${exported.coordinateConfirmedAt}`,
    ...exported.safetyLabels.map((label) => `Safety label: ${label}`),
    '',
  ];
  for (const section of exported.sections) {
    lines.push(`[${section.title}]`);
    for (const field of section.fields) {
      lines.push(`${field.label}: ${field.value ?? 'Unavailable'} (${field.freshness}; ${field.source.sourceName ?? field.source.sourceKind})`);
    }
    for (const warning of section.warnings ?? []) {
      lines.push(`Note: ${warning}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}
