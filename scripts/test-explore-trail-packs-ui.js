const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const discover = read(path.join('app', '(tabs)', 'discover.tsx'));
const card = read(path.join('components', 'discover', 'TrailPackCard.tsx'));
const feedbackPanel = read(path.join('components', 'trailPacks', 'TrailPackFeedbackPanel.tsx'));
const previewPanel = read(path.join('components', 'trailPacks', 'TrailPackPreviewModal.tsx'));
const domain = read(path.join('lib', 'explore', 'trailPacks.ts'));

assert(
  discover.includes("import TrailPackCard from '../../components/discover/TrailPackCard'"),
  'Explore should render Trail Packs through the dedicated card component',
);
assert(
  discover.includes("'trailPacks'"),
  'Explore category panel keys should include Trail Packs',
);
assert(
  discover.includes("label: 'Trail Packs'") && discover.includes("description: 'ECS-native route packs"),
  'Trail Packs should appear as a dedicated Explore category tile',
);
assert(
  discover.includes('case \'trailPacks\'') && discover.includes('<TrailPackCard'),
  'Trail Packs should render in their own category panel',
);
assert(
  discover.includes('getDiscoverableTrailPacks(') && discover.includes('activeDistanceRadius'),
  'Trail Packs should use the selected Explore radius',
);
assert(
  discover.includes('DEFAULT_USER_LOCATION') &&
    discover.includes('useThrottledGPS') &&
    discover.includes("gps.hasFix && gps.position ? 'shared_live_gps' : 'default_location_fallback'"),
  'Explore should retain the no-location and denied-permission default-location fallback',
);
assert(
  discover.includes('setTrailPackPageIndex(0);') &&
    discover.includes('trailPackFeedbackReviewStates') &&
    discover.includes('reviewStatesByTrailPackId: trailPackFeedbackReviewStates'),
  'Radius or location changes should refresh Trail Pack results and pagination',
);
assert(
  discover.includes('trailPackToExpeditionOpportunity') && discover.includes('handleStartTrailPackGuidance'),
  'Approved Trail Packs should stage into the existing Navigate handoff path',
);
assert(
  previewPanel.includes('disabled={!canStart}') &&
    previewPanel.includes('Route geometry is unavailable for this Trail Pack.'),
  'Trail Pack preview should guard Start Guidance when geometry is missing',
);
assert(
  discover.includes('TrailPackPreviewModal') &&
    discover.includes('submitTrailPackFeedback') &&
    discover.includes("handleTrailPackFeedback(trailPack.id, 'saved')"),
  'Trail Pack detail/save flows should capture structured feedback without cluttering cards',
);
assert(
  previewPanel.includes('TrailPackFeedbackPanel') &&
    previewPanel.includes('RouteSegment') &&
    previewPanel.includes('Offline cache unavailable for this Trail Pack.'),
  'Trail Pack preview should contain map geometry, feedback controls, and disabled offline cache language',
);
assert(
  discover.includes('Scanning approved ECS Trail Packs within selected radius…') &&
    discover.includes('Trail Packs need your location or a selected search area to filter nearby routes.') &&
    discover.includes('Only lower-confidence Trail Packs were found nearby. Expand your radius or enable broader results.') &&
    discover.includes('No approved Trail Packs found within this radius. Try expanding your radius or checking Hidden Gems.'),
  'Trail Packs should render loading, no-location, low-confidence, and empty states',
);
assert(
  discover.includes('This Trail Pack is under ECS review and is not visible to other users.') &&
    discover.includes('trailPackSubmissionStore') &&
    discover.includes('includeOwnDrafts: ownerTrailPackIds.length > 0'),
  'Owner-visible pending Trail Packs should use explicit review warning language',
);
const hiddenGemPanelCase = discover.split("case 'hiddenGems':")[1]?.split("case 'popularTrails':")[0] ?? '';
assert(
  !/trailPack/i.test(hiddenGemPanelCase),
  'Trail Packs should not be mixed into Hidden Gems logic',
);
assert(
  card.includes('ECS confidence') &&
    card.includes('PREVIEW') &&
    card.includes('START') &&
    card.includes('star-outline'),
  'Trail Pack cards should show ECS confidence plus Preview, Start Guidance, and Save actions',
);
assert(
  card.includes('disabled={!canStartGuidance}') &&
    card.includes('Route geometry is unavailable for this Trail Pack.'),
  'Trail Pack card should disable Start Guidance when geometry is missing',
);
assert(
  feedbackPanel.includes('COMPLETED') &&
    feedbackPanel.includes('RECOMMEND') &&
    feedbackPanel.includes('REPORT ISSUE') &&
    feedbackPanel.includes('Blocked route') &&
    feedbackPanel.includes('Private land'),
  'Trail Pack detail feedback should expose compact operational controls and quick issue reasons',
);
assert(
  !feedbackPanel.includes('comment thread') &&
    !feedbackPanel.includes('public comments'),
  'Trail Pack feedback should avoid noisy public social-comment behavior',
);
assert(
  domain.includes("'partner_source'") &&
    domain.includes("reviewStatus: 'draft'") &&
    !/source:\s*'partner_source'[\s\S]{0,220}reviewStatus:\s*'approved'/.test(domain),
  'Partner source should remain label/type scaffolding only',
);

console.log('Explore Trail Pack UI checks passed');
