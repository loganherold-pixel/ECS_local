const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function requireTs(relativePath) {
  const fullPath = path.join(root, relativePath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => {
    if (request.startsWith('./')) {
      return requireTs(path.join(path.dirname(relativePath), request).replace(/\\/g, '/'));
    }
    return require(request);
  };
  new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports);
  return module.exports;
}

const {
  CAMPSITE_CONFIRMATION_SPAM_WINDOW_MS,
  calculateCampSiteTrustScore,
  getCampSiteTrustLabel,
  hasRecentUserConfirmation,
} = requireTs('lib/campsites/campsiteTrustScoring.ts');

const now = Date.parse('2026-04-28T12:00:00.000Z');

assert.strictEqual(
  calculateCampSiteTrustScore({
    originalVerifiedInPerson: true,
    originalUserStayedHere: true,
    originalLocationAccuracyM: 30,
    approvedPhotoCount: 1,
    uniqueConfirmationCount: 9,
    unresolvedFlagCount: 0,
    lastConfirmedAt: '2026-04-20T12:00:00.000Z',
    now,
  }),
  90,
  'Trust score should include original verification, stay, accurate location, photos, and capped confirmations.',
);

assert.strictEqual(getCampSiteTrustLabel(90), 'High confidence');
assert.strictEqual(getCampSiteTrustLabel(65), 'Medium confidence');
assert.strictEqual(getCampSiteTrustLabel(20), 'Low confidence');
assert.strictEqual(getCampSiteTrustLabel(0), 'Unverified');
assert.strictEqual(getCampSiteTrustLabel(null), 'Unverified');

assert.strictEqual(
  calculateCampSiteTrustScore({
    originalVerifiedInPerson: true,
    originalUserStayedHere: true,
    originalLocationAccuracyM: 30,
    uniqueConfirmationCount: 4,
    unresolvedFlagCount: 6,
    lastConfirmedAt: '2026-04-20T12:00:00.000Z',
    now,
  }),
  30,
  'Unresolved flags should reduce score with a capped penalty.',
);

assert.strictEqual(
  calculateCampSiteTrustScore({
    originalVerifiedInPerson: true,
    originalUserStayedHere: false,
    originalLocationAccuracyM: 80,
    uniqueConfirmationCount: 1,
    unresolvedFlagCount: 0,
    lastConfirmedAt: '2024-01-01T12:00:00.000Z',
    now,
  }),
  10,
  'Sites confirmed more than 18 months ago should lose recency score.',
);

assert.strictEqual(
  hasRecentUserConfirmation(
    [
      {
        camp_site_id: 'camp-1',
        created_at: new Date(now - CAMPSITE_CONFIRMATION_SPAM_WINDOW_MS + 1000).toISOString(),
        moderation_status: 'approved',
        verified_in_person: true,
      },
    ],
    'camp-1',
    now,
  ),
  true,
  'Recent approved confirmations should be detected for anti-spam.',
);

assert.strictEqual(
  hasRecentUserConfirmation(
    [
      {
        camp_site_id: 'camp-1',
        created_at: new Date(now - CAMPSITE_CONFIRMATION_SPAM_WINDOW_MS - 1000).toISOString(),
        moderation_status: 'approved',
        verified_in_person: true,
      },
    ],
    'camp-1',
    now,
  ),
  false,
  'Older confirmations should not be treated as rapid duplicates.',
);

console.log('Campsite trust scoring checks passed.');
