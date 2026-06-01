-- Owner-scoped RLS for legacy ECS core trip/resource tables.
-- These tables contain user-owned expedition data created before the newer
-- fleet and expedition persistence tables. Keep access conservative.

alter table public.trips enable row level security;
alter table public.waypoints enable row level security;
alter table public.load_items enable row level security;
alter table public.load_map_slots enable row level security;
alter table public.fuel_water_logs enable row level security;
alter table public.risk_scores enable row level security;

drop policy if exists trips_select_own on public.trips;
create policy trips_select_own
on public.trips
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists trips_insert_own on public.trips;
create policy trips_insert_own
on public.trips
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists trips_update_own on public.trips;
create policy trips_update_own
on public.trips
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists trips_delete_own on public.trips;
create policy trips_delete_own
on public.trips
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists waypoints_select_own on public.waypoints;
create policy waypoints_select_own
on public.waypoints
for select
to authenticated
using (
  auth.uid() = user_id
  and (
    trip_id is null
    or exists (
      select 1
      from public.trips t
      where t.id = trip_id
        and t.user_id = auth.uid()
    )
  )
);

drop policy if exists waypoints_insert_own on public.waypoints;
create policy waypoints_insert_own
on public.waypoints
for insert
to authenticated
with check (
  auth.uid() = user_id
  and (
    trip_id is null
    or exists (
      select 1
      from public.trips t
      where t.id = trip_id
        and t.user_id = auth.uid()
    )
  )
);

drop policy if exists waypoints_update_own on public.waypoints;
create policy waypoints_update_own
on public.waypoints
for update
to authenticated
using (
  auth.uid() = user_id
  and (
    trip_id is null
    or exists (
      select 1
      from public.trips t
      where t.id = trip_id
        and t.user_id = auth.uid()
    )
  )
)
with check (
  auth.uid() = user_id
  and (
    trip_id is null
    or exists (
      select 1
      from public.trips t
      where t.id = trip_id
        and t.user_id = auth.uid()
    )
  )
);

drop policy if exists waypoints_delete_own on public.waypoints;
create policy waypoints_delete_own
on public.waypoints
for delete
to authenticated
using (
  auth.uid() = user_id
  and (
    trip_id is null
    or exists (
      select 1
      from public.trips t
      where t.id = trip_id
        and t.user_id = auth.uid()
    )
  )
);

drop policy if exists load_items_select_own on public.load_items;
create policy load_items_select_own
on public.load_items
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists load_items_insert_own on public.load_items;
create policy load_items_insert_own
on public.load_items
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists load_items_update_own on public.load_items;
create policy load_items_update_own
on public.load_items
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists load_items_delete_own on public.load_items;
create policy load_items_delete_own
on public.load_items
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists load_map_slots_select_own on public.load_map_slots;
create policy load_map_slots_select_own
on public.load_map_slots
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists load_map_slots_insert_own on public.load_map_slots;
create policy load_map_slots_insert_own
on public.load_map_slots
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists load_map_slots_update_own on public.load_map_slots;
create policy load_map_slots_update_own
on public.load_map_slots
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists load_map_slots_delete_own on public.load_map_slots;
create policy load_map_slots_delete_own
on public.load_map_slots
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists fuel_water_logs_select_own on public.fuel_water_logs;
create policy fuel_water_logs_select_own
on public.fuel_water_logs
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists fuel_water_logs_insert_own on public.fuel_water_logs;
create policy fuel_water_logs_insert_own
on public.fuel_water_logs
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists fuel_water_logs_update_own on public.fuel_water_logs;
create policy fuel_water_logs_update_own
on public.fuel_water_logs
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists fuel_water_logs_delete_own on public.fuel_water_logs;
create policy fuel_water_logs_delete_own
on public.fuel_water_logs
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists risk_scores_select_own on public.risk_scores;
create policy risk_scores_select_own
on public.risk_scores
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists risk_scores_insert_own on public.risk_scores;
create policy risk_scores_insert_own
on public.risk_scores
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists risk_scores_update_own on public.risk_scores;
create policy risk_scores_update_own
on public.risk_scores
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists risk_scores_delete_own on public.risk_scores;
create policy risk_scores_delete_own
on public.risk_scores
for delete
to authenticated
using (auth.uid() = user_id);
