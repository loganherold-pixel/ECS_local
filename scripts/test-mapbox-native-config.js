const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), 'utf8');
}

const packageJson = JSON.parse(read('package.json'));
const appJson = JSON.parse(read('app.json'));
const mapboxConfig = read(path.join('lib', 'mapbox', 'mapboxConfig.ts'));
const mapboxLoader = read(path.join('lib', 'mapbox', 'rnMapboxModule.ts'));
const docs = read(path.join('docs', 'mapbox-native-convoy-command.md'));

assert(
  packageJson.dependencies && packageJson.dependencies['@rnmapbox/maps'],
  'package.json must include @rnmapbox/maps as a dependency.',
);

assert(
  appJson.expo.plugins.some((plugin) => plugin === '@rnmapbox/maps'),
  'app.json must include the @rnmapbox/maps Expo config plugin.',
);

const pluginsJson = JSON.stringify(appJson.expo.plugins);
assert(
  !pluginsJson.includes('RNMapboxMapsDownloadToken'),
  'app.json must not commit Mapbox SDK download tokens.',
);

assert(
  appJson.expo.ios.infoPlist.NSLocationWhenInUseUsageDescription &&
    appJson.expo.ios.infoPlist.NSLocationAlwaysAndWhenInUseUsageDescription,
  'iOS location permission strings must remain configured.',
);

assert(
  appJson.expo.android.permissions.includes('android.permission.ACCESS_FINE_LOCATION') &&
    appJson.expo.android.permissions.includes('android.permission.ACCESS_COARSE_LOCATION'),
  'Android location permissions must remain configured.',
);

assert(
  mapboxConfig.includes("import { getMapboxToken, getMapboxTokenSync } from '../mapConfig';") &&
    mapboxConfig.includes('const token = getMapboxTokenSync()') &&
    mapboxConfig.includes("await getMapboxToken().catch(() => '')") &&
    mapboxConfig.includes('export const hasMapboxToken') &&
    mapboxConfig.includes('initializeMapboxAccessToken') &&
    mapboxConfig.includes('loadRnMapboxModule') &&
    mapboxLoader.includes("import { NativeModules } from 'react-native';") &&
    mapboxLoader.includes('isRnMapboxNativeModuleAvailable') &&
    mapboxLoader.includes('if (!isRnMapboxNativeModuleAvailable())') &&
    mapboxLoader.includes("require('@rnmapbox/maps')") &&
    !mapboxConfig.includes("await import('@rnmapbox/maps')"),
  'Native Mapbox config must use the shared Mapbox token resolver and initialize @rnmapbox/maps through the guarded Metro-safe loader without requiring native code in Expo Go.',
);

assert(
  mapboxConfig.includes('native_module_unavailable') &&
    mapboxConfig.includes('missing_token') &&
    mapboxConfig.includes('invalid_token'),
  'Native Mapbox config must expose missing-token and native-module fallback states.',
);

assert(
  mapboxConfig.includes("return trimmed.startsWith('pk.');") &&
    !mapboxConfig.includes("trimmed.startsWith('sk.')") &&
    !mapboxConfig.includes('trimmed.startsWith("sk.")') &&
    !mapboxConfig.includes('trimmed.length > 50'),
  'Native Mapbox config must accept only public pk runtime tokens and reject sk/download tokens.',
);

assert(
  !mapboxConfig.includes('console.log') &&
    !mapboxConfig.includes('pk.ey') &&
    !mapboxConfig.includes('sk.ey'),
  'Native Mapbox config must not log or commit real-looking Mapbox tokens.',
);

assert(
  docs.includes('EXPO_PUBLIC_MAPBOX_TOKEN') &&
    docs.includes('Expo Go will not run this native module') &&
    docs.includes('npx expo prebuild --clean') &&
    docs.includes('Do not commit real Mapbox tokens'),
  'Native Mapbox docs must describe token setup, Expo Go limits, and native rebuild requirements.',
);

console.log('Native Mapbox config checks passed.');
