# ECS Accessibility and Device-Quality Pass

## Scope and Baseline

Repository baseline:

- Root: `C:\Users\logan\Desktop\ECS_local`
- Branch: `codex/source-truth-foundation`
- Worktree before this task: 0 staged, 324 tracked unstaged, 102 untracked
- Applicable instructions: root `AGENTS.md`

This pass preserves existing routes, copy, layout hierarchy, operational density, semantic colors, deterministic status ownership, and domain behavior.

| Surface | Measured baseline | Highest-confidence issue |
| --- | --- | --- |
| Fleet | 5 raw touchables, 33 ECS buttons, 7 labels | Shared buttons lack busy/selected state and compact hit-target expansion; errors are not announced |
| Navigate | 87 raw touchables, 71 labels, 4 hints | Many controls are named, but route activation and modal focus behavior are inconsistent |
| Dashboard / ECS Brief | 6 raw touchables in route, 2 labels | Brief freshness and critical/hold changes are visible but not announced consistently |
| Explore | 39 raw touchables, 10 labels | Nested favorite actions are incompletely named; long route names clip; destructive plan removal has no confirmation |
| Dispatch | 100 raw touchables, 52 labels, 15 states | Connection, critical advisory, and queued-action transitions lack one shared announcement policy |
| Expedition assessments | 84 raw touchables across expedition components, no roles in that folder | The central assessment view uses text/color status but lacks grouped screen-reader state and stale/critical announcements |
| CampOps | Results are distributed across Navigate and Dashboard components | Safe-endpoint and assessment shells inherit modal gaps; source state must remain explicit and color-independent |
| Offline Prep | 11 touchables, 13 labels | Error and queued-download text is visible but not announced as operational state changes |
| Vehicle Display | 6 touchables, no labels or roles | Driver controls lack names, roles, selected/checked state, and guaranteed effective touch targets |

Only 64 application files currently use advanced React Native accessibility APIs, and only two files call `announceForAccessibility`. There was no dedicated cross-surface accessibility regression script at baseline.

## First Tranche

1. Add one typed operational announcement model for errors, connection changes, route activation, stale data, critical advisories, and queued offline actions.
2. Harden the existing ECS button, badge/status, modal, and tactical-shell primitives for names, state, dynamic text, modal focus, keyboard behavior, and reduced motion.
3. Apply the announcement model to Navigate route activation, ECS Brief freshness, Dispatch connection/queue/critical advisories, Expedition assessments, Offline Prep, and Vehicle Display.
4. Correct Vehicle Display control semantics and Explore favorite-card naming, long-text handling, and destructive confirmation.

This is a bounded first tranche. It does not replace every raw `TouchableOpacity`, alter map layout, reduce information density, or redesign any target surface.

## Implemented Contract

- ECS buttons expose disabled, busy, and selected state, support bounded font scaling, and expand compact visual controls to an effective 44-point target.
- ECS status badges and indicators expose a spoken status label, so warning, unavailable, live, and selected states do not depend on color alone.
- ECS modal surfaces contain assistive focus, support the accessibility escape gesture, focus the title on native open, preserve Android back dismissal, and support keyboard-aware scrolling.
- Operational announcements use one typed, deduplicated model. The model accepts already-validated state and does not infer safety, delivery, route, or connection conclusions.
- Tab render failures announce a redacted recovery message. Raw exception text is not spoken to the user.
- Navigate announces route activation/failure, gives stacked map popups modal semantics, and exposes map-style choices as radio controls.
- Command Brief, Dispatch, Expedition assessments, Offline Prep, and Vehicle Display announce their selected stale, critical, error, connection, or queued-action transitions.
- Explore saved-route actions are individually reachable, long names wrap, and route/stack removal requires confirmation.
- Vehicle Display exposes tab, radio, and switch semantics with selected/checked state and 44-point or larger controls.

No production dependency, route, top-level tab, rollout flag, or deterministic domain conclusion changed in this pass.

## Ranked Follow-Up

1. Replace remaining raw Dispatch and Expedition touchables with existing ECS primitives, starting with compose forms, timeline rows, and destructive actions.
2. Add runtime focus-order tests for stacked Navigate map popups and marker detail actions on TalkBack and VoiceOver.
3. Characterize Fleet and Dashboard widget layouts at 200% accessibility text and correct widget-specific clipping without reducing normal-density layouts.
4. Add keyboard next/previous/done navigation and focus restoration to Dispatch, Explore, and Offline Prep forms.
5. Add dedicated CampOps candidate/result semantics for hard gates, source detail, primary/backup/emergency endpoint roles, and map/list clustering.
6. Validate Vehicle Display focus order, glanceability, and update announcements on real Android Auto and CarPlay hardware before changing rollout approval.

## Real-Device Matrix

The following scenarios still require visual and assistive-technology evidence on physical devices after automated checks pass:

- Android phone: TalkBack, 200% font size, display size Large, portrait and landscape
- Android tablet: TalkBack, split-screen, hardware keyboard, portrait and landscape
- iPhone: VoiceOver, Larger Text at accessibility sizes, Reduce Motion, portrait and landscape
- iPad: VoiceOver, Stage Manager/split view, hardware keyboard, portrait and landscape
- Android Auto and CarPlay/head-unit: rotary/focus navigation, glanceability, disconnect/reconnect, route and stale-GPS transitions
- Navigate map: TalkBack/VoiceOver traversal while map controls, map points, stacked sheets, and active guidance are visible
- Keyboard forms: Dispatch compose, Explore search/filter, Offline Prep imports, and modal restoration after keyboard dismissal
- Contrast: day/night themes and outdoor brightness on representative OLED/LCD devices

Automated source and model tests cannot establish real focus order, screen-reader speech, physical target spacing, frame pacing, or head-unit driver distraction.
