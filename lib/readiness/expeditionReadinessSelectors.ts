import { useSyncExternalStore } from 'react';
import type {
  ExpeditionReadinessAssessment,
  ExpeditionReadinessCategory,
  ExpeditionReadinessCategoryId,
  ExpeditionDepartureAuditItem,
  ExpeditionReadinessStatus,
  ExpeditionTripIntent,
  ExpeditionTripIntentSource,
} from './expeditionReadinessTypes';
import type { ExpeditionReadinessPreferences } from './expeditionReadinessPreferences';
import { getTripIntentLabel } from './expeditionReadinessCalibration';
import { getTopReadinessConcerns } from './expeditionReadinessScoring';
import {
  getReadinessColorToken,
  getReadinessDecisionLabel,
  getReadinessShortCopy,
} from './expeditionReadinessCopy';
import {
  expeditionReadinessStore,
  type ExpeditionReadinessStoreState,
} from './expeditionReadinessStore';
import type { ExpeditionReadinessAlert } from './expeditionReadinessAlerts';
import {
  buildDispatchReadinessContext,
  type DispatchReadinessContext,
} from './dispatchReadinessAdapter';

export type ExpeditionReadinessDecision = {
  status: ExpeditionReadinessStatus;
  label: string;
  score: number;
  confidence: ExpeditionReadinessAssessment['confidence'];
  colorToken: string;
  copy: string;
  updatedAt: string;
};

export type ExpeditionTripIntentSelection = {
  intent: ExpeditionTripIntent;
  source: ExpeditionTripIntentSource;
  label: string;
  isInferred: boolean;
};

export type ExpeditionReadinessStartDecision = {
  canStart: boolean;
  status: ExpeditionReadinessStatus;
  reason: string;
  blockers: ExpeditionReadinessAssessment['blockers'];
  warnings: ExpeditionReadinessAssessment['warnings'];
};

export type ExpeditionReadinessBriefPayload = {
  status: ExpeditionReadinessStatus;
  label: string;
  score: number;
  confidence: ExpeditionReadinessAssessment['confidence'];
  explanation: string;
  concerns: ExpeditionReadinessCategory[];
  blockers: ExpeditionReadinessAssessment['blockers'];
  warnings: ExpeditionReadinessAssessment['warnings'];
  recommendations: string[];
  departureAudit: ExpeditionDepartureAuditItem[];
  sourceFreshness: ExpeditionReadinessAssessment['sourceFreshness'];
  updatedAt: string;
  isUsingDemoData: boolean;
  tripIntent: ExpeditionTripIntentSelection;
  readinessPreferences: ExpeditionReadinessPreferences;
  preferenceEffects: ExpeditionReadinessAssessment['preferenceEffects'];
};

export function selectReadinessCategory(
  assessment: ExpeditionReadinessAssessment,
  id: ExpeditionReadinessCategoryId,
): ExpeditionReadinessCategory | null {
  return assessment.categories.find((category) => category.id === id) ?? null;
}

export function selectReadinessBlockers(assessment: ExpeditionReadinessAssessment) {
  return assessment.blockers;
}

export function selectReadinessWarnings(assessment: ExpeditionReadinessAssessment) {
  return assessment.warnings;
}

export function selectTopReadinessConcerns(
  assessment: ExpeditionReadinessAssessment,
  limit = 3,
): ExpeditionReadinessCategory[] {
  return getTopReadinessConcerns(assessment, limit);
}

export function selectReadinessHasSyntheticData(assessment: ExpeditionReadinessAssessment): boolean {
  return assessment.dataIntegrity.usesDemoData || assessment.dataIntegrity.usesMockData;
}

export function selectReadinessMissingInputs(assessment: ExpeditionReadinessAssessment): string[] {
  return [...new Set(assessment.categories.flatMap((category) => category.missingInputs))];
}

export function selectTripIntent(
  assessment: ExpeditionReadinessAssessment | null = selectCurrentExpeditionReadiness(),
): ExpeditionTripIntentSelection {
  const state = expeditionReadinessStore.getSnapshot();
  const intent = assessment?.tripIntent ?? state.tripIntent ?? 'unknown';
  const source = assessment?.tripIntentSource ?? state.tripIntentSource ?? 'unknown';
  return {
    intent,
    source,
    label: getTripIntentLabel(intent),
    isInferred: source === 'ecs_inferred',
  };
}

export function selectDepartureAudit(
  assessment: ExpeditionReadinessAssessment | null = selectCurrentExpeditionReadiness(),
): ExpeditionDepartureAuditItem[] {
  return assessment?.departureAudit ?? [];
}

export function selectExpeditionReadinessState(): ExpeditionReadinessStoreState {
  return expeditionReadinessStore.getSnapshot();
}

export function selectCurrentExpeditionReadiness(): ExpeditionReadinessAssessment | null {
  return expeditionReadinessStore.getSnapshot().currentAssessment;
}

export function selectReadinessDecision(
  assessment: ExpeditionReadinessAssessment | null = selectCurrentExpeditionReadiness(),
): ExpeditionReadinessDecision | null {
  if (!assessment) return null;
  return {
    status: assessment.status,
    label: getReadinessDecisionLabel(assessment.status),
    score: assessment.overallScore,
    confidence: assessment.confidence,
    colorToken: getReadinessColorToken(assessment.status),
    copy: getReadinessShortCopy(assessment),
    updatedAt: assessment.updatedAt,
  };
}

export function selectCanStartExpedition(
  assessment: ExpeditionReadinessAssessment | null = selectCurrentExpeditionReadiness(),
): ExpeditionReadinessStartDecision {
  if (!assessment) {
    return {
      canStart: false,
      status: 'hold',
      reason: 'Readiness has not been assessed yet.',
      blockers: [],
      warnings: [],
    };
  }

  if (assessment.status === 'hold') {
    return {
      canStart: false,
      status: assessment.status,
      reason: assessment.blockers[0]?.detail ?? assessment.explanation,
      blockers: assessment.blockers,
      warnings: assessment.warnings,
    };
  }

  if (assessment.confidence === 'low') {
    return {
      canStart: false,
      status: assessment.status,
      reason: 'Readiness confidence is low because critical inputs are stale or missing.',
      blockers: assessment.blockers,
      warnings: assessment.warnings,
    };
  }

  return {
    canStart: true,
    status: assessment.status,
    reason: assessment.status === 'ready'
      ? 'No readiness blockers are present.'
      : 'Start is possible with caution-level items still visible.',
    blockers: assessment.blockers,
    warnings: assessment.warnings,
  };
}

export function selectReadinessBriefPayload(
  assessment: ExpeditionReadinessAssessment | null = selectCurrentExpeditionReadiness(),
  concernLimit = 4,
): ExpeditionReadinessBriefPayload | null {
  if (!assessment) return null;
  return {
    status: assessment.status,
    label: getReadinessDecisionLabel(assessment.status),
    score: assessment.overallScore,
    confidence: assessment.confidence,
    explanation: assessment.explanation,
    concerns: getTopReadinessConcerns(assessment, concernLimit),
    blockers: assessment.blockers,
    warnings: assessment.warnings,
    recommendations: assessment.recommendations,
    departureAudit: assessment.departureAudit,
    sourceFreshness: assessment.sourceFreshness,
    updatedAt: assessment.updatedAt,
    isUsingDemoData: assessment.dataIntegrity.usesDemoData || assessment.dataIntegrity.usesMockData,
    tripIntent: selectTripIntent(assessment),
    readinessPreferences: assessment.readinessPreferences,
    preferenceEffects: assessment.preferenceEffects,
  };
}

export function selectDispatchReadinessContext(
  assessment: ExpeditionReadinessAssessment | null = selectCurrentExpeditionReadiness(),
): DispatchReadinessContext {
  const storeState = expeditionReadinessStore.getSnapshot();
  return buildDispatchReadinessContext(assessment, {
    activeRouteId: storeState.activeRouteId,
    activeTripId: storeState.activeTripId,
  });
}

export function selectActiveReadinessAlert(): ExpeditionReadinessAlert | null {
  return expeditionReadinessStore.getSnapshot().activeReadinessAlert;
}

export function selectReadinessAlertHistory(): ExpeditionReadinessAlert[] {
  return expeditionReadinessStore.getSnapshot().readinessAlertHistory;
}

export function useExpeditionReadinessState(): ExpeditionReadinessStoreState {
  return useSyncExternalStore(
    expeditionReadinessStore.subscribe,
    expeditionReadinessStore.getSnapshot,
    expeditionReadinessStore.getSnapshot,
  );
}

export function useCurrentExpeditionReadiness(): ExpeditionReadinessAssessment | null {
  return useExpeditionReadinessState().currentAssessment;
}

export function useReadinessCategory(id: ExpeditionReadinessCategoryId): ExpeditionReadinessCategory | null {
  const assessment = useCurrentExpeditionReadiness();
  return assessment ? selectReadinessCategory(assessment, id) : null;
}

export function useReadinessConcerns(limit = 3): ExpeditionReadinessCategory[] {
  const assessment = useCurrentExpeditionReadiness();
  return assessment ? getTopReadinessConcerns(assessment, limit) : [];
}

export function useReadinessDecision(): ExpeditionReadinessDecision | null {
  const assessment = useCurrentExpeditionReadiness();
  return selectReadinessDecision(assessment);
}

export function useTripIntent(): ExpeditionTripIntentSelection {
  const assessment = useCurrentExpeditionReadiness();
  return selectTripIntent(assessment);
}

export function useCanStartExpedition(): ExpeditionReadinessStartDecision {
  const assessment = useCurrentExpeditionReadiness();
  return selectCanStartExpedition(assessment);
}

export function useReadinessBriefPayload(concernLimit = 4): ExpeditionReadinessBriefPayload | null {
  const assessment = useCurrentExpeditionReadiness();
  return selectReadinessBriefPayload(assessment, concernLimit);
}

export function useDepartureAudit(): ExpeditionDepartureAuditItem[] {
  const assessment = useCurrentExpeditionReadiness();
  return selectDepartureAudit(assessment);
}

export function useDispatchReadinessContext(): DispatchReadinessContext {
  const state = useExpeditionReadinessState();
  return buildDispatchReadinessContext(state.currentAssessment, {
    activeRouteId: state.activeRouteId,
    activeTripId: state.activeTripId,
  });
}

export function useActiveReadinessAlert(): ExpeditionReadinessAlert | null {
  return useExpeditionReadinessState().activeReadinessAlert;
}

export function useReadinessAlertHistory(): ExpeditionReadinessAlert[] {
  return useExpeditionReadinessState().readinessAlertHistory;
}
