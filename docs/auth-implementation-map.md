# ECS Auth Implementation Map

This document locks the production auth architecture for ECS so future work does not reintroduce route churn, duplicate ownership, or scattered copy.

## Part 1 - Auth Implementation Map

### Auth-related Routes And Screens

Keep as owners:

- [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)
  Owns root auth bootstrap, route gating, remembered-session handoff, access verification hold, access-required gate, and post-auth shell reveal timing.
- [app/index.tsx](/C:/Users/logan/Desktop/ECS_local/app/index.tsx)
  Fallback branded entry surface only. No route logic should move here.
- [app/login.tsx](/C:/Users/logan/Desktop/ECS_local/app/login.tsx)
  Owns signed-out login UI, forgot-password request mode, footer/legal/support utilities, and login-local validation state.
- [app/initialize.tsx](/C:/Users/logan/Desktop/ECS_local/app/initialize.tsx)
  Owns create-account email capture entry for public signup.
- [app/create-access-key.tsx](/C:/Users/logan/Desktop/ECS_local/app/create-access-key.tsx)
  Owns signup password creation, reset-password completion, invite or activation password setup, and reset or activation success states.
- [components/Header.tsx](/C:/Users/logan/Desktop/ECS_local/components/Header.tsx)
  Owns authenticated shell account-entry trigger and sign-out confirmation entry.
- [components/ProfileSettingsPanel.tsx](/C:/Users/logan/Desktop/ECS_local/components/ProfileSettingsPanel.tsx)
  Owns in-app account summary and account-management surface.

Keep but simplify over time:

- [components/AuthModal.tsx](/C:/Users/logan/Desktop/ECS_local/components/AuthModal.tsx)
  Legacy authenticated or offline account sheet still used from tab screens. Should remain a thin wrapper until callers migrate to the shell profile hub or a shared account panel.

Supporting route and boundary helpers:

- [lib/auth/distributionEntryResolver.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/distributionEntryResolver.ts)
  Pure route-decision helper for initial auth entry resolution.
- [lib/auth/accessResolver.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/accessResolver.ts)
  Pure account access-state resolver from operator and billing metadata.
- [lib/auth/accountUXResolver.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/accountUXResolver.ts)
  Pure presenter for in-app account UX state and actions.
- [lib/auth/authCopy.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/authCopy.ts)
  Single production copy source for auth-boundary UI.
- [lib/auth/authDiagnostics.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/authDiagnostics.ts)
  Structured telemetry and auth-boundary diagnostics.

### State Ownership

Single source of truth:

- Current authenticated session
  Owner: [context/AppContext.tsx](/C:/Users/logan/Desktop/ECS_local/context/AppContext.tsx)
  Source: Supabase session plus local remembered-session bootstrap.
- Session restore and auth bootstrap loading
  Owner: [context/AppContext.tsx](/C:/Users/logan/Desktop/ECS_local/context/AppContext.tsx)
  Consumed by: [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)
- Operator or account metadata
  Owner: [context/AppContext.tsx](/C:/Users/logan/Desktop/ECS_local/context/AppContext.tsx)
  Resolver layer: [lib/auth/accessResolver.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/accessResolver.ts)
- Access verification result
  Owner: derived in [context/AppContext.tsx](/C:/Users/logan/Desktop/ECS_local/context/AppContext.tsx) as `accessState`
  Route decision consumer: [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)
- Login form local state
  Owner: [app/login.tsx](/C:/Users/logan/Desktop/ECS_local/app/login.tsx)
- Forgot-password request state
  Owner: [app/login.tsx](/C:/Users/logan/Desktop/ECS_local/app/login.tsx)
- Reset-link verification and reset-password submit state
  Owner: [app/create-access-key.tsx](/C:/Users/logan/Desktop/ECS_local/app/create-access-key.tsx)
- Invite or activation verification and first-time password setup state
  Owner: [app/create-access-key.tsx](/C:/Users/logan/Desktop/ECS_local/app/create-access-key.tsx)
- Logout in-progress state
  Shell owner: [components/Header.tsx](/C:/Users/logan/Desktop/ECS_local/components/Header.tsx)
  Context owner for actual session teardown: [context/AppContext.tsx](/C:/Users/logan/Desktop/ECS_local/context/AppContext.tsx)
- Account or profile display data
  Owner: [context/AppContext.tsx](/C:/Users/logan/Desktop/ECS_local/context/AppContext.tsx)
  Presentation layer: [lib/auth/accountUXResolver.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/accountUXResolver.ts)

Rules:

- UI screens should not compute auth truth independently.
- Route files should not perform their own access gating beyond local screen mode handling.
- Access and entitlement semantics should remain derived, not duplicated in UI state.

### Route Decision Ownership

Single route-boundary owner:

- [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)
  This is the only place that should decide:
  - unauthenticated -> login or recovery
  - authenticated -> access verification
  - authenticated plus active access -> app shell
  - authenticated plus inactive access -> access gate
  - authenticated plus pending approval -> pending-access gate
  - logout or session expiry -> return to signed-out auth entry
  - remembered session on cold launch -> branded hold -> destination

Pure decision helper:

- [lib/auth/distributionEntryResolver.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/distributionEntryResolver.ts)
  Keep business-free and deterministic. It should map current app conditions to one destination and one hold-state label set.

Deep-link boundary:

- [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)
  Owns whether `create-access-key` is treated as reset completion, activation, or signup entry.

### Shared Component Map

Keep as shared auth infrastructure:

- [components/login/AdaptiveBackground.tsx](/C:/Users/logan/Desktop/ECS_local/components/login/AdaptiveBackground.tsx)
  Shared auth background and visual continuity layer.
- [components/login/AnimatedShield.tsx](/C:/Users/logan/Desktop/ECS_local/components/login/AnimatedShield.tsx)
  Shared crest or lockup treatment.
- [app/login.tsx](/C:/Users/logan/Desktop/ECS_local/app/login.tsx)
  Current owner of shared auth-form shell composition. This is the reference implementation for field, button, helper, and footer patterns.
- [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)
  Current owner of branded auth hold and access gate composition.
- [components/TacticalPopupShell.tsx](/C:/Users/logan/Desktop/ECS_local/components/TacticalPopupShell.tsx)
  Shared dialog and sheet shell for sign-out confirmation and auth-adjacent utility overlays.

Standardized shared patterns already in use:

- branded hold state
- normalized status or error row
- primary action button with stable loading width
- secondary utility action row
- password visibility toggle
- access gate card

### Copy Ownership

Single owner:

- [lib/auth/authCopy.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/authCopy.ts)

Consumers that should only read from shared copy or use derived copy:

- [app/login.tsx](/C:/Users/logan/Desktop/ECS_local/app/login.tsx)
- [app/initialize.tsx](/C:/Users/logan/Desktop/ECS_local/app/initialize.tsx)
- [app/create-access-key.tsx](/C:/Users/logan/Desktop/ECS_local/app/create-access-key.tsx)
- [app/index.tsx](/C:/Users/logan/Desktop/ECS_local/app/index.tsx)
- [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)
- [components/Header.tsx](/C:/Users/logan/Desktop/ECS_local/components/Header.tsx)
- [components/ProfileSettingsPanel.tsx](/C:/Users/logan/Desktop/ECS_local/components/ProfileSettingsPanel.tsx)
- [components/AuthModal.tsx](/C:/Users/logan/Desktop/ECS_local/components/AuthModal.tsx)
- [lib/auth.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth.ts)
- [lib/auth/accountUXResolver.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/accountUXResolver.ts)
- [lib/auth/accessResolver.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/accessResolver.ts)
- [lib/auth/distributionEntryResolver.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/distributionEntryResolver.ts)

### Error Normalization Ownership

Single backend-to-UI normalization owner:

- [lib/auth.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth.ts)
  `sanitizeAuthError(...)` should remain the backend or provider normalization layer.

Diagnostic categorization owner:

- [lib/auth/authDiagnostics.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/authDiagnostics.ts)
  `classifyAuthFailure(...)` should translate normalized UI-safe outcomes into telemetry-safe categories.

UI rule:

- Screens should render normalized ECS-safe strings only.
- No route or component should map raw provider error text directly for display.

### Deep-link And Callback Map

Password reset:

- Request origin: [context/AppContext.tsx](/C:/Users/logan/Desktop/ECS_local/context/AppContext.tsx) via `sendPasswordReset`
- Deep link destination: `/create-access-key?mode=reset`
- Verification and completion owner: [app/create-access-key.tsx](/C:/Users/logan/Desktop/ECS_local/app/create-access-key.tsx)
- Route gating owner: [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)
- Email template owner: [supabase/templates/recovery.html](/C:/Users/logan/Desktop/ECS_local/supabase/templates/recovery.html)
- Local template config: [supabase/config.toml](/C:/Users/logan/Desktop/ECS_local/supabase/config.toml) under `[auth.email.template.recovery]`
- Production sender requirement: Supabase Auth custom SMTP must send from `admin@expeditioncommand.com` with sender name `Expedition Command`. SMTP credentials must be configured in Supabase project settings or secrets, never committed.

Invite or activation:

- Setup-link origin: [context/AppContext.tsx](/C:/Users/logan/Desktop/ECS_local/context/AppContext.tsx) via `sendCredentialSetupLink`
- Deep link destination: `/create-access-key?mode=activate`
- Verification and setup owner: [app/create-access-key.tsx](/C:/Users/logan/Desktop/ECS_local/app/create-access-key.tsx)
- Route gating owner: [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)

Cold-start callback handling:

- [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx) must remain the only place that decides whether the app shows recovery hold, login, or authenticated hold during deep-link startup.

### Telemetry Hook Points

Stable hook owners:

- Login view and login submit or result
  Owner: [app/login.tsx](/C:/Users/logan/Desktop/ECS_local/app/login.tsx)
- Session restore started or resolved
  Owner: [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)
- Access verification started or resolved
  Owner: [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)
- Logout started or completed
  Owners: [components/Header.tsx](/C:/Users/logan/Desktop/ECS_local/components/Header.tsx) for initiation, [context/AppContext.tsx](/C:/Users/logan/Desktop/ECS_local/context/AppContext.tsx) for completion
- Password reset submitted or resolved
  Owner: [app/login.tsx](/C:/Users/logan/Desktop/ECS_local/app/login.tsx)
- First authenticated frame visible
  Owner: [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)
- Route guard fallback
  Owner: [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)

Instrumentation utility:

- [lib/auth/authDiagnostics.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/authDiagnostics.ts)

### Protected-shell Handoff Boundary

Single handoff owner:

- [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)

Handoff sequence:

1. bootstrap auth and startup hydration
2. resolve remembered session or signed-out state
3. resolve access verification result
4. choose one hold or one gate or one shell destination
5. reveal shell only after route decision is stable

Rules:

- Top shell and `CommandDock` should never appear before auth or access decision is stable.
- Negative empty or fallback screen states should not appear until bootstrap and access checks have had a fair chance to resolve.
- Recovery flows should bypass normal shell reveal until reset or activation state is known.

### File-by-file Ownership Status

Keep as owner:

- [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)
- [context/AppContext.tsx](/C:/Users/logan/Desktop/ECS_local/context/AppContext.tsx)
- [app/login.tsx](/C:/Users/logan/Desktop/ECS_local/app/login.tsx)
- [app/create-access-key.tsx](/C:/Users/logan/Desktop/ECS_local/app/create-access-key.tsx)
- [lib/auth/authCopy.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/authCopy.ts)
- [lib/auth/distributionEntryResolver.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/distributionEntryResolver.ts)
- [lib/auth/accessResolver.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/accessResolver.ts)
- [lib/auth/accountUXResolver.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/accountUXResolver.ts)
- [lib/auth/authDiagnostics.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/authDiagnostics.ts)

Simplify:

- [app/index.tsx](/C:/Users/logan/Desktop/ECS_local/app/index.tsx)
  Keep as branded fallback only.
- [app/initialize.tsx](/C:/Users/logan/Desktop/ECS_local/app/initialize.tsx)
  Keep narrow as signup-email entry only.
- [components/Header.tsx](/C:/Users/logan/Desktop/ECS_local/components/Header.tsx)
  Keep only as authenticated account-entry and sign-out trigger, not a second auth-boundary owner.
- [components/ProfileSettingsPanel.tsx](/C:/Users/logan/Desktop/ECS_local/components/ProfileSettingsPanel.tsx)
  Keep focused on in-app account management, not route decisions.
- [components/AuthModal.tsx](/C:/Users/logan/Desktop/ECS_local/components/AuthModal.tsx)
  Reduce over time to a shared account-summary presentation or deprecate after tab callers migrate.

Deprecate or remove when safe:

- duplicate inline auth copy
- duplicate access-label mapping in UI components
- any future route decisions outside `app/_layout.tsx`

## Part 2 - Execution Order

### Phase A - Boundary ownership

1. Lock root auth or session bootstrap ownership in [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx).
2. Lock access-decision ownership to [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx) plus [lib/auth/distributionEntryResolver.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/distributionEntryResolver.ts).
3. Remove or avoid duplicate route decisions in auth screens, shell components, and tab-level surfaces.

### Phase B - Shared auth infrastructure

4. Standardize shared auth wrapper and visual components around `AdaptiveBackground`, `AnimatedShield`, and the shared auth shell structure.
5. Standardize branded hold and loading states in [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx) and [app/index.tsx](/C:/Users/logan/Desktop/ECS_local/app/index.tsx).
6. Standardize normalized error presentation through [lib/auth.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth.ts) and shared status rows in auth screens.
7. Centralize production copy in [lib/auth/authCopy.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/authCopy.ts).

### Phase C - Flow stabilization

8. Stabilize login in [app/login.tsx](/C:/Users/logan/Desktop/ECS_local/app/login.tsx).
9. Stabilize forgot-password and reset in [app/login.tsx](/C:/Users/logan/Desktop/ECS_local/app/login.tsx) and [app/create-access-key.tsx](/C:/Users/logan/Desktop/ECS_local/app/create-access-key.tsx).
10. Stabilize invite, activation, and first-time setup in [app/create-access-key.tsx](/C:/Users/logan/Desktop/ECS_local/app/create-access-key.tsx) and [context/AppContext.tsx](/C:/Users/logan/Desktop/ECS_local/context/AppContext.tsx).
11. Stabilize access-required and pending-access gates in [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx).
12. Stabilize logout, re-entry, and session-expiration behavior across [components/Header.tsx](/C:/Users/logan/Desktop/ECS_local/components/Header.tsx) and [context/AppContext.tsx](/C:/Users/logan/Desktop/ECS_local/context/AppContext.tsx).

### Phase D - Handoff polish

13. Stabilize post-login shell handoff in [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx).
14. Stabilize remembered-session cold launch behavior in [context/AppContext.tsx](/C:/Users/logan/Desktop/ECS_local/context/AppContext.tsx) plus [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx).
15. Stabilize first authenticated frame quality in [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx) and shell surfaces.

### Phase E - Diagnostics and QA

16. Attach telemetry at stable lifecycle boundaries through [lib/auth/authDiagnostics.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/authDiagnostics.ts), [app/login.tsx](/C:/Users/logan/Desktop/ECS_local/app/login.tsx), [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx), and [context/AppContext.tsx](/C:/Users/logan/Desktop/ECS_local/context/AppContext.tsx).
17. Run the auth-state QA matrix across signed-out launch, remembered session, expired session, reset flow, activation flow, access gate, logout, and re-login.
18. Remove leftover dead code or duplicate auth artifacts only after the above states are stable.

## Cleanup Candidates

Keep watching these:

- [components/AuthModal.tsx](/C:/Users/logan/Desktop/ECS_local/components/AuthModal.tsx)
  Legacy tab-level auth surface that overlaps with the shell profile hub.
- inline auth copy not sourced from [lib/auth/authCopy.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/authCopy.ts)
- tab-level sign-out entry points that bypass the shell account path
- direct route redirects outside [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)

## Current Stabilization Result

The current ECS auth shape is already close to the desired final model:

- root boundary owner is [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)
- auth and access state owner is [context/AppContext.tsx](/C:/Users/logan/Desktop/ECS_local/context/AppContext.tsx)
- copy owner is [lib/auth/authCopy.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/authCopy.ts)
- deep-link reset or activation owner is [app/create-access-key.tsx](/C:/Users/logan/Desktop/ECS_local/app/create-access-key.tsx)
- telemetry owner is [lib/auth/authDiagnostics.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/authDiagnostics.ts)

Future ECS auth work should extend those owners instead of adding new parallel logic.
