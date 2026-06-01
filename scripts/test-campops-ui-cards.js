const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const panelPath = path.join(repoRoot, 'components', 'navigate', 'CampsiteCandidatePanel.tsx');
const coexistencePath = path.join(repoRoot, 'lib', 'campops', 'campOpsLegacyCoexistence.ts');
const docsPath = path.join(repoRoot, 'docs', 'campops', 'ui_cards.md');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const panel = fs.readFileSync(panelPath, 'utf8');
const coexistence = fs.readFileSync(coexistencePath, 'utf8');
const docs = fs.readFileSync(docsPath, 'utf8');
const uiSource = `${panel}\n${coexistence}`;

assert(
  panel.includes('result.campOps?.enabled') && panel.includes('result.campOps.recommendationSet'),
  'CampOps cards must be gated by the CampOps payload flag.',
);

assert(
  panel.includes('CampOpsRecommendationCards'),
  'CampsiteCandidatePanel should render the CampOps recommendation card component.',
);

for (const coexistenceCopy of [
  'CAMPSITE RESULTS',
  'Search results',
  'Endpoint recommendation',
  'CampOps cards are operational recommendations',
  'available camps/results',
  'TOP RESULT',
  'Top search result is not recommended by CampOps',
]) {
  assert(uiSource.includes(coexistenceCopy), `Missing legacy/CampOps coexistence copy: ${coexistenceCopy}`);
}

assert(
  panel.includes('getCampOpsLegacyCandidateStatus') && panel.includes('getCampOpsLegacyListNotice'),
  'Legacy search results should be annotated from CampOps status when cards are visible.',
);

for (const label of ['Recommended Camp', 'Backup Camp', 'Emergency Camp']) {
  assert(panel.includes(label), `Missing CampOps card label: ${label}`);
}

for (const label of ['Recommended', 'Backup', 'Emergency stop', 'Fallback only', 'Not recommended', 'Unknown confidence']) {
  assert(panel.includes(label), `Missing conservative recommendation language: ${label}`);
}

for (const field of ['Score', 'Legal', 'ETA', 'Sunset', 'Fuel', 'Water', 'Late risk', 'Trailer', 'Group fit', 'Data']) {
  assert(panel.includes(`label: '${field}'`), `Missing CampOps field: ${field}`);
}

for (const transparency of [
  'Why this recommendation?',
  'Legal confidence',
  'Closure status',
  'Fire restrictions',
  'Weather freshness',
  'Service/resupply',
  'Missing critical data',
  'Source data is stale',
  'Source conflict',
  'Resource debt',
  'Decision point',
]) {
  assert(panel.includes(transparency), `Missing CampOps reasoning/source transparency copy: ${transparency}`);
}

assert(
  panel.includes('onNavigateToCamp') && panel.includes('onShareCamp'),
  'CampOps cards should use optional host-provided navigation/share handlers.',
);

for (const forbidden of ['Definitely legal', 'Guaranteed open', 'guaranteed', 'definitely legal']) {
  assert(!panel.includes(forbidden), `CampOps UI must avoid overconfident wording: ${forbidden}`);
}

assert(
  docs.includes('campopsRecommendationsEnabled') &&
    docs.includes('The existing campsite result list remains visible for backward compatibility') &&
    docs.includes('Legacy Coexistence') &&
    docs.includes('Why this recommendation?') &&
    docs.includes('source transparency'),
  'CampOps UI cards documentation should describe feature-flagged behavior, preserved results, and transparency.',
);

console.log('CampOps UI cards contract checks passed.');
