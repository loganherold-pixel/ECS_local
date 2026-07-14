export type {
  ExpeditionBadge,
  ExpeditionBadgeCategory,
  ExpeditionBadgeDefinition,
  ExpeditionBadgeRarity,
  ExpeditionInsight,
  ExpeditionInsightType,
  ExpeditionRecap,
  ExpeditionRecapElevationChange,
  ExpeditionRecapLocationSummary,
  ExpeditionRecapNotableMoment,
  ExpeditionRecapSteepGradeSegment,
  ExpeditionRecapTemperatureRange,
  ExpeditionRecapTerrainRiskEvent,
  ExpeditionReport,
  ExpeditionReportExportFormat,
  ExpeditionReportExportStatus,
  ExpeditionTripBounds,
  ExpeditionTripCoordinate,
  ExpeditionTripCreateInput,
  ExpeditionTripDataQuality,
  ExpeditionTripDeviation,
  ExpeditionTripFinalizeInput,
  ExpeditionTripGeneratedSummary,
  ExpeditionTripGuidanceSnapshot,
  ExpeditionTripGuidanceSource,
  ExpeditionTripNotableMoment,
  ExpeditionTripRecord,
  ExpeditionTripSourceLabel,
  ExpeditionTripStatsUpdateInput,
  ExpeditionTripStatus,
  ExpeditionTripSummary,
  ExpeditionTripTerrainRiskSnapshot,
  ExpeditionTripViewedEntity,
  ExpeditionTripWeatherSnapshot,
  PersonalExpeditionRecord,
  PersonalExpeditionRecordType,
  PersonalExpeditionRecordUnit,
} from './expeditionTripRecordTypes';

export {
  EXPEDITION_BADGE_DEFINITIONS,
  getBadgeDefinition,
  getVisibleBadgeDefinitions,
} from './expeditionBadgeRegistry';

export {
  buildExpeditionBadgeCatalogPresentation,
  getExpeditionBadgeCatalogEntry,
  getExpeditionBadgeCatalogForUser,
} from './expeditionBadgeCatalog';

export type {
  ExpeditionBadgeCatalogEntry,
  ExpeditionBadgeCatalogPresentationEntry,
} from './expeditionBadgeCatalog';

export {
  BADGE_IDENTITY_CATEGORIES,
  BADGE_IDENTITY_DEFERRED_SIGNALS,
  BADGE_IDENTITY_MVP_BADGE_MAPPING,
  BADGE_IDENTITY_PRODUCTION_GUARDS,
  BADGE_IDENTITY_SAFE_SIGNALS,
  BADGE_IDENTITY_SOURCE_OF_TRUTH,
  BADGE_IDENTITY_TITLE_TIERS,
  BADGE_IDENTITY_UI_SURFACES,
  buildBadgeIdentityProfileModel,
  deriveExpeditionIdentityTitle,
  isBadgeIdentitySignalDeferred,
  isBadgeIdentitySignalSafe,
} from './badgeExpeditionIdentityReadiness';

export type {
  BadgeIdentityCategoryRecommendation,
  BadgeIdentityMvpSignalId,
  BadgeIdentitySignal,
  BadgeIdentitySignalStatus,
  BadgeIdentityProfileBadgeInput,
  BadgeIdentityProfileModel,
  BadgeIdentityTitle,
  BadgeIdentityTitleInput,
  BadgeIdentityTitleResult,
  BadgeIdentityTitleTier,
} from './badgeExpeditionIdentityReadiness';

export {
  materializeCompletedGuidanceSummary,
} from './completedGuidanceSummaryMaterializer';

export type {
  CompletedGuidanceSummaryMaterializerInput,
  CompletedGuidanceSummaryMaterializerResult,
} from './completedGuidanceSummaryMaterializer';

export {
  clearAllBadgesForTests,
  evaluateBadgesForCompletedTrip,
  getBadgeProgress,
  getBadgesForTrip,
  getRecentBadgeUnlocks,
  getUnlockedBadges,
  hasBadge,
  recordBadgeIdentitySafeSignal,
} from './expeditionBadgeStore';

export type {
  BadgeIdentitySafeSignalInput,
} from './expeditionBadgeStore';

export {
  BADGE_UNLOCK_EVENT_SCHEMA_VERSION,
  BADGE_UNLOCK_PRESENTATION_SCHEMA_VERSION,
  buildBadgeUnlockEvents,
  getBadgeUnlockPresentationModel,
  planBadgeUnlockPresentations,
} from './badgeUnlockPresentation';

export type {
  BadgeUnlockAnimationPolicy,
  BadgeUnlockEvent,
  BadgeUnlockPresentationItem,
  BadgeUnlockPresentationMode,
  BadgeUnlockPresentationModel,
} from './badgeUnlockPresentation';

export {
  badgeUnlockQueueStore,
  enqueueBadgeUnlockEvents,
} from './badgeUnlockQueueStore';

export {
  clearAllInsightsForTests,
  dismissInsight,
  generateInsightsForCompletedTrip,
  generateInsightsFromTripHistory,
  getCurrentInsights,
  refreshExpeditionInsights,
} from './expeditionInsightStore';

export {
  generateExpeditionRecap,
} from './expeditionRecapEngine';

export {
  cancelActiveTripRecordFromGuidanceEnd,
  createNewActiveTripRecord,
  ensureActiveTripRecordForGuidance,
  expeditionTripRecordStore,
  finalizeActiveTripRecordFromGuidanceEnd,
  finalizeCompletedTrip,
  getExpeditionSchemaMigrationHooks,
  getTripSchemaVersion,
  migrateTripRecord,
  normalizeExpeditionTripRecord,
  normalizeTripRecord,
  safelyAppendBadgeIds,
  safelyStoreNotableMoment,
  trackExpeditionTripFromGuidanceSnapshot,
  updateTripStatsDuringGuidance,
  upgradeTripSchemaIfNeeded,
  validateTripRecord,
} from './expeditionTripRecordStore';

export {
  clearAllPersonalExpeditionRecordsForTests,
  didTripSetRecord,
  evaluatePersonalRecordsForCompletedTrip,
  getCurrentPersonalRecords,
  getRecordHistory,
  getRecordsForTrip,
} from './expeditionPersonalRecordStore';

export {
  clearAllExpeditionReportsForTests,
  deleteExpeditionReport,
  downloadExpeditionReport,
  generateExpeditionReport,
  getAllExpeditionReports,
  getMostRecentReports,
  getReportForTrip,
  getReportsForTrip,
  regenerateExpeditionReport,
  shareExpeditionReport,
} from './expeditionReportStore';

export type {
  ExpeditionReportShareResult,
} from './expeditionReportStore';

export {
  archiveTrip,
  deleteTripRecord,
  expeditionTripRepository,
  getActiveTrip,
  getCompletedTrips,
  getMostRecentCompletedTrip,
  getTripById,
  summarizeCompletedTripForList,
  updateTripTitle,
} from './expeditionTripRepository';
