-- Photo moderation states separate private/group visibility from public approval.
-- Community campsite photos remain pending until explicitly approved.

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'camp_site_photos_moderation_status_check') then
    alter table public.camp_site_photos
      drop constraint camp_site_photos_moderation_status_check;
  end if;

  alter table public.camp_site_photos
    add constraint camp_site_photos_moderation_status_check
    check (moderation_status in ('private', 'group_visible', 'pending', 'approved', 'rejected'));
end $$;

drop policy if exists camp_site_photos_select_approved_public on public.camp_site_photos;
create policy camp_site_photos_select_approved_public
on public.camp_site_photos
for select
to anon, authenticated
using (
  moderation_status = 'approved'
  and exif_stripped = true
  and camp_site_id is not null
  and exists (
    select 1
    from public.camp_sites
    where camp_sites.id = camp_site_photos.camp_site_id
      and camp_sites.status = 'approved'
      and camp_sites.visibility = 'community'
  )
);
