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

assert.ok(generated.candidates.length > 0);
assert.ok(generated.candidates.every((candidate) => candidate.sourceType === 'ecs_inferred'));
assert.ok(generated.candidates.every((candidate) => candidate.title === ECS_INFERRED_CAMP_CANDIDATE_TITLE));
assert.ok(generated.candidates.every((candidate) => candidate.verificationWarning === ECS_INFERRED_CAMP_CANDIDATE_WARNING));
assert.ok(generated.candidates.every((candidate) => candidate.eligibilityConfidence !== 'restricted'));

const unknownCandidate = generated.candidates.find((candidate) => candidate.dispersedCampingRegionId === 'unknown');
assert.notStrictEqual(unknownCandidate?.eligibilityConfidence, 'high', 'Unknown land manager must not become high confidence.');

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
  routePrioritized.candidates.map((candidate) => candidate.dispersedCampingRegionId),
  ['high-blm'],
  'Route corridor candidates should prioritize nearby eligible regions.',
);

const cardSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'components', 'navigate', 'CampScoutIntelCard.tsx'),
  'utf8',
);
assert.ok(cardSource.includes(ECS_INFERRED_CAMP_CANDIDATE_TITLE));
assert.ok(cardSource.includes(ECS_INFERRED_CAMP_CANDIDATE_WARNING));
[
  'Approved campsite',
  'Guaranteed campsite',
  'Safe campsite',
  'You can camp here',
].forEach((forbidden) => {
  assert.ok(!cardSource.includes(forbidden), `Candidate card should not contain banned copy: ${forbidden}`);
});

console.log('Dispersed camping CampOps candidate scoring tests passed.');
