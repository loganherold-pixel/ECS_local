const args = new Set(process.argv.slice(2));

const requireRuntimeEnv = args.has('--require-runtime-env');
const requireBuildEnv = args.has('--require-build-env');

const runtimeToken = String(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '').trim();
const runtimeAliasToken = String(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '').trim();
const downloadsToken = String(process.env.MAPBOX_DOWNLOADS_TOKEN ?? '').trim();

function describeTokenShape(token) {
  const value = String(token ?? '').trim();
  if (!value) return 'missing';
  const lower = value.toLowerCase();
  if (lower === 'undefined' || lower === 'null' || lower === 'your_token_here') return 'placeholder';
  if (value.startsWith('pk.')) return 'pk.*';
  if (value.startsWith('sk.')) return 'sk.*';
  return 'other';
}

function isPublicRuntimeMapboxToken(token) {
  const value = String(token ?? '').trim();
  if (value.length < 10) return false;
  return describeTokenShape(value) === 'pk.*';
}

function isBuildDownloadsMapboxToken(token) {
  const value = String(token ?? '').trim();
  if (value.length < 10) return false;
  return describeTokenShape(value) === 'sk.*';
}

const errors = [];

if (requireRuntimeEnv && !runtimeToken) {
  errors.push('EXPO_PUBLIC_MAPBOX_TOKEN is required for fieldtest builds.');
}

if (runtimeToken && !isPublicRuntimeMapboxToken(runtimeToken)) {
  errors.push(
    `EXPO_PUBLIC_MAPBOX_TOKEN must be a public pk.* token; runtimeTokenShape=${describeTokenShape(runtimeToken)}.`,
  );
}

if (runtimeAliasToken && !isPublicRuntimeMapboxToken(runtimeAliasToken)) {
  errors.push(
    `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN must be a public pk.* token when set; runtimeAliasTokenShape=${describeTokenShape(runtimeAliasToken)}.`,
  );
}

if (requireBuildEnv && !downloadsToken) {
  errors.push('MAPBOX_DOWNLOADS_TOKEN is required for Android native fieldtest builds.');
}

if (downloadsToken && !isBuildDownloadsMapboxToken(downloadsToken)) {
  errors.push(
    `MAPBOX_DOWNLOADS_TOKEN should be a build-only sk.* downloads token; downloadsTokenShape=${describeTokenShape(downloadsToken)}.`,
  );
}

if (runtimeToken && downloadsToken && runtimeToken === downloadsToken) {
  errors.push('EXPO_PUBLIC_MAPBOX_TOKEN must not match MAPBOX_DOWNLOADS_TOKEN.');
}

console.log('Fieldtest Mapbox token split check');
console.log(`runtimeTokenShape=${describeTokenShape(runtimeToken)}`);
console.log(`runtimeAliasTokenShape=${describeTokenShape(runtimeAliasToken)}`);
console.log(`downloadsTokenShape=${describeTokenShape(downloadsToken)}`);

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`FAIL: ${error}`);
  }
  console.error('FAIL: Fieldtest Mapbox token split is not safe for packaging.');
  process.exit(1);
}

console.log('PASS: Fieldtest Mapbox runtime/build token split is safe.');
