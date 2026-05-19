# CampOps Mobile Visual State Matrix

This matrix is the developer-facing visual QA checklist for CampOps recommendation cards and endpoint flows. It is backed by `fixtures/campops/mobileQaVisualStates.js` and does not require live provider APIs or AI output to render deterministic card states.

## Viewports

| Viewport | Target | Checks |
| --- | --- | --- |
| `android_small_portrait` | 360x640 or similar small Android screen | No label overlap, action buttons tappable, long warnings wrap inside cards. |
| `android_large_portrait` | 412x915 or similar large Android screen | Role cards remain scannable, expanded reasoning does not hide actions. |
| `android_landscape` | 640x360 or device equivalent | Panel remains reachable, card content scrolls instead of clipping, no header overlap. |

## Matrix

| State ID | Visual State | Fixture/Test Refs | What To Verify |
| --- | --- | --- | --- |
| `candidate_producing_viewport` | Candidate-producing QA viewport | `components/campops/CampOpsVisualQaScreen.tsx`, `scripts/test-route-camp-pins.js` | Visible CampOps pins render from local non-live fixture data; tapping a pin opens Camp Intel. |
| `camp_intel_popup_actions` | Camp Intel popup actions | `components/navigate/CampScoutIntelCard.tsx`, `scripts/test-campops-camp-intel-popup.js` | Save Camp, Navigate Here, and Report Unusable are visible, tappable, and captured locally for QA only. |
| `feature_flag_off` | Feature flag off | `scripts/test-campops-search-integration.js` | Legacy camp list only; no CampOps cards or source transparency. |
| `feature_flag_on` | Feature flag on | `fixtures/campops/evaluationFixtures.js:on_time_normal_day`, `scripts/test-campops-ui-cards.js` | CampOps cards render above legacy results and do not depend on AI output. |
| `recommended_endpoint` | Recommended endpoint | `fixtures/campops/evaluationFixtures.js:on_time_normal_day` | Recommended Camp card shows name, score, ETA, and top reasons. |
| `backup_endpoint` | Backup endpoint | `scripts/test-campops-recommendations.js` | Backup Camp appears when a distinct viable alternate exists. |
| `emergency_fallback` | Emergency fallback | `fixtures/campops/evaluationFixtures.js:emergency_stop` | Emergency Camp uses Emergency stop or Fallback only language; legal/access fields remain visible. |
| `planned_camp_downgraded` | Planned camp downgraded | `fixtures/campops/evaluationFixtures.js:two_hour_delay`, `scripts/test-campops-two-hour-delay-acceptance.js` | Downgrade reason is visible; avoid unqualified safe copy. |
| `stale_source_warning` | Stale source warning | `fixtures/campops/evaluationFixtures.js:offline_stale_data`, `fixtures/campops/providerFixtures.js:provider_stale_offline_source` | Source data is stale appears without relying on AI. |
| `source_conflict_warning` | Source conflict warning | `fixtures/campops/evaluationFixtures.js:conflicting_legal_access_source`, `scripts/test-campops-source-conflict-resolution.js` | Source conflict appears in warnings or expanded Why details. |
| `legal_confidence_unknown` | Legal confidence unknown | `fixtures/campops/evaluationFixtures.js:legal_uncertainty` | Legal field says Unknown confidence and does not imply confirmed access. |
| `closure_status_unknown` | Closure status unknown | `scripts/test-campops-closure-provider.js` | Closure status unknown appears in source transparency. |
| `fire_restriction_unknown` | Fire restriction unknown | `scripts/test-campops-fire-restriction-provider.js` | Fire restrictions unknown appears; campfire permission is not invented. |
| `weather_stale` | Weather stale | `fixtures/campops/providerFixtures.js:provider_stale_offline_source`, `scripts/test-campops-weather-provider.js` | Weather freshness shows stale or unknown, not current. |
| `low_fuel` | Low fuel | `fixtures/campops/evaluationFixtures.js:low_fuel_margin`, `fixtures/campops/providerFixtures.js:provider_low_fuel` | Fuel concern remains visible on small screens; use comfortable/tight/critical/unknown style wording. |
| `low_water` | Low water | `fixtures/campops/evaluationFixtures.js:low_water_margin` | Water concern is visible without promising refill availability. |
| `trailer_caution` | Trailer caution | `fixtures/campops/evaluationFixtures.js:trailer_convoy` | Trailer limitation is visible; no-turnaround camp is downgraded or rejected. |
| `large_group_caution` | Large group caution | `fixtures/campops/evaluationFixtures.js:large_group` | Group fit shows downgrade/caution when capacity is too small. |
| `offline_cached_data` | Offline cached data | `scripts/test-campops-offline-stale-sources.js`, `fixtures/campops/evaluationFixtures.js:offline_stale_data` | Cached/stale warning is visible in field mode; confidence is reduced. |
| `offline_no_cached_data` | Offline no cached data | `scripts/test-campops-offline-stale-sources.js` | Missing or unavailable source warnings are visible; unknown fields stay Unknown. |
| `ai_summary_expanded_collapsed` | AI summary expanded/collapsed | `scripts/test-campops-ai-assist.js` | Collapsed AI does not hide deterministic facts; expanded AI preserves stale/missing warnings. |
| `why_expanded_collapsed` | Why this recommendation expanded/collapsed | `scripts/test-campops-ui-cards.js` | Collapsed cards show top three reasons/warnings; expanded section shows source summaries, resource debt, and decision point when available. |
| `long_camp_names` | Long camp names | `fixtures/campops/mobileQaVisualStates.js`, `scripts/test-campops-ui-cards.js` | Long endpoint names wrap without covering role labels, confidence chips, field rows, or action buttons. |
| `long_warning_lists` | Long warning lists | `fixtures/campops/mobileQaVisualStates.js`, `scripts/test-campops-ui-cards.js` | Top warnings stay concise; expanded details scroll or wrap without overlapping action buttons. |
| `cramped_small_screen` | Cramped small screen | `fixtures/campops/mobileQaVisualStates.js` | Cards remain readable at 360x640-equivalent size; expanders remain reachable; fields do not overlap. |
| `long_text_stress` | Long camp names and warning lists | `fixtures/campops/mobileQaVisualStates.js` | Long names and warnings wrap without overlapping badges or action buttons. |

## Android Manual Pass

Run the matrix on:

- small screen Android portrait
- large screen Android portrait
- landscape if supported by the build/device
- online mode
- offline mode with cached source data
- offline mode with no cached source data

For each pass, check:

- long camp names wrap cleanly
- long warning lists scroll or collapse cleanly
- missing data fields show Unknown or Unknown confidence
- stale/missing source warnings remain visible in field mode
- action buttons are tappable and use existing navigation/share handlers
- visible CampOps pins, Camp Intel popup, Save Camp, Navigate Here, and Report Unusable are exercised in the dev-only candidate viewport
- Why this recommendation expands and collapses without clipping
- AI summary expands and collapses without changing deterministic card facts

## Dev Fixture Entry Point

Use `/dev/campops-visual-qa` as the lightweight dev-only fixture entry point. The route is implemented in `app/dev/campops-visual-qa.tsx`, renders `components/campops/CampOpsVisualQaScreen.tsx`, and uses label-only fixture state from this matrix.

The route must:

- be hidden outside development builds
- render the core state ids from this matrix
- avoid live provider APIs
- avoid raw user ids, vehicle ids, private debriefs, raw provider payloads, raw AI prompts, and precise private coordinates
- keep CampOps cards renderable without AI output
- include a candidate-producing fixture viewport without enabling providers, telemetry, community publishing, AI output, or fake live camp data

The fixture manifest in `fixtures/campops/mobileQaVisualStates.js` remains the source for manual QA state staging and checklist coverage.
