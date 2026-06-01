const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const publisherSource = read('lib/convoy/convoyLocationPublisher.ts');
const membershipSource = read('lib/convoy/convoyMembershipService.ts');
const appContextSource = read('context/AppContext.tsx');
const dispatchPanelSource = read('components/dispatch/DispatchConvoyCommandPanel.tsx');
const markerIdentitySource = read('lib/convoy/convoyMarkerIdentity.ts');
const fallbackSource = read('components/convoy/ConvoyMapFallback.tsx');
const mapboxConfigSource = read('lib/mapbox/mapboxConfig.ts');
const edgeFunctionSource = read('supabase/functions/convoy-membership/index.ts');
const retentionDoc = read('docs/convoy-location-retention.md');
const retentionMigration = read('supabase/migrations/023_convoy_location_retention_cleanup.sql');
const packageJson = JSON.parse(read('package.json'));

assert.ok(
  dispatchPanelSource.includes('Live Sharing Active') &&
    dispatchPanelSource.includes('Alert.alert') &&
    dispatchPanelSource.includes('Stop live sharing?') &&
    dispatchPanelSource.includes('Stop sharing'),
  'Dispatch panel should show persistent live-sharing state and confirm stop behavior.',
);

assert.ok(
  publisherSource.includes('validateSharingAllowed') &&
    publisherSource.includes('Convoy membership was revoked. Live sharing stopped.') &&
    publisherSource.includes('Convoy has ended. Live sharing stopped.') &&
    publisherSource.includes('Auth session ended. Live sharing stopped.'),
  'Publisher should stop locally for revoked members, ended convoys, and ended auth sessions.',
);

assert.ok(
  membershipSource.includes("stopConvoyLocationSharing('You left the convoy. Live sharing stopped.')"),
  'Leaving a convoy should stop local live location sharing.',
);

assert.ok(
  edgeFunctionSource.includes('async function leaveConvoy') &&
    edgeFunctionSource.includes(".eq('user_id', user.id)") &&
    edgeFunctionSource.includes(".eq('member_id', data.id)") &&
    edgeFunctionSource.includes(".from('convoy_member_locations')"),
  'Leaving a convoy should revoke only the current member and delete only that member location row.',
);

assert.ok(
  membershipSource.includes("stopConvoyLocationSharing('Convoy ended. Live sharing stopped.')") &&
    edgeFunctionSource.includes("case 'end_convoy'") &&
    edgeFunctionSource.includes(".from('convoy_members')") &&
    edgeFunctionSource.includes(".from('convoy_member_locations')") &&
    edgeFunctionSource.includes('.delete()'),
  'Ending a convoy should stop local leader sharing, revoke active memberships, and remove live location rows.',
);

assert.ok(
  appContextSource.includes("stopConvoyLocationSharing('Auth session ended. Live sharing stopped.')"),
  'Auth cleanup should stop convoy location sharing.',
);

for (const phrase of ['Last known location', 'Location stale', 'Member offline', 'Needs assistance']) {
  assert.ok(
    markerIdentitySource.includes(phrase) || fallbackSource.includes(phrase),
    `Convoy UI should include user-facing "${phrase}" explanation.`,
  );
}

assert.ok(
  retentionDoc.includes('delete location rows after 30 days') &&
    retentionDoc.includes('Do not run cleanup from mobile clients') &&
    retentionDoc.includes('cleanup_old_convoy_member_locations'),
  'Convoy retention docs should describe deletion policy and cleanup ownership.',
);

assert.ok(
  retentionMigration.includes('cleanup_old_convoy_member_locations') &&
    retentionMigration.includes("convoys.status in ('completed', 'cancelled')") &&
    retentionMigration.includes('bounded_retention_days') &&
    retentionMigration.includes('revoke execute on function public.cleanup_old_convoy_member_locations(integer) from public, anon, authenticated') &&
    retentionMigration.includes('grant execute on function public.cleanup_old_convoy_member_locations(integer) to service_role'),
  'Convoy retention migration should add bounded service-owned cleanup for completed/cancelled convoys.',
);

const normalRuntimeSources = [
  publisherSource,
  membershipSource,
  dispatchPanelSource,
  markerIdentitySource,
  fallbackSource,
  mapboxConfigSource,
  edgeFunctionSource,
];
const unsafeLogPattern = /console\.(log|warn|error|debug)\([^)]*(rawCode|code_hash|EXPO_PUBLIC_MAPBOX_TOKEN|setAccessToken|latitude|longitude|coordinates)/is;
for (const source of normalRuntimeSources) {
  assert.strictEqual(
    unsafeLogPattern.test(source),
    false,
    'Normal convoy runtime sources should not log raw invite codes, tokens, or precise coordinates.',
  );
}

assert.ok(!edgeFunctionSource.includes('console.log'), 'Convoy invite Edge Function should not log raw codes.');
assert.ok(mapboxConfigSource.includes('tokenPreview'), 'Mapbox config should expose token previews instead of full token logs.');
assert.ok(!mapboxConfigSource.includes('console.log'), 'Mapbox config should not log tokens.');

assert.ok(
  packageJson.scripts['test:convoy-privacy-safety'],
  'package.json should expose convoy privacy safety checks.',
);

console.log('convoy privacy safety checks passed');
