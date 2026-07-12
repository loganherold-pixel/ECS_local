import type {
  SourceTruthConfidence,
  SourceTruthPolicyKey,
  SourceTruthRef,
} from '../sourceTruth';

export type TripLearningMetric =
  | 'drive_time'
  | 'fuel_consumption'
  | 'power_runtime'
  | 'camp_arrival';

export type TripLearningValueUnit =
  | 'seconds'
  | 'gallons'
  | 'hours'
  | 'epoch_minutes';

export type ForecastActualQualityFlag =
  | 'incomplete'
  | 'mocked'
  | 'simulated'
  | 'corrupted'
  | 'materially_stale'
  | 'manual_unverified';

export type ForecastActualMeasurement = {
  value: number;
  unit: TripLearningValueUnit;
  observedAt: string;
  sourceTruth: SourceTruthRef;
  freshnessPolicyKey: SourceTruthPolicyKey;
};

/**
 * Redacted forecast-versus-actual input. This contract intentionally has no
 * coordinate, route geometry, free-form note, or raw payload field.
 */
export type ForecastActualRecord = {
  schemaVersion: 'ecs.trip-learning.forecast-actual.v1';
  id: string;
  tripId: string;
  expeditionId: string | null;
  vehicleId: string | null;
  routeClass: string | null;
  terrainClass: string | null;
  metric: TripLearningMetric;
  forecast: ForecastActualMeasurement;
  actual: ForecastActualMeasurement;
  tripStartedAt: string;
  tripEndedAt: string;
  createdAt: string;
  qualityFlags: ForecastActualQualityFlag[];
};

export type TripSampleRejectionCode =
  | 'invalid_record'
  | 'incomplete'
  | 'mocked_or_simulated'
  | 'corrupted'
  | 'duplicate'
  | 'invalid_value'
  | 'unit_mismatch'
  | 'actual_confidence_not_high'
  | 'actual_coverage_incomplete'
  | 'actual_unavailable'
  | 'actual_conflict'
  | 'actual_timestamp_invalid'
  | 'actual_timestamp_stale_at_capture'
  | 'manual_actual_unverified';

export type TripSampleRejection = {
  recordId: string;
  code: TripSampleRejectionCode;
  reason: string;
};

export type QualifiedTripSample = {
  schemaVersion: 'ecs.trip-learning.qualified-sample.v1';
  id: string;
  fingerprint: string;
  recordId: string;
  tripId: string;
  expeditionId: string | null;
  vehicleId: string | null;
  routeClass: string | null;
  terrainClass: string | null;
  metric: TripLearningMetric;
  unit: TripLearningValueUnit;
  forecastValue: number;
  actualValue: number;
  error: number;
  absoluteError: number;
  relativeError: number | null;
  occurredAt: string;
  confidence: 'high';
  forecastSourceTruth: SourceTruthRef;
  actualSourceTruth: SourceTruthRef;
  forecastFreshnessPolicyKey: SourceTruthPolicyKey;
  actualFreshnessPolicyKey: SourceTruthPolicyKey;
};

export type TripSampleQualificationResult = {
  accepted: QualifiedTripSample[];
  rejected: TripSampleRejection[];
};

export type CalibrationConfidence = SourceTruthConfidence;

export type CalibrationAdjustmentKind =
  | 'drive_time_multiplier'
  | 'fuel_consumption_multiplier'
  | 'power_runtime_multiplier'
  | 'camp_arrival_offset_minutes';

export type CalibrationProposalStatus =
  | 'pending'
  | 'applied'
  | 'dismissed'
  | 'reverted';

export type CalibrationProposal = {
  schemaVersion: 'ecs.trip-learning.calibration-proposal.v1';
  id: string;
  metric: TripLearningMetric;
  scopeKey: string;
  vehicleId: string | null;
  terrainClass: string | null;
  adjustmentKind: CalibrationAdjustmentKind;
  currentValue: number;
  proposedValue: number;
  sampleCount: number;
  meanError: number;
  meanRelativeError: number | null;
  variance: number;
  standardDeviation: number;
  confidence: CalibrationConfidence;
  dataPeriodStart: string;
  dataPeriodEnd: string;
  sourceTripIds: string[];
  sourceTruth: SourceTruthRef;
  warnings: string[];
  canApply: boolean;
  requiresExplicitConfirmation: true;
  reversible: true;
  status: CalibrationProposalStatus;
  createdAt: string;
  updatedAt: string;
  appliedAt: string | null;
  dismissedAt: string | null;
  revertedAt: string | null;
};

export type CalibrationAnalysisStatus =
  | 'ready'
  | 'insufficient_samples'
  | 'no_material_change'
  | 'high_variance';

export type CalibrationAnalysis = {
  status: CalibrationAnalysisStatus;
  metric: TripLearningMetric;
  scopeKey: string;
  sampleCount: number;
  requiredSampleCount: number;
  proposal: CalibrationProposal | null;
  reason: string;
};

export type TripCalibrationOverlay = {
  key: string;
  proposalId: string;
  metric: TripLearningMetric;
  scopeKey: string;
  adjustmentKind: CalibrationAdjustmentKind;
  value: number;
  previousValue: number;
  appliedAt: string;
};

export type CalibrationApplication = {
  id: string;
  proposalId: string;
  overlayKey: string;
  previousValue: number;
  appliedValue: number;
  appliedAt: string;
  revertedAt: string | null;
  status: 'active' | 'reverted';
};

export type TripExposureKind =
  | 'technical_terrain'
  | 'high_coolant_temperature'
  | 'low_battery_voltage'
  | 'high_attitude'
  | 'recovery_use'
  | 'load_shift'
  | 'incident_exposure'
  | 'tire_pressure_excursion';

export type TripExposureObservation = {
  id: string;
  tripId: string;
  expeditionId: string | null;
  kind: TripExposureKind;
  observedAt: string;
  value: number | null;
  unit: string | null;
  comparisonBaseline: number | null;
  severity: 'watch' | 'high';
  verified: boolean;
  evidenceLabel: string;
  sourceTruth: SourceTruthRef;
  freshnessPolicyKey: SourceTruthPolicyKey;
  qualityFlags: ForecastActualQualityFlag[];
};

export type PostTripInspectionCategory =
  | 'tires_and_wheels'
  | 'load_security'
  | 'recovery_equipment'
  | 'fluids_and_cooling'
  | 'battery_and_power'
  | 'vehicle_and_equipment';

export type PostTripInspectionEvidence = {
  observationId: string;
  observedAt: string;
  label: string;
  value: number | null;
  unit: string | null;
  sourceTruth: SourceTruthRef;
  freshnessPolicyKey: SourceTruthPolicyKey;
};

export type PostTripInspectionPrompt = {
  schemaVersion: 'ecs.trip-learning.inspection-prompt.v1';
  id: string;
  tripId: string;
  expeditionId: string | null;
  category: PostTripInspectionCategory;
  title: string;
  instruction: string;
  rationale: string;
  confidence: CalibrationConfidence;
  sourceTruth: SourceTruthRef;
  evidence: PostTripInspectionEvidence[];
  status: 'open' | 'dismissed' | 'completed';
  createdAt: string;
  updatedAt: string;
};

export type TripLearningPreferences = {
  schemaVersion: 'ecs.trip-learning.preferences.v1';
  enabled: boolean;
  calibrationProposalsEnabled: boolean;
  inspectionPromptsEnabled: boolean;
  localOnly: true;
  cloudSyncEnabled: false;
  updatedAt: string;
};

export type TripLearningForecastBaselineEntry = {
  metric: TripLearningMetric;
  value: number;
  unit: TripLearningValueUnit;
  sourceTruth: SourceTruthRef;
  freshnessPolicyKey: SourceTruthPolicyKey;
};

export type TripLearningForecastBaseline = {
  schemaVersion: 'ecs.trip-learning.forecast-baseline.v1';
  id: string;
  tripId: string;
  expeditionId: string | null;
  vehicleId: string | null;
  routeClass: string | null;
  terrainClass: string | null;
  routeIntelligenceId: string | null;
  forecastRouteMiles: number | null;
  capturedAt: string;
  entries: TripLearningForecastBaselineEntry[];
};

export type TripLearningSummary = {
  tripId: string;
  sampleCount: number;
  proposals: CalibrationProposal[];
  inspectionPrompts: PostTripInspectionPrompt[];
  activeOverlays: TripCalibrationOverlay[];
};
