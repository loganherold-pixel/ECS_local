# ECS Explore Filter And Discovery Release Audit

Date: 2026-05-03

## Summary

This pass audited the active Explore tab route discovery flow, radius filtering, category panels, route-card behavior, empty states, and Navigate handoff. The active route remains `app/(tabs)/discover.tsx` for Expo Router compatibility, while user-facing tab and screen copy is Explore.

## Patched Low-Risk Items

### Explore Naming

- The Explore screen header now reads `Explore` instead of `Explore System`.
- Active user-facing empty-state and favorites copy now uses `Explore`, not `Explorer`.
- Internal legacy identifiers such as `discover.tsx`, `DiscoveryTabId`, and `ExplorerCategoryPanelKey` were retained because they are route/state compatibility names, not visible product labels.

Risk: low. User-facing naming is cleaner without renaming persisted or routed identifiers.

### Page Size

- Explore category panels now render up to 10 items per page.
- Hidden Gems, Popular Trails, Trail Packs, ECS Route Ideas, and Favorites all share the same `EXPLORE_CATEGORY_PAGE_SIZE = 10` contract.
- Legacy hidden section pager copy was updated from `NEXT 5` / `RESTART 5` to `NEXT 10` / `RESTART 10`.

Risk: low. This changes paging count only and keeps existing contained panel scrolling.

### Filter Robustness

- Trip-type filters now inspect route text/category hints when numeric duration metadata is missing.
- If a selected trip-type filter would otherwise produce no results because every candidate lacks duration metadata, Explore keeps unknown-duration records visible instead of presenting a false empty state.
- Remoteness still sorts the current radius-filtered set instead of aggressively eliminating usable results.

Risk: low. This only affects missing-metadata cases and prevents false empty panels.

## Confirmed Active Behavior

- Radius is applied before dedupe, refinement, Hidden Gems, Popular Trails, Trail Packs, Favorites, and ECS Route Ideas.
- ECS Route Ideas are filtered by radius before refinement.
- Filter changes reset section pagination.
- Empty states explain whether the radius or refinement removed results and provide clear widening/reset actions.
- Route cards use compact previews in category panels and preserve detail/Navigate actions through the existing preview/detail flow.
- Route handoff stages a validated Explore navigation payload, saves it to the Navigate handoff store, stages a navigation flow, then routes to `/navigate`.
- Trail Pack guidance uses the same Explore-to-Navigate handoff after validating geometry.

## Needs Review

### Legacy Internal Discover Naming

Several non-visible identifiers still use Discover/Discovery naming. Renaming the route file or persisted identifiers would risk breaking Expo Router paths, saved state, tests, and compatibility adapters.

Recommendation: keep for this release; plan a separate compatibility migration if product wants internal naming parity.

Risk: medium.

### Favorites Filter Scope

Favorites are scoped to the active Explore route context, so saved trails outside the current radius/refinement are hidden in the category panel. This is consistent with current UI copy, but product may want a separate "All Favorites" mode later.

Risk: low to retain, medium to alter.

### Hidden Gems Intelligence

Hidden Gems already uses validated baseline scoring plus ECS route idea alignment when available, with fallback diagnostics when ECS suggestions are unavailable or time out.

Recommendation: keep fallback behavior visible and conservative for release.

Risk: low.

## Verification Targets

- `npm run test:explore-refinement-filter`
- `node scripts/test-explore-compact-cards.js`
- `node scripts/test-explore-remoteness-integration.js`
- `node scripts/test-explore-route-preview-regression.js`
- `node scripts/test-explore-guidance-camp-intel-ux.js`
- `npx tsc --noEmit --pretty false`
- `npm run lint`
