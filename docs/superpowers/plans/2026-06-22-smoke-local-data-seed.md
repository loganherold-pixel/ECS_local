# Smoke Local Data Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeatable, privacy-safe development smoke seed flow that imports a realistic exported ECS local-data JSON into the app without manual setup.

**Architecture:** Reuse the existing local-data export shape and import merge path. Split picker-based import from raw JSON import so normal import/export behavior remains unchanged, then expose only a development-mode login action that loads a bundled smoke export fixture through the same engine.

**Tech Stack:** Expo Router, React Native, TypeScript, Node assertion scripts, ECS local stores.

---

### Task 1: Regression Contract

**Files:**
- Modify: `scripts/test-local-data-import-export.js`
- Create: `fixtures/local-data/ecs-smoke-local-profile.json`

- [ ] Add failing assertions that require a smoke export fixture with local-only IDs, no provider secrets, useful Fleet/Navigate/Dispatch/offline content, and exported-data metadata.
- [ ] Add failing assertions that require `lib/localDataExport.ts` to expose a raw JSON import helper reused by both picker import and the dev seed.
- [ ] Add failing assertions that require `app/login.tsx` to gate the smoke seed UI behind `__DEV__`.
- [ ] Run `node scripts/test-local-data-import-export.js` and confirm it fails because the fixture/helper/dev path do not exist yet.

### Task 2: Import Engine

**Files:**
- Modify: `lib/localDataExport.ts`

- [ ] Implement `importLocalDataFromRawJson(rawJson, options?)` by moving the current merge logic behind the picker into a shared helper.
- [ ] Preserve `importLocalData()` as the picker-based public behavior.
- [ ] Add `importDevSmokeLocalData()` that is hard-gated by `__DEV__`, loads `fixtures/local-data/ecs-smoke-local-profile.json`, and calls the shared helper.
- [ ] Run the focused regression script and confirm local-data assertions pass once the fixture and login path exist.

### Task 3: Dev Login Harness

**Files:**
- Modify: `app/login.tsx`

- [ ] Import `importDevSmokeLocalData`.
- [ ] Add a `devSeedingLocalData` busy state and handler.
- [ ] Render a compact "Load smoke seed" action only when `__DEV__` is true.
- [ ] Keep production import/export buttons and privacy copy intact.

### Task 4: Fixture

**Files:**
- Create: `fixtures/local-data/ecs-smoke-local-profile.json`

- [ ] Populate a valid exported local-data payload with a local vehicle, vehicle spec confidence/source labels, active route, trip, loadout and critical items, waypoints, fuel/water log, user settings, setup state, and expedition log.
- [ ] Use local IDs and synthetic operational data only; do not include emails, phone numbers, provider API payloads, service-role fields, remote image URLs, or real secrets.
- [ ] Make metadata counts match the fixture.

### Task 5: Verification

**Files:**
- Modify: `package.json` if a named script is useful.

- [ ] Run `node scripts/test-local-data-import-export.js`.
- [ ] Run `npm run typecheck`.
- [ ] Run relevant app lint/build smoke commands as time allows and report any unrelated failures clearly.
