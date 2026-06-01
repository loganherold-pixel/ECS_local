const fs = require('fs');
const path = require('path');

const ROUTE_CATALOG_ENV_KEYS = new Set([
  'ECS_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
  'ECS_ROUTE_CATALOG_SYNC_TOKEN',
]);

function cleanDotenvValue(rawValue) {
  const trimmed = String(rawValue || '').trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readDotenvPairs(source) {
  const pairs = [];
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    pairs.push([match[1], cleanDotenvValue(match[2])]);
  }
  return pairs;
}

function loadRouteCatalogEnv({
  root = path.join(__dirname, '..'),
  env = process.env,
  files = ['.env', '.env.local'],
} = {}) {
  const filesRead = [];
  const loadedKeys = [];

  for (const fileName of files) {
    const filePath = path.join(root, fileName);
    if (!fs.existsSync(filePath)) continue;
    filesRead.push(filePath);

    for (const [key, value] of readDotenvPairs(fs.readFileSync(filePath, 'utf8'))) {
      if (!ROUTE_CATALOG_ENV_KEYS.has(key)) continue;
      if (env[key]) continue;
      env[key] = value;
      loadedKeys.push(key);
    }
  }

  return { filesRead, loadedKeys };
}

module.exports = {
  ROUTE_CATALOG_ENV_KEYS,
  loadRouteCatalogEnv,
  readDotenvPairs,
};
