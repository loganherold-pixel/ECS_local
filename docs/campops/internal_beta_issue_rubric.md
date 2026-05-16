# CampOps Internal Beta Issue Severity Rubric

CampOps internal beta issues should be classified by the highest realistic field impact, not by how easy the fix looks. The purpose of this rubric is to decide what blocks closed field testing.

CampOps remains internal-beta only until P0 and P1 issues are resolved or explicitly accepted by product, safety, privacy, and engineering reviewers.

## Severity Levels

| Severity | Name | Definition | Closed field-test impact |
| --- | --- | --- | --- |
| P0 | Unsafe or privacy-critical | A defect could direct a user toward a known rejected, closed, illegal, or operationally unsafe endpoint, or could expose private data. | Blocks closed field test. Stop rollout until fixed and re-tested. |
| P1 | Recommendation trust failure | CampOps output is materially misleading about legality, access, source freshness, role assignment, AI narration, or legacy coexistence. | Blocks closed field test unless explicitly risk-accepted with mitigation. |
| P2 | Confusing UX or source transparency issue | Users can still recover the right meaning, but important uncertainty, stale data, source confidence, or reasoning is hard to see or understand. | Does not automatically block internal beta, but must be reviewed before closed field test. Multiple related P2s may block. |
| P3 | Polish/copy issue | Copy, spacing, labels, or non-critical UI behavior could be clearer but does not hide critical warnings or change recommendation meaning. | Can wait if tracked. |
| P4 | Enhancement | A useful improvement that is outside the current internal beta acceptance bar. | Can wait. |

## P0 Examples

Classify as P0 when any of these occur:

- CampOps recommends a candidate that deterministic hard gates rejected as closed, illegal, inaccessible, or otherwise not allowable.
- CampOps recommends a known private-land camp without permission or adequate caution.
- Community publishing exposes private data, precise location, user id, vehicle id, raw photo reference, or private notes.
- Telemetry emits precise location, raw trip data, raw AI prompt, private debrief notes, user id, or vehicle identifier.
- AI overrides hard gates or resurrects a rejected camp as recommended.
- Provider influence bypasses feature flags, cohort gates, or provider readiness approval.
- Rollback does not disable CampOps beta surfaces for non-testers or general users.

Required response:

- Stop expanding beta access.
- Capture fixture/input, flags, screenshots/logs where privacy-safe, and exact observed output.
- Assign engineering owner.
- Add or update regression test before marking fixed.
- Re-run CampOps tests, typecheck, lint, and relevant UI/provider/AI checks.

## P1 Examples

Classify as P1 when trust in the recommendation is materially degraded:

- Low, unknown, or conflicting legal confidence is presented as allowed.
- Stale closure data appears current.
- Fire restriction, closure, or access uncertainty is omitted from the recommendation summary.
- Emergency fallback appears as the primary recommended camp.
- Planned camp downgrade reason is missing in a delayed-day scenario.
- Legacy ranking contradicts CampOps by calling a downgraded or caution camp the best option.
- AI uses overconfident legal/access wording such as "definitely legal", "guaranteed open", "always accessible", "no risk", or unqualified "safe".
- Provider conflict resolution favors a stale low-confidence allowed signal over a fresh high-confidence restricted signal.
- Two-hour delay scenario fails to downgrade an after-dark high-risk planned camp when a better endpoint exists.

Required response:

- Keep issue inside internal beta until fixed or explicitly risk-accepted.
- Add regression coverage for the scenario.
- Review source transparency, AI parser/prompt guardrails, and legacy coexistence copy.
- Verify feature flag off behavior remains unchanged.

## P2 Examples

Classify as P2 when the output is not dangerously wrong, but testers may misunderstand it:

- "Why this recommendation?" is too vague to explain the role assignment.
- Source warnings are buried behind too many taps or low-contrast UI.
- Offline/stale copy is confusing or inconsistent between cards and AI summary.
- Android card layout hides critical warnings on small screens.
- Source confidence labels are visible but ambiguous.
- Missing closure/fire/weather/service data is shown, but not clearly tied to confidence.
- Decision point wording is too hard to act on while driving.
- Action buttons are present but unclear or inconsistently ordered.

Required response:

- Triage with product/design/engineering.
- Fix before closed field test if it hides critical warnings, affects field-mode comprehension, or repeats across multiple core states.
- Otherwise track as pre-limited-region polish.

## P3 Examples

Classify as P3 for low-risk polish:

- Copy is slightly wordy but accurate.
- A non-critical label differs from preferred terminology.
- Expanded details have minor spacing issues.
- Long camp names wrap awkwardly but critical status remains visible.
- Internal review export wording could be clearer.

P3 issues can wait if tracked and do not combine into a source transparency or recommendation trust problem.

## P4 Examples

Classify as P4 for enhancements:

- Add a new source category or provider.
- Add richer field-test analytics after telemetry approval.
- Add more detailed explanation copy for planning mode.
- Add additional fixture states or screenshots beyond the current QA matrix.
- Improve internal review dashboards.

P4 issues should not block closed field test unless they expose an acceptance gap.

## Triage Workflow

1. Capture the issue with the CampOps internal beta feedback schema. Use labels, not precise private coordinates.
2. Record active flags, tester cohort, scenario, provider mode, offline state, and whether AI was enabled.
3. Product/design review UX wording and comprehension issues.
4. Engineering reviews deterministic gates, scoring, recommendations, feature flags, provider resolution, and legacy coexistence.
5. Privacy/security reviews any issue involving telemetry, debriefs, feedback export, community publishing, AI inputs, logs, or stored data.
6. Classify the issue by highest severity.
7. Add a regression test for P0/P1 and any P2 that blocks closed field test.
8. Update `product_acceptance_review.md` or the active blocker registry when an issue blocks a rollout gate.

## Closed Field-Test Blockers

Closed field testing is blocked when any of the following are open:

- Any P0.
- Any unresolved P1 without explicit product, safety, privacy, and engineering risk acceptance.
- Multiple related P2s that make source confidence, stale data, legal/access status, late-arrival risk, or emergency fallback behavior hard to understand.
- Missing Android/device QA evidence for the core recommendation card states.
- Missing provider shadow-validation evidence for the selected region label.
- Any known rollback failure.
- Any indication that community publishing, telemetry, broad AI assist, or provider influence can activate outside approved gates.

## What Can Wait

These can generally wait until after closed field-test readiness if tracked:

- Isolated P3 copy/layout polish that does not hide warnings.
- P4 enhancements.
- Additional provider categories not required for the selected test region.
- Richer analytics, as long as telemetry remains disabled.
- Community publishing improvements, because community publishing remains out of scope.
