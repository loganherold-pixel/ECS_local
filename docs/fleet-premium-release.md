# Fleet Premium Release

## Release Scope

Fleet remains the ECS vehicle command center under the existing `Fleet` tab label. This release ships the premium tactical Fleet foundation without vehicle photos, image heroes, upload flows, photo manifests, image resolvers, or remote vehicle imagery.

## Production Readiness

- Vehicle profile defaults include configuration-aware RAM 2500 weights, with base net/curb/empty weight kept separate from GVWR.
- Vehicle profile setup can use the offline OEM-reference catalog to prefill likely year/make/model baseline specs for common expedition vehicles, including fuel capacity, ground clearance, wheelbase, dimensions, off-road angles, and turning diameter when bundled.
- OEM references are source/confidence labeled and are not treated as VIN-specific truth. Door placard values, user-entered specs, and scale tickets remain higher authority.
- Weight math follows `base net + installed accessories + active loadout = operating weight`, and `payload remaining = GVWR - operating weight`. Saved fuel and water are counted as explicit current-loadout inputs when present, with their source/confidence labels kept visible instead of hidden in the base vehicle weight.
- Confidence tiers are explicit for scale tickets, VIN/OEM matches, manufacturer specs, exact build matches, ECS defaults, and user estimates.
- Build & Loadout accessories add weight, create compartments where appropriate, and preserve existing loadout state during accessory edits.
- Weight Summary uses `calculateVehicleOperatingWeight` to combine confirmed Vehicle Profile weights, saved Build & Loadout accessories, compartment loadout items, active loadout items, and saved fuel/water consumables before calculating operating weight and center-of-gravity inputs.
- Center of Gravity uses live weighted placement from the base vehicle, selected build systems, and compartment/loadout items, then plots the result on a type-aware top-down vehicle silhouette instead of a generic box graphic.
- Build & Loadout persists compartment placement metadata with accessory-generated compartments and loadout items so moving items between compartments updates operating weight and live center-of-gravity output after save/reopen.
- Compartment-aware loadout presets can layer Work or trip load on top of Daily without deleting existing items.
- What Did I Forget? remains optional. Need it adds prep work only; Have it can create a linked loadout item when the user chooses.
- Fleet fabric payloads include vehicle, build, accessories, compartments, active loadout, checklist, scoring, risk, confidence, and limited tactical route state only.
- Existing Fleet data is handled through adapters and `migrateLegacyVehicleToFleetPremium`, which preserves existing `wizard_config` keys and writes premium Fleet state under versioned fields.
- `resolveFleetPremiumReleaseConfig` provides staged rollout switches for premium Fleet, profile setup, Build & Loadout, checklist, fabric sync, and developer diagnostics.

## Shell And Tactical Compliance

- Fleet inherits the root shell background and keeps route containers transparent.
- Fleet renders the shared `Header` while top banner ownership remains screen-level.
- Fleet does not render `CommandDock`; bottom navigation remains root-owned.
- Fleet overlays use `ECSModalShell` or `TacticalPopupShell` for backdrop, close behavior, scroll behavior, keyboard handling, overlay stack behavior, and safe-area clearance.
- Fleet cards and panels use `ECSCard`, `ECSPanel`, `ECSBadge`, `ECSButton`, `ECSActionRow`, `ECS_SURFACE`, `ECS_STATUS`, and `ECS_TEXT`.

## Test Coverage

- `scripts/test-fleet-premium-domain.js`
  - Vehicle profile defaults.
  - RAM 2500 defaults.
  - GVWR/net weight separation.
  - Weight math and confidence tiers.
  - Accessory-generated compartments.
  - Loadout presets and preset preservation.
  - Checklist statuses.
  - ECS fabric payload shape and no-media serialization.
  - Legacy migration adapter.
  - Fleet premium rollout config.
- `scripts/test-fleet-tactical-ui-contract.js`
  - No-image Fleet implementation.
  - Tactical UI contract usage.
  - Shared modal/sheet container usage.
  - Top `Header` and bottom `CommandDock` ownership.
  - Safe-area and scroll QA checklist presence.
- `scripts/test-fleet-operating-weight.js`
  - Real operating-weight aggregation from Vehicle Profile, Build & Loadout accessories, compartment items, and active loadout items.
  - Payload margin, over-GVWR warning metadata, and missing item-weight partial-data handling.
  - Live center-of-gravity placement, including roof-heavy and driver/passenger-side load placement.
  - Saved accessory-framework weights and compartment moves feeding the same Weight Summary calculation used by Fleet card scoring.
- `scripts/test-fleet-weight-summary-dashboard.js`
  - Full-body Weight Summary modal sizing.
  - Single-dashboard Weight Summary surface with no old Overview/Zones/Stability tabs.
  - Guard that Fleet Weight Summary uses the real operating-weight helper instead of the legacy wizard-selection calculation.
  - Guard that the COG visual uses a vehicle-type silhouette and lateral COG marker placement instead of the old generic box sections.
- `scripts/test-fleet-oem-spec-reference.js`
  - OEM reference catalog matching.
  - Unsupported model-year handling.
  - Fleet profile OEM suggestion source/confidence behavior.
  - Downstream vehicle-fit fields such as width and approach angle.

## Production Evidence Contract

Fleet is code-ready but remains evidence-blocked for production. The production gate expects this file when QA is complete:

`.smoke/fleet-production-evidence.json`

Expected fields:

```json
{
  "androidFleetProfileVisualQaPassed": true,
  "multiVehicleActiveSelectionEvidencePassed": true,
  "scaleTicketProfileEvidencePassed": true,
  "sourceConfidenceOfflineStatesVisible": true,
  "offlinePersistenceMigrationEvidencePassed": true,
  "productionDecision": "accepted",
  "buildAndDevice": {
    "appBuildType": "development/native",
    "appVersion": "field-test build identifier",
    "androidDeviceModel": "device model",
    "androidOsVersion": "Android version",
    "nativeBuild": true,
    "expoGoRuntime": false
  },
  "androidQaStateMatrix": {
    "sourceLabelsVisible": true,
    "confidenceLabelsVisible": true,
    "estimatedStateVisible": true,
    "missingDataStateVisible": true,
    "offlineStateVisible": true,
    "noPhotoContractVisible": true
  },
  "deviceMatrix": [
    "Android phone portrait",
    "Android tablet or large-screen emulator"
  ],
  "evidenceReferences": [
    ".smoke/fleet-android/profile-zero-vehicle.png",
    ".smoke/fleet-android/profile-source-confidence.png",
    ".smoke/fleet-android/multi-vehicle-switch.png",
    ".smoke/fleet-android/offline-restart-restore.log"
  ],
  "reviewerSignoff": {
    "product": "name/date",
    "engineering": "name/date",
    "qa": "name/date",
    "privacy": "name/date",
    "acceptedAt": "ISO timestamp"
  },
  "notes": "Screenshots, UI XML, logs, and reviewer notes captured for review."
}
```

Do not set `productionDecision` to `accepted` until the Android evidence, source/confidence/offline states, no-photo contract, and reviewer signoff are complete.

## Remaining Evidence Checklist

- Android Fleet QA: capture phone and large-screen evidence for zero-vehicle, add/edit Vehicle Profile, Advanced Specs, Build & Loadout, Weight Summary, confidence modal, safe-area scrolling, keyboard entry, and no vehicle-photo surfaces.
- Multi-vehicle evidence: create at least two vehicles, switch active vehicle, then verify Fleet, Dashboard, Navigate, Explore, CampOps, and ECS intelligence surfaces use the selected vehicle without stale context.
- Verified-weight evidence: record one scale-ticket or axle-weight path, verify base/GVWR/source/confidence labels change from estimated to verified where appropriate, and confirm payload math still uses GVWR minus operating weight.
- Offline persistence evidence: add/edit profile data, build/loadout items, consumables, tire/lift values, and checklist state while offline; restart the Android app; confirm local data restores and legacy migration keeps existing `wizard_config` fields.
- Evidence hygiene: keep screenshots/logs privacy-safe. Do not include VINs, precise private trip data, private user IDs, raw provider payloads, secrets, or vehicle photographs.

## Manual QA

1. Open Fleet.
2. Confirm the tab label is still Fleet.
3. Confirm Fleet inherits the correct ECS tactical app background.
4. Confirm the top ECS banner/header appears or is omitted according to the existing app shell rules.
5. Confirm there is no duplicate top banner.
6. Confirm the bottom ECS banner/navigation/footer appears or is omitted according to the existing app shell rules.
7. Confirm there is no duplicate bottom banner.
8. Confirm Fleet vehicle cards contain no vehicle photos, hero images, remote images, or image upload prompts.
9. Add RAM 2500 Cummins Crew 4x4 short bed.
10. Confirm base net weight around `7,742 lb` and GVWR around `10,190 lb`.
11. Confirm the card uses text, chips, metrics, and status badges rather than images.
11a. Add a 2021 Ford Bronco and confirm the OEM reference panel appears with verification copy.
11b. Try a 2019 Ford Bronco and confirm ECS does not silently apply the 2021+ Bronco reference.
12. Open Vehicle Profile advanced specs.
13. Confirm advanced specs use the global drawer/modal/sheet container.
14. Add SmartCap.
15. Confirm accessory weight is added and compartments are created.
16. Add bed drawers.
17. Confirm drawer compartments are created.
18. Add recovery gear to driver drawer.
19. Add roof rack item and place cargo on roof.
20. Confirm high-mounted risk changes.
21. Run What Did I Forget? for towing and recovery.
22. Mark compressor as Have it and assign it to passenger bin.
23. Mark trailer fuses as Need it.
24. Confirm Have item can affect loadout weight and Need item does not.
25. Open Weight Summary.
26. Confirm operating weight, payload remaining, GVWR usage, confidence, and risk flags.
26a. Confirm saved fuel/water appears as an explicit operating-weight input when values exist.
27. Confirm ECS fabric payload contains vehicle, build profile, accessories, compartments, loadout, checklist, verifications, and scoring.
28. Confirm ECS fabric payload contains no photo/image metadata.
29. Confirm mobile layout remains usable with correct safe-area padding.
30. Confirm popups/drawers/sheets use correct overlay, z-index, close, and focus behavior.
31. Confirm no new image/media assets were added for Fleet.

## Known Limitations

- Mobile safe-area and keyboard behavior still require a physical device or emulator pass.
- Fleet premium UI still lives inside the large `app/(tabs)/fleet.tsx` file; future extraction should split cards, panels, and detail surfaces into focused components.
- Cloud schema persistence for every premium Fleet extension depends on existing `wizard_config` storage until a dedicated synced schema is introduced.
- Fleet fabric debug output is dev-only and controlled by rollout diagnostics.

## Follow-Up Items

- Run a device QA pass on iOS and Android for safe areas, keyboard entry, and sheet dismissal.
- Add dedicated synced database fields or migrations if Fleet premium data must be queried server-side.
- Extract reusable Fleet card/panel components after release stabilization.
- Add visual regression coverage if the repo adopts Storybook, Playwright, or screenshot tooling.

## No-Media Confirmation

This release adds no vehicle images, OEM/dealer photos, scraped media, photo manifests, photo resolvers, remote vehicle image loads, image upload fields, or vehicle media metadata. Fleet’s premium identity is text, icon, metric, badge, chip, and tactical-surface based.
