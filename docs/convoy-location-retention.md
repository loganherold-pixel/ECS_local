# Convoy Location Retention

Convoy Command stores live member location rows in `convoy_member_locations` so active convoy members can see current and last-known vehicle positions.

## Release Policy

- Keep live location sharing opt-in.
- Stop local publishing when the user leaves a convoy, is revoked, the convoy ends, or the auth session ends.
- Keep precise coordinates out of normal app logs.
- Store invite codes only as hashes server-side. Raw invite codes are shown once to the leader and must not be logged.
- Treat `convoy_member_locations` as expedition-operational data, not long-term history.

## Recommended Retention

Delete or anonymize convoy member location rows after expedition completion. ECS should use a short operational retention window unless a customer has a documented longer retention requirement.

Recommended default:

- Active, planned, paused convoy: retain latest member row for current dispatch operation.
- Completed or cancelled convoy: delete location rows after 30 days.
- Field-test or privacy-sensitive convoy: delete location rows immediately or within 7 days after completion.

## Cleanup Function

Migration `023_convoy_location_retention_cleanup.sql` adds:

```sql
select public.cleanup_old_convoy_member_locations(30);
```

The function deletes `convoy_member_locations` rows for completed or cancelled convoys whose location row is older than the configured retention window.

The migration revokes execute permission from `public`, `anon`, and `authenticated`, then grants execute to `service_role`. Do not expose this RPC through mobile clients or publishable keys.

## Scheduling

This repository does not currently include a checked-in Supabase scheduled-function or `pg_cron` convention. Configure cleanup in the deployment environment using one of:

- Supabase scheduled functions, if enabled.
- A trusted backend cron runner using a service role connection.
- A future repo-owned scheduled workflow once ECS standardizes backend cron.

Do not run cleanup from mobile clients.
