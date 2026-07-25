# Explore Android performance profiling plan

This plan is for a later release-equivalent or field-test Android build. Development-mode timing is not production evidence.

## Fixture and setup

- Use one access partition and a deterministic fixture containing exactly 20 validated unique route summaries.
- Keep full geometry and route-detail requests disabled until route selection.
- Capture the privacy-safe Explore performance events, React render counts, provider/cache request counts, JS/UI frame rates, and long tasks.
- Run once cold, then retain the matching cache for warm-cache measurements.

## Repetitions

Capture at least five repetitions each for category tap, refinement tap, radius change, settled map-area search, warm-cache search, cold-provider search, and route-card-to-Trip-Builder selection.

For each scenario report median and p95 input-to-feedback time, cached-result time, provider-result time, JS/UI frame rate, dropped-frame periods, longest Explore-attributable JS task, provider request count, route-list render count, and route-card render count.

## Acceptance targets

- Tap to visible acknowledgement: median at most 50 ms and p95 at most 100 ms.
- Tap to search dispatch: median at most 100 ms and p95 at most 150 ms.
- Warm cache to visible result: median at most 150 ms and p95 at most 300 ms.
- Route press to navigation dispatch: median at most 50 ms and p95 at most 100 ms.
- Exactly one provider request per settled fingerprint, no duplicate request for repeated identical taps, zero ordinary-search route-detail calls, zero ordinary-search full-geometry calls, and no Explore-attributable synchronous task over 50 ms.
- Confirm every result set remains capped at 20 and stale responses never replace the active fingerprint.

Record device model, Android version, build profile, thermal state, connectivity class, and whether each run was cold or warm. Do not record coordinates, query text, route history, user identity, device identifiers, tokens, or provider credentials.
