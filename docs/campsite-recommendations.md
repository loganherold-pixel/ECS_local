# ECS Campsite Recommendations

## Feature Overview

ECS Campsite Recommendations adds a responsible campsite intelligence flow inside the existing Navigate Map Tools experience. Users can save campsites privately, share them with a private group, or submit them to ECS Community Review. Community-submitted campsites are not public until they pass automated triage, trusted review, and any required moderator approval.

The feature is designed for field usefulness without treating campsite data as automatically safe, legal, or public. ECS preserves private, group, pending, rejected, hidden, and sensitive records outside the public community map layer.

## Feature Flags

Operational flags are documented in `docs/campsite-feature-flags.md`. The main controls are `communityCampsitesEnabled`, `campsiteCommunityReviewEnabled`, `campsiteReviewerQuorumEnabled`, `campsiteAutoPublishAfterQuorumEnabled`, `campsiteModerationEnabled`, `gpxCampsiteImportEnabled`, `campsitePhotosEnabled`, `campsiteGroupSharingEnabled`, `campsiteOfflineQueueEnabled`, `campsiteLandUseReviewEnabled`, and `campsitePostPublicationReviewEnabled`.

## User Flow

Required user-facing state copy:

- Private success: `Campsite saved privately.`
- Community submit success: `Submitted for ECS review.`
- Pending review: `This campsite is pending review and is not visible to the community yet.`
- Approved publication: `This campsite is now visible on the ECS Community Campsites layer.`
- Legal acknowledgement: `I believe this is a legal, established campsite.`
- Sensitive-area acknowledgement: `I am not sharing a private, closed, culturally sensitive, wildlife-sensitive, or fragile location.`

### Current Location to Private Save

1. Open Navigate.
2. Open Map Tools.
3. Select `Recommend Campsite`.
4. Select `Use My Current Location`.
5. Complete the campsite form.
6. Keep visibility as `private`.
7. Submit.

Result: `Campsite saved privately.` The marker appears only in the owner's private campsite layer.

### Pin Drop to Community Review

1. Open Map Tools.
2. Select `Recommend Campsite`.
3. Select `Drop a Pin`.
4. Place the campsite pin.
5. Complete the form.
6. Select `Submit to ECS Community Review`.
7. Accept both stewardship acknowledgements.

Result: `Submitted for ECS review.` The report enters triage and review. Pending submissions are not public.

### GPX Import to Candidate

1. Open Map Tools.
2. Select `Recommend Campsite`.
3. Select `Import GPX / Route`.
4. Upload a `.gpx` file.
5. Review parsed waypoints.
6. Select one or more campsite candidates.
7. Save privately or submit selected candidates to Community Review.

Route and track points are not campsites by default. They can only become campsite candidates through an explicit user selection.

## Moderation Flow

Moderator/admin tools support approval, rejection, needs-info, merge, hide, photo moderation, reviewer management, and post-publication re-review. Moderator actions write audit/review events.

## Community Review Wall

Community submissions pass through the review wall before publication.

Flow:

1. Community report is created as pending/submitted.
2. Automated triage runs.
3. Passed reports enter `community_review`.
4. Trusted reviewers vote.
5. Quorum moves the report forward.
6. If moderator final approval is required, moderators approve or reject before publication.
7. Approved reports create canonical `camp_sites` records.

Community approval does not imply certainty. Reviewers and moderators are checking that a submission is specific, plausible, established, legal-looking based on available evidence, and safe enough to publish responsibly.

## GPX Import Behavior

GPX import is private by default.

- ECS accepts `.gpx` uploads only.
- Raw GPX content is parsed and not retained by default.
- GPX imports are scoped to the owner.
- Waypoints become selectable private candidates.
- Route and track counts are recorded for context.
- Route and track points do not automatically create campsite reports.
- Imported GPX data is never public unless a selected candidate is submitted and approved through review.
- Offline GPX selections can be queued or parsed locally when supported.

## Photo Privacy and EXIF Stripping

Photo support is optional and controlled by rollout flags.

- Photos attach to `camp_site_reports` first.
- Private report photos are visible only to the owner.
- Group report photos are visible only to authorized group members when supported.
- Community submission photos remain pending until reviewed.
- Public campsite details only show approved photos on approved community campsites.
- ECS re-encodes photos before upload/public use through `stripCampsitePhotoMetadata`, removing EXIF/GPS metadata.
- Raw original filenames are not exposed publicly.

## Privacy

Public responses omit submitter user IDs, contributor email, reviewer private notes, raw GPX metadata, original photo filenames, unapproved photos, private/group records, pending/rejected reports, and exact blocked/sensitive land-use details. Object-level authorization is enforced through service checks and backend/RLS policies.

## Group Sharing

Group sharing lets users share campsite intel with private groups without submitting it to the public ECS Community layer.

- Group shares are not public community campsites.
- Active group members can see shared reports/sites in the group campsite layer.
- Group admins/owners can remove group shares.
- Non-members cannot fetch group shares.
- A group-shared campsite submitted to ECS Community must still pass triage and review.

## Offline Sync

Offline queue support lets users create campsite recommendations in poor connectivity.

- Offline reports receive a `client_submission_id`.
- Local status labels include `Saved locally`, `Waiting to sync`, `Syncing`, `Submitted`, and `Sync failed`.
- Reconnect sync submits queued records once.
- Retry uses idempotency to avoid duplicate server records.
- Offline community submissions still enter triage and review after sync.
- Unsynced drafts can be edited or deleted.

Limitation: local photo file blobs are best-effort. If local file persistence is unavailable, photos may need to be attached after the report syncs.

## Land-Use and Sensitive-Area Triage

Automated triage is advisory and does not publish anything by itself.

Checks include:

- coordinate validity;
- required submission fields;
- stewardship acknowledgements;
- source confidence;
- duplicate proximity;
- submission rate/rejection history;
- land-use provider result when available.

Land-use provider results can be `passed`, `warning`, `blocked`, or `unknown`. Sensitive layer details are not exposed publicly. Reviewer UI should show general warnings such as `Potential sensitive or restricted area`; moderator UI may show fuller provider details when authorized.

## Post-Publication Confirmations and Flags

Published campsites can change over time.

- Confirmations create linked reports and update `confirmation_count`, `last_confirmed_at`, and trust score.
- Flags create `camp_site_flags` records and reduce trust score.
- Serious flags such as `private_land`, `closed_to_camping`, or `sensitive_area` can move a site to `hidden_pending_review`.
- Hidden or sensitive-removed sites are excluded from the public map.
- Moderators can keep, hide, merge, update, mark closed, or mark sensitive removed.

## Permissions Matrix

| Role | Private saves | Community submissions | Public community map | Group layer | Review queue | Publish/hide | GPX imports | Photos |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Anonymous | No | No | View if app allows anonymous map access | No | No | No | No | Public approved only if exposed |
| Normal authenticated user | Create/view own | Submit own | View approved community | Own memberships only | No | No | Own imports only | Own/private; approved public |
| Group member | Own saves | Submit own | View approved community | View active group shares | No | No | Own imports only | Group-visible when authorized |
| Group admin | Own saves | Submit own | View approved community | Manage group shares/members | No | Remove group share | Own imports only | Group-visible when authorized |
| Trusted reviewer | Own saves | Submit own | View approved community | Own memberships only | Community review reports | No final publish unless also moderator/admin | Own imports only | Pending review photos |
| Moderator | Own saves | Submit own | View approved community | Authorized groups | Review and moderator queues | Approve/reject/merge/hide | Own imports only | Approve/reject photos |
| Admin | Full administrative access | Full administrative access | Full administrative access | Full administrative access | Full administrative access | Full administrative access | Administrative access as allowed by backend policy | Full moderation access |

## Data Model Overview

Primary tables/models:

- `camp_sites`: canonical approved/public, group, private, hidden, archived, closed, or sensitive-removed campsite records.
- `camp_site_reports`: every private save, community submission, confirmation, GPX candidate submission, and linked report.
- `camp_site_flags`: user flags against approved campsites.
- `camp_site_photos`: report-linked photos with moderation status.
- `camp_site_review_votes`: one active vote per reviewer/report.
- `camp_site_review_events`: review and moderation timeline.
- `camp_site_reviewer_profiles`: reviewer status and reputation.
- `gpx_imports`: owner-scoped GPX import summaries.
- `gpx_import_candidates`: owner-scoped waypoint or explicit route/track selected candidates.
- `camp_site_groups`, `camp_site_group_memberships`, `camp_site_group_shares`: private group sharing.
- `camp_site_group_audit_events`: group share removal audit trail.
- `land_use_review_results`: automated sensitive/restricted-area review results.
- `camp_site_review_notifications`: in-app review workflow notifications.
- `camp_site_lifecycle_events`: post-publication flag/re-review lifecycle events.

## Known Limitations

- Land-use review is only as strong as configured providers. Default rollout keeps provider-backed land-use review disabled unless configured.
- ECS cannot guarantee a campsite is legal, safe, open, durable, or appropriate.
- Photos require the media pipeline and local file support for full offline behavior.
- Raw GPX is not retained by default, so users may need to re-upload if a queued file cannot be read after reconnect.
- Community review quality depends on trusted reviewer coverage and moderator follow-through.
- Group sharing does not make a campsite public and does not replace Community Review.
