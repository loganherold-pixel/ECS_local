const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const screenPath = path.join(root, 'app', 'convoy-command.tsx');
const layoutPath = path.join(root, 'app', '_layout.tsx');
const dispatchPath = path.join(root, 'components', 'dispatch', 'DispatchCadCommandCenter.tsx');
const servicePath = path.join(root, 'lib', 'convoy', 'convoyMembershipService.ts');
const inviteFormatPath = path.join(root, 'lib', 'convoy', 'convoyInviteCodeFormat.ts');
const copyButtonPath = path.join(root, 'components', 'ECSCopyButton.tsx');
const clipboardPath = path.join(root, 'lib', 'clipboard.ts');
const packagePath = path.join(root, 'package.json');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

const screen = read(screenPath);
const layout = read(layoutPath);
const dispatch = read(dispatchPath);
const service = read(servicePath);
const inviteFormat = read(inviteFormatPath);
const copyButton = read(copyButtonPath);
const clipboard = read(clipboardPath);
const pkg = JSON.parse(read(packagePath));

for (const copy of [
  'Create Convoy',
  'Generate Invite Code',
  'Join Convoy',
  'Convoy Roster',
  'Start live sharing',
  'Live location is shared only with active convoy members.',
  'Tracking can be turned off at any time.',
  'Leaders can revoke member or invite access.',
  'Scan Invite QR',
]) {
  assert.ok(screen.includes(copy), `Convoy credentials UI should include: ${copy}`);
}

assert.ok(
  screen.includes("import QRCode from 'react-native-qrcode-svg'") &&
    screen.includes('<QRCode') &&
    screen.includes('value={lastInvitePayload}') &&
    screen.includes('accessibilityLabel={`Convoy invite QR code for ${lastInviteCode}`}') &&
    !screen.includes('QR-ready payload:') &&
    pkg.dependencies['react-native-qrcode-svg'],
  'Convoy invite UI should render a scannable QR code instead of exposing the raw JSON payload text.',
);

assert.ok(
  screen.includes('ECSCopyButton') &&
    screen.includes('accessibilityLabel="Copy one-time convoy invite code"') &&
    screen.includes("setNotice(success ? 'Invite code copied.'") &&
    copyButton.includes("name={copied ? 'checkmark-circle-outline' : 'copy-outline'}") &&
    copyButton.includes("copiedLabel = 'COPIED'") &&
    clipboard.includes("import('expo-clipboard')"),
  'Convoy invite UI should provide native/web copy feedback with a temporary checkmark state.',
);

assert.ok(
  screen.includes('formatConvoyInviteCode(value)') &&
    screen.includes('normalizeConvoyInviteCodeForSubmit(joinCode)') &&
    inviteFormat.includes("const CONVOY_INVITE_PREFIX = 'ECS'") &&
    inviteFormat.includes("return [CONVOY_INVITE_PREFIX, first, second].filter(Boolean).join('-')"),
  'Convoy join code input should auto-format typed and pasted codes as ECS-XXXX-XXXX before submit.',
);

for (const serviceCall of [
  'convoyMembershipService.createConvoy',
  'convoyMembershipService.createConvoyInvite',
  'convoyMembershipService.joinConvoyWithInvite',
  'convoyMembershipService.revokeConvoyInvite',
  'convoyMembershipService.revokeConvoyMember',
  'convoyMembershipService.listMyActiveConvoys',
  'convoyMembershipService.listConvoyRoster',
  'convoyMembershipService.listConvoyInvites',
]) {
  assert.ok(screen.includes(serviceCall), `Convoy credentials UI should call ${serviceCall}.`);
}

for (const validationCopy of [
  'Invite code is invalid. Check the code and ask the convoy leader for a fresh invite if needed.',
  'Invite expired. Ask the convoy leader for a new code.',
  'Invite revoked. Ask the convoy leader to reissue access.',
  'Invite has reached its use limit.',
  'Sign in before creating or joining a convoy.',
]) {
  assert.ok(screen.includes(validationCopy), `Convoy credentials UI should explain validation state: ${validationCopy}`);
}

assert.ok(
  screen.includes('vehicleStore.getAll') &&
    screen.includes('leaderVehicleId') &&
    screen.includes('joinVehicleId'),
  'Convoy credentials UI should offer Fleet vehicle selection for leader and member flows.',
);

assert.ok(
  screen.includes('showsVerticalScrollIndicator={false}') &&
    screen.includes('paddingBottom: 92') &&
    screen.includes('minHeight: 44') &&
    screen.includes('gap: 8') &&
    screen.includes('label="Generate Invite Code"') &&
    screen.includes('size="compact" disabled={!selectedConvoy || !isLeader} onPress={handleGenerateInvite}'),
  'Convoy credentials UI should keep leader/invite/roster spacing compact enough for active invite records to remain reachable.',
);

assert.ok(
  screen.includes('accessibilityLabel="Back to dispatch"') &&
    screen.includes('<Text style={styles.backButtonText}>Back</Text>') &&
    screen.indexOf('<View style={styles.headerCopy}>') < screen.indexOf('<TouchableOpacity\n            style={styles.backButton}'),
  'Convoy credentials UI should place a labeled Back button on the top right of the header.',
);

assert.ok(
  !screen.includes('code_hash') &&
    !screen.includes('phone') &&
    !screen.includes('email'),
  'Convoy credentials UI should not expose invite hashes or contact fields.',
);

assert.ok(
  service.includes("select('id, convoy_id, role, max_uses, used_count, expires_at, revoked_at, created_by, created_at')") &&
    !service.includes("select('code_hash") &&
    service.includes('revokeConvoyInvite') &&
    service.includes('listConvoyLocationSummaries'),
  'Convoy membership service should expose public invite/roster helpers without selecting raw invite hashes.',
);

assert.ok(
  layout.includes('name="convoy-command"') &&
    dispatch.includes("router.push('/convoy-command' as any)"),
  'Convoy credentials route should be registered and reachable from Dispatch.',
);

assert.ok(
  pkg.scripts['test:convoy-credentials-ui'],
  'package.json should expose the convoy credentials UI smoke test.',
);

console.log('convoy credentials UI checks passed');
