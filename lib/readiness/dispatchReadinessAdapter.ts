import type {
  ExpeditionReadinessAssessment,
  ExpeditionReadinessCategory,
  ExpeditionReadinessStatus,
} from './expeditionReadinessTypes';
import { getTopReadinessConcerns } from './expeditionReadinessScoring';
import { getReadinessDecisionLabel } from './expeditionReadinessCopy';
import { expeditionReadinessStore } from './expeditionReadinessStore';

export type DispatchReadinessRiskFactor = {
  id: string;
  label: string;
  summary: string;
  status: ExpeditionReadinessStatus;
  confidence: ExpeditionReadinessCategory['confidence'];
};

export type DispatchReadinessContext = {
  hasActiveAssessment: boolean;
  status: ExpeditionReadinessStatus;
  statusLabel: string;
  score: number;
  confidence: ExpeditionReadinessAssessment['confidence'];
  updatedAt: string | null;
  activeRouteId: string | null;
  activeTripId: string | null;
  activeRouteLabel: string | null;
  currentCoordinates: ExpeditionReadinessAssessment['recoveryBrief']['currentCoordinates'];
  topRiskFactors: DispatchReadinessRiskFactor[];
  emergencyPacketStatus: ExpeditionReadinessAssessment['recoveryBrief']['emergencyCoordinatePacketStatus'];
  emergencyPacketSummary: string;
  recoverySummary: string;
  communicationsSummary: string;
  isUsingDemoData: boolean;
};

export function buildDispatchReadinessContext(
  assessment: ExpeditionReadinessAssessment | null,
  options: {
    activeRouteId?: string | null;
    activeTripId?: string | null;
  } = {},
): DispatchReadinessContext {
  if (!assessment) {
    return {
      hasActiveAssessment: false,
      status: 'hold',
      statusLabel: 'Hold',
      score: 0,
      confidence: 'low',
      updatedAt: null,
      activeRouteId: options.activeRouteId ?? null,
      activeTripId: options.activeTripId ?? null,
      activeRouteLabel: null,
      currentCoordinates: null,
      topRiskFactors: [],
      emergencyPacketStatus: 'unavailable',
      emergencyPacketSummary: 'Readiness context is unavailable. Dispatch can still create local reports, but trip risk factors are not attached.',
      recoverySummary: 'Recovery and bailout context is unavailable.',
      communicationsSummary: 'Communications confidence is unavailable.',
      isUsingDemoData: false,
    };
  }

  return {
    hasActiveAssessment: true,
    status: assessment.status,
    statusLabel: getReadinessDecisionLabel(assessment.status),
    score: assessment.overallScore,
    confidence: assessment.confidence,
    updatedAt: assessment.updatedAt,
    activeRouteId: options.activeRouteId ?? null,
    activeTripId: options.activeTripId ?? null,
    activeRouteLabel: assessment.recoveryBrief.activeRouteLabel,
    currentCoordinates: assessment.recoveryBrief.currentCoordinates,
    topRiskFactors: getTopReadinessConcerns(assessment, 4).map((category) => ({
      id: category.id,
      label: category.label,
      summary: category.summary,
      status: category.status,
      confidence: category.confidence,
    })),
    emergencyPacketStatus: assessment.recoveryBrief.emergencyCoordinatePacketStatus,
    emergencyPacketSummary: assessment.recoveryBrief.emergencyCoordinatePacketSummary,
    recoverySummary: assessment.recoveryBrief.nearestBailoutSummary,
    communicationsSummary: assessment.recoveryBrief.communicationsSummary,
    isUsingDemoData: assessment.dataIntegrity.usesDemoData || assessment.dataIntegrity.usesMockData,
  };
}

export function getDispatchReadinessContextSnapshot(
  assessment: ExpeditionReadinessAssessment | null = expeditionReadinessStore.getSnapshot().currentAssessment,
): DispatchReadinessContext {
  const state = expeditionReadinessStore.getSnapshot();
  return buildDispatchReadinessContext(assessment, {
    activeRouteId: state.activeRouteId,
    activeTripId: state.activeTripId,
  });
}
