const { ROUTE_CATALOG_SYNC_INVENTORY } = require('./route-catalog-sync-inventory.js');

const USFS_MVUM_FOREST_BATCHES = [
  {
    key: 'all',
    label: 'All configured USFS MVUM forests',
    forests: null,
  },
  {
    key: 'california_nevada',
    label: 'California and Nevada',
    forests: [
      'tahoe-national-forest',
      'mendocino-national-forest',
      'humboldt-toiyabe-national-forest',
      'inyo-national-forest',
      'plumas-national-forest',
      'lassen-national-forest',
      'shasta-trinity-national-forest',
      'klamath-national-forest',
      'stanislaus-national-forest',
      'sierra-national-forest',
      'rogue-river-siskiyou-national-forests',
      'eldorado-national-forest',
      'sequoia-national-forest',
      'san-bernardino-national-forest',
      'los-padres-national-forest',
      'cleveland-national-forest',
      'lake-tahoe-basin-management-unit',
      'six-rivers-national-forest',
      'modoc-national-forest',
    ],
  },
  {
    key: 'southwest',
    label: 'Southwest',
    forests: [
      'coconino-national-forest',
      'kaibab-national-forest',
      'prescott-national-forest',
      'gila-national-forest',
      'santa-fe-national-forest',
      'carson-national-forest',
      'coronado-national-forest',
      'cibola-national-forest',
      'lincoln-national-forest',
      'tonto-national-forest',
    ],
  },
  {
    key: 'central_rockies',
    label: 'Central Rockies',
    forests: [
      'san-juan-national-forest',
      'manti-la-sal-national-forest',
      'rio-grande-national-forest',
      'grand-mesa-uncompahgre-gunnison-national-forests',
      'pike-san-isabel-national-forests',
      'fishlake-national-forest',
      'uinta-wasatch-cache-national-forest',
      'dixie-national-forest',
      'medicine-bow-routt-national-forest',
      'arapaho-roosevelt-national-forests',
      'ashley-national-forest',
      'bridger-teton-national-forest',
      'white-river-national-forest',
      'shoshone-national-forest',
    ],
  },
  {
    key: 'northern_rockies',
    label: 'Northern Rockies and Plains',
    forests: [
      'sawtooth-national-forest',
      'idaho-panhandle-national-forests',
      'helena-lewis-and-clark-national-forest',
      'black-hills-national-forest',
      'caribou-targhee-national-forest',
      'boise-national-forest',
      'lolo-national-forest',
      'salmon-challis-national-forest',
      'bitterroot-national-forest',
      'kootenai-national-forest',
      'nez-perce-clearwater-national-forest',
      'payette-national-forest',
      'flathead-national-forest',
      'custer-national-forest',
      'bighorn-national-forest',
      'nebraska-national-forest',
      'dakota-prairie-grasslands',
      'beaverhead-deerlodge-national-forest',
      'custer-gallatin-national-forest',
      'gallatin-national-forest',
    ],
  },
  {
    key: 'alaska',
    label: 'Alaska',
    forests: [
      'chugach-national-forest',
      'tongass-national-forest',
    ],
  },
  {
    key: 'pacific_northwest',
    label: 'Pacific Northwest',
    forests: [
      'deschutes-national-forest',
      'umpqua-national-forest',
      'fremont-winema-national-forest',
      'willamette-national-forest',
      'mt-hood-national-forest',
      'gifford-pinchot-national-forest',
      'umatilla-national-forest',
      'ochoco-national-forest',
      'siuslaw-national-forest',
      'mt-baker-snoqualmie-national-forest',
      'olympic-national-forest',
      'colville-national-forest',
      'wallowa-whitman-national-forest',
      'columbia-river-gorge-national-scenic-area',
      'okanogan-wenatchee-national-forest',
    ],
  },
  {
    key: 'midwest_northeast',
    label: 'Midwest and Northeast',
    forests: [
      'huron-manistee-national-forest',
      'ottawa-national-forest',
      'hiawatha-national-forest',
      'chequamegon-nicolet-national-forest',
      'allegheny-national-forest',
      'superior-national-forest',
      'chippewa-national-forest',
      'monongahela-national-forest',
      'shawnee-national-forest',
      'green-mountain-finger-lakes-national-forests',
      'wayne-national-forest',
      'white-mountain-national-forest',
      'hoosier-national-forest',
    ],
  },
  {
    key: 'south_southeast',
    label: 'South and Southeast',
    forests: [
      'ozark-st-francis-national-forest',
      'national-forests-in-florida',
      'ouachita-national-forest',
      'mark-twain-national-forest',
      'national-forests-in-mississippi',
      'kisatchie-national-forest',
      'george-washington-jefferson-national-forest',
      'francis-marion-sumter-national-forests',
      'national-forests-in-texas',
      'national-forests-in-north-carolina',
      'cherokee-national-forest',
      'daniel-boone-national-forest',
      'chattahoochee-oconee-national-forests',
      'land-between-the-lakes-national-recreation-area',
    ],
  },
];

function defaultUsfsMvumForests() {
  return ROUTE_CATALOG_SYNC_INVENTORY.find((entry) => entry.key === 'usfs_mvum').defaultPayload.forests;
}

function parseRequestedForests(value) {
  return String(value || '')
    .split(',')
    .map((forest) => forest.trim())
    .filter(Boolean);
}

function resolveUsfsMvumForestSelection({ requestedForests = '', forestBatch = 'all' } = {}) {
  const explicitForests = Array.isArray(requestedForests)
    ? requestedForests.map((forest) => String(forest).trim()).filter(Boolean)
    : parseRequestedForests(requestedForests);
  if (explicitForests.length > 0) {
    return {
      mode: 'explicit',
      batchKey: 'custom',
      forests: explicitForests,
    };
  }

  const normalizedBatch = String(forestBatch || 'all').trim().toLowerCase();
  const defaultForests = defaultUsfsMvumForests();
  if (normalizedBatch === 'all') {
    return {
      mode: 'batch',
      batchKey: 'all',
      forests: [...defaultForests],
    };
  }

  const batch = USFS_MVUM_FOREST_BATCHES.find((entry) => entry.key === normalizedBatch);
  if (!batch || !Array.isArray(batch.forests)) {
    throw new Error(`Unknown USFS MVUM forest batch: ${forestBatch}`);
  }

  return {
    mode: 'batch',
    batchKey: batch.key,
    forests: [...batch.forests],
  };
}

function validateUsfsMvumForestBatches() {
  const errors = [];
  const defaultForests = defaultUsfsMvumForests();
  const configuredSet = new Set(defaultForests);
  const seen = new Map();
  const nonAllBatches = USFS_MVUM_FOREST_BATCHES.filter((batch) => batch.key !== 'all');

  for (const batch of nonAllBatches) {
    if (!/^[a-z0-9_]+$/.test(batch.key)) {
      errors.push(`Invalid USFS MVUM batch key: ${batch.key}`);
    }
    if (!Array.isArray(batch.forests) || batch.forests.length === 0) {
      errors.push(`USFS MVUM batch ${batch.key} must include forests`);
      continue;
    }
    if (batch.forests.length > 20) {
      errors.push(`USFS MVUM batch ${batch.key} has ${batch.forests.length} forests; max is 20`);
    }
    for (const forest of batch.forests) {
      if (!configuredSet.has(forest)) {
        errors.push(`USFS MVUM batch ${batch.key} includes unknown forest ${forest}`);
      }
      if (seen.has(forest)) {
        errors.push(`USFS MVUM forest ${forest} appears in both ${seen.get(forest)} and ${batch.key}`);
      }
      seen.set(forest, batch.key);
    }
  }

  for (const forest of defaultForests) {
    if (!seen.has(forest)) {
      errors.push(`USFS MVUM default forest ${forest} is missing from named batches`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    defaultForestCount: defaultForests.length,
    nonAllBatchCount: nonAllBatches.length,
    maxBatchSize: Math.max(...nonAllBatches.map((batch) => batch.forests.length)),
  };
}

module.exports = {
  USFS_MVUM_FOREST_BATCHES,
  defaultUsfsMvumForests,
  resolveUsfsMvumForestSelection,
  validateUsfsMvumForestBatches,
};
