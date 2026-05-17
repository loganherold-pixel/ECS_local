import * as assert from 'assert';

import {
  classifyDispersedCampingRegion,
  getDispersedCampingEligibilityLabel,
  getDispersedCampingStyleKey,
} from '../../lib/map/dispersedCampingEligibility';
import {
  toDispersedCampingFeatureCollection,
  toDispersedCampingRegions,
} from '../../lib/map/dispersedCampingGeojsonAdapter';
import type { PublicLandEligibilitySourceRecord } from '../../lib/map/publicLandSources';

const polygon = {
  type: 'Polygon' as const,
  coordinates: [[
    [-119.1, 37.1] as [number, number],
    [-119.0, 37.1] as [number, number],
    [-119.0, 37.0] as [number, number],
    [-119.1, 37.0] as [number, number],
    [-119.1, 37.1] as [number, number],
  ]],
};

assert.strictEqual(
  classifyDispersedCampingRegion({
    landManager: 'BLM',
    knownClosure: false,
    permitRequired: false,
    fireRestriction: false,
  }),
  'high',
  'BLM with explicit non-closure, non-permit, and no fire restriction should classify high.',
);

assert.strictEqual(
  classifyDispersedCampingRegion({
    landManager: 'BLM',
    knownClosure: false,
    permitRequired: true,
    fireRestriction: false,
  }),
  'verify',
  'BLM with permit requirement should require local verification.',
);

assert.strictEqual(
  classifyDispersedCampingRegion({
    landManager: 'BLM',
    knownClosure: true,
    permitRequired: false,
    fireRestriction: false,
  }),
  'restricted',
  'Known closure should classify restricted.',
);

assert.strictEqual(
  classifyDispersedCampingRegion({
    landManager: 'USFS',
    hasMvumAccessNearby: true,
    knownClosure: false,
    permitRequired: false,
    fireRestriction: false,
  }),
  'medium',
  'USFS with MVUM/access signal should classify medium.',
);

assert.strictEqual(
  classifyDispersedCampingRegion({
    landManager: 'USFS',
    knownClosure: false,
    permitRequired: false,
    fireRestriction: false,
  }),
  'verify',
  'USFS without MVUM/access confirmation should classify verify.',
);

assert.strictEqual(classifyDispersedCampingRegion({ landManager: 'PRIVATE' }), 'restricted');
assert.strictEqual(classifyDispersedCampingRegion({ landManager: 'TRIBAL' }), 'restricted');
assert.strictEqual(classifyDispersedCampingRegion({ landManager: 'MILITARY' }), 'restricted');
assert.strictEqual(classifyDispersedCampingRegion({ landManager: 'UNKNOWN' }), 'verify');

const npsDefault = classifyDispersedCampingRegion({ landManager: 'NPS' });
assert.ok(
  npsDefault === 'restricted' || npsDefault === 'verify',
  'NPS default must not classify as likely eligible.',
);
assert.notStrictEqual(npsDefault, 'high');
assert.notStrictEqual(npsDefault, 'medium');

assert.strictEqual(getDispersedCampingEligibilityLabel('high'), 'Likely eligible');
assert.strictEqual(getDispersedCampingEligibilityLabel('medium'), 'Likely eligible');
assert.strictEqual(getDispersedCampingEligibilityLabel('verify'), 'Verify locally');
assert.strictEqual(getDispersedCampingEligibilityLabel('restricted'), 'Restricted / unavailable');
assert.strictEqual(getDispersedCampingStyleKey('restricted'), 'restricted-unavailable');

const sources: PublicLandEligibilitySourceRecord[] = [
  {
    id: 'source-blm-high',
    landManager: 'BLM',
    geometry: polygon,
    knownClosure: false,
    permitRequired: false,
    fireRestriction: false,
    sourceNames: ['Unit test source'],
  },
  {
    id: 'source-private',
    landManager: 'PRIVATE',
    geometry: polygon,
    privateOrTribal: true,
    sourceNames: ['Unit test source'],
  },
];

const regions = toDispersedCampingRegions(sources);
const geojson = toDispersedCampingFeatureCollection(regions);

assert.strictEqual(geojson.type, 'FeatureCollection');
assert.strictEqual(geojson.features.length, 2);
assert.strictEqual(geojson.features[0].properties.confidence, 'high');
assert.strictEqual(geojson.features[0].properties.requiresVerification, true);
assert.ok(geojson.features[0].properties.basis.length > 0);
assert.ok(geojson.features[0].properties.restrictions.includes('Verify locally'));
assert.ok(geojson.features[0].properties.sourceNames.includes('Unit test source'));
assert.strictEqual(geojson.features[1].properties.confidence, 'restricted');

console.log('Dispersed camping eligibility classifier tests passed.');
