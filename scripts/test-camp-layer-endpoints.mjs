#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_BBOX = {
  minLng: -121.656,
  minLat: 40.363,
  maxLng: -121.444,
  maxLat: 40.601,
};

function readDotEnvValue(name) {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return undefined;
  const source = fs.readFileSync(envPath, 'utf8');
  const line = source
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`));
  if (!line) return undefined;
  return line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
}

function getEnv(name) {
  return process.env[name] || readDotEnvValue(name) || '';
}

function readBbox() {
  const values = { ...DEFAULT_BBOX };
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--(minLng|minLat|maxLng|maxLat)=(-?\d+(?:\.\d+)?)$/);
    if (match) values[match[1]] = Number(match[2]);
  }
  return values;
}

function buildFunctionsUrl(baseUrl, functionName) {
  return `${baseUrl.replace(/\/+$/, '')}/functions/v1/${functionName}`;
}

function assertFeatureCollection(functionName, body) {
  if (!body || typeof body !== 'object') {
    throw new Error(`${functionName} returned a non-object JSON body`);
  }
  if (body.ok !== true) {
    throw new Error(`${functionName} returned ok=false: ${String(body.error || 'unknown error')}`);
  }
  if (!body.geojson || body.geojson.type !== 'FeatureCollection' || !Array.isArray(body.geojson.features)) {
    throw new Error(`${functionName} did not return a GeoJSON FeatureCollection`);
  }
}

async function probeFunction({ baseUrl, anonKey, functionName, body }) {
  const url = buildFunctionsUrl(baseUrl, functionName);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${functionName} returned HTTP ${response.status}`);
  }
  assertFeatureCollection(functionName, json);
  return {
    functionName,
    status: response.status,
    featureCount: json.geojson.features.length,
    count: typeof json.count === 'number' ? json.count : null,
    source: typeof json.meta?.source === 'string' ? json.meta.source : null,
  };
}

async function main() {
  const baseUrl = getEnv('EXPO_PUBLIC_SUPABASE_URL');
  const anonKey = getEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (!baseUrl || !anonKey) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.');
    process.exit(1);
  }

  const bbox = readBbox();
  const bboxString = [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat]
    .map((value) => value.toFixed(6))
    .join(',');
  const probes = [
    {
      baseUrl,
      anonKey,
      functionName: 'dispersed-camping-eligibility',
      body: { bbox: bboxString, limit: 80 },
    },
    {
      baseUrl,
      anonKey,
      functionName: 'campgrounds-search',
      body: { bbox: bboxString, limit: 250, availability: 'any', openStatus: 'any' },
    },
  ];

  const results = [];
  for (const probe of probes) {
    try {
      results.push({
        ok: true,
        ...(await probeFunction(probe)),
      });
    } catch (error) {
      results.push({
        ok: false,
        functionName: probe.functionName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const ok = results.every((result) => result.ok);
  console.log(JSON.stringify({ ok, bbox, results }, null, 2));
  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
