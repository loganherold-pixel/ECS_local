# Supabase Database Testing

ECS uses Supabase pgTAP database tests as a release gate for row-level security regressions.

## Local Commands

Start the local Supabase stack:

```sh
supabase start
```

Run database tests:

```sh
supabase test db
```

The current pgTAP tests live under:

```text
supabase/tests/database/
```

The first RLS coverage file is:

```text
supabase/tests/database/rls_convoy_tracking.test.sql
```

## RLS Coverage Matrix

| ECS domain | Tables covered | Test file | Status |
| --- | --- | --- | --- |
| Trips, route plans, waypoints | `trips`, `waypoints` | `supabase/tests/database/010-trips-rls.test.sql` | Covered with anon, owner, non-owner, insert/update/delete checks |
| Fleet vehicles and loadouts | `vehicles`, `loadouts`, `loadout_items` | `supabase/tests/database/020-fleet-rls.test.sql` | Covered with anon, owner, non-owner, parent vehicle/loadout checks |
| Convoy/team membership and live locations | `convoys`, `convoy_invites`, `convoy_members`, `convoy_member_locations` | `supabase/tests/database/rls_convoy_tracking.test.sql` | Covered with anon, leader, member, non-member, revoked member, location publish checks |
| Dispatch/team event access | `dispatch_cad_events` | Not yet added | Next candidate for authorized user array coverage |
| Expedition persistence | `expedition_sessions`, `expedition_timeline_events`, `expedition_timeline` | Not yet added | Next candidate for owner and parent-session coverage |
| Telemetry snapshots and power device records | No migrated table found in this checkout | Not available | Add tests when telemetry persistence tables land |
| Offline prep packs/cache metadata | No migrated table found in this checkout | Not available | Add tests when offline pack persistence tables land |
| Camp favorites/saved filters | No migrated table found in this checkout | Not available | Camp community/provider tables exist, but saved user favorites/filter tables were not found |

The legacy core trip/resource tables gained owner-only RLS in `supabase/migrations/024_legacy_core_rls.sql` before trip/waypoint pgTAP coverage was added.

## CI Gate

GitHub Actions runs `.github/workflows/supabase-db-tests.yml` on `pull_request` and `push`.

The workflow:

- checks out the repo
- installs the Supabase CLI with `supabase/setup-cli@v1`
- starts the local Supabase stack with `supabase start`
- runs `supabase test db`

If pgTAP or RLS tests fail, the pull request fails.

## Staging Smoke Tests

After staging migrations deploy, run the read-only anon REST smoke check:

```sh
SUPABASE_URL="https://your-staging-project.supabase.co" \
SUPABASE_ANON_KEY="your-staging-anon-key" \
bash scripts/supabase-rls-smoke.sh
```

To override the private table list:

```sh
SUPABASE_URL="https://your-staging-project.supabase.co" \
SUPABASE_ANON_KEY="your-staging-anon-key" \
ECS_RLS_TABLES="convoys convoy_members convoy_member_locations vehicles loadouts" \
bash scripts/supabase-rls-smoke.sh
```

The smoke script uses only the anon key. It never uses a service-role key and does not mutate staging data. A table passes when anon REST access is denied with `401`/`403` or returns an empty array. A table fails when anon REST returns any row.

Run the catalog check in staging SQL tooling to verify key tables have RLS enabled:

```sql
-- supabase/smoke/rls_catalog_check.sql
```

The catalog check is read-only and raises an exception if a key table is missing or has `relrowsecurity = false`.

## Safety Notes

- This workflow does not deploy anything.
- This workflow does not run migrations against production.
- No production Supabase secrets are required.
- Test fixtures must stay inside `BEGIN; ... ROLLBACK;`.
- Tests should use deterministic local IDs only, never production IDs.
