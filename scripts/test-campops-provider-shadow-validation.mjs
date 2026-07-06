import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCampOpsProviderShadowEvidence,
  renderRegion001EvidenceLedgerRows,
} from './lib/campops-provider-shadow-validation.mjs';

const aggregateFixture = {
  checkedAt: '2026-07-06T17:24:44.014Z',
  routeRollup: {
    candidate_count: 100,
    legal_access_covered_count: 91,
    legal_access_unknown_count: 7,
    legal_access_conflict_count: 2,
    closure_covered_count: 83,
    active_closure_candidate_count: 3,
    seasonal_restriction_candidate_count: 80,
    stale_candidate_count: 4,
    latest_verified_at: '2026-07-01T13:26:46.173Z',
    oldest_verified_at: '2026-06-02T02:39:02.935Z',
  },
  routeSources: [
    {
      provider_id: 'usfs_mvum_humboldt_toiyabe_nf',
      source_type: 'federal_agency',
      authority: 'official_access',
      status: 'active',
      covered_routes: 91,
      avg_source_coverage_pct: 100,
      conflicting_source_rows: 2,
      latest_source_verified_at: '2026-07-01T13:26:46.173Z',
    },
  ],
  campgroundRollup: {
    candidate_count: 0,
    provider_backed_count: 0,
    status_known_count: 0,
    unknown_status_count: 0,
    closed_status_count: 0,
    stale_canonical_count: 0,
    latest_service_checked_at: null,
    oldest_service_checked_at: null,
  },
  campgroundByProvider: [],
  availabilityRollup: {
    availability_row_count: 0,
    covered_campgrounds: 0,
    unknown_or_stale_rows: 0,
    expired_rows: 0,
    latest_availability_checked_at: null,
    oldest_availability_checked_at: null,
  },
  syncRollup: [
    {
      provider_id: 'ridb',
      run_count: 1,
      completed_run_count: 1,
      failed_run_count: 0,
      latest_finished_at: '2026-05-16T20:57:14.087Z',
      records_read: 10,
      records_upserted: 10,
      records_failed: 0,
      error_count: 0,
    },
  ],
  sourceRecordRollup: [],
  privateCoordinatesThatMustNotLeak: {
    latitude: 39.987654,
    longitude: -119.123456,
  },
  raw_json: { title: 'raw provider payload must not leak' },
};

test('CampOps Region 001 shadow evidence summarizes only sanitized aggregate provider evidence', () => {
  const evidence = buildCampOpsProviderShadowEvidence({
    generatedAt: '2026-07-06T17:30:00.000Z',
    regionLabel: 'Region 001 - Northern Nevada controlled provider shadow cell',
    releaseCohortLabel: 'internal-shadow-validation-region-001',
    projectRef: 'ppullxxprgyeoakzqnxi',
    sourceAggregate: aggregateFixture,
  });

  assert.equal(evidence.schemaVersion, 'campops-provider-shadow-region-001/v1');
  assert.equal(evidence.validationMode, 'real-shadow');
  assert.equal(evidence.providerInfluenceAllowed, false);
  assert.equal(evidence.providerOutputAppliedToRecommendations, false);
  assert.equal(evidence.rawProviderPayloadsExcluded, true);
  assert.equal(evidence.precisePrivateCoordinatesExcluded, true);

  assert.equal(evidence.categories['legal/access'].realShadowStatus, 'shadow_validated');
  assert.equal(evidence.categories['legal/access'].coverageRate, '91%');
  assert.equal(evidence.categories['legal/access'].unknownRate, '7%');
  assert.equal(evidence.categories['legal/access'].conflictRate, '2%');
  assert.equal(evidence.categories['legal/access'].acceptedForInfluence, false);

  assert.equal(evidence.categories['closure/seasonal restriction'].realShadowStatus, 'shadow_validated');
  assert.equal(evidence.categories['closure/seasonal restriction'].coverageRate, '83%');
  assert.equal(evidence.categories['closure/seasonal restriction'].staleRate, '4%');

  assert.equal(evidence.categories['service/resupply'].realShadowStatus, 'missing_live_records');
  assert.equal(evidence.categories['service/resupply'].coverageRate, '0%');
  assert.ok(evidence.categories['service/resupply'].blockers.includes('no_region_001_service_or_resupply_records'));

  assert.equal(evidence.categories['fire restriction'].realShadowStatus, 'missing_live_persisted_evidence');
  assert.equal(evidence.categories.weather.realShadowStatus, 'missing_live_persisted_evidence');

  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /raw provider payload/i);
  assert.doesNotMatch(serialized, /raw_json/i);
  assert.doesNotMatch(serialized, /provider_record_id/i);
  assert.doesNotMatch(serialized, /39\.987654|-119\.123456/);
  assert.doesNotMatch(serialized, /"latitude"|"longitude"|"lat"|"lng"/i);
});

test('Region 001 ledger rows keep shadow validation separate from influence approval', () => {
  const evidence = buildCampOpsProviderShadowEvidence({
    generatedAt: '2026-07-06T17:30:00.000Z',
    regionLabel: 'Region 001 - Northern Nevada controlled provider shadow cell',
    releaseCohortLabel: 'internal-shadow-validation-region-001',
    projectRef: 'ppullxxprgyeoakzqnxi',
    sourceAggregate: aggregateFixture,
  });

  const rows = renderRegion001EvidenceLedgerRows(evidence);

  assert.match(rows, /\| legal\/access \| usfs_mvum_humboldt_toiyabe_nf \| real-shadow observed \| 91% \| fresh \| 7% \| 4% \| 2% \| no \|/);
  assert.match(rows, /\| service\/resupply \| none observed \| missing_live_records \| 0% \| unknown \| 100% \| 0% \| 0% \| no \|/);
  assert.doesNotMatch(rows, /accepted for influence.*yes/i);
});
