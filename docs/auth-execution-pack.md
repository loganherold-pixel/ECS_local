# ECS Auth Execution Pack

This document is the final delivery structure for ECS auth. It packages the auth system into ordered Codex execution batches with explicit dependencies, batch gates, regression checks, and no-go conditions so future work does not reintroduce auth sprawl or out-of-order polish churn.

It should be used alongside:

- [auth-implementation-map.md](/C:/Users/logan/Desktop/ECS_local/docs/auth-implementation-map.md)
- [auth-visual-spec.md](/C:/Users/logan/Desktop/ECS_local/docs/auth-visual-spec.md)

## Operating Rule

Do not move to a later batch casually. Each batch must clear its acceptance gate before later polish work is considered stable.

Hard gate rules:

- If Batch 1 is unstable, stop. Do not continue into visual polish.
- If Batch 2 is inconsistent, stop. Do not continue into microinteraction polish.
- If Batch 5 is incomplete, do not declare auth production-ready.
- If Batch 8 fails RC signoff, ECS auth is not release-ready.

## Ordered Execution Batches

### Batch 1 — Auth Boundary Ownership And Route Control

Purpose:

- Lock auth and session bootstrap ownership.
- Lock access-verification ownership.
- Centralize landing-route decisions.
- Remove duplicate or conflicting route decisions.

Owner areas:

- [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)
- [context/AppContext.tsx](/C:/Users/logan/Desktop/ECS_local/context/AppContext.tsx)
- [lib/auth/distributionEntryResolver.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/distributionEntryResolver.ts)
- [lib/auth/accessResolver.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/accessResolver.ts)

Includes:

- auth bootstrap
- remembered-session handling
- access verification boundary
- post-auth destination resolution
- protected-route guard ownership
- logout return routing

Acceptance gate:

- no login flash on valid remembered session
- no wrong-route flash after sign-in
- no redirect loops
- inactive, pending, and exempt access states resolve correctly before shell reveal

Regression checks:

- valid sign-in works
- remembered session works
- logout works
- access gate works
- no stale protected UI leakage

Downstream dependency:

- Batch 2 depends on Batch 1 being stable

### Batch 2 — Shared Auth Infrastructure And Visual System Lock

Purpose:

- Standardize auth layout wrappers.
- Standardize auth header and lockup.
- Standardize form surface, input, button, and footer patterns.
- Centralize visual tokens and spec.

Owner areas:

- [lib/auth/authVisualSpec.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/authVisualSpec.ts)
- [lib/auth/authResponsive.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/authResponsive.ts)
- [lib/auth/authSurface.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/authSurface.ts)
- [components/login/AuthBrandLockup.tsx](/C:/Users/logan/Desktop/ECS_local/components/login/AuthBrandLockup.tsx)
- [components/login/AuthFormSurface.tsx](/C:/Users/logan/Desktop/ECS_local/components/login/AuthFormSurface.tsx)
- [components/login/AuthFooterStack.tsx](/C:/Users/logan/Desktop/ECS_local/components/login/AuthFooterStack.tsx)
- [components/login/AuthStatusBanner.tsx](/C:/Users/logan/Desktop/ECS_local/components/login/AuthStatusBanner.tsx)

Includes:

- shared auth header
- shared auth form surface
- shared input and button patterns
- shared footer
- shared error and status presentation
- auth visual tokens and spec
- responsive width and spacing rules

Acceptance gate:

- login, forgot password, reset password, request access, invite, and access-gate surfaces share one ECS auth visual language
- no obvious header, form, or footer drift remains
- no stretched tablet fields or cramped compact-height layouts

Regression checks:

- phone portrait remains polished
- tablet remains balanced
- keyboard still works
- no new spacing or clipping bugs

Downstream dependency:

- Batch 3 assumes shared auth components and tokens are stable

### Batch 3 — Login Interaction, Entry Polish, And Field Behavior

Purpose:

- Refine credential entry.
- Refine focus flow.
- Refine keyboard behavior.
- Refine password toggle and autofill behavior.
- Refine login-level motion restraint.

Owner areas:

- [app/login.tsx](/C:/Users/logan/Desktop/ECS_local/app/login.tsx)
- [components/login/PasswordVisibilityToggle.tsx](/C:/Users/logan/Desktop/ECS_local/components/login/PasswordVisibilityToggle.tsx)

Includes:

- email and password field config
- password show or hide toggle
- autofill readiness
- return-key behavior
- keyboard avoidance
- login microinteractions
- login mount and reveal restraint

Acceptance gate:

- entering credentials feels smooth and stable
- password toggle causes no jitter
- autofill behaves cleanly
- keyboard never obscures the primary flow

Regression checks:

- manual entry still works
- autofill still works
- sign-in still submits
- no focus or cursor bugs introduced

Downstream dependency:

- Batch 4 assumes field and keyboard behavior are stable

### Batch 4 — Error, Validation, And Calm Failure-State System

Purpose:

- Standardize field validation.
- Standardize form-level failure states.
- Refine offline and login failure presentation.
- Keep auth stable under failure.

Owner areas:

- [app/login.tsx](/C:/Users/logan/Desktop/ECS_local/app/login.tsx)
- [app/initialize.tsx](/C:/Users/logan/Desktop/ECS_local/app/initialize.tsx)
- [app/create-access-key.tsx](/C:/Users/logan/Desktop/ECS_local/app/create-access-key.tsx)
- [components/login/AuthStatusBanner.tsx](/C:/Users/logan/Desktop/ECS_local/components/login/AuthStatusBanner.tsx)
- [lib/auth/authCopy.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/authCopy.ts)
- [lib/auth.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth.ts)

Includes:

- invalid email and password messaging
- invalid credentials
- offline sign-in handling
- generic failure fallback
- rate-limit handling
- error layout stability
- shared auth error components

Acceptance gate:

- all validation and failure states feel calm and ECS-consistent
- no raw backend or provider text appears
- error appearance does not destabilize layout

Regression checks:

- errors still trigger correctly
- keyboard remains stable with errors
- offline and login failure still recoverable
- no duplicated messages appear

Downstream dependency:

- Batch 5 assumes auth feedback language is already standardized

### Batch 5 — Recovery, Invite, Activation, And Access-State Completeness

Purpose:

- Finish secondary auth flows to the same standard as login.

Owner areas:

- [app/login.tsx](/C:/Users/logan/Desktop/ECS_local/app/login.tsx)
- [app/create-access-key.tsx](/C:/Users/logan/Desktop/ECS_local/app/create-access-key.tsx)
- [context/AppContext.tsx](/C:/Users/logan/Desktop/ECS_local/context/AppContext.tsx)
- [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)

Includes:

- forgot password
- reset password
- reset-link deep-link return
- invite activation
- request access
- pending approval
- access required
- unable-to-verify-access fallback

Acceptance gate:

- every auth-adjacent route is branded, clear, and non-technical
- no dead-end recovery, invite, or access states remain
- deep links no longer expose raw callback behavior

Regression checks:

- forgot password still works
- reset flow still works
- invite or request-access still works if supported
- access gate routes correctly
- no loop or blank callback screens

Downstream dependency:

- Batch 6 assumes all auth-adjacent states are identified and stable

### Batch 6 — Auth-To-Shell Handoff And First Authenticated Experience

Purpose:

- Polish the post-auth transition into ECS.
- Polish the first authenticated frame.
- Suppress premature negative states during startup.

Owner areas:

- [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)
- [app/(tabs)/dashboard.tsx](/C:/Users/logan/Desktop/ECS_local/app/(tabs)/dashboard.tsx)
- route restore helpers and startup hydration selectors

Includes:

- authenticated handoff hold states
- shell readiness timing
- first authenticated route reveal
- startup placeholder strategy
- early warning suppression
- first 3-second experience
- landing-route validation and fallback

Acceptance gate:

- successful sign-in flows cleanly into ECS
- first authenticated frame feels intentional
- no shell chrome pop-in
- no premature “no data”, “no GPS”, or “no route” noise on first frame

Regression checks:

- dashboard or chosen default route still loads
- remembered-route restore still works if enabled
- no new startup delay or flicker introduced

Downstream dependency:

- Batch 7 assumes shell handoff behavior is stable enough to distinguish degraded startup from broken startup

### Batch 7 — Offline And Degraded Entry And Field-Readiness Behavior

Purpose:

- Polish signed-out offline behavior.
- Polish remembered-session offline entry.
- Polish degraded startup and access-verification messaging.

Owner areas:

- [app/login.tsx](/C:/Users/logan/Desktop/ECS_local/app/login.tsx)
- [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)
- [context/AppContext.tsx](/C:/Users/logan/Desktop/ECS_local/context/AppContext.tsx)
- degraded-state copy and diagnostics

Includes:

- offline sign-in messaging
- offline remembered-session path
- degraded access verification
- limited-connectivity messaging
- field-readiness language
- retry behavior under degraded conditions

Acceptance gate:

- offline and degraded conditions feel calm and operational
- returning users are not blocked unnecessarily when safe behavior exists
- unknown verification is not mislabeled as denied access

Regression checks:

- online behavior unchanged
- no degraded-state loops or blank holds
- no noisy overlapping startup warnings

Downstream dependency:

- Batch 8 assumes degraded-state behavior is separated cleanly from normal auth failure handling

### Batch 8 — Telemetry, Diagnostics, Cleanup, And RC Auth Signoff

Purpose:

- Instrument production-safe auth diagnostics.
- Remove stale auth artifacts.
- Run the final auth RC signoff matrix.

Owner areas:

- [lib/auth/authDiagnostics.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/authDiagnostics.ts)
- [app/login.tsx](/C:/Users/logan/Desktop/ECS_local/app/login.tsx)
- [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)
- [context/AppContext.tsx](/C:/Users/logan/Desktop/ECS_local/context/AppContext.tsx)
- cleanup candidates from [auth-implementation-map.md](/C:/Users/logan/Desktop/ECS_local/docs/auth-implementation-map.md)

Includes:

- auth lifecycle telemetry
- duration metrics
- route-fallback diagnostics
- session and access verification diagnostics
- stale route and screen cleanup
- final RC signoff checklist

Acceptance gate:

- auth failure categories are observable internally
- no visible debug noise exists
- duplicate or stale auth paths are removed or deprecated
- final signoff recommendation is explicit

Regression checks:

- telemetry does not affect UX
- no raw errors appear
- no dead auth screens remain reachable
- auth still passes the full RC matrix

## Batch-Level Deliverable Format

Every future auth batch should leave:

### A. What changed

- exact files touched
- key components or utilities updated
- state ownership or routing changes if any

### B. What was standardized

- shared components, tokens, or copy consolidated
- duplicate paths removed
- edge cases covered

### C. Acceptance results

- `Pass`
- `Fixed in batch`
- `Remaining issue`

### D. Regression results

- what was tested
- what remains to verify manually if any

## Manual QA Order After All Batches

Run manual auth QA in this order:

1. Fresh signed-out launch
2. Valid sign-in
3. Invalid credentials
4. Offline signed-out sign-in attempt
5. Remembered-session cold launch
6. Expired or invalid session return to login
7. Logout to return-to-login
8. Forgot password request
9. Reset-link entry and password update
10. Invite or request-access path if supported
11. Authenticated but inactive access
12. Pending approval access state if supported
13. Remembered-route restore or default landing route
14. First authenticated frame and first 3-second startup feel
15. Tablet, compact-height, and narrow landscape auth layout check

## Final No-Go Conditions

Do not mark auth ready if any of these remain:

- login flash on remembered session
- wrong-route flash after sign-in
- redirect loop
- raw backend or provider auth text visible
- broken forgot-password or reset deep-link path
- inactive users reaching protected content
- logout leaving stale protected UI visible
- auth screen clipping or keyboard breakage on common devices
- access-denied messaging shown for merely unverifiable offline states
- obvious auth visual inconsistency across primary auth routes

## Final Signoff Output Format

At the end of the full auth pack, the signoff report should use:

### Part 1 — Batch completion summary

List Batch 1 through Batch 8 with:

- `completed`
- `partially completed`
- `blocked`

### Part 2 — Remaining issues by severity

- `release blocker`
- `high priority`
- `medium priority`

### Part 3 — Final files touched

List the exact auth-related files modified across the full auth pack.

### Part 4 — Final readiness call

One of:

- `Ready for auth release signoff`
- `Ready with noted non-blocking issues`
- `Not ready for release`

## Current ECS Auth Pack Snapshot

Based on the current codebase state:

- Batch 1 — completed in code, live runtime QA still required for final signoff
- Batch 2 — completed in code and tokenized
- Batch 3 — completed in code, live autofill and device keyboard QA still recommended
- Batch 4 — completed in code, live repeated-failure QA still recommended
- Batch 5 — completed in code, live deep-link and pending-access QA still recommended
- Batch 6 — completed in code, live first-frame and remembered-session QA still required for final signoff
- Batch 7 — completed in code, live degraded-connectivity QA still required
- Batch 8 — partially completed; telemetry and cleanup are in place, but final RC signoff remains blocked on trustworthy runtime validation

This means ECS auth is structurally packaged and largely implemented, but final release readiness still depends on device or emulator QA against the RC checklist.
