# Explore Unified Discovery Contract

Explore keeps source-specific route models, but adapts route cards and planning handoffs through
`lib/explore/exploreDiscoveryItem.ts`.

## Identity and source priority

Canonical identity prefers an existing identity key, geometry/source fingerprint, catalog or Trail Pack ID,
external source ID, then a normalized source ID or title/trailhead/distance signature. Alternate representations remain
attached as sanitized source descriptors.

Primary-source priority is deterministic:

1. Official or ECS-validated Trail Packs.
2. Partner and reviewed community Trail Packs.
3. User-saved/built routes and imported/stitched assets.
4. Deterministic Hidden Gem selections.
5. AI-generated route ideas.

Source priority selects the displayed authority. Guidance-capable geometry may come from another retained source,
and that distinction remains in handoff metadata.

## Independent operational dimensions

Explore does not collapse these into one readiness score:

- Active-guidance readiness.
- Legal/access verification.
- Current conditions and closures.
- Active-vehicle fit.

Unknown values remain unknown. Conflicting non-unknown sources produce explicit conflict codes; legal/access
conflict remains `conflicted`, while conditions and vehicle fit degrade to watch/caution presentation states.

AI route ideas are generated/inferred suggestions. They are never treated as verified legal access, current
conditions, or official route authority.

## Loading and persistence

- Catalog search remains summary-first. Full geometry is requested only for preview, save, Trip Builder, Offline
  Prep, or Navigate handoff.
- Identical catalog detail requests share one in-flight request and a bounded 24-entry, five-minute cache.
- AI requests are fingerprinted by location bucket, radius, vehicle, result count, and known-route universe.
  Changed criteria supersede older work; stale responses cannot replace newer results.
- Discovery and summary caches retain at most 24 LRU entries and keep their existing fresh/stale windows.
- Validated radius, refinement, and category filters restore after restart. Identical snapshots do not write again.

## Publication boundary

Local submissions remain `pending_review`, `local_review`, and private to their submitter. Public discovery still
requires the existing approved/public-recommendation gates. Feedback never promotes a submission by itself.
