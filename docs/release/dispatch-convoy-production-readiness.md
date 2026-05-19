# Dispatch/Convoy Command Production Readiness

Status: blocked by approvals

Production decision: pending

Position sharing approval: pending

## System

Dispatch/Convoy Command is the first production-readiness lane. Convoy Command now lives in the Dispatch tab, with the Rive panel seated in the lower CAD feed surface while convoy setup/team status remains above it. The old Dashboard widget/menu category is removed.

## Current Passes

- Dispatch internal beta gate passes.
- Convoy Command panel Rive asset is bundled for native and web and is mounted in the lower CAD feed surface.
- Dashboard Convoy Command widget/category is removed.
- Emergency Coordinate Ping is wired to the local Recovery Assist GPS flow.
- Emergency Coordinate Ping E2E device evidence is captured for GPS allowed, GPS denied, event detail, Navigate Assist handoff, and Navigate recovery route readiness.
- Copy states that ECS does not contact emergency services.
- Sensitive integrations remain default-off: live team position sharing, agency ingestion, public hazard publishing, automated SOS transmission, live radio/network integrations, and demo data.

## Remaining Production Tasks

| Task | Status | Evidence Needed |
| --- | --- | --- |
| Android Dispatch panel visual QA | Captured | Tablet portrait, phone portrait, phone landscape, and tablet landscape captured on device. Phone portrait text overlap and landscape dock cutoff were fixed during QA. Dev-warning overlays are not production UI. |
| Emergency Coordinate Ping E2E | Captured | GPS-allowed path created a local Recovery Assist event with coordinate and accuracy. GPS-denied path returned without fake coordinate creation. Event detail, Navigate Assist, readiness prompt, and Navigate recovery route card were captured on device. |
| Position sharing privacy/product approval | Pending | Explicit acceptance before enabling live team position sharing beyond local/internal beta. |
| Public/external dispatch approval | Pending | Explicit acceptance before enabling agency ingestion, public publishing, automated SOS transmission, or live radio/network integrations. |
| Production owner decision | Pending | Product, safety, privacy, and engineering owner acceptance after evidence is complete. |

## Android Evidence Captured

- Tablet portrait Dispatch route opened on device through `planning-offline-sync:///alert` after the pre-setup route guard was corrected to allow safety-critical Dispatch surfaces.
- Current tablet portrait visual evidence: `.smoke/dispatch-convoy-android-qa/37-tablet-portrait-after-responsive-fixes.png` and `.smoke/dispatch-convoy-android-qa/37-tablet-portrait-after-responsive-fixes-ui.xml`.
- Phone portrait visual evidence after responsive overlay fix: `.smoke/dispatch-convoy-android-qa/24-phone-portrait-dispatch-convoy-after-overlap-fix.png` and `.smoke/dispatch-convoy-android-qa/24-phone-portrait-dispatch-convoy-after-overlap-fix-ui.xml`.
- Phone landscape scroll evidence: `.smoke/dispatch-convoy-android-qa/30-phone-landscape-scroll-bottom.png` and `.smoke/dispatch-convoy-android-qa/30-phone-landscape-scroll-bottom-ui.xml`.
- Tablet landscape full-width panel evidence: `.smoke/dispatch-convoy-android-qa/32-tablet-landscape-full-width-panel.png`, `.smoke/dispatch-convoy-android-qa/32-tablet-landscape-full-width-panel-ui.xml`, and `.smoke/dispatch-convoy-android-qa/33-tablet-landscape-scroll-bottom-feed.png`.
- Emergency Coordinate Ping GPS-allowed path created one local `Recovery Assist` row with visible coordinate and accuracy.
- Ping evidence: `.smoke/dispatch-convoy-android-qa/18-emergency-ping-tap.png`, `.smoke/dispatch-convoy-android-qa/18-emergency-ping-tap-ui.xml`, and `.smoke/dispatch-convoy-android-qa/18-emergency-ping-logcat.txt`.
- GPS-denied path evidence: `.smoke/dispatch-convoy-android-qa/35-gps-denied-reopened-dispatch.png`, `.smoke/dispatch-convoy-android-qa/36-gps-denied-after-deny.png`, `.smoke/dispatch-convoy-android-qa/36-gps-denied-after-deny-ui.xml`, and `.smoke/dispatch-convoy-android-qa/36-gps-denied-after-deny-logcat.txt`.
- Event detail/action evidence: `.smoke/dispatch-convoy-android-qa/61-event-detail-open-after-navigate-guard.png`, `.smoke/dispatch-convoy-android-qa/61-event-detail-open-after-navigate-guard-ui.xml`, `.smoke/dispatch-convoy-android-qa/68-event-detail-actions-visible-scheduled-push.png`, and `.smoke/dispatch-convoy-android-qa/68-event-detail-actions-visible-scheduled-push-ui.xml`.
- Navigate Assist handoff evidence: `.smoke/dispatch-convoy-android-qa/69-navigate-assist-scheduled-push-result.png`, `.smoke/dispatch-convoy-android-qa/69-navigate-assist-scheduled-push-result-ui.xml`, `.smoke/dispatch-convoy-android-qa/70-navigate-assist-active-route-after-continue.png`, and `.smoke/dispatch-convoy-android-qa/70-navigate-assist-active-route-after-continue-ui.xml`.
- Current evidence is recorded in `.smoke/dispatch-convoy-production-evidence.json`. Visual QA and emergency ping E2E are captured; production remains blocked by explicit position-sharing privacy/product approval and owner production decision.

## Evidence Contract

The production gate expects this evidence file when QA is complete:

`.smoke/dispatch-convoy-production-evidence.json`

Expected fields:

```json
{
  "androidDispatchConvoyVisualQaPassed": true,
  "emergencyCoordinatePingE2ePassed": true,
  "deviceMatrix": ["phone portrait", "phone landscape", "tablet portrait", "tablet landscape"],
  "notes": "Screenshots/log references captured for review."
}
```

Do not mark `Position sharing approval: accepted` or `Production decision: accepted` until evidence and owner sign-off are complete.
