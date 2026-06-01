const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const graphFiles = [
  'lib/activeVehicleContext.ts',
  'lib/fleet/activeVehicleState.ts',
  'lib/fleet/fleetVehicleStateSelectors.ts',
  'lib/fleet/fleetOperatingWeight.ts',
  'lib/weightDashboardStore.ts',
  'lib/weightEngine.ts',
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function normalizeSlashes(value) {
  return value.replace(/\\/g, '/');
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const fromDir = path.dirname(fromFile);
  const base = normalizeSlashes(path.normalize(path.join(fromDir, specifier)));
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ];
  return candidates.find((candidate) => graphFiles.includes(candidate)) ?? null;
}

function getRuntimeImports(relativePath) {
  const source = read(relativePath);
  const imports = [];
  const importPattern = /import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importPattern.exec(source)) != null) {
    const importClause = match[1].trim();
    const specifier = match[2];
    if (importClause.startsWith('type ')) continue;
    const resolved = resolveImport(relativePath, specifier);
    if (resolved) imports.push(resolved);
  }
  return imports;
}

function assertNoCycle() {
  const graph = new Map(graphFiles.map((file) => [file, getRuntimeImports(file)]));
  const visiting = new Set();
  const visited = new Set();

  function visit(file, stack) {
    if (visiting.has(file)) {
      const cycleStart = stack.indexOf(file);
      const cycle = [...stack.slice(cycleStart), file].join(' -> ');
      assert.fail(`Runtime import cycle detected: ${cycle}`);
    }
    if (visited.has(file)) return;
    visiting.add(file);
    for (const next of graph.get(file) ?? []) {
      visit(next, [...stack, next]);
    }
    visiting.delete(file);
    visited.add(file);
  }

  for (const file of graphFiles) {
    visit(file, [file]);
  }
}

const weightEngine = read('lib/weightEngine.ts');
assert.ok(
  /import\s+type\s+\{\s*ActiveVehicleContext\s*\}\s+from\s+['"]\.\/vehicle\/activeVehicleTypes['"]/.test(weightEngine),
  'weightEngine must type-import ActiveVehicleContext from the shared vehicle type module.',
);
assert.ok(
  !/import\s+[^;]+from\s+['"]\.\/activeVehicleContext['"]/.test(weightEngine),
  'weightEngine must not import activeVehicleContext at module scope.',
);
assert.ok(
  /require\(['"]\.\/activeVehicleContext['"]\)/.test(weightEngine),
  'weightEngine should resolve activeVehicleContext lazily inside context-backed breakdown calculation.',
);

assertNoCycle();

console.log('active vehicle / weight require-cycle guard passed');
