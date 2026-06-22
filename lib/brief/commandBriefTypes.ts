import type {
  ExpeditionReadinessAssessment,
  ExpeditionReadinessVehicleInput,
} from '../readiness/expeditionReadinessTypes';
import type { WeakPointAssessment } from '../readiness/expeditionWeakPointAnalyzer';

export type CommandBriefPacketFormat = 'pdf';

export type CommandBriefExportAction = 'copy' | 'share' | 'save';

export type ECSCommandBriefPacketStatus = 'draft' | 'active' | 'exported' | 'stale';

export type ECSCommandBriefPacketSource = 'active_guidance' | 'planned_trip' | 'convoy' | 'manual';

export type ECSCommandBriefCoordinate = {
  label: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  source?: string | null;
};

export type ECSCommandBriefContact = {
  name: string;
  role?: string | null;
  notes?: string | null;
};

export type ECSCommandBriefPacket = {
  packetMetadata: {
    packetId: string;
    generatedAt: string;
    generatedByDevice: string;
    appVersionBuild: string | null;
    packetStatus: ECSCommandBriefPacketStatus;
    source: ECSCommandBriefPacketSource;
    packetLabel: 'Active Guidance Packet' | 'Planned Trip Packet' | 'Convoy Packet' | 'Manual Packet';
  };
  readinessSummary: {
    decision: 'GO' | 'CAUTION' | 'HOLD' | 'UNKNOWN';
    score: number | null;
    confidence: ExpeditionReadinessAssessment['confidence'] | 'unknown';
    topBlockers: string[];
    topWarnings: string[];
    recommendedOperatorActions: string[];
    freshnessSummary: string[];
  };
  routeGuidanceSummary: {
    routeName: string | null;
    routeId: string | null;
    tripId: string | null;
    catalogSource: string | null;
    geometryStatus: string | null;
    guidanceReady: boolean | null;
    startPoint: ECSCommandBriefCoordinate | null;
    destinationPoint: ECSCommandBriefCoordinate | null;
    plannedDepartureTime: string | null;
    estimatedTrailEntryTime: string | null;
    estimatedReturnTime: string | null;
    totalPlannedDistance: string | null;
    pavedApproachDistance: string | null;
    trailDistance: string | null;
    currentProgressPercent: number | null;
    remainingDistance: string | null;
    remainingDuration: string | null;
    etaIso: string | null;
    routeDataRefreshedAt: string | null;
    bailoutPoints: string[];
    campBackupEndpoints: string[];
    summary: string | null;
  };
  mapSection: {
    overviewImageUri: string | null;
    polylineSnapshot: string | null;
    trailheadMarker: ECSCommandBriefCoordinate | null;
    endpointMarker: ECSCommandBriefCoordinate | null;
    bailoutCampMarkers: ECSCommandBriefCoordinate[];
    fallbackText: string;
  };
  coordinatesSection: {
    currentGps: ECSCommandBriefCoordinate | null;
    trailhead: ECSCommandBriefCoordinate | null;
    endpoint: ECSCommandBriefCoordinate | null;
    majorWaypoints: ECSCommandBriefCoordinate[];
    emergencyCoordinateLine: string | null;
  };
  vehicleSection: {
    profileName: string | null;
    yearMakeModel: string | null;
    licensePlate: string | null;
    tireSize: string | null;
    spareStatus: string | null;
    fuelRange: string | null;
    batteryPower: string | null;
    payloadLoadoutWarnings: string[];
    summary: string | null;
  };
  recoverySafetySection: {
    recoveryGearSummary: string | null;
    spareTireStatus: string | null;
    commsDevices: string | null;
    firstAidEmergencyGear: string | null;
    knownRisks: string[];
    difficulty: string | null;
  };
  weatherEnvironmentSection: {
    weatherSnapshot: string | null;
    fetchedAt: string | null;
    freshnessLabel: string | null;
    alerts: string[];
    daylightSunset: string | null;
    fireSmokeAqi: string | null;
  };
  convoySection: {
    convoyName: string | null;
    memberCount: number | null;
    plannedRegroupPoints: string[];
    checkInSchedule: string | null;
    checkInStatus: string | null;
  };
  emergencyContactSection: {
    selectedContacts: ECSCommandBriefContact[];
    optionalNotes: string | null;
    checkInExpectations: string | null;
    overdueInstructions: string | null;
  };
  freshnessProvenance: {
    packetGeneratedAt: string;
    routeDataRefreshedAt: string | null;
    weatherSnapshotFetchedAt: string | null;
    offlinePacketRefreshedAt: string | null;
    vehicleTelemetryRefreshedAt: string | null;
  };
  limitations: string[];
};

export type CommandBriefExportContext = {
  assessment: ExpeditionReadinessAssessment | null;
  tripName?: string | null;
  routeName?: string | null;
  routeSummary?: string | null;
  packetSource?: ECSCommandBriefPacketSource | null;
  packetStatus?: ECSCommandBriefPacketStatus | null;
  generatedByDevice?: string | null;
  appVersionBuild?: string | null;
  routeCatalogSource?: string | null;
  routeGeometryStatus?: string | null;
  guidanceReady?: boolean | null;
  startPoint?: ECSCommandBriefCoordinate | null;
  destinationPoint?: ECSCommandBriefCoordinate | null;
  plannedDepartureTime?: string | null;
  estimatedTrailEntryTime?: string | null;
  estimatedReturnTime?: string | null;
  totalPlannedDistance?: string | null;
  pavedApproachDistance?: string | null;
  trailDistance?: string | null;
  routeOverviewImageUri?: string | null;
  routePolylineSnapshot?: string | null;
  currentGps?: ECSCommandBriefCoordinate | null;
  currentProgressPercent?: number | null;
  remainingDistance?: string | null;
  remainingDuration?: string | null;
  etaIso?: string | null;
  routeDataRefreshedAt?: string | null;
  weatherSnapshotFetchedAt?: string | null;
  offlinePacketRefreshedAt?: string | null;
  vehicleTelemetryRefreshedAt?: string | null;
  bailoutPoints?: string[] | null;
  campBackupEndpoints?: string[] | null;
  majorWaypoints?: ECSCommandBriefCoordinate[] | null;
  emergencyContacts?: ECSCommandBriefContact[] | null;
  familyNotes?: string | null;
  checkInExpectations?: string | null;
  overdueInstructions?: string | null;
  convoyName?: string | null;
  convoyMemberCount?: number | null;
  plannedRegroupPoints?: string[] | null;
  checkInSchedule?: string | null;
  checkInStatus?: string | null;
  activeVehicle?: ExpeditionReadinessVehicleInput | null;
  activeTripId?: string | null;
  activeRouteId?: string | null;
  weakPointAssessment?: WeakPointAssessment | null;
  generatedAt?: string | null;
};

export type CommandBriefPacketOptions = {
  format?: CommandBriefPacketFormat;
  generatedAt?: string | null;
};

export type CommandBriefPacket = {
  title: string;
  filename: string;
  mimeType: 'application/pdf';
  format: CommandBriefPacketFormat;
  generatedAt: string;
  body: string;
  copyBody: string;
  html: string;
  data: ECSCommandBriefPacket;
};

export type CommandBriefPdfArtifact = {
  fileUri: string;
  filename: string;
  createdAt: string;
  byteSize: number | null;
  packetId: string;
  mimeType: 'application/pdf';
  base64?: string | null;
};

export type CommandBriefExportResult = {
  ok: boolean;
  action: CommandBriefExportAction;
  message: string;
  packet?: CommandBriefPacket;
  uri?: string;
  savedLocation?: string;
  unavailableReason?: string;
};
