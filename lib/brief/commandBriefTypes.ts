import type {
  ExpeditionReadinessAssessment,
  ExpeditionReadinessVehicleInput,
} from '../readiness/expeditionReadinessTypes';

export type CommandBriefPacketFormat = 'markdown' | 'text';

export type CommandBriefExportAction = 'copy' | 'share' | 'save';

export type CommandBriefExportContext = {
  assessment: ExpeditionReadinessAssessment | null;
  tripName?: string | null;
  routeName?: string | null;
  routeSummary?: string | null;
  activeVehicle?: ExpeditionReadinessVehicleInput | null;
  activeTripId?: string | null;
  activeRouteId?: string | null;
  generatedAt?: string | null;
};

export type CommandBriefPacketOptions = {
  format?: CommandBriefPacketFormat;
  generatedAt?: string | null;
};

export type CommandBriefPacket = {
  title: string;
  filename: string;
  mimeType: 'text/markdown' | 'text/plain';
  format: CommandBriefPacketFormat;
  generatedAt: string;
  body: string;
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
