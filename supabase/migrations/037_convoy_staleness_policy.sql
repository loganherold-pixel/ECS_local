-- Convoy Staleness Ladder policy provenance.
-- Thresholds intentionally have no defaults: Expedition/Dispatch config must provide them.

alter table public.convoys
  add column if not exists expedition_id text,
  add column if not exists dispatch_id text,
  add column if not exists staleness_policy jsonb,
  add column if not exists staleness_policy_source text,
  add column if not exists staleness_policy_source_id text,
  add column if not exists staleness_policy_id text,
  add column if not exists staleness_policy_generated_at timestamptz,
  add column if not exists staleness_policy_updated_at timestamptz,
  add column if not exists staleness_policy_observed_at timestamptz,
  add column if not exists staleness_policy_stale_at timestamptz,
  add column if not exists staleness_policy_schema_version text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'convoys_staleness_policy_source_check'
  ) then
    alter table public.convoys
      add constraint convoys_staleness_policy_source_check
      check (
        staleness_policy_source is null or
        staleness_policy_source in ('expedition_config', 'dispatch_config', 'convoy_config', 'unknown')
      );
  end if;
end $$;
