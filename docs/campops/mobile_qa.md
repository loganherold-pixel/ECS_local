# CampOps Mobile QA

This checklist makes CampOps QA repeatable on a local Android emulator or physical Android device. It does not require real provider API keys. Use the deterministic fixtures and local CampOps checks before running the manual mobile pass.

## Scope

The repo does not currently include a heavy mobile E2E framework such as Detox or Maestro. CampOps mobile QA therefore uses:

- existing Expo/Android commands
- deterministic fixture-backed Node checks
- a manual device checklist
- the fixture manifest in `fixtures/campops/mobileQaHarness.js`
- the visual state matrix in `fixtures/campops/mobileQaVisualStates.js`
- the dev-only runtime route `/dev/campops-visual-qa`

Do not add real secrets, production provider payloads, or private user data to the mobile QA fixtures.

## Preflight

Run the deterministic checks first:

```bash
node ./scripts/test-campops-search-integration.js
node ./scripts/test-campops-ui-cards.js
node ./scripts/test-campops-safe-endpoint.js
node ./scripts/test-campops-ai-assist.js
node ./scripts/test-campops-debrief.js
node ./scripts/test-campops-provider-fixtures.js
node ./scripts/test-campops-mobile-qa-harness.js
```

Then run the repo checks:

```bash
npx tsc --noEmit
npm run lint
```

## Android Setup

1. Start an Android emulator from Android Studio or connect a physical device with USB debugging enabled.
2. Confirm the target is visible:

```bash
adb devices -l
```

3. Start the Expo app:

```bash
npm run android
```

If Metro is not already running:

```bash
npm run start
```

If deep linking is available in the current dev session, open Navigate:

```bash
adb shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8081/--/navigate
```

Expo host/port can vary. Use the URL printed by Metro when needed.

## Fixture Entry Point

Use `fixtures/campops/mobileQaHarness.js` as the QA manifest. It lists:

- Android helper commands
- required deterministic fixture files
- preflight Node checks
- manual QA scenarios
- expected UI and behavior assertions
- visual state matrix entry points

Use `/dev/campops-visual-qa` as the lightweight dev-only runtime entry point for visual states. The route is implemented in `app/dev/campops-visual-qa.tsx`, is gated by `__DEV__`, and redirects away outside development builds. It renders label-only scenarios from `components/campops/CampOpsVisualQaScreen.tsx`.

The route exists to unblock Android/device QA evidence collection. It does not complete Android/device QA by itself.

Guardrails:

- no real users
- no real routes
- no precise private coordinates
- no vehicle identifiers
- no raw provider payloads
- no raw AI prompts
- no private debrief notes
- AI assist disabled
- telemetry disabled
- community publishing disabled
- provider influence shadow/unknown only

## Visual State Matrix

The full matrix lives in `docs/campops/mobile_visual_state_matrix.md` and is backed by `fixtures/campops/mobileQaVisualStates.js`.

Required visual states:

- feature flag off
- feature flag on
- recommended endpoint
- backup endpoint
- emergency fallback
- planned camp downgraded
- stale source warning
- source conflict warning
- legal confidence unknown
- closure status unknown
- fire restriction unknown
- weather stale
- low fuel
- low water
- trailer caution
- large group caution
- offline cached data
- offline no cached data
- AI summary expanded/collapsed
- Why this recommendation? expanded/collapsed
- long camp names
- long warning lists
- cramped/small screen

## Manual QA Checklist

### Device and layout pass

Run the visual state matrix on:

- small screen Android portrait
- large screen Android portrait
- landscape if supported by the build/device
- online mode
- offline mode with cached source data
- offline mode with no cached source data

For each state, verify:

- long camp names wrap cleanly.
- long warning lists remain readable and do not overlap controls.
- missing data fields show `Unknown` or `Unknown confidence`.
- action buttons are tappable and use existing navigation/share handlers.
- stale, cached, missing, and unavailable source warnings stay visible in field mode.
- `Why this recommendation?` expands and collapses without clipping.
- AI summary expanded/collapsed states do not change deterministic card facts.

### Feature flag off: old camp search behavior

Setup:

- Set `campopsRecommendationsEnabled=false` through the existing rollout/config path.
- Open Navigate and run an existing campsite search or route/polygon camp analysis.

Expected:

- Existing campsite candidate list is visible.
- CampOps cards are not rendered.
- No source transparency section appears.

### Feature flag on: CampOps cards display

Setup:

- Set `campopsRecommendationsEnabled=true`.
- Run a camp search that returns CampOps data.

Expected:

- CampOps cards appear above or alongside the existing result list.
- Existing campsite results remain visible.
- The UI does not use overconfident wording such as guaranteed, definitely legal, or unqualified safe.

### Recommended Camp, Backup Camp, Emergency Camp

Expected:

- Recommended Camp card appears when a primary endpoint exists.
- Backup Camp card appears when a viable alternate exists.
- Emergency Camp card appears when an emergency endpoint exists.
- Cards display available score, legal confidence, ETA, sunset margin, fuel/water margin, late-arrival risk, trailer suitability, group fit, and data confidence.
- “Why this recommendation?” expands to top reasons, top warnings, source data, resource debt, and decision point when available.

### Stale source warning display

This is the stale source warning QA path.

Fixture refs:

- `fixtures/campops/evaluationFixtures.js:offline_stale_data`
- `fixtures/campops/providerFixtures.js:provider_stale_offline_source`

Expected:

- UI shows “Source data is stale” or equivalent stale/cached source warning.
- Recommendation confidence is reduced.
- AI explanation includes the stale source warning.

### Two-hour delay endpoint recommendation

This is the two-hour delay QA path.

Fixture refs:

- `scripts/test-campops-safe-endpoint.js`
- `fixtures/campops/evaluationFixtures.js:two_hour_delay`

Expected:

- Planned scenic camp is downgraded when ETA moves after sunset and late-arrival risk is high.
- A closer accessible endpoint is recommended where fixture data supports it.
- Decision summary includes downgrade reason, key risks, and next action.

### Trailer convoy recommendation

This is the trailer convoy QA path.

Fixture refs:

- `fixtures/campops/evaluationFixtures.js:trailer_convoy`
- `scripts/test-campops-convoy-awareness.js`

Expected:

- Known no-turnaround or trailer-incompatible camp is rejected or downgraded.
- Trailer-suitable camp is recommended when available.
- UI and AI explain trailer/turnaround limits without inventing road width or turnaround data.

### Low fuel recommendation

This is the low fuel QA path.

Fixture refs:

- `fixtures/campops/evaluationFixtures.js:low_fuel_margin`
- `fixtures/campops/providerFixtures.js:provider_low_fuel`

Expected:

- Remote scenic camp is downgraded when fuel exit margin is tight or critical.
- Resupply-friendly camp is recommended or assigned resupply role.
- Fuel margin language uses comfortable, tight, critical, or unknown style wording.

### AI explanation with stale data

Fixture refs:

- `scripts/test-campops-ai-assist.js`
- `fixtures/campops/providerFixtures.js:staleOfflineCases`

Expected:

- AI mentions stale source data clearly.
- AI does not call stale closure, fire, or weather data current.
- AI does not recommend a hard-gate rejected camp.

### Debrief privacy defaults

Fixture refs:

- `scripts/test-campops-debrief.js`

Expected:

- Debrief visibility defaults to private.
- Community publishing requires explicit consent.
- Public-safe debrief output omits user id, vehicle id, raw photo refs, and precise location.

### Offline/cached source warning

This is the offline/cached source warning QA path.

Fixture refs:

- `scripts/test-campops-offline-stale-sources.js`
- `fixtures/campops/evaluationFixtures.js:offline_stale_data`

Expected:

- CampOps remains usable with cached or unknown source data.
- UI shows stale, cached, missing, or unavailable source warnings.
- AI summary preserves stale/missing warning language.

## Evidence To Capture

For each mobile QA run, record:

- device/emulator model and Android version
- Expo runtime used: Expo Go, dev client, or native build
- feature flag state
- scenario ids exercised from `mobileQaHarness.js`
- screenshots of CampOps cards and expanded reasoning
- stale/offline source warning screenshot
- notes for any missing fixture path or blocked step

Do not capture or attach private user ids, vehicle ids, raw photo refs, or precise private camp coordinates in QA artifacts.
