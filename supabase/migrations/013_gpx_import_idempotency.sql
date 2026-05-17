-- Offline-safe GPX import idempotency.
-- A client import id lets offline uploads replay without creating duplicate private imports.

alter table public.gpx_imports
  add column if not exists client_import_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gpx_imports_client_import_id_length_check') then
    alter table public.gpx_imports
      add constraint gpx_imports_client_import_id_length_check
      check (client_import_id is null or length(client_import_id) <= 128);
  end if;
end $$;

create unique index if not exists idx_gpx_imports_user_client_import_id
  on public.gpx_imports(user_id, client_import_id)
  where client_import_id is not null;
