/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypescript(module, filename) {
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
}

require.extensions['.ts'] = compileTypescript;

const providerContractPath = path.join(
  root,
  'supabase',
  'functions',
  'route-catalog-search',
  'providerContract.ts',
);
const edgeFunctionPath = path.join(
  root,
  'supabase',
  'functions',
  'route-catalog-search',
  'index.ts',
);
const verifiedRoutesSourceVersionMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260715143000_verified_routes_source_version_trigger.sql',
);
const providerSource = fs.readFileSync(providerContractPath, 'utf8');

const {
  buildSafeRouteCatalogDiagnostic,
  decodeRouteCatalogPageCursor,
  encodeRouteCatalogPageCursor,
  expandRouteCatalogCandidateLimit,
  hasRestrictedRouteCatalogSource,
  normalizeRouteCatalogPagination,
  partitionRouteCatalogRecordsForPage,
  partitionRestrictedRouteCatalogRecords,
  routeCatalogCursorFingerprint,
} = require(providerContractPath);

const restrictedCoordinate = [-120.781234, 38.921234];
const restrictedRecord = {
  id: 'restricted-route-id',
  public_id: 'restricted-route-public-id',
  name: 'Restricted route diagnostic',
  route_type: 'loop',
  center_latitude: restrictedCoordinate[1],
  center_longitude: restrictedCoordinate[0],
  route_geometry: {
    type: 'LineString',
    coordinates: [restrictedCoordinate, [-120.75, 38.95]],
  },
  route_intelligence: {
    trailheadCoordinate: {
      latitude: restrictedCoordinate[1],
      longitude: restrictedCoordinate[0],
    },
  },
  raw_payload: { secret: 'must-not-cross-provider-boundary' },
  review_status: 'approved',
  recommendation_status: 'recommendable',
  updated_at: '2026-07-15T00:00:00.000Z',
  source_records: [{
    provider_id: 'partner-provider',
    source_type: 'partner_restricted',
    authority: 'partner_restricted',
    use_permission: 'not_granted',
  }],
};
const officialRecord = {
  id: 'official-route-id',
  public_id: 'official-route-public-id',
  name: 'Official route',
  route_type: 'loop',
  route_geometry: {
    type: 'LineString',
    coordinates: [[-121, 39], [-120.9, 39.1]],
  },
  source_records: [{ source_type: 'official', authority: 'official' }],
};

assert.strictEqual(hasRestrictedRouteCatalogSource(restrictedRecord), true);
assert.strictEqual(hasRestrictedRouteCatalogSource(officialRecord), false);

const partition = partitionRestrictedRouteCatalogRecords([restrictedRecord, officialRecord]);
assert.deepStrictEqual(partition.records, [officialRecord]);
assert.strictEqual(partition.diagnosticRecords.length, 1);
assert.strictEqual(partition.diagnosticRecords[0].routeId, 'restricted-route-id');
assert.deepStrictEqual(partition.diagnosticRecords[0].exclusionReasons, ['source_restricted']);

const paginatedOfficials = Array.from({ length: 51 }, (_, index) => ({
  ...officialRecord,
  id: `official-route-${String(index).padStart(2, '0')}`,
  public_id: `official-route-public-${String(index).padStart(2, '0')}`,
}));
const interleavedProviderRecords = [
  ...paginatedOfficials.slice(0, 25),
  restrictedRecord,
  ...paginatedOfficials.slice(25),
];
const revealablePageOne = partitionRouteCatalogRecordsForPage(interleavedProviderRecords, {
  offset: 0,
  pageSize: 50,
});
const revealablePageTwo = partitionRouteCatalogRecordsForPage(interleavedProviderRecords, {
  offset: 50,
  pageSize: 50,
});
assert.strictEqual(revealablePageOne.records.length, 50);
assert.strictEqual(revealablePageOne.diagnosticRecords.length, 1);
assert.strictEqual(revealablePageOne.hasMoreRevealable, true);
assert.strictEqual(revealablePageTwo.records.length, 1);
assert.strictEqual(revealablePageTwo.records[0].id, paginatedOfficials[50].id);
assert.strictEqual(
  new Set([...revealablePageOne.records, ...revealablePageTwo.records].map((record) => record.id)).size,
  51,
  'Restricted diagnostics must not consume revealable route slots or create cross-page duplicates.',
);
assert.strictEqual(expandRouteCatalogCandidateLimit(51, 50), 102);
assert.strictEqual(expandRouteCatalogCandidateLimit(1500, 50), 2000);

const serializedProviderBoundary = JSON.stringify({
  records: partition.records,
  diagnosticRecords: partition.diagnosticRecords,
});
const serializedDiagnostic = JSON.stringify(partition.diagnosticRecords[0]);
[
  'raw_payload',
  'must-not-cross-provider-boundary',
  String(restrictedCoordinate[0]),
  String(restrictedCoordinate[1]),
].forEach((forbiddenValue) => {
  assert(
    !serializedProviderBoundary.includes(forbiddenValue),
    `Raw provider-boundary serialization must not contain restricted ${forbiddenValue}.`,
  );
});
[
  'route_geometry',
  'routeGeometry',
  'route_intelligence',
  'routeIntelligence',
  'center_latitude',
  'center_longitude',
  'coordinates',
  'raw_payload',
].forEach((forbiddenKey) => {
  assert(
    !serializedDiagnostic.includes(forbiddenKey),
    `Safe restricted diagnostic must not contain ${forbiddenKey}.`,
  );
});

const curationDiagnostic = buildSafeRouteCatalogDiagnostic({
  id: 'curation-route',
  public_id: 'curation-route-public',
  name: 'Curation route',
  route_type: 'loop',
  geometry_quality: 'missing',
  official_access_coverage_pct: 20,
  unknown_access_coverage_pct: 80,
  active_closure_count: 1,
  vehicle_mismatch: true,
  seasonal_restriction_count: 1,
  stale_at: '2020-01-01T00:00:00.000Z',
  review_status: 'needs_more_data',
  recommendation_status: 'needs_review',
});
assert(curationDiagnostic);
assert.deepStrictEqual(
  new Set(curationDiagnostic.exclusionReasons),
  new Set([
    'missing_geometry',
    'access_unverified',
    'current_condition_blocked',
    'moderation_pending',
    'vehicle_incompatible',
    'date_or_season_blocked',
    'stale_required_source',
  ]),
);

assert.deepStrictEqual(
  normalizeRouteCatalogPagination({ page: 2, pageSize: 25 }),
  { page: 2, pageSize: 25, offset: 25, windowEnd: 50, windowExceeded: false },
);
assert.deepStrictEqual(
  normalizeRouteCatalogPagination({ page: 3, limit: 20, offset: 75 }),
  { page: 3, pageSize: 20, offset: 75, windowEnd: 95, windowExceeded: false },
);
assert.strictEqual(
  normalizeRouteCatalogPagination({ page: 5, pageSize: 500 }).windowExceeded,
  true,
  'Pagination beyond the bounded provider search window must be rejected, not silently overlapped.',
);

const edgeSource = fs.readFileSync(edgeFunctionPath, 'utf8');
const edgeTranspile = ts.transpileModule(edgeSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: edgeFunctionPath,
  reportDiagnostics: true,
});
assert.deepStrictEqual(
  (edgeTranspile.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error),
  [],
  'The route-catalog-search Edge entry must remain valid TypeScript.',
);
assert(
  edgeSource.includes("from './providerContract.ts'") &&
    edgeSource.includes("'route_catalog_nearby_route_ids'") &&
    edgeSource.includes("'route_catalog_nearby_public_route_page'") &&
    edgeSource.includes("'route_catalog_nearby_public_route_cursor_page'") &&
    edgeSource.includes('p_offset: Math.max(0, Math.floor(args.offset ?? 0))') &&
    edgeSource.includes('p_cursor_route_id: args.continuationCursor?.routeId ?? null') &&
    edgeSource.includes('publicPage: true') &&
    edgeSource.includes('cursorPage: useCursorPage') &&
    edgeSource.includes('offset: hasRadiusCriteria ? 0 : offset') &&
    edgeSource.includes("'ROUTE_CATALOG_INVALID_SEARCH_AREA'") &&
    edgeSource.includes("'ROUTE_CATALOG_INVALID_CONTINUATION'") &&
    edgeSource.includes("'ROUTE_CATALOG_CONTINUATION_REQUIRED'") &&
    edgeSource.includes('requestsCursorContract') &&
    edgeSource.includes('spatialIndexFilterApplied: hasRadiusCriteria') &&
    edgeSource.includes('coverageDiagnosticsUnavailable = true') &&
    edgeSource.includes('if (!skipCoverageDiagnostics && limitedRecords.length === 0)') &&
    edgeSource.includes('partitionRouteCatalogRecordsForPage(') &&
    edgeSource.includes('expandRouteCatalogCandidateLimit(queryLimit, pageSize)') &&
    edgeSource.includes('revealablePage.hasMoreRevealable') &&
    edgeSource.includes('offset + nearbyLookupCount') &&
    edgeSource.includes("'route_catalog_public_cursor_page_v2'") &&
    edgeSource.includes("'route_catalog_public_page_v1'") &&
    edgeSource.includes('nearbyRouteRpcUsed: hasRadiusCriteria') &&
    edgeSource.includes("? 'route_catalog_nearby_public_route_cursor_page'") &&
    edgeSource.includes('fallbackQueryUsed: !hasRadiusCriteria') &&
    edgeSource.includes('annotateIndexedRadiusPage(candidates') &&
    edgeSource.includes('diagnosticRecords,') &&
    edgeSource.includes('normalizeRouteCatalogPagination(params)') &&
    !edgeSource.includes('sourceMatchedRecords.slice(offset, windowEnd)') &&
    !edgeSource.includes('radiusFiltered.records.slice(offset, windowEnd)') &&
    edgeSource.includes('cleanText(a.id).localeCompare(cleanText(b.id))') &&
    edgeSource.includes('totalMatchedCount: matchedCount') &&
    edgeSource.includes('nextPage: hasMore ? page + 1 : null') &&
    edgeSource.includes('nextCursor: hasMore ? nextCursor : null') &&
    edgeSource.includes('await routeCatalogCursorFingerprint([') &&
    providerSource.includes("crypto.subtle.digest('SHA-256', input)") &&
    providerSource.includes("{ name: 'HMAC', hash: 'SHA-256' }") &&
    providerSource.includes("crypto.subtle.verify("),
  'The executed provider contract must use radius-first lookup, fail-soft diagnostics, restricted-source partitioning, legacy bounds, and criteria-bound signed cursor pagination.',
);

const sourceVersionMigration = fs.readFileSync(verifiedRoutesSourceVersionMigrationPath, 'utf8');
assert(
  sourceVersionMigration.includes('verified_routes_set_updated_at') &&
    sourceVersionMigration.includes('before update on public.verified_routes') &&
    sourceVersionMigration.includes('execute function public.set_updated_at()'),
  'Verified route updates must advance the source version used by detail-cache keys and catalog ordering.',
);

async function verifyOpaqueCursorContract() {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: require('crypto').webcrypto,
    });
  }
  const criteria = ['privacy-safe-location-bucket', 500, true, 'full_size_4x4'];
  const fingerprint = await routeCatalogCursorFingerprint(criteria);
  const repeatedFingerprint = await routeCatalogCursorFingerprint(criteria);
  const changedFingerprint = await routeCatalogCursorFingerprint([
    'privacy-safe-location-bucket',
    499,
    true,
    'full_size_4x4',
  ]);
  assert.strictEqual(fingerprint, repeatedFingerprint);
  assert.notStrictEqual(fingerprint, changedFingerprint);
  assert.match(fingerprint, /^[0-9a-f]{32}$/);

  const routeId = '00000000-0000-4000-8000-000000000051';
  const signingSecret = 'unit-test-only-cursor-signing-secret';
  const cursor = await encodeRouteCatalogPageCursor({ routeId }, fingerprint, signingSecret);
  assert.deepStrictEqual(
    await decodeRouteCatalogPageCursor(cursor, fingerprint, signingSecret),
    { routeId },
  );
  assert.strictEqual(
    await decodeRouteCatalogPageCursor(cursor, changedFingerprint, signingSecret),
    null,
  );
  const tamperedCursor = `${cursor.slice(0, -1)}${cursor.endsWith('A') ? 'B' : 'A'}`;
  assert.strictEqual(
    await decodeRouteCatalogPageCursor(tamperedCursor, fingerprint, signingSecret),
    null,
  );

  const decodedPayload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  assert.deepStrictEqual(Object.keys(decodedPayload).sort(), ['f', 'r', 's', 'v']);
  assert.strictEqual(JSON.stringify(decodedPayload).includes('latitude'), false);
  assert.strictEqual(JSON.stringify(decodedPayload).includes('longitude'), false);
  assert.strictEqual(JSON.stringify(decodedPayload).includes('radius'), false);
  const forgedPayload = {
    ...decodedPayload,
    r: '00000000-0000-4000-8000-000000000099',
  };
  const forgedCursor = Buffer.from(JSON.stringify(forgedPayload)).toString('base64url');
  assert.strictEqual(
    await decodeRouteCatalogPageCursor(forgedCursor, fingerprint, signingSecret),
    null,
    'Changing the route continuation without the server-only HMAC must be rejected.',
  );

  console.log('Route catalog search provider contract checks passed.');

  // Keep the radius-first database behavior in the established provider-contract
  // lane so the regression cannot be skipped by running only package scripts.
  require('./test-route-catalog-nearby-route-ids-rpc.js');
}

verifyOpaqueCursorContract().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
