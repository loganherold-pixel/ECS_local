# ECS Campsite Feature Flags

Flags live in `lib/communityCampsitesRolloutConfig.ts`.

## Defaults

Local/dev defaults are intentionally enabled for implemented surfaces so engineering and QA can validate the full workflow. Production rollout should override public/community surfaces until product, moderation staffing, media safety, and land-use providers are ready.

Recommended production posture:

- Keep public community discovery off until moderation operations are staffed.
- Keep auto-publish off.
- Keep land-use review off unless a provider is configured.
- Keep photos off unless the media pipeline is verified.

## Flags

| Flag | Default | Recommended rollout | Purpose |
| --- | --- | --- | --- |
| `communityCampsitesEnabled` | `true` local/dev | `true` in dev/staging, production only after launch approval | Enables Recommend Campsite entry point and approved community campsite layer. |
| `campsiteCommunityReviewEnabled` | `true` | `true` | Enables the Community Review workflow. |
| `campsiteReviewerQuorumEnabled` | `true` | `true` | Requires trusted reviewer quorum before publication flow proceeds. |
| `campsiteAutoPublishAfterQuorumEnabled` | `false` | `false` | Allows community quorum to publish without moderator final approval. Keep disabled until review quality is proven. |
| `campsiteModerationEnabled` | `true` | `true` | Legacy/admin alias used by existing review UI. Keep aligned with `campsiteCommunityReviewEnabled`. |
| `gpxCampsiteImportEnabled` | `true` local/dev | `true` in staging, production after GPX privacy QA | Enables GPX import candidate flow. |
| `campsitePhotosEnabled` | `true` local/dev | `true` only if media pipeline is ready | Enables campsite photo selection/upload UI. |
| `campsiteGroupSharingEnabled` | `true` | `true` if group model is enabled | Enables private group campsite sharing. |
| `campsiteOfflineQueueEnabled` | `true` | `true` if local sync is ready | Enables offline-safe report queue behavior. |
| `campsiteLandUseReviewEnabled` | `false` | `false` unless provider configured | Enables provider-backed land-use/sensitive-area review hooks. |
| `campsitePostPublicationReviewEnabled` | `true` | `true` | Enables confirmations, flags, and re-review behavior after publication. |

## Config Exports

- `DEFAULT_COMMUNITY_CAMPSITES_ROLLOUT_CONFIG`: local/dev QA posture.
- `PRODUCTION_COMMUNITY_CAMPSITES_ROLLOUT_CONFIG`: conservative public rollout posture.
- `resolveCommunityCampsitesRolloutConfig(overrides)`: merges overrides and keeps `campsiteModerationEnabled` aligned with `campsiteCommunityReviewEnabled`.
- `isCommunityCampsitesFeatureEnabled(config, feature)`: single flag-check helper.

## Rollout Recommendations

1. Dev: enable all implemented flows except provider-backed land-use review unless the provider is configured.
2. Staging: enable community, review, GPX, group sharing, offline queue, and post-publication review. Enable photos only after media QA.
3. Limited production beta: enable private saves, group sharing, offline queue, reviewer quorum, and moderator approval. Keep auto-publish disabled.
4. Public production: enable community discovery only after moderation staffing, privacy review, and legal/sensitive-area policy review.
