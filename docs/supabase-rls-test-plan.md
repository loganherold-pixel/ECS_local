# Supabase RLS Test Plan

Audit date: 2026-05-22

Scope: database test-surface audit only. No migrations, application behavior, secrets, or runtime code were changed.

## Repository Surface

- Supabase config exists at `supabase/config.toml`.
- Local API exposes `public` and `graphql_public`; Realtime is enabled.
- Migrations are present under `supabase/migrations`.
- No `supabase/tests` or `supabase/tests/database` folder was found in this checkout.
- CI wiring now exists at `.github/workflows/supabase-db-tests.yml` and runs `supabase start` plus `supabase test db` on `pull_request` and `push`.
- No generated Supabase `Database` TypeScript type file was found by static search.
- `supabase/remote_public_schema.sql` exists but is empty, so remote schema verification is not available from the repo.
- No pgTAP helper, `pgtap` extension migration, or SQL auth-test helper was found.

## Tables Found

The table inventory below is inferred from checked-in migrations and app/function usage. `RLS` means an `alter table ... enable row level security` statement was found in migrations.

| Table | Migration source | RLS | Existing policies found | User/app exposure | RLS test priority |
| --- | --- | --- | --- | --- | --- |
| `trips` | `001_ecs_core_schema.sql`, `024_legacy_core_rls.sql` | Enabled | owner select/insert/update/delete | Legacy trip/user-owned data | Covered by `010-trips-rls.test.sql` |
| `waypoints` | `001_ecs_core_schema.sql`, `024_legacy_core_rls.sql` | Enabled | owner select/insert/update/delete with parent trip ownership checks | Legacy trip waypoint/user-owned data | Covered by `010-trips-rls.test.sql` |
| `load_items` | `001_ecs_core_schema.sql`, `024_legacy_core_rls.sql` | Enabled | owner select/insert/update/delete | Legacy load/user-owned data | Needs direct tests |
| `load_map_slots` | `001_ecs_core_schema.sql`, `024_legacy_core_rls.sql` | Enabled | owner select/insert/update/delete | Legacy load map/user-owned data | Needs direct tests |
| `fuel_water_logs` | `001_ecs_core_schema.sql`, `024_legacy_core_rls.sql` | Enabled | owner select/insert/update/delete | Legacy expedition resource logs | Needs direct tests |
| `risk_scores` | `001_ecs_core_schema.sql`, `024_legacy_core_rls.sql` | Enabled | owner select/insert/update/delete | Legacy expedition scoring | Needs direct tests |
| `profiles` | `002_ecs_auth_entitlements.sql` | Not found | None found | Account/profile data via auth edge function | High gap |
| `operators` | `002_ecs_auth_entitlements.sql` | Not found | None found | Account/access/admin gate data | High gap |
| `entitlements` | `002_ecs_auth_entitlements.sql` | Not found | None found | Subscription/access data | High gap |
| `billing_events` | `002_ecs_auth_entitlements.sql` | Not found | None found | Billing webhook history | High gap |
| `audit_logs` | `002_ecs_auth_entitlements.sql` | Not found | None found | Security/account audit trail | High gap |
| `ecs_issue_events` | `003_ecs_issue_intelligence.sql` | Not found | None found | Runtime issue telemetry via edge function | Medium gap |
| `vehicles` | `004_ecs_fleet_schema.sql` | Enabled | select/insert/update/delete own | Direct client fleet store use | High |
| `loadouts` | `004_ecs_fleet_schema.sql` | Enabled | select/insert/update/delete own; vehicle ownership checks | Direct client loadout store use | High |
| `loadout_items` | `004_ecs_fleet_schema.sql` | Enabled | select/insert/update/delete own; parent loadout checks | Direct client loadout store use | High |
| `dispatch_cad_events` | `005_dispatch_cad_events.sql` | Enabled | select/insert/update authorized users | Dispatch event sync adapter | High |
| `camp_sites` | `006_campsite_recommendations.sql` | Enabled | visible select, own insert/update | Camp/community data | High |
| `camp_site_reports` | `006`, `007`, `011`, `014` | Enabled | own select/insert/update; community review; group-shared select | Camp/community review data | High |
| `camp_site_flags` | `006_campsite_recommendations.sql` | Enabled | own select/insert | Camp safety/moderation data | Medium |
| `camp_site_photos` | `006`, `010`, `011` | Enabled | own select, approved public select, group-shared select, own insert, admin update | Camp photo privacy data | High |
| `camp_site_review_votes` | `007_campsite_community_review.sql` | Enabled | reviewer/admin select, trusted insert, own update | Community review workflow | Medium |
| `camp_site_review_events` | `007_campsite_community_review.sql` | Enabled | related select, system/reviewer insert | Community review workflow | Medium |
| `camp_site_reviewer_profiles` | `007`, `015` | Enabled | own/admin select, candidate insert, admin update, admin-all select | Reviewer trust profile | Medium |
| `gpx_imports` | `008_campsite_gpx_imports.sql` | Enabled | own/admin select/update, own insert | GPX import workflow | Medium |
| `gpx_import_candidates` | `008_campsite_gpx_imports.sql` | Enabled | own/admin select/update, own insert with parent check | GPX candidate workflow | Medium |
| `camp_site_groups` | `011_campsite_group_sharing.sql` | Enabled | member select, owner insert, admin update | Private group sharing | High |
| `camp_site_group_memberships` | `011_campsite_group_sharing.sql` | Enabled | member select, admin insert/update | Private group sharing | High |
| `camp_site_group_shares` | `011_campsite_group_sharing.sql` | Enabled | member select/insert, admin delete | Private group sharing | High |
| `land_use_review_results` | `012_campsite_land_use_review.sql` | Enabled | moderator select/insert/update | Legal/access review result | Medium |
| `camp_site_reviewer_audit_events` | `015_campsite_reviewer_reputation.sql` | Enabled | admin select/insert | Reviewer audit trail | Medium |
| `camp_site_review_notifications` | `016_campsite_review_notifications.sql` | Enabled | own select, authorized insert, own update read state | User notifications | High |
| `camp_site_lifecycle_events` | `017_campsite_published_lifecycle_review.sql` | Enabled | moderator select/insert; actor exception on insert | Publishing lifecycle audit | Medium |
| `camp_site_group_audit_events` | `018_campsite_privacy_security_hardening.sql` | Enabled | admin select/insert | Private group audit trail | Medium |
| `expedition_sessions` | `019_expedition_cloud_persistence.sql` | Enabled | own select/insert/update | Direct expedition state store use | High |
| `expedition_timeline_events` | `019_expedition_cloud_persistence.sql` | Enabled | select/insert by owned parent session | Direct expedition state store use | High |
| `expedition_timeline` | `019_expedition_cloud_persistence.sql` | Enabled | select/insert by owned parent expedition/session | Timeline intelligence use | High |
| `campground_provider_configs` | `020_established_campgrounds_provider_layer.sql` | Enabled | admin select/write | Provider config; should not be public | High |
| `campgrounds` | `020_established_campgrounds_provider_layer.sql` | Enabled | public select, admin write | Established campground search/detail | Medium |
| `campground_source_records` | `020_established_campgrounds_provider_layer.sql` | Enabled | admin select/write | Provider raw records; should not be public | High |
| `campground_availability` | `020_established_campgrounds_provider_layer.sql` | Enabled | public select, admin write | Established campground availability | Medium |
| `campground_sync_runs` | `020_established_campgrounds_provider_layer.sql` | Enabled | admin select/write | Provider sync operations | High |
| `convoys` | `022_convoy_team_tracking.sql` | Enabled | leader/member select, leader insert/update | Convoy create/join/tracking | Highest |
| `convoy_invites` | `022_convoy_team_tracking.sql` | Enabled | leader select/insert/update | Invite credentials; hash-only storage | Highest |
| `convoy_members` | `022_convoy_team_tracking.sql` | Enabled | active member select, leader insert/update | Convoy roster | Highest |
| `convoy_member_locations` | `022_convoy_team_tracking.sql` | Enabled | active member select, own insert/update | Live location tracking; Realtime publication | Highest |

## App-Referenced Tables Not Created By Checked-In Migrations

Static client/function searches found additional table references that are not created by the migrations in this checkout. These should be treated as remote-schema unknowns until the live schema is exported or migrations are added. The pgTAP harness should skip missing tables with `to_regclass(...)` rather than assuming they exist.

- Expedition/detail: `expeditions`, `expedition_waypoints`, `expedition_route_segments`, `expedition_route_summary`, `trip_logs`, `trip_checklists`, `trip_checklist_items`, `attachments`.
- Expedition command store: `ecs_expeditions`, `ecs_loadout_snapshots`, `ecs_routes`, `ecs_waypoints`, `ecs_expedition_checklist_items`, `ecs_checklist_templates`, `ecs_field_logs`.
- Fleet/maintenance: `vehicle_zones`, `maintenance_logs`, `inspection_checklists`.
- Sync/settings/debrief: `user_settings`, `aar_reports`.

Recommended next action before writing tests for these: export the remote public schema into `supabase/remote_public_schema.sql` or add the missing migrations, then include their RLS state in the pgTAP matrix.

## Recommended RLS Scenarios

### Convoy Tracking

Tables: `convoys`, `convoy_invites`, `convoy_members`, `convoy_member_locations`.

- Leader can create and update only their own convoy.
- Active member can read the convoy record and active roster for their convoy.
- Non-member cannot read convoy, roster, invite, or location rows.
- Revoked member cannot read or update convoy data.
- Only leader can create/revoke invites.
- Invite rows expose `code_hash` only to leader; raw codes are never stored.
- Member can insert/update only their own `convoy_member_locations` row.
- Member cannot overwrite another member location row.
- Realtime table `convoy_member_locations` remains RLS protected.
- Completed/cancelled convoy should not allow continued location publishing if policy or service logic enforces that state.

### Fleet And Loadout

Tables: `vehicles`, `loadouts`, `loadout_items`.

- User can select, insert, update, and delete own vehicles.
- User cannot read, update, or delete another user's vehicle.
- User can create loadout only for an owned vehicle or with no vehicle.
- User cannot attach a loadout to another user's vehicle.
- User can create/update loadout items only for an owned loadout.
- User cannot insert an item into another user's loadout even if `owner_user_id` is forged.

### Expedition Persistence And Dispatch

Tables: `expedition_sessions`, `expedition_timeline_events`, `expedition_timeline`, `dispatch_cad_events`.

- User can read/write own expedition session.
- User cannot read/write another user's expedition session.
- Timeline event insert/select must require ownership of parent session.
- Timeline insert/select must require ownership of parent expedition/session.
- Dispatch creator can read/update their own event.
- Authorized users in `authorized_user_ids` can read/update the event.
- Unlisted users cannot read/update dispatch events.

### Camp Community, Groups, And GPX

Tables: `camp_sites`, `camp_site_reports`, `camp_site_photos`, `camp_site_flags`, `camp_site_groups`, `camp_site_group_memberships`, `camp_site_group_shares`, `gpx_imports`, `gpx_import_candidates`.

- Public/published camp sites are visible according to policy, but private/draft sites are owner/admin/member only.
- Authorized users can view/update shared camp sites only when included by policy.
- Reports are visible to submitter/admin/review roles only as intended.
- Photos obey privacy status, approval status, and group sharing.
- Group members can see groups, memberships, and shares for their group only.
- Non-members cannot read private group shares.
- GPX imports and candidates are owner-only, with parent import ownership checked on candidate insert.

### Notifications, Reviewer, Audit, And Land-Use Review

Tables: `camp_site_review_notifications`, `camp_site_review_votes`, `camp_site_review_events`, `camp_site_reviewer_profiles`, `camp_site_reviewer_audit_events`, `camp_site_lifecycle_events`, `camp_site_group_audit_events`, `land_use_review_results`.

- Notification recipient can select and mark read only their own notifications.
- Reviewer profile owner can read own profile; admin can read/update all.
- Trusted reviewer policies should reject ordinary authenticated users.
- Audit/lifecycle/land-use tables should be admin or moderator only except explicit actor exceptions.

### Established Campgrounds Provider Layer

Tables: `campground_provider_configs`, `campgrounds`, `campground_source_records`, `campground_availability`, `campground_sync_runs`.

- Anonymous/authenticated users can read only public canonical campground and availability rows intended for app display.
- Anonymous/authenticated users cannot read provider configs, source records, or sync runs.
- Only admin/service-authorized context can write provider config, canonical campground, source record, availability, or sync run rows.
- Public campground results should not expose provider secrets or raw source payloads.

### Account, Entitlement, Legacy Core, And Issue Telemetry Gaps

Tables: `profiles`, `operators`, `entitlements`, `billing_events`, `audit_logs`, `trips`, `waypoints`, `load_items`, `load_map_slots`, `fuel_water_logs`, `risk_scores`, `ecs_issue_events`.

No RLS enable statements or policies were found in migrations for these tables. Before pgTAP can assert detailed access behavior, ECS needs a policy decision:

- If these tables are directly exposed to authenticated clients, add RLS and owner/admin policies.
- If these tables are edge-function/service-role only, add RLS deny-by-default policies or explicit tests that anon/authenticated roles cannot access them.
- Legacy core trip/load/resource tables contain `user_id` and should not remain public if still deployed.
- `ecs_issue_events` contains hashed telemetry and runtime context; authenticated users should not be able to browse global issue data unless explicitly intended.

## pgTAP Harness Notes

No test helper is currently available in the repo. The first database test pass should add CI-safe helpers under `supabase/tests/database`.

Recommended helper behavior:

- Install or assume pgTAP with `create extension if not exists pgtap with schema extensions;` if the local Supabase test runner does not already do it.
- Use `to_regclass('public.table_name')` checks so tests can skip remote-schema-unknown tables safely.
- Provide helpers to simulate Supabase authenticated requests:
  - set `request.jwt.claim.sub`
  - set `request.jwt.claim.role`
  - set role to `authenticated` or `anon` as needed
  - reset role and request claims after each scenario
- Avoid service-role assertions in pgTAP unless the project introduces an explicit non-secret local test role.
- Keep fixtures minimal and deterministic.
- Use unique UUID constants per test file to avoid cross-test collisions.

## First Test Files To Add

Prefer `supabase/tests/database/*.test.sql`, because no alternate Supabase test convention was found.

1. `supabase/tests/database/rls_convoy_tracking.test.sql`
   - Highest value because it covers live location privacy, invites, revoked members, and convoy roster access.

2. `supabase/tests/database/rls_fleet_loadout.test.sql`
   - High value because `vehicles`, `loadouts`, and `loadout_items` are direct client-owned ECS data with parent-child ownership rules.

3. `supabase/tests/database/rls_expedition_dispatch.test.sql`
   - High value because expedition persistence and dispatch events are route/team operational state with cross-user access rules.

Second wave:

- `supabase/tests/database/rls_camp_community.test.sql`
- `supabase/tests/database/rls_campground_provider_layer.test.sql`
- `supabase/tests/database/rls_account_legacy_denials.test.sql`

## Exact Next Files To Create Or Modify

- Create `supabase/tests/database/test_helpers.sql` or inline shared helpers if the Supabase CLI in this repo does not support shared includes.
- Create `supabase/tests/database/rls_convoy_tracking.test.sql`.
- Create `supabase/tests/database/rls_fleet_loadout.test.sql`.
- Create `supabase/tests/database/rls_expedition_dispatch.test.sql`.
- Maintain `.github/workflows/supabase-db-tests.yml` as the CI gate for `supabase test db`.
- Export or regenerate `supabase/remote_public_schema.sql` before adding tests for app-referenced tables not covered by migrations.

## Current Gaps Summary

- Highest-risk untested RLS surface: convoy membership and live locations.
- Largest direct-client untested RLS surface: fleet/loadout and expedition persistence.
- Largest policy gap: legacy core/account/entitlement/audit/issue tables with no inferable RLS in migrations.
- Largest schema uncertainty: app-referenced expedition/detail/maintenance/settings tables not created by checked-in migrations.
