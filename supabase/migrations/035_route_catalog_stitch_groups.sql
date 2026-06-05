-- Route catalog stitch group review tables.
-- These tables persist operator-reviewed stitch candidates without exposing
-- draft groups through the public route catalog.

create table if not exists public.route_catalog_stitch_groups (
  id uuid primary key default gen_random_uuid(),
  public_id text unique not null,
  name text not null,
  cluster_key text not null,
  cluster_label text,
  source_adapter text not null,
  route_public_ids text[] not null,
  chain_ready_edge_count integer not null default 0,
  bridge_review_edge_count integer not null default 0,
  review_status text not null default 'draft_review_required',
  publication_status text not null default 'review_only',
  can_auto_publish boolean not null default false,
  requires_field_review boolean not null default true,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  current_conditions_reviewed_at timestamptz,
  closure_orders_reviewed_at timestamptz,
  land_use_authority_reviewed_at timestamptz,
  vehicle_suitability_reviewed_at timestamptz,
  route_direction_reviewed_at timestamptz,
  reviewer_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_catalog_stitch_groups_public_id_check check (public_id <> ''),
  constraint route_catalog_stitch_groups_name_check check (name <> ''),
  constraint route_catalog_stitch_groups_cluster_key_check check (cluster_key <> ''),
  constraint route_catalog_stitch_groups_source_adapter_check check (source_adapter <> ''),
  constraint route_catalog_stitch_groups_route_public_ids_check check (array_length(route_public_ids, 1) >= 2),
  constraint route_catalog_stitch_groups_edge_count_check check (
    chain_ready_edge_count >= 1 and
    bridge_review_edge_count >= 0
  ),
  constraint route_catalog_stitch_groups_review_status_check check (
    review_status in (
      'draft_review_required',
      'pending_review',
      'approved_for_internal_use',
      'rejected',
      'needs_more_data'
    )
  ),
  constraint route_catalog_stitch_groups_publication_status_check check (
    publication_status in (
      'review_only',
      'eligible_for_curated_use',
      'retired'
    )
  ),
  constraint route_catalog_stitch_groups_no_auto_publish_check check (can_auto_publish = false)
);

create table if not exists public.route_catalog_stitch_group_routes (
  id uuid primary key default gen_random_uuid(),
  stitch_group_id uuid not null references public.route_catalog_stitch_groups(id) on delete cascade,
  verified_route_id uuid not null references public.verified_routes(id) on delete restrict,
  route_public_id text not null,
  route_order integer not null default 0,
  direction text not null default 'unknown',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_catalog_stitch_group_routes_public_id_check check (route_public_id <> ''),
  constraint route_catalog_stitch_group_routes_order_check check (route_order >= 0),
  constraint route_catalog_stitch_group_routes_direction_check check (
    direction in ('forward', 'reverse', 'either', 'unknown')
  ),
  unique (stitch_group_id, route_public_id),
  unique (stitch_group_id, route_order)
);

create table if not exists public.route_catalog_stitch_group_edges (
  id uuid primary key default gen_random_uuid(),
  stitch_group_id uuid not null references public.route_catalog_stitch_groups(id) on delete cascade,
  from_route_public_id text not null,
  to_route_public_id text not null,
  edge_status text not null default 'chain_ready',
  gap_meters numeric not null default 0,
  from_endpoint jsonb not null,
  to_endpoint jsonb not null,
  requires_verified_bridge boolean not null default false,
  bridge_source_label text,
  bridge_geometry jsonb,
  review_status text not null default 'draft_review_required',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_catalog_stitch_group_edges_from_route_check check (from_route_public_id <> ''),
  constraint route_catalog_stitch_group_edges_to_route_check check (to_route_public_id <> ''),
  constraint route_catalog_stitch_group_edges_gap_check check (gap_meters >= 0),
  constraint route_catalog_stitch_group_edges_status_check check (
    edge_status in ('chain_ready', 'needs_bridge_review', 'verified_bridge')
  ),
  constraint route_catalog_stitch_group_edges_review_status_check check (
    review_status in (
      'draft_review_required',
      'pending_review',
      'approved_for_internal_use',
      'rejected',
      'needs_more_data'
    )
  ),
  unique (stitch_group_id, from_route_public_id, to_route_public_id)
);

create index if not exists route_catalog_stitch_groups_cluster_idx
  on public.route_catalog_stitch_groups (cluster_key, review_status, created_at desc);

create index if not exists route_catalog_stitch_groups_source_idx
  on public.route_catalog_stitch_groups (source_adapter, review_status, created_at desc);

create index if not exists route_catalog_stitch_group_routes_route_idx
  on public.route_catalog_stitch_group_routes (verified_route_id, stitch_group_id);

create index if not exists route_catalog_stitch_group_edges_group_idx
  on public.route_catalog_stitch_group_edges (stitch_group_id, edge_status);

alter table public.route_catalog_stitch_groups enable row level security;
alter table public.route_catalog_stitch_group_routes enable row level security;
alter table public.route_catalog_stitch_group_edges enable row level security;

revoke all on public.route_catalog_stitch_groups from anon, authenticated;
revoke all on public.route_catalog_stitch_group_routes from anon, authenticated;
revoke all on public.route_catalog_stitch_group_edges from anon, authenticated;

grant select, insert, update, delete on public.route_catalog_stitch_groups to service_role;
grant select, insert, update, delete on public.route_catalog_stitch_group_routes to service_role;
grant select, insert, update, delete on public.route_catalog_stitch_group_edges to service_role;
