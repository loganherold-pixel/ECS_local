# ECS Asset And Branding Release Audit

## Summary

The active release brand is now aligned to `Expedition Command System` / `ECS`, with the motto `Explore with Confidence.` in Expo metadata. The active top and bottom chrome assets, app icon, splash image, login video, and startup loading video are all referenced through static `require` or Expo config paths.

## Patched Low-Risk Items

- Updated Expo app display name from `Expedition Planner Elite` to `Expedition Command System`.
- Added the release motto as Expo metadata: `Explore with Confidence.`
- Updated the top banner title override so the Dispatch tab renders `Dispatch`, not `Dispatch Center`.
- Replaced user-facing/diagnostic `AI` copy in Explore fallback messaging, Mission Brief summaries, and vehicle display source labels with ECS terminology.
- Removed unreferenced legacy chrome title PNGs under `assets/chrome/titles/`.
- Removed the unreferenced duplicate logo file `assets/images/Logo Update.png`.
- Removed stale unreferenced Expo icon PNGs `assets/images/icon.png` and `assets/images/adaptive-icon.png`; active launcher config now points to the safe-zone replacements.

## Confirmed Active Asset References

- App icon: `assets/images/icon-safe.png`
- Android adaptive icon foreground: `assets/images/adaptive-icon-foreground.png`
- Android adaptive icon background: `#0B0E12`
- Web favicon: `assets/images/favicon.png`
- Splash image: `assets/images/splash-icon.png`
- Startup loading video: `assets/auth/loading-transition.mp4`
- Login video: `assets/login/intro-login-video.mp4`
- Login fallback background: `assets/attitude/backgrounds/darker-tactical-canyon.png`
- Top banner background: `assets/chrome/banners/top-banner-bg.png`
- Bottom taskbar background: `assets/chrome/banners/bottom-banner-bg.png`
- Dock badges:
  - `assets/ecs/nav/fleet-badge.png`
  - `assets/ecs/nav/navigate-badge.png`
  - `assets/ecs/nav/ecs-center.png`
  - `assets/ecs/nav/discover-badge.png`
  - `assets/ecs/nav/alert-badge.png`

## Visual Findings

- Top banner background uses `ImageBackground` with `resizeMode="cover"` and fills the banner without an added dark rectangular title box.
- Bottom dock uses the full-width `bottom-banner-bg.png` and remains non-floating.
- Dock badge filenames still use legacy route keys (`discover`, `alert`), but the visible labels are `EXPLORE` and `DISPATCH`. The badge images themselves do not contain stale text.
- The active Expo app icon and Android adaptive foreground are safe-zone PNGs (`1024 x 1024`) generated to keep the ECS mark inside adaptive and legacy launcher masks.
- Chrome banner assets are wide, purpose-built banner images (`top-banner-bg.png` is `1390 x 241`, `bottom-banner-bg.png` is `1385 x 237`).

## Retained For Review

- `ECS_Dashboard_Icon_512.png` is a tracked root-level release-looking asset with no code reference found. I retained it because it may be external store/listing material rather than runtime UI.
- Legacy route filenames and keys remain `discover` and `alert` for route restoration and deep-link compatibility. User-facing labels are Explore and Dispatch.
- Some internal module names still use `ai` namespaces. User-facing copy was patched where low-risk; a broad namespace rename should be a separate migration.

## Risk

- Low: metadata display name, motto, visible Dispatch title, ECS terminology copy, and orphan title PNG removal.
- Medium: renaming legacy route files/keys from `discover`/`alert`.
- Medium: removing tracked root-level release artwork without confirming store/listing usage.
