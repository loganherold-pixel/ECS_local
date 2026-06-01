const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const migration = read('supabase/migrations/019_expedition_cloud_persistence.sql');
const availability = read('lib/expeditionCloudSyncAvailability.ts');
const expeditionState = read('lib/expeditionStateStore.ts');
const timelineIntel = read('lib/timelineIntelligenceEngine.ts');

for (const table of [
  'public.expedition_sessions',
  'public.expedition_timeline_events',
  'public.expedition_timeline',
]) {
  assert(migration.includes(table), `Migration should define ${table}.`);
}

assert(
  migration.includes('alter table public.expedition_sessions enable row level security') &&
    migration.includes('alter table public.expedition_timeline_events enable row level security') &&
    migration.includes('alter table public.expedition_timeline enable row level security'),
  'Expedition cloud tables should enable RLS.'
);

assert(
  migration.includes('user_id uuid default auth.uid()'),
  'Expedition sessions/timeline should default user_id from auth.uid() for cloud inserts.'
);

assert(
  migration.includes('expedition_sessions_user_start_idx') &&
    migration.includes('expedition_timeline_events_session_occurred_idx') &&
    migration.includes('expedition_timeline_expedition_timestamp_idx'),
  'Expedition cloud tables should include lookup indexes.'
);

assert(
  !migration.includes('auth.uid() = user_id\n  or\n  exists (\n    select 1\n    from public.expedition_sessions s\n    where s.id = session_id') &&
    migration.includes('where s.id = session_id') &&
    migration.includes('and s.user_id = auth.uid()'),
  'Timeline event RLS should authorize through expedition_sessions because expedition_timeline_events has no user_id column.'
);

assert(
  availability.includes('const unavailableTables = new Set<string>()') &&
    availability.includes('isMissingExpeditionCloudTableError') &&
    availability.includes('markExpeditionCloudTableUnavailable'),
  'Cloud sync availability helper should track missing expedition cloud tables once per session.'
);

assert(
  availability.includes('schema cache') &&
    availability.includes('could not find the table') &&
    availability.includes('pgrst205'),
  'Cloud sync availability helper should recognize Supabase missing-table/schema-cache errors.'
);

assert(
  expeditionState.includes("isExpeditionCloudTableUnavailable('expedition_sessions')") &&
    expeditionState.includes("markExpeditionCloudTableUnavailable(TAG, 'expedition_sessions'"),
  'Expedition state cloud session sync should skip and mark missing expedition_sessions gracefully.'
);

assert(
  expeditionState.includes("isExpeditionCloudTableUnavailable('expedition_timeline_events')") &&
    expeditionState.includes("markExpeditionCloudTableUnavailable(TAG, 'expedition_timeline_events'"),
  'Expedition lifecycle event cloud sync should skip and mark missing expedition_timeline_events gracefully.'
);

assert(
  expeditionState.includes('if (record?.cloudSessionId)') &&
    !expeditionState.includes("record?.cloudSessionId || record?.id"),
  'Expedition lifecycle event cloud sync should not race session creation with local ids.'
);

assert(
  timelineIntel.includes("isExpeditionCloudTableUnavailable('expedition_timeline')") &&
    timelineIntel.includes("markExpeditionCloudTableUnavailable(TAG, 'expedition_timeline'"),
  'Timeline intelligence cloud sync should skip and mark missing expedition_timeline gracefully.'
);

console.log('Expedition cloud sync persistence checks passed.');
