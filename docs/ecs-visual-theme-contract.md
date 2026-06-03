# ECS Visual Theme Contract

## Fleet As Visual Reference

Fleet is the first-pass visual reference for the primary ECS shell. App surfaces should inherit Fleet's tactical dark body, compact cards, restrained gold accents, muted text, quiet borders, and pill opacity instead of creating separate page chrome.

This contract does not make every screen identical. It makes the app feel like one ECS system.

## Primary Shell Scope

The first pass covers the primary app-shell surfaces: Fleet, Dashboard, Navigate, Explore/Discover, Route, Trips/Expeditions, Intel/Intelligence, Safety, More, Loadmap/Loaditems, Alert, and Dispatch/Convoy command surfaces.

Auth, admin, PDF/export, and deep utility surfaces are out of scope unless they are affected through shared components.

## No Layout Or Content Changes

Theme work must not resize containers, reorder content, replace icons, rename labels, change workflows, or alter navigation behavior. It may only swap local fills, borders, text colors, opacity, and background ownership to existing ECS theme roles.

## Shared Background Contract

Root shell chrome owns the page background through `ShellBodyBackground`, `BODY_BG`, `resolveShellChromeTheme`, and transparent route containers. `TopoBackground` remains a transparent compatibility wrapper under the root body image.

Primary shell routes must not add local page images, gradients, or full-screen opaque backgrounds that fight the shared shell scrim.

## Shared Surface Contract

Use `ECSCard`, `ECSPanel`, `ECSBadge`, `ECSStatusPill`, `ECSButton`, `ECSActionRow`, and `ECSModalShell` when a shared primitive fits. Local styles may remain where replacing the component would reconfigure the screen, but their visual roles should map to `ECS_SURFACE`, `ECS_STATUS`, `ECS_TEXT`, `TACTICAL`, `GOLD_RAIL`, or shell chrome tokens.

Panel fills should use shared primary, secondary, compact, quiet, selected, warning, and overlay roles. Pills and badges should use shared status tones unless a domain-specific color carries explicit meaning.

## Semantic Color Exceptions

Keep meaningful non-gold color where it communicates status or domain data: map route lines, trail/road categories, hazard severity, live telemetry, dispatch urgency, load zones, weather/resource warnings, and safety-critical states.

Do not convert warnings, danger, map geometry, or route-category signals to gold just for visual consistency.

## Mapbox And Navigation Exceptions

Mapbox map styles, route geometry colors, selected segment colors, hazard layer colors, and user-location graphics are domain visuals. Theme normalization for Navigate and Dispatch should focus on surrounding chrome: toolboxes, cards, sheets, modals, legends, pills, route previews, and buttons.

## Guardrails

The static guard is `npm run test:ecs-visual-theme-contract`. It complements Fleet-specific checks and verifies that primary shell screens keep shared background ownership, avoid local background images or gradients, and continue consuming shared surface tokens where the visual pass touches legacy chrome.
