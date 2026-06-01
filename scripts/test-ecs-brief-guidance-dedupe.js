const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

require.extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

const {
  AI_GUIDANCE_DUPLICATE_SUPPRESSION_MINUTES,
  ECS_BRIEF_TOP_BANNER_DEFAULT_MS,
  ECS_BRIEF_TOP_BANNER_RESOLVED_MS,
  briefCadLogStore,
  getCurrentBriefCadTopBannerMessage,
  recordBriefCadEntry,
} = loadTypeScriptModule('lib/briefCadLogStore.ts');
const { ecsUpdateDedupeTestHooks } = loadTypeScriptModule('lib/ecsUpdateDedupe.ts');
const packageSource = fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8');
const storeSource = fs.readFileSync(path.join(process.cwd(), 'lib', 'briefCadLogStore.ts'), 'utf8');
const hookSource = fs.readFileSync(path.join(process.cwd(), 'lib', 'useEcsBriefTopBannerMessage.ts'), 'utf8');
const dashboardHeaderSource = fs.readFileSync(path.join(process.cwd(), 'components', 'dashboard', 'DashboardHeader.tsx'), 'utf8');
const shellHeaderSource = fs.readFileSync(path.join(process.cwd(), 'components', 'Header.tsx'), 'utf8');

const baseTime = Date.parse('2026-05-01T16:00:00.000Z');
const minutes = (value) => value * 60 * 1000;

function resetStores() {
  ecsUpdateDedupeTestHooks.clearRegistry();
  briefCadLogStore.clear();
}

function recordBrief(overrides = {}) {
  recordBriefCadEntry({
    id: overrides.id ?? 'ecs-brief-weather-guidance',
    text: overrides.text ?? 'Weather data is stale. Route guidance available.',
    mode: overrides.mode ?? 'advisory',
    priority: overrides.priority ?? 4,
    queuedAt: overrides.queuedAt ?? baseTime,
    title: overrides.title ?? 'ECS Brief',
    source: overrides.source ?? 'brief_ai',
    eventType: overrides.eventType ?? 'weather',
    severity: overrides.severity ?? 'watch',
    routeId: overrides.routeId ?? 'route-alpha',
    segmentId: overrides.segmentId ?? 'segment-1',
  });
}

assert.strictEqual(
  AI_GUIDANCE_DUPLICATE_SUPPRESSION_MINUTES,
  15,
  'ECS Brief AI guidance duplicate suppression window should be 15 minutes.',
);
assert(
  storeSource.includes('AI_GUIDANCE_HISTORY_LIMIT'),
  'Brief guidance duplicate history should be bounded.',
);
assert.strictEqual(
  ECS_BRIEF_TOP_BANNER_DEFAULT_MS,
  16_000,
  'ECS Brief top intelligence banner should use a short, gentle transient duration.',
);
assert.strictEqual(
  ECS_BRIEF_TOP_BANNER_RESOLVED_MS,
  10_000,
  'Resolved ECS Brief updates should leave the top intelligence banner quickly.',
);
assert(
  hookSource.includes('useEcsBriefTopBannerMessage') &&
    hookSource.includes('getCurrentBriefCadTopBannerMessage') &&
    hookSource.includes('setInterval(refresh, tickMs)'),
  'ECS Brief top banner hook should subscribe to the central brief CAD store.',
);
assert(
  dashboardHeaderSource.includes('useEcsBriefTopBannerMessage') &&
    dashboardHeaderSource.includes('briefBannerCopy') &&
    dashboardHeaderSource.includes('displayBriefBanner.eyebrow'),
  'Dashboard header should present ECS Brief updates through the top intelligence banner.',
);
assert(
  shellHeaderSource.includes('useEcsBriefTopBannerMessage') &&
    shellHeaderSource.includes('briefBannerCopy') &&
    shellHeaderSource.includes('displayBriefBanner.eyebrow'),
  'Shared shell header should present ECS Brief updates through the top intelligence banner.',
);
assert(
  packageSource.includes('"test:ecs-brief-guidance-dedupe": "node ./scripts/test-ecs-brief-guidance-dedupe.js"'),
  'package.json should expose the ECS Brief guidance dedupe regression test.',
);

resetStores();
recordBrief();
const activeBanner = getCurrentBriefCadTopBannerMessage(baseTime + 1000);
assert(activeBanner, 'Fresh accepted ECS Brief guidance should produce a top intelligence banner message.');
assert.strictEqual(activeBanner.eyebrow, 'ECS INTELLIGENCE');
assert.strictEqual(activeBanner.detail, 'Weather data is stale. Route guidance available.');
assert.strictEqual(activeBanner.tone, 'watch');
assert.strictEqual(
  getCurrentBriefCadTopBannerMessage(baseTime + ECS_BRIEF_TOP_BANNER_DEFAULT_MS + 1),
  null,
  'Top intelligence banner should gently exit after its transient display window.',
);
recordBrief({
  id: 'ecs-brief-weather-guidance-refresh',
  text: ' weather data is stale.   route guidance available. ',
  queuedAt: baseTime + minutes(14),
});
assert.strictEqual(
  briefCadLogStore.getEntries().length,
  1,
  'Identical AI guidance should not repeat in the ECS Brief activity log inside 15 minutes.',
);

recordBrief({
  id: 'ecs-brief-weather-guidance-later',
  queuedAt: baseTime + minutes(15) + 1,
});
assert.strictEqual(
  briefCadLogStore.getEntries().length,
  2,
  'The same AI guidance may appear again after the 15-minute suppression window.',
);

resetStores();
recordBrief();
recordBrief({
  id: 'ecs-brief-weather-alert',
  text: 'Weather alert active. High wind expected near the route.',
  mode: 'alert',
  priority: 2,
  severity: 'warning',
  queuedAt: baseTime + minutes(2),
});
assert.strictEqual(
  briefCadLogStore.getEntries().length,
  2,
  'New weather guidance with materially different content should display immediately.',
);

resetStores();
recordBrief({
  text: 'Weather is stale, verify exposed terrain before departure.',
  mode: 'advisory',
  priority: 4,
  severity: 'watch',
});
recordBrief({
  id: 'ecs-brief-weather-escalated',
  text: 'Weather is stale, verify exposed terrain before departure.',
  mode: 'alert',
  priority: 2,
  severity: 'warning',
  queuedAt: baseTime + minutes(3),
});
assert.strictEqual(
  briefCadLogStore.getEntries().length,
  2,
  'Severity escalations should not be suppressed even when guidance text is the same.',
);

resetStores();
recordBrief({ routeId: 'route-alpha', segmentId: 'segment-1' });
recordBrief({
  id: 'ecs-brief-weather-guidance-route-beta',
  routeId: 'route-beta',
  segmentId: 'segment-7',
  queuedAt: baseTime + minutes(4),
});
assert.strictEqual(
  briefCadLogStore.getEntries().length,
  2,
  'Same guidance on a different route/segment context should not be suppressed.',
);

resetStores();
recordBrief({
  text: 'Weather alert resolved. Route guidance remains available.',
  eventType: 'weather_resolved',
});
recordBrief({
  id: 'ecs-brief-weather-resolved-repeat',
  text: 'Weather alert resolved. Route guidance remains available.',
  eventType: 'weather_resolved',
  queuedAt: baseTime + minutes(1),
});
assert.strictEqual(
  briefCadLogStore.getEntries().length,
  1,
  'Repeated identical resolved-state guidance should not re-enter the top banner inside 15 minutes.',
);
recordBrief({
  id: 'ecs-brief-weather-resolved-later',
  text: 'Weather alert resolved. Route guidance remains available.',
  eventType: 'weather_resolved',
  queuedAt: baseTime + minutes(15) + 1,
});
assert.strictEqual(
  briefCadLogStore.getEntries().length,
  2,
  'Resolved-state guidance may appear again after the duplicate suppression window.',
);

console.log('ECS Brief guidance duplicate suppression checks passed.');
