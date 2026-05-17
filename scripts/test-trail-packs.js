const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request.endsWith('/discoverEngine') || request.endsWith('\\discoverEngine') || request === '../discoverEngine') {
    return {};
  }
  return originalLoad(request, parent, isMain);
};

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;
require.extensions['.tsx'] = compileTypescript;

const {
  canStartTrailPackGuidance,
  getDefaultECSTrailPacks,
  getDiscoverableTrailPacks,
  getTrailPackSourceLabel,
  trailPackToExpeditionOpportunity,
} = require(path.join(root, 'lib', 'explore', 'trailPacks.ts'));

const user = { latitude: 38.5733, longitude: -109.5507 };

const defaultPacks = getDefaultECSTrailPacks();
assert(defaultPacks.length >= 4, 'ECS Trail Pack seed catalog should contain discoverable scaffolding');
assert(
  defaultPacks.every((pack) => pack.source !== 'partner_source' || pack.reviewStatus !== 'approved'),
  'Partner-source scaffolding must not be discoverable by default',
);
assert.strictEqual(getTrailPackSourceLabel('partner_source'), 'Partner Source');

const discoverable = getDiscoverableTrailPacks(defaultPacks, user, 75);
assert(discoverable.length > 0, 'Approved Trail Packs near the active radius should be returned');
assert(
  discoverable.every((pack) => pack.reviewStatus === 'approved'),
  'Explore discovery should default to approved Trail Packs only',
);
assert(
  discoverable.every((pack) => pack.distanceFromUserMiles <= 75),
  'Trail Packs should respect the selected Explore radius',
);

for (let index = 1; index < discoverable.length; index += 1) {
  const previous = discoverable[index - 1];
  const current = discoverable[index];
  assert(
    previous.confidenceScore >= current.confidenceScore ||
      previous.distanceFromUserMiles <= current.distanceFromUserMiles,
    'Trail Pack sort should prefer confidence before proximity',
  );
}

const approvedWithGeometry = discoverable.find(canStartTrailPackGuidance);
assert(approvedWithGeometry, 'At least one approved Trail Pack should include geometry');
const opportunity = trailPackToExpeditionOpportunity(approvedWithGeometry);
assert.strictEqual(opportunity.id, `trail-pack:${approvedWithGeometry.id}`);
assert.strictEqual(opportunity.matchScore, approvedWithGeometry.confidenceScore);
assert(opportunity.routeGeometry, 'Converted Trail Pack opportunity should carry route geometry for Navigate staging');

const missingGeometryPack = defaultPacks.find((pack) => pack.id === 'north-georgia-ridge-scout');
assert(missingGeometryPack, 'Missing-geometry fixture should exist');
assert.strictEqual(
  canStartTrailPackGuidance(missingGeometryPack),
  false,
  'Start Guidance should be guarded when Trail Pack geometry is unavailable',
);

const draftPack = defaultPacks.find((pack) => pack.reviewStatus === 'draft');
assert(draftPack, 'Draft Trail Pack fixture should exist');
const withOwnDraft = getDiscoverableTrailPacks(defaultPacks, user, 75, {
  includeOwnDrafts: true,
  ownTrailPackIds: [draftPack.id],
});
assert(
  withOwnDraft.some((pack) => pack.id === draftPack.id),
  'Own draft Trail Packs can be included only through the explicit own-draft path',
);

console.log('Trail Pack domain checks passed');
