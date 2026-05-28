const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'lib', 'mapConfig.ts'), 'utf8');

function indexOfOrFail(pattern, label) {
  const index = source.indexOf(pattern);
  assert(index >= 0, `Missing ${label}.`);
  return index;
}

const resolveStart = indexOfOrFail('async function resolveMapboxToken()', 'async token resolver');
const syncStart = indexOfOrFail('export function getMapboxTokenSync()', 'sync token resolver');

const resolveBody = source.slice(resolveStart, syncStart);
const syncBody = source.slice(syncStart);

assert(
  resolveBody.indexOf('const constantsToken = getConstantsToken();') <
    resolveBody.indexOf('const secureToken = await getSecurePersistedTokenAsync();'),
  'Async resolver should prefer current Expo Constants token before persisted SecureStore tokens.',
);
assert(
  resolveBody.indexOf('const envToken = getEnvToken();') <
    resolveBody.indexOf('const secureToken = await getSecurePersistedTokenAsync();'),
  'Async resolver should prefer current environment token before persisted SecureStore tokens.',
);
assert(
  syncBody.indexOf('const constantsToken = getConstantsToken();') <
    syncBody.indexOf('const persisted = getWebPersistedToken();'),
  'Sync resolver should prefer current Expo Constants token before persisted web/memory tokens.',
);
assert(
  syncBody.indexOf('const envToken = getEnvToken();') <
    syncBody.indexOf('const persisted = getWebPersistedToken();'),
  'Sync resolver should prefer current environment token before persisted web/memory tokens.',
);
assert(
  source.includes('2. Expo Constants') &&
    source.includes('3. Environment variable') &&
    source.includes('4. SecureStore') &&
    source.includes('5. localStorage'),
  'Map token resolution order documentation should match rotation-safe precedence.',
);
assert(
  source.includes('EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN') &&
    source.includes("['EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN', process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN]") &&
    source.includes('extra.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN') &&
    source.includes('manifest2Extra.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN'),
  'Map token resolver should accept the ECS public Mapbox access-token alias across env and Expo Constants.',
);
assert(
  source.includes("return trimmed.startsWith('pk.');"),
  'Runtime Mapbox token validator should accept only public pk tokens.',
);
assert(
  !source.includes("token.startsWith('sk.')") && !source.includes('token.startsWith("sk.")'),
  'Runtime Mapbox token resolver must not accept Mapbox secret sk tokens.',
);
assert(
  source.includes('MAPBOX_DOWNLOADS_TOKEN / sk tokens are only for Android build-time Maven') &&
    source.includes('intentionally rejected here'),
  'Runtime token docs should distinguish pk runtime tokens from sk downloads tokens.',
);

console.log('Mapbox token rotation precedence checks passed.');
