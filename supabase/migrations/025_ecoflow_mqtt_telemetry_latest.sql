create table if not exists public.ecoflow_mqtt_telemetry_latest (
  provider_id text not null default 'ecoflow',
  device_id text not null,
  device_name text,
  model text,
  source text not null default 'mqtt_quota',
  telemetry jsonb not null,
  raw_topic text,
  raw_type_code text,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider_id, device_id)
);

alter table public.ecoflow_mqtt_telemetry_latest enable row level security;

revoke all on table public.ecoflow_mqtt_telemetry_latest from anon, authenticated;
grant select, insert, update, delete on table public.ecoflow_mqtt_telemetry_latest to service_role;

create index if not exists ecoflow_mqtt_telemetry_latest_received_at_idx
  on public.ecoflow_mqtt_telemetry_latest (received_at desc);
