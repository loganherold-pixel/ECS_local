import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

import {
  assessDispersedCampingRegionForCandidate,
  buildDispersedCampingCampScoutCandidates,
} from '../../lib/campops/campCandidateScoring';
import {
  ECS_INFERRED_CAMP_CANDIDATE_TITLE,
  ECS_INFERRED_CAMP_CANDIDATE_WARNING,
} from '../../lib/campops/campCandidateTypes';
import type { DispersedCampingRegion, GeoJSON } from '../../lib/map/dispersedCampingTypes';
import { haversineDistanceMiles } from '../../lib/map/routeGeometryUtils';

function polygon(longitude: number, latitude: number): GeoJSON.Polygon {
  return {
    type: 'Polygon',
    coordinates: [[
      [longitude, latitude],
      [longitude + 0.05, latitude],
      [longitude + 0.05, latitude + 0.05],
      [longitude, latitude + 0.05],
      [longitude, latitude],
    ]],
  };
}

function region(
  id: string,
  confidence: DispersedCampingRegion['confidence'],
  landManager: DispersedCampingRegion['landManager'],
  longitude: number,
  latitude: number,
  overrides: Partial<DispersedCampingRegion> = {},
): DispersedCampingRegion {
  return {
    id,
    geometry: polygon(longitude, latitude),
    landManager,
    confidence,
    eligibilityLabel: confidence === 'verify' ? 'Verify locally' : 'Likely eligible',
    basis: [`${landManager} source boundary`],
    restrictions: ['Verify locally'],
    sourceNames: ['Unit source'],
    requiresVerification: true,
    closureKnown: false,
    ...overrides,
  };
}

const route = [
  { lat: 37.0, lng: -119.0 },
  { lat: 37.4, lng: -119.0 },
];

const highBlm = region('high-blm', 'high', 'BLM', -119.01, 37.2);
const mediumUsfs = region('medium-usfs', 'medium', 'USFS', -119.01, 37.1);
const verifyUsfs = region('verify-usfs', 'verify', 'USFS', -119.01, 37.3);

assert.strictEqual(assessDispersedCampingRegionForCandidate(highBlm).accepted, true);
assert.ok(assessDispersedCampingRegionForCandidate(highBlm).eligibilityScore > 80);
assert.strictEqual(assessDispersedCampingRegionForCandidate(mediumUsfs).accepted, true);
assert.ok(assessDispersedCampingRegionForCandidate(mediumUsfs).eligibilityScore >= 70);
assert.strictEqual(assessDispersedCampingRegionForCandidate(verifyUsfs).accepted, true);
assert.ok(assessDispersedCampingRegionForCandidate(verifyUsfs).eligibilityScore < 60);

assert.strictEqual(
  assessDispersedCampingRegionForCandidate(region('private', 'restricted', 'PRIVATE', -119.01, 37.1)).accepted,
  false,
  'Private land should be hard-blocked.',
);
assert.strictEqual(
  assessDispersedCampingRegionForCandidate(region('tribal', 'restricted', 'TRIBAL', -119.01, 37.1)).accepted,
  false,
  'Tribal land should be hard-blocked.',
);
assert.strictEqual(
  assessDispersedCampingRegionForCandidate(region('closure', 'high', 'BLM', -119.01, 37.1, {
    closureKnown: true,
    restrictions: ['Known closure signal present'],
  })).accepted,
  false,
  'Known closures should be hard-blocked.',
);

const unknown = region('unknown', 'verify', 'UNKNOWN', -119.01, 37.16);
const generated = buildDispersedCampingCampScoutCandidates({
  regions: [verifyUsfs, mediumUsfs, highBlm, unknown],
  routeCoordinates: route,
  maxCandidates: 5,
});

assert.strictEqual(generated.candidates.length, 0, 'Dispersed eligibility research must not create campsite pins.');
assert.ok(Array.isArray(generated.researchAreas), 'Research-only dispersed output should expose areas instead of points.');
assert.ok(generated.researchAreas.length > 0, 'Eligible dispersed regions should still be available as research areas.');
assert.ok(generated.researchAreas.every((area) => area.title === 'Dispersed camping research area'));
assert.ok(generated.researchAreas.every((area) => area.verificationWarning === ECS_INFERRED_CAMP_CANDIDATE_WARNING));
assert.ok(generated.researchAreas.every((area) => area.confidence !== 'restricted'));
assert.ok(generated.researchAreas.every((area) => Number.isFinite(area.eligibilityScore)));

const unknownArea = generated.researchAreas.find((area) => area.regionId === 'unknown');
assert.notStrictEqual(unknownArea?.confidence, 'high', 'Unknown land manager must not become high confidence.');

const selectedRegionScoutCenter = { latitude: 37.225, longitude: -118.985 };
const selectedRegionScouts = buildDispersedCampingCampScoutCandidates({
  regions: [highBlm],
  routeCoordinates: route,
  scoutCenter: selectedRegionScoutCenter,
  maxScoutRadiusMiles: 2,
  maxCandidates: 5,
  includeVerifyCandidates: true,
});
assert.strictEqual(
  selectedRegionScouts.candidates.length,
  0,
  'Selected eligibility regions should not fan out into exact campsite pins.',
);
assert.strictEqual(
  selectedRegionScouts.researchAreas.length,
  1,
  'Selected eligibility regions should remain available as one research area.',
);
assert.strictEqual(
  selectedRegionScouts.researchAreas[0].regionId,
  'high-blm',
  'Research area output should preserve the selected eligibility region id.',
);
assert.ok(
  selectedRegionScouts.researchAreas[0].warnings.some((warning) => warning.includes('Verify')),
  'Research area output should keep local verification warnings.',
);

const routePrioritized = buildDispersedCampingCampScoutCandidates({
  regions: [region('far-blm', 'high', 'BLM', -119.5, 37.2), highBlm],
  routeNearbyRegions: [
    {
      regionId: 'high-blm',
      confidence: 'high',
      landManager: 'BLM',
      distanceFromRouteMiles: 0.1,
      eligibilityLabel: 'Likely eligible',
      basis: [],
      restrictions: [],
      requiresVerification: true,
    },
  ],
  routeCoordinates: route,
  maxCandidates: 5,
});
assert.deepStrictEqual(
  routePrioritized.researchAreas.map((area) => area.regionId),
  ['high-blm'],
  'Route corridor research areas should prioritize nearby eligible regions.',
);

const closeRouteRanked = buildDispersedCampingCampScoutCandidates({
  regions: [
    region('far-route-blm', 'high', 'BLM', -119.02, 37.2),
    region('close-route-blm', 'high', 'BLM', -119.02, 37.22),
  ],
  routeNearbyRegions: [
    {
      regionId: 'far-route-blm',
      confidence: 'high',
      landManager: 'BLM',
      distanceFromRouteMiles: 4.8,
      eligibilityLabel: 'Likely eligible',
      basis: [],
      restrictions: [],
      requiresVerification: true,
    },
    {
      regionId: 'close-route-blm',
      confidence: 'high',
      landManager: 'BLM',
      distanceFromRouteMiles: 0.2,
      eligibilityLabel: 'Likely eligible',
      basis: [],
      restrictions: [],
      requiresVerification: true,
    },
  ],
  routeCoordinates: route,
  maxCandidates: 5,
});
assert.strictEqual(
  closeRouteRanked.researchAreas[0]?.regionId,
  'close-route-blm',
  'Route corridor research areas should favor stronger scored regions near the active route.',
);

const cardSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'components', 'navigate', 'CampScoutIntelCard.tsx'),
  'utf8',
);
assert.ok(cardSource.includes(ECS_INFERRED_CAMP_CANDIDATE_TITLE));
assert.ok(cardSource.includes('not a confirmed permitted overnight location'));
assert.ok(cardSource.includes('verify locally before relying on it'));
[
  'Approved campsite',
  'Guaranteed campsite',
  'Safe campsite',
  'You can camp here',
].forEach((forbidden) => {
  assert.ok(!cardSource.includes(forbidden), `Candidate card should not contain banned copy: ${forbidden}`);
});

console.log('Dispersed camping CampOps candidate scoring tests passed.');
