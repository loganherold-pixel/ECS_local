import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  collectDispersedCampingReleaseReadinessIssues,
  scanDispersedCampingReleaseCopyGuardrails,
  verifyDispersedCampingRestrictedClassificationGuardrail,
} from '../../lib/ai/releaseReadinessChecks';
import { detectDispersedCampingRuntimeContradictions } from '../../lib/ai/runtimeSmokeChecks';
import { classifyDispersedCampingRegion } from '../../lib/map/dispersedCampingEligibility';

const root = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const navigateSource = read('app/(tabs)/navigate.tsx');
const mapRendererSource = read('components/navigate/MapRenderer.tsx');
const regionSheetSource = read('components/navigate/DispersedCampingRegionSheet.tsx');
const routeSummarySource = read('components/navigate/DispersedCampingRouteSummary.tsx');
const campScoutCardSource = read('components/navigate/CampScoutIntelCard.tsx');
const candidateTypesSource = read('lib/campops/campCandidateTypes.ts');
const candidateScoringSource = read('lib/campops/campCandidateScoring.ts');
const eligibilitySource = read('lib/map/dispersedCampingEligibility.ts');
const adapterSource = read('lib/map/dispersedCampingGeojsonAdapter.ts');
const typesSource = read('lib/map/dispersedCampingTypes.ts');
const envExampleSource = read('.env.example');

const featureCopy = [
  navigateSource,
  regionSheetSource,
  routeSummarySource,
  campScoutCardSource,
  candidateTypesSource,
  eligibilitySource,
  adapterSource,
  typesSource,
].join('\n');

const copyScan = scanDispersedCampingReleaseCopyGuardrails(featureCopy);
assert.deepStrictEqual(copyScan.bannedPhrasesFound, [], 'Dispersed Camping feature copy must not use banned certainty phrases.');
assert.deepStrictEqual(copyScan.requiredPhrasesMissing, [], 'Dispersed Camping feature copy must include required caution phrases.');

assert.deepStrictEqual(
  verifyDispersedCampingRestrictedClassificationGuardrail(),
  [],
  'Restricted/private/tribal/military/closure classifier samples must not return high or medium.',
);

[
  { landManager: 'PRIVATE' as const },
  { landManager: 'TRIBAL' as const },
  { landManager: 'MILITARY' as const },
  { landManager: 'BLM' as const, knownClosure: true },
  { landManager: 'BLM' as const, privateOrTribal: true },
  { landManager: 'USFS' as const, militaryOrRestricted: true },
].forEach((sample) => {
  assert.ok(
    !['high', 'medium'].includes(classifyDispersedCampingRegion(sample)),
    `Classifier must not return likely eligibility for ${JSON.stringify(sample)}.`,
  );
});

assert.strictEqual(
  classifyDispersedCampingRegion({ landManager: 'NPS' }),
  'restricted',
  'General NPS land should not classify as high or medium.',
);

const happyReleaseIssues = collectDispersedCampingReleaseReadinessIssues({
  featureCopy,
  overlayLifecycle: {
    toggleAvailable: true,
    canToggleOnOff: true,
    avoidsDuplicateMapboxLayers: true,
    removesSourceWhenDisabled: true,
    remainsBelowRouteUserAndPinLayers: true,
  },
  candidateGeneration: {
    requiresExplicitUserAction: true,
    canRunOnMapPan: false,
    maxCandidateCount: 5,
    blocksRestrictedPrivateTribalClosedCandidates: true,
  },
  freshness: {
    staleDataLabeled: true,
    offlineLimitedCachedOrUnavailableState: true,
    createsNewClaimsWithoutData: false,
  },
  betaFlag: {
    flagName: 'EXPO_PUBLIC_ECS_DISPERSED_CAMPING_LAYER',
    defaultEnabled: false,
    productionEnabled: false,
  },
});
assert.deepStrictEqual(happyReleaseIssues, [], 'Healthy Dispersed Camping release snapshot should pass.');

const failingReleaseCodes = new Set<string>(collectDispersedCampingReleaseReadinessIssues({
  featureCopy: 'legal camping without verification copy',
  overlayLifecycle: {
    toggleAvailable: false,
    canToggleOnOff: false,
    avoidsDuplicateMapboxLayers: false,
    removesSourceWhenDisabled: false,
    remainsBelowRouteUserAndPinLayers: false,
  },
  candidateGeneration: {
    requiresExplicitUserAction: false,
    canRunOnMapPan: true,
    maxCandidateCount: 8,
    blocksRestrictedPrivateTribalClosedCandidates: false,
  },
  freshness: {
    staleDataLabeled: false,
    offlineLimitedCachedOrUnavailableState: false,
    createsNewClaimsWithoutData: true,
  },
  betaFlag: {
    flagName: 'EXPO_PUBLIC_ECS_DISPERSED_CAMPING_LAYER',
    defaultEnabled: true,
    productionEnabled: true,
  },
}).map((issue) => issue.code));

[
  'dispersed_camping_copy_guardrail_gap',
  'dispersed_camping_overlay_lifecycle_gap',
  'dispersed_camping_candidate_generation_gap',
  'dispersed_camping_data_freshness_gap',
  'dispersed_camping_beta_flag_gap',
].forEach((code) => {
  assert.ok(failingReleaseCodes.has(code), `Release checks should flag ${code}.`);
});

assert.ok(
  envExampleSource.includes('EXPO_PUBLIC_ECS_DISPERSED_CAMPING_LAYER=false'),
  'Dispersed Camping Eligibility should remain default-off behind the internal/dev flag.',
);

assert.ok(
  mapRendererSource.includes('removeDispersedCampingEligibilityLayer') &&
    mapRendererSource.includes('removeMapLayer(DISPERSED_CAMPING_OUTLINE_LAYER_ID)') &&
    mapRendererSource.includes('removeMapLayer(DISPERSED_CAMPING_FILL_LAYER_ID)') &&
    mapRendererSource.includes('removeMapSource(DISPERSED_CAMPING_SOURCE_ID)'),
  'MapRenderer should remove eligibility layers and source cleanly when disabled.',
);

assert.ok(
  mapRendererSource.includes('if (!map.getLayer(DISPERSED_CAMPING_FILL_LAYER_ID))') &&
    mapRendererSource.includes('if (!map.getLayer(DISPERSED_CAMPING_OUTLINE_LAYER_ID))'),
  'MapRenderer should avoid duplicate eligibility layers across repeated toggles.',
);

assert.ok(
  mapRendererSource.includes('getFirstExistingLayerId') &&
    mapRendererSource.includes("'route-layer'") &&
    mapRendererSource.includes('CAMP_SCOUT_LAYER_ID'),
  'Eligibility layers should stay below route/user/pin overlays.',
);

assert.strictEqual(
  countOccurrences(navigateSource, 'buildDispersedCampingCampScoutCandidates({'),
  1,
  'Dispersed camping CampOps candidate generation should have one explicit action path.',
);

assert.ok(
  navigateSource.includes('onScoutCandidatePins={handleScoutDispersedCampingCandidatePins}') &&
    routeSummarySource.includes('Scout candidate camp pins'),
  'Candidate pin generation should be tied to an explicit Scout action.',
);

assert.ok(
  navigateSource.includes('runtimeSmokeStore.updateDispersedCamping') &&
    navigateSource.includes("candidateGenerationTrigger:") &&
    navigateSource.includes("'explicit_user_action'") &&
    navigateSource.includes("dataFreshnessState: dispersedCampingEligibilityLayer.enabled ? 'cached' : 'unavailable'"),
  'Navigate should publish Dispersed Camping runtime smoke state with trigger and freshness labels.',
);

assert.ok(
  navigateSource.includes('const bottomLeftMapOverlayStackBottom = routeBuilderControlBottomOffset') &&
    navigateSource.includes('const dispersedCampingLegendBottom =\n    bottomLeftMapOverlayStackBottom +'),
  'Dispersed Camping legend should anchor from the bottom-left overlay base instead of the right-side Tools stack.',
);

assert.ok(
  candidateScoringSource.includes('Math.min(5') &&
    candidateScoringSource.includes('LAND_MANAGER_BLOCKLIST') &&
    candidateScoringSource.includes("region.closureKnown === true") &&
    candidateScoringSource.includes("region.confidence === 'restricted'"),
  'CampOps candidate scoring should cap count and block restricted/private/tribal/closed regions.',
);

const runtimeCodes = new Set<string>(detectDispersedCampingRuntimeContradictions({
  featureAvailable: true,
  betaFlagEnabled: false,
  toggleVisible: true,
  layerEnabled: true,
  sourceLoaded: false,
  fillLayerPresent: false,
  outlineLayerPresent: false,
  unavailableStateVisible: false,
  selectedRegionSheetVisible: true,
  selectedRegionId: null,
  routeExists: false,
  routeAwareSummaryVisible: true,
  candidatePinCount: 6,
  candidateGenerationTrigger: 'map_pan',
  dataFreshnessState: 'stale',
  dataFreshnessLabel: 'Current',
  offlineMode: true,
  createdEligibilityClaimsWithoutData: true,
  candidatePins: [
    {
      id: 'private-candidate',
      landManager: 'PRIVATE',
      confidence: 'restricted',
      verificationWarning: '',
    },
  ],
}).map((contradiction) => contradiction.code));

[
  'dispersed_camping_beta_flag_bypass',
  'dispersed_camping_layer_missing_source',
  'dispersed_camping_selected_region_stale',
  'dispersed_camping_route_summary_without_route',
  'dispersed_camping_candidate_auto_generated',
  'dispersed_camping_candidate_limit_exceeded',
  'dispersed_camping_candidate_restricted_land',
  'dispersed_camping_candidate_missing_warning',
  'dispersed_camping_stale_data_unlabeled',
  'dispersed_camping_offline_claim_without_data',
].forEach((code) => {
  assert.ok(runtimeCodes.has(code), `Runtime smoke checks should detect ${code}.`);
});

assert.deepStrictEqual(
  detectDispersedCampingRuntimeContradictions({
    featureAvailable: true,
    betaFlagEnabled: true,
    toggleVisible: true,
    layerEnabled: true,
    sourceLoaded: true,
    fillLayerPresent: true,
    outlineLayerPresent: true,
    unavailableStateVisible: false,
    selectedRegionSheetVisible: false,
    selectedRegionId: null,
    routeExists: true,
    routeAwareSummaryVisible: true,
    candidatePinCount: 1,
    candidateGenerationTrigger: 'explicit_user_action',
    dataFreshnessState: 'cached',
    dataFreshnessLabel: 'Cached eligibility data',
    offlineMode: false,
    createdEligibilityClaimsWithoutData: false,
    candidatePins: [
      {
        id: 'blm-candidate',
        landManager: 'BLM',
        confidence: 'high',
        verificationWarning: 'Verify local rules, closures, fire restrictions, permits, road access, and posted signs before camping.',
      },
    ],
  }),
  [],
  'Healthy runtime smoke snapshot should pass without contradictions.',
);
