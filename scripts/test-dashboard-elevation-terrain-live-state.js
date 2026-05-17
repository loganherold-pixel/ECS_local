const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const modelSource = fs.readFileSync(path.join(root, 'lib', 'dashboardElevationTerrain.ts'), 'utf8');
const rendererSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'WidgetRenderers.tsx'), 'utf8');
const gridSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'WidgetGrid.tsx'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'dashboard.tsx'), 'utf8');
const terrainRiskSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'TerrainRiskWidget.tsx'), 'utf8');

function includes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function notIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

[
  "export type ElevationTerrainStatus = 'live' | 'stale' | 'route' | 'unavailable';",
  'const DEFAULT_STALE_AFTER_MS = 60_000;',
  'const hasLiveElevation = hasGpsAltitude && hasFreshTimestamp;',
  "badgeLabel: 'LIVE ELEVATION'",
  "badgeLabel: 'STALE ELEVATION'",
  "badgeLabel: 'ROUTE PROFILE'",
  "badgeLabel: 'ELEVATION PENDING'",
  "sourceLabel: 'Last known GPS elevation'",
  "sourceLabel: 'Active route elevation profile'",
  "sourceLabel: input.gpsHasFix ? 'GPS fix has no altitude' : 'No live GPS or route profile'",
].forEach((fragment) => {
  includes(modelSource, fragment, `Elevation/terrain resolver should include ${fragment}`);
});

includes(
  rendererSource,
  'resolveElevationTerrainSnapshot({',
  'Elevation widget should use the shared normalized resolver.',
);
includes(
  rendererSource,
  'hasLiveFix: terrainSnapshot.hasLiveElevation',
  'Terrain outlook should only receive live context when fresh GPS elevation exists.',
);
includes(
  rendererSource,
  "badge={{ label: terrainSnapshot.badgeLabel, tone: badgeTone }}",
  'Elevation widget badge should come from the normalized source state.',
);
includes(
  rendererSource,
  "{ label: 'ELEV', value: altitudeValue, tone: badgeTone }",
  'Elevation value tone should follow live/stale/route/unavailable state.',
);
notIncludes(
  rendererSource,
  "activeRoute ? 'ROUTE TERRAIN' : 'LIVE TERRAIN'",
  'Elevation widget must not claim LIVE TERRAIN whenever no route is staged.',
);
notIncludes(
  rendererSource,
  "altFt != null ? `${Math.round(altFt).toLocaleString()} ft` : '--', tone: 'live'",
  'Elevation value must not be hard-coded as live.',
);

includes(gridSource, 'gpsTimestampMs?: number | null;', 'Widget grid should accept GPS timestamps.');
includes(gridSource, 'prev?.gpsTimestampMs === next?.gpsTimestampMs', 'Widget memo checks should include GPS timestamp.');
includes(gridSource, 'gpsTimestampMs,', 'Widget grid render options should pass GPS timestamp.');
includes(dashboardSource, 'gpsTimestampMs={gps.position?.timestamp ?? null}', 'Dashboard should pass GPS timestamp into widgets.');
includes(dashboardSource, 'gpsAccuracyM={gps.position?.accuracyM ?? null}', 'Dashboard should pass GPS accuracy into widgets.');

includes(
  terrainRiskSource,
  'current.riskScore === result.riskScore',
  'Terrain Risk simulated refresh should avoid identical state writes.',
);
includes(
  terrainRiskSource,
  "'Default profile'",
  'Terrain Risk compact state should disclose default/fallback terrain data.',
);
includes(
  terrainRiskSource,
  'Source: default terrain profile, not live sensor data',
  'Terrain Risk detail should not present simulated terrain as live data.',
);

console.log('Dashboard elevation/terrain live-state checks passed.');
