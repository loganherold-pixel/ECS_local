# ECS Product Spine QA Summary

Last reviewed: 2026-06-09

Branch context: `codex/qa-evidence-policy-and-artifact-hygiene` created from `3981d013`.

Primary native QA device observed across recent passes: Samsung SM-X230, Android 16. Evidence is mixed: Active Trip, Offline Incident Packet, Badge Identity, Convoy v1.5, Convoy fixture, and Convoy title display have tracked local evidence folders; Terrain Risk and Camp Viability were recorded in prior QA notes but do not currently have curated tracked evidence folders in this repo snapshot.

| System | Native QA status | Internal testing | Closed beta | Paid beta | Key caveat |
| --- | --- | --- | --- | --- | --- |
| Trip Confidence Summary | Passed Android native QA in prior pass; screenshots appear in badge MVP evidence | Ready | Candidate after provider/outage matrix | Not enough alone | Advisory only; not a safety guarantee |
| Route Confidence Engine | Automated and native regression verified through Trip Confidence | Ready | Candidate | Not enough alone | Requires truthful upstream route, vehicle, POI, and environment inputs |
| Active Trip Mode | Tracked native evidence in `qa-evidence/active-trip-mode/` | Ready | Needs restart/device matrix | Not ready | More upgrade/restart coverage needed |
| Offline Incident Packet | Tracked native evidence in `qa-evidence/offline-incident-packet/` | Ready | Needs offline/restart matrix | Not ready | Local-only; no sharing/SOS claims |
| Active Trip Resume Discoverability | Native QA passed in prior run notes | Ready | Candidate after restart sweep | Not ready | Resume card must stay hidden after stop/end |
| Terrain Risk v1 | Native QA passed in prior run notes | Ready | Candidate as conservative advisory | Not ready | Missing/provider terrain data must stay Unknown, never safe |
| Camp Viability v1 | Native QA passed in prior run notes | Ready | Candidate as conservative advisory | Not ready | Legal/source confidence still blocks paid beta claims |
| Badge / Expedition Identity MVP | Tracked native evidence in `.qa/badge-expedition-identity-mvp-native/` | Ready | Candidate | Candidate after privacy copy review | No unlocks from unsafe signals |
| Convoy Command v1.5 | Tracked native evidence in `.qa/convoy-command-v1-5-native/` and fixture folders | Ready for fixture QA | Needs live multi-device privacy QA | Not ready | Do not treat demo/fixture participants as production membership |
| Convoy title display | Tracked native evidence in `.qa/convoy-badge-title-display-native/` | Ready | Candidate after privacy/scope review | Not ready | Read-only title only for scoped, trusted participants |

## Still Required Before Closed Beta

- Native Mapbox route overlay sweep: valid, malformed, missing, trailhead-only, approach-only, demo, and imported geometry.
- Provider unavailable/no-results native QA for route, POI, weather, and Mapbox dependency failures.
- Restart persistence matrix across Fleet, Trip Builder, Active Trip, Packet, weather cache, waypoint progress, and power metadata.
- Hardware field proof for OBD2/VeePeak, EcoFlow, Mopeka/Bluestack, and utility sensors.
- Live multi-device Convoy privacy and scope validation.
- Evidence retention cleanup: remove raw tracked QA folders from the index or replace them with curated summaries.

## Keep Gated

BLE/Mopeka/Bluestack, EcoFlow, OBD2, live Convoy tracking, route/community publishing, Android Auto, dev fixture screens, demo routes, mock telemetry, and raw QA fixture harnesses remain gated until explicitly field-qualified.

