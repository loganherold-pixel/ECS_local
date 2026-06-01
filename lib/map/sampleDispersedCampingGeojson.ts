import { toDispersedCampingFeatureCollection, toDispersedCampingRegions } from './dispersedCampingGeojsonAdapter';
import {
  PUBLIC_LAND_SOURCE_NAMES,
  type PublicLandEligibilitySourceRecord,
} from './publicLandSources';

export const SAMPLE_DISPERSED_CAMPING_ELIGIBILITY_SOURCES: PublicLandEligibilitySourceRecord[] = [
  {
    id: 'ecs-demo-dispersed-eligibility-blm-high',
    landManager: 'BLM',
    designation: 'Open public land demo polygon',
    accessType: 'public road access sample',
    knownClosure: false,
    permitRequired: false,
    fireRestriction: false,
    sourceNames: [PUBLIC_LAND_SOURCE_NAMES.demo, PUBLIC_LAND_SOURCE_NAMES.blm],
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-119.214, 37.168],
        [-119.061, 37.163],
        [-119.049, 37.058],
        [-119.205, 37.049],
        [-119.214, 37.168],
      ]],
    },
  },
  {
    id: 'ecs-demo-dispersed-eligibility-usfs-medium',
    landManager: 'USFS',
    designation: 'National forest demo polygon',
    accessType: 'MVUM access sample',
    hasMvumAccessNearby: true,
    knownClosure: false,
    permitRequired: false,
    fireRestriction: false,
    sourceNames: [PUBLIC_LAND_SOURCE_NAMES.demo, PUBLIC_LAND_SOURCE_NAMES.usfs],
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-118.936, 37.335],
        [-118.802, 37.327],
        [-118.777, 37.224],
        [-118.908, 37.208],
        [-118.936, 37.335],
      ]],
    },
  },
  {
    id: 'ecs-demo-dispersed-eligibility-verify',
    landManager: 'UNKNOWN',
    designation: 'Unconfirmed ownership demo polygon',
    accessType: 'access not confirmed',
    sourceNames: [PUBLIC_LAND_SOURCE_NAMES.demo, PUBLIC_LAND_SOURCE_NAMES.padUs],
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-119.386, 37.412],
        [-119.247, 37.397],
        [-119.232, 37.301],
        [-119.371, 37.286],
        [-119.386, 37.412],
      ]],
    },
  },
  {
    id: 'ecs-demo-dispersed-eligibility-restricted',
    landManager: 'UNKNOWN',
    designation: 'restricted-area demo polygon',
    accessType: 'restricted access',
    knownClosure: true,
    sourceNames: [PUBLIC_LAND_SOURCE_NAMES.demo, PUBLIC_LAND_SOURCE_NAMES.local],
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-118.729, 37.061],
        [-118.596, 37.052],
        [-118.588, 36.949],
        [-118.716, 36.937],
        [-118.729, 37.061],
      ]],
    },
  },
];

export const SAMPLE_DISPERSED_CAMPING_ELIGIBILITY_REGIONS =
  toDispersedCampingRegions(SAMPLE_DISPERSED_CAMPING_ELIGIBILITY_SOURCES);

export const SAMPLE_DISPERSED_CAMPING_ELIGIBILITY_GEOJSON =
  toDispersedCampingFeatureCollection(SAMPLE_DISPERSED_CAMPING_ELIGIBILITY_REGIONS);
