# AGENTS.md - ECS 5.0 Repository Instructions

## Project Purpose

ECS is an Expedition Command System for active overland travel, safety, convoy awareness, route confidence, logistics, vehicles, camp readiness, and incident recovery.

The app should feel tactical, compact, premium, readable, and useful in real field conditions. It should continue to work when live sensors, OBD, satellite, or internet data are unavailable.

## Expedition Dashboard Rules

- Do not redesign the Expedition dashboard layout unless the user explicitly asks for a layout change.
- Current Expedition work should add behavior, data, state, and detail views behind existing buttons/cards.
- Preserve the existing dashboard card/grid structure and visual hierarchy.
- The six Expedition operational buttons are:
  - Overview
  - Route
  - Convoy
  - Camp
  - Logistics
  - Vehicles
- Each operational assessment view should include:
  - Status
  - Why
  - What to Watch
  - Recommended Action
  - To Improve Status
  - Confidence
  - Data Used
- Safety-critical status should come from deterministic rules first. AI may explain, summarize, and synthesize, but it must be grounded in visible input data.
- AI text must not invent facts, live data, coordinates, route conditions, vehicle telemetry, convoy state, or logistics status.
- If data is stale, cached, missing, mocked, estimated, or manually entered, the UI must say so.
- Manual input fallback must remain available where live data is unavailable.

## CampOps Rules

CampOps is the operational camp and resource logistics engine for deciding where an expedition can safely, legally, and realistically end the day. Do not treat camps as simple POI pins. Treat camps as operational endpoints in an expedition plan.

- CampOps should evaluate camp candidates against route progress, ETA, fuel range and margin, water range and margin, vehicle or trailer constraints, group capacity, suitability, access confidence, land-use/legal confidence, fire restriction awareness, weather exposure, late-arrival risk, privacy likelihood, pet/kid suitability, and Plan B or emergency fallback options when data exists.
- The deterministic CampOps engine must produce recommendations, hard gates, filter decisions, scores, margins, status, and confidence values. AI may explain, summarize, compare, and ask for missing inputs, but it must be grounded in visible engine outputs and input data.
- AI must not invent legal status, access confidence, fuel or water margins, weather facts, safety-critical conclusions, coordinates, provider coverage, or resource availability.
- Use structured data, typed inputs, typed outputs, explicit confidence fields, source labels, timestamps, and stale/missing/manual/mock/cache markers wherever possible.
- Preserve backward compatibility with existing camp search, campsite recommendation, camp intel, and campsite candidate flows. CampOps should wrap, adapt, or feature-flag behavior changes before replacing existing behavior.
- Prefer feature flags for risky changes to filtering, ranking, route-aware recommendations, AI prompts, public/community camp visibility, or provider-backed legal/resource data.
- Keep adapters thin: normalize route, weather, vehicle, logistics, community campsite, and manual inputs into explicit CampOps engine inputs instead of hiding business logic in UI or provider code.
- Add tests for filtering, scoring, hard gates, confidence calculation, stale/missing data handling, backward-compatible outputs, and AI prompt/response behavior that verifies AI cannot override deterministic safety or legality conclusions.
- Plan toward answering operational questions such as: "Where can we safely end the day if we are delayed two hours?"

## Established Campgrounds Provider Layer

- Provider API keys and service-role keys must only be accessed server-side through Supabase Edge Function environment variables.
- Never expose `RIDB_API_KEY`, `NPS_API_KEY`, `CAMPFLARE_API_KEY`, `ACTIVE_API_KEY`, `ACTIVE_API_SECRET`, `RESERVEAMERICA_API_KEY`, `ASPIRA_API_KEY`, `ECS_SERVICE_ROLE_KEY`, or equivalent secrets to React Native/mobile code.
- Mobile code should call ECS-owned endpoints only, not provider APIs directly.
- Established campground data should be normalized into canonical ECS records before reaching the map.
- Keep provider source records separately from canonical campground records.
- Preserve attribution per provider.
- Label live availability conservatively: only show "available now" or similar language when backed by a fresh availability source.
- OpenStreetMap is supplemental/lower-confidence POI data, not authority for legal status or live availability.
- Add tests or fixtures for every provider adapter.
- Do not log raw provider secrets or full sensitive payloads.

## Coding Expectations

- Reuse existing ECS design system components, tactical surfaces, icons, badges, typography, modal/sheet patterns, and semantic status colors.
- Follow existing app architecture and routing/state conventions.
- Keep UI accessible, readable, compact, and usable on mobile screens.
- Preserve offline usefulness.
- Prefer pure domain functions for deterministic assessment, scoring, confidence, and recommendation logic.
- Keep adapters thin. They should normalize app state into explicit inputs rather than hiding business logic.
- Keep missing data explicit. Unknown safety, location, communication, vehicle, weather, convoy, or logistics state must not imply safety.
- Avoid unrelated refactors while implementing Expedition, Incident, Fleet, or Dashboard work.
- Do not introduce new styling systems, one-off gradients, modal containers, banners, or raw colors when existing ECS tokens/components can be used.

## Testing Expectations

- Add unit tests for assessment logic and other pure domain functions.
- Add scenario fixture tests for Normal, Watch, Caution, and Critical states.
- Add adapter tests for stale, missing, cached, mocked, and manual data paths.
- Add UI tests if the repository already supports them.
- For Expedition operational work, verify the existing dashboard layout remains unchanged while buttons gain behavior.
- Run the repo's relevant lint, build, typecheck, and test commands before the final response.

## Expedition Definition of Done

- Existing Expedition layout is unchanged unless a layout change was explicitly requested.
- The six target buttons are interactive when enabled.
- Each button opens an operational assessment view.
- Each assessment includes Status, Why, What to Watch, Recommended Action, To Improve Status, Confidence, and Data Used.
- Offline/mock/manual data paths work.
- Stale and missing data are visible to the user.
- Deterministic safety status is covered by tests.
- Scenario fixtures cover Normal, Watch, Caution, and Critical states.
- Existing dashboard, Expedition, Incident & Recovery, and widget tests continue to pass.

## Fleet Rules

Fleet is the ECS vehicle command center. Keep the tab labeled Fleet. The experience should feel personal, guided, tactical, compact, and premium while retaining all technical data needed for ECS AI scoring, readiness, payload risk, confidence, and fabric outputs.

### Non-Negotiable Fleet Rules

- Keep the navigation/tab label as Fleet.
- Do not incorporate vehicle images, OEM photographs, build photographs, dealer images, scraped media, photo manifests, photo resolvers, remote vehicle image URLs, image carousels, large hero photo cards, or image-heavy Fleet backgrounds.
- Fleet should feel premium through ECS tactical layout, typography, metrics, chips, status badges, compact cards, icons from the existing design system, guided flows, and scoring clarity.
- Prefer vehicle cards over spreadsheet-style entry.
- ECS should prefill first, then ask the user to confirm or correct.
- Keep advanced fields, but hide them behind progressive disclosure.
- Accessories add weight and create compartments/load zones.
- "What Did I Forget?" is optional and separate from required Fleet setup.
- Always separate net/curb/empty weight from GVWR.
- Always show confidence/source when ECS estimates a value.
- Keep FleetFabricPayload free of photo/image fields.

### Fleet Math

- operatingWeight = baseNetWeight + installedAccessoryWeight + activeLoadoutWeight
- payloadRemaining = gvwr - operatingWeight
- gvwrUsagePct = operatingWeight / gvwr * 100
- roof/bedHigh loads affect top-heavy risk
- frontLow affects front axle risk
- rearLow/bedLow/bedHigh/hitch affect rear axle risk
- verified weights increase confidence
- uncertain estimates reduce confidence

### Fleet Confidence Tiers

- scale_ticket: 98
- vin_oem_match: 90-95
- manufacturer_spec: 88-95
- year/make/model/trim/engine/drivetrain match: 80-88
- ecs_default vehicle type only: 60-72
- user estimate only: 55-70

### Fleet Visual Identity Without Photos

Allowed:

- vehicle class icons from the existing ECS icon system
- nickname and year/make/model/trim text
- use-case chips
- tactical accent tokens from the ECS theme
- readiness/confidence/payload badges
- metric tiles
- compact status strips

Disallowed:

- OEM vehicle photographs
- build photographs
- remote vehicle image URLs
- vehicle image manifests
- photo resolvers
- large hero-image placeholders
- background photos
- image carousels
- vehicle image upload fields

### Required Fleet Docs

Create or update these docs during the Fleet refactor:

- docs/fleet-premium-refactor-map.md
- docs/fleet-tactical-ui-contract.md
- docs/fleet-premium-release.md

## Final Response Expectations

- Summarize files changed.
- Summarize verification commands run and their results.
- If tests were not run, explain why.
- Mention any remaining risks or follow-up work clearly and briefly.
