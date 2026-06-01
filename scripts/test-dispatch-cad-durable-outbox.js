const assert = require('assert');
const fs = require('fs');
const path = require('path');

const componentPath = path.join(process.cwd(), 'components/dispatch/DispatchCadCommandCenter.tsx');
const persistencePath = path.join(process.cwd(), 'lib/dispatchPersistenceAdapter.ts');
const replayPath = path.join(process.cwd(), 'lib/dispatchOfflineReplayAdapter.ts');
const backendPath = path.join(process.cwd(), 'lib/dispatchCadEventBackendAdapter.ts');
const migrationPath = path.join(process.cwd(), 'supabase/migrations/005_dispatch_cad_events.sql');

const componentSource = fs.readFileSync(componentPath, 'utf8');
const persistenceSource = fs.readFileSync(persistencePath, 'utf8');
const replaySource = fs.readFileSync(replayPath, 'utf8');
const backendSource = fs.readFileSync(backendPath, 'utf8');
const migrationSource = fs.readFileSync(migrationPath, 'utf8');

assert.match(
  migrationSource,
  /create table if not exists public\.dispatch_cad_events/,
  'Dispatch CAD events need a durable backend table.',
);
assert.match(
  migrationSource,
  /authorized_user_ids uuid\[\]/,
  'Backend CAD events should carry event-scoped authorized user IDs for RLS.',
);
assert.match(
  migrationSource,
  /enable row level security/,
  'Dispatch CAD event storage must enable RLS.',
);
assert.match(
  migrationSource,
  /auth\.uid\(\) = any\(authorized_user_ids\)/,
  'RLS should allow only authorized event users to read/write location-bearing CAD events.',
);

assert.match(
  backendSource,
  /export async function upsertDispatchCadEventToBackend/,
  'Backend adapter should expose a CAD event upsert.',
);
assert.match(
  backendSource,
  /from\(DISPATCH_CAD_EVENTS_TABLE\)[\s\S]*\.upsert/,
  'Backend adapter should persist CAD events through Supabase upsert.',
);
assert.match(
  backendSource,
  /export async function fetchDispatchCadEventsFromBackend/,
  'Backend adapter should fetch durable team/session CAD events.',
);
assert.match(
  backendSource,
  /getDispatchCadAuthorizedUserIds/,
  'Backend payloads should include authorized user IDs.',
);

assert.match(
  persistenceSource,
  /cadEvents: DispatchEvent\[\]/,
  'Dispatch persistence snapshots should include CAD events.',
);
assert.match(
  persistenceSource,
  /upsertCadEvent/,
  'Dispatch persistence adapter should expose CAD event upsert.',
);
assert.match(
  persistenceSource,
  /mergeDispatchCadEvents/,
  'Persisted CAD events should be deduped before saving.',
);

assert.match(
  replaySource,
  /persistCadEvent\?: \(event: DispatchEvent\) => Promise<boolean>/,
  'Offline replay should accept a backend CAD persistence hook.',
);
assert.match(
  replaySource,
  /type: 'cad_event_upsert'/,
  'Offline replay should publish CAD event upserts after durable persistence.',
);
assert.match(
  replaySource,
  /syncState: 'failed'/,
  'Offline replay should keep failed CAD delivery visible for retry.',
);

assert.match(
  componentSource,
  /dispatchPersistenceAdapter\.upsertCadEvent/,
  'Dispatch UI should persist recovery CAD events to the durable local outbox.',
);
assert.match(
  componentSource,
  /fetchDispatchCadEventsFromBackend/,
  'Dispatch UI should hydrate recovery CAD events from durable backend storage.',
);
assert.match(
  componentSource,
  /upsertDispatchCadEventToBackend/,
  'Dispatch UI should write recovery CAD events to durable backend storage.',
);
assert.match(
  componentSource,
  /const sent = durableResult\.ok/,
  'Dispatch should not mark recovery CAD durable until backend storage succeeds.',
);
assert.match(
  componentSource,
  /persistRecoveryCadEventLocally\(failedEvent\)/,
  'Failed recovery CAD sends should remain in the local outbox for retry.',
);

console.log('Dispatch CAD durable backend/outbox checks passed.');
