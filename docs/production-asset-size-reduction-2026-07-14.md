# ECS Production Asset Size Reduction

Measured on 2026-07-14 from `codex/source-truth-foundation`. The 225 MiB hard limit remains unchanged.

## Result

| Metric | Before | After source changes | Delta |
| --- | ---: | ---: | ---: |
| Production source assets | 261,694,089 bytes (249.57 MiB) | 226,322,504 bytes (215.84 MiB) | -35,371,585 bytes (-33.73 MiB) |
| Hard-limit margin | -25,764,489 bytes | +9,607,096 bytes (+9.16 MiB) | +35,371,585 bytes |
| Raw `assets/` and `public/` files | 261,694,089 bytes | 238,444,970 bytes | -23,249,119 bytes |
| Guarded local staging exclusion | 0 bytes | 12,122,466 bytes | -12,122,466 production bytes |

The rebuilt universal release APK is 385,946,531 bytes (368.07 MiB), down 16,486,234 bytes (15.72 MiB) from 402,432,765 bytes. It remains 18.07 MiB above the 350 MiB warning but 31.93 MiB below the 400 MiB hard ceiling. ZIP inspection found zero Rive/Nitro, `.riv`, staging, or source-map entries. Its measured compressed contributors are 191,982,008 bytes of resources and 157,895,932 bytes of four-ABI native libraries; production continues to use AAB delivery rather than dropping supported ABIs from the universal QA APK.

The rebuilt Expo web export is 229,046,274 bytes (218.44 MiB) and contains no Rive, staging, or source-map files.

`artifacts/app-size/production-asset-inventory.json` is the schema-versioned machine inventory. It records raw and measurable export sizes, importers, runtime/development use, platform scope, exact and conservative near-duplicate groups, recommendations, and safety classification. Policy exclusions fail closed unless both EAS and Metro protections are present.

## Removed Assets

These files had no production importer or dynamic-manifest/native reference. Current visual behavior already uses the native Power Monitor telemetry panel and the 21-image vehicle attitude manifest.

- `assets/power/blu_power_module.riv` (4,467,435 bytes)
- `public/rive/blu_power_module.riv` (4,467,435 bytes)
- `assets/attitude/vehicles/default/Attitude_Monitor_Image.png` (2,423,376 bytes)
- `assets/ecs/nav/Attitude_Monitor_Image.png` (2,423,376 bytes)
- `assets/images/favicon.png` (2,274,479 bytes); web now uses the byte-identical `assets/images/splash-icon.png`

The unreachable Power Monitor Rive wrappers, adapters, and `@rive-app`/Nitro dependencies were also retired. This removes the Rive native libraries from subsequent Android packaging without changing Power Monitor telemetry behavior.

## Excluded Local Staging Copies

These ignored local files remain on disk and in the inventory, but `.easignore` and Metro prevent production inclusion. Their tracked offline runtime equivalents remain under `assets/images/protocols/recovery/`.

- `assets/images/recovery-protocols/deadman_anchor_recovery.png` (1,734,678 bytes)
- `assets/images/recovery-protocols/kinetic_rope_recovery.png` (2,071,164 bytes)
- `assets/images/recovery-protocols/multi_vehicle_recovery.png` (2,051,862 bytes)
- `assets/images/recovery-protocols/snatch_block_recovery.png` (2,194,749 bytes)
- `assets/images/recovery-protocols/vehicle_assisted_pull.png` (2,055,539 bytes)
- `assets/images/recovery-protocols/winch_recovery.png` (2,014,474 bytes)

## Losslessly Recompressed Assets

Only tracked PNGs with no embedded color/profile metadata and at least 100 KiB savings were rewritten. All 44 retained their dimensions, image mode, and decoded RGBA SHA-256. No asset was resized or visually converted. Detailed before/after hashes are in `artifacts/app-size/png-lossless-verification.json`.

- `assets/attitude/overlays/subtle-topo-overlay.png` (-401,143 bytes)
- `assets/attitude/vehicles/default/fullsize-truck-hero.png` (-144,047 bytes)
- `assets/attitude/vehicles/fleet/heavy-duty-truck-hero.png` (-144,992 bytes)
- `assets/attitude/vehicles/fleet/midsize-truck-hero.png` (-146,956 bytes)
- `assets/attitude/vehicles/fleet/suv-hero.png` (-136,326 bytes)
- `assets/attitude/vehicles/fleet/van-hero.png` (-140,997 bytes)
- `assets/chrome/backgrounds/popup-container-bg.png` (-372,764 bytes)
- `assets/dashboard/attitude-monitor-vehicle.png` (-172,791 bytes)
- `assets/field-utilities/emergency-protocol.png` (-233,063 bytes)
- `assets/field-utilities/trip-summaries.png` (-227,954 bytes)
- `assets/images/Attitude_Truck_Silhouette.png` (-131,265 bytes)
- `assets/images/safety-protocols/impalement.png` (-184,206 bytes)
- `assets/images/safety-protocols/severe_bleeding.png` (-154,644 bytes)
- `assets/images/safety-protocols/vehicle_rollover.png` (-193,579 bytes)
- `assets/power/Power_Management_Background.png` (-158,881 bytes)
- `assets/route/Route_Progress_Map_Background.png` (-162,939 bytes)
- `assets/sunlight/After_sunset.png` (-116,819 bytes)
- `assets/sunlight/Civil_twilight.png` (-103,926 bytes)
- `assets/sunlight/Dark.png` (-129,830 bytes)
- `assets/sunlight/Remaining_Sunlight_Night.png` (-119,785 bytes)
- `assets/vehicles/profile/Ford_F150_Vehicle_Profile.png` (-108,041 bytes)
- `assets/vehicles/profile/Ford_Super_Duty_Vehicle_Profile.png` (-112,028 bytes)
- `assets/vehicles/profile/Generic_SUV_Vehicle_Profile.png` (-109,108 bytes)
- `assets/vehicles/profile/Generic_Truck_Vehicle_Profile.png` (-111,313 bytes)
- `assets/vehicles/profile/Generic_Van_Vehicle_Profile.png` (-106,657 bytes)
- `assets/vehicles/profile/Jeep_Gladiator_Vehicle_Profile.png` (-112,679 bytes)
- `assets/vehicles/profile/Jeep_Wrangler_Vehicle_Profile.png` (-104,560 bytes)
- `assets/vehicles/profile/Lexus_LX_Vehicle_Profile.png` (-108,356 bytes)
- `assets/vehicles/profile/Nissan_Frontier_Vehicle_Profile.png` (-110,766 bytes)
- `assets/vehicles/profile/Nissan_Xterra_Vehicle_Profile.png` (-112,436 bytes)
- `assets/vehicles/profile/Ram_2500_3500_Vehicle_Profile.png` (-110,290 bytes)
- `assets/vehicles/profile/Subaru_Outback_Vehicle_Profile.png` (-112,284 bytes)
- `assets/vehicles/profile/Toyota_4Runner_Vehicle_Profile.png` (-104,366 bytes)
- `assets/vehicles/profile/Toyota_Sequoia_Vehicle_Profile.png` (-103,715 bytes)
- `assets/vehicles/profile/Toyota_Tacoma_Vehicle_Profile.png` (-104,080 bytes)
- `assets/vehicles/profile/Toyota_Tundra_Vehicle_Profile.png` (-112,040 bytes)
- `assets/weather/atmosphere.png` (-134,026 bytes)
- `assets/weather/Drizzle.png` (-123,480 bytes)
- `assets/weather/Rain.png` (-111,027 bytes)
- `assets/weather/Thunderstorms.png` (-130,125 bytes)
- `assets/weather/Weather_Clear_Sun.png` (-250,598 bytes)
- `assets/weather/Weather_Overcast_Cloud.png` (-369,771 bytes)
- `assets/weather/Weather_Rain.png` (-355,150 bytes)
- `assets/weather/Weather_Snow.png` (-399,215 bytes)

Category savings: weather 1,873,392 bytes; vehicles 1,742,719; attitude 1,114,461; images 663,694; sunlight 470,360; Field Utilities 461,017; chrome 372,764; Dashboard 172,791; route 162,939; power 158,881.

## Offline Contract

Tracked recovery and emergency protocol artwork remains packaged and explicitly classified as offline-required by `config/production-asset-policy.json`. Route geometry, map regions, weather snapshots, and expedition packages continue to use the existing Offline Readiness Manifest/provider-managed cache path; none were converted to remote-only assets.
