-- Lightweight convoy identity fields used by live map labels.
-- Callsign remains the primary tactical identifier; display_name and
-- expedition_badge_title are optional presentation snapshots.

alter table public.convoy_members
  add column if not exists display_name text,
  add column if not exists expedition_badge_title text;

comment on column public.convoy_members.display_name is
  'Optional operator display name snapshot for convoy roster presentation.';

comment on column public.convoy_members.expedition_badge_title is
  'Optional Expedition badge/title snapshot shown below callsign on convoy map labels.';
