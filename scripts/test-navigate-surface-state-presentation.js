const assert = require('assert');
const fs = require('fs');

const mapRenderer = fs.readFileSync('components/navigate/MapRenderer.tsx', 'utf8');
const navigate = fs.readFileSync('app/(tabs)/navigate.tsx', 'utf8');
const gpsOverlay = fs.readFileSync('components/navigate/GPSStatusOverlay.tsx', 'utf8');

assert.match(mapRenderer, /export type MapRendererBootState = 'loading' \| 'ready' \| 'degraded' \| 'disabled' \| 'error'/);
assert.match(mapRenderer, /onBootStateChange\?: \(state: MapRendererBootState\) => void/);
assert.match(mapRenderer, /onBootStateChange\?\.\(bootPresentationState\)/);
assert.match(mapRenderer, /label="Retry live map"/);
assert.match(mapRenderer, /label="Retry map"/);
assert.doesNotMatch(mapRenderer, /Use your existing retry control to reinitialize the map surface/);

assert.match(navigate, /const \[mapBootState, setMapBootState\] = useState<MapRendererBootState>\('loading'\)/);
assert.match(navigate, /mapBootState === 'degraded'/);
assert.match(navigate, /mapBootState === 'disabled'/);
assert.match(navigate, /mapBootState === 'error'/);
assert.match(navigate, /onBootStateChange=\{setMapBootState\}/);
assert.match(navigate, /setMapBootState\('loading'\)/);
assert.match(navigate, /ECS will expose fallback or retry if live initialization does not complete/);

assert.match(gpsOverlay, /gpsStatus === 'UNAVAILABLE'/);
assert.match(gpsOverlay, /gpsStatus === 'OFFLINE'/);
assert.match(gpsOverlay, /Boolean\(error\)/);
assert.match(gpsOverlay, /LOCATION UNAVAILABLE/);
assert.match(gpsOverlay, /label="RETRY"/);
assert.match(gpsOverlay, /useReducedMotion\(\)/);
assert.match(gpsOverlay, /accessibilityRole="progressbar"/);
assert.match(gpsOverlay, /accessibilityLiveRegion="assertive"/);

console.log('Navigate surface-state presentation checks passed');
