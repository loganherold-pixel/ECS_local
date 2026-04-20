# ECS Auth Visual Spec

## Part 1 — Final Auth Visual Spec

### Breakpoints

- `tabletMinWidth`: `768`
- `compactHeightMax`: `759`
- `narrowLandscapeHeightMax`: `539`
- `tallPhoneHeightMin`: `880`

### Auth Column Width Rules

- Minimum usable column: `320`
- Standard phone max column width: `430`
- Narrow landscape column width: `width * 0.52`, clamped to `420–500`
- Tablet column width: `width * 0.54`, clamped to `480–560`
- Footer max width: `360` on phones, `400` on tablets
- Loading/hold max width: `380` phone, `470` narrow landscape, `520` tablet
- Access gate max width: `440` phone, `500` narrow landscape, `560` tablet

### Safe-Area and Vertical Rhythm

- Top content padding: `12` narrow landscape, `14` compact phone, `18` standard phone, `26` tablet
- Bottom content padding: `14` narrow landscape, `16` compact phone, `18` standard phone, `26` tablet
- Brand lockup to form gap: `12` narrow landscape, `14` compact phone, `18` standard phone, `24` tablet
- Form to footer gap: `12` narrow landscape, `16` standard phone, `20` tablet
- Panel horizontal padding: `20`
- Panel top padding: `18`
- Panel bottom padding: `18`
- Field to field gap: `16`
- Label to field gap: `8`
- Field feedback top gap: `7`
- Feedback slot min height: `22`
- Field group to primary button gap: `4`
- Primary button to secondary actions gap: `16`
- Secondary row top divider padding: `14`
- Secondary row gaps: `8` x `8`
- Form message row top gap: `14`
- Recovery title to supporting line gap: `6`
- Footer divider top padding: `14`
- Footer internal stack gap: `8`
- Footer horizontal inset: `8`
- Footer version gap: `2`
- Footer utility row gaps: `8` row, `10` column
- Footer utility minimums: `36h / 36w`
- Access gate context gap: `8`
- Access status card top gap: `18`
- Access message top gap: `12`
- Access status row top gap: `10`
- Access primary action top gap: `16`
- Access utility row top gap: `12`
- Access footnote top gap: `14`

### Crest and Brand Lockup

#### Hero variant

- Crest width: `width * 0.35` on phones, `width * 0.33` on compact phones, `width * 0.20` on tablets
- Hero crest clamp: `144–176` on phones, `144–182` on tablets
- Crest to `ECS` label gap: `6`
- `ECS` label to title gap: `9` compact, `10` standard
- Title to supporting line gap: `10`
- Supporting max width: `336` phone, `420` tablet

#### State/hold variant

- Crest width: `width * 0.30` on phones, `width * 0.28` on compact phones, `width * 0.18` on tablets
- State crest clamp: `118–144` on phones, `118–154` on tablets
- Crest to `ECS` label gap: `5`
- `ECS` label to title gap: `8`
- Title to supporting line gap: `8`
- Supporting max width: `318` phone, `380` tablet

### Form Surface

- Panel radius: `22`
- Input radius: `16`
- Helper/status radius: `14`
- Sub-surface radius: `16`
- Primary button radius: `16`
- Utility pill radius: `14`
- Panel border: `rgba(212,160,23,0.18)`
- Panel background: `rgba(10, 14, 18, 0.88)`
- Panel top rule inset: `18`
- Corner accent top/inset/width: `18 / 16 / 20`

### Inputs and Buttons

- Input min height: `56`
- Input horizontal padding: `16`
- Primary button height: `56`
- Utility hit minimums: `38h / 36w`
- Utility hit padding: `10x / 8y`
- Footer utility padding: `12x / 7y`
- Footer utility radius: `12`
- Access primary button min height: `54`
- Access utility button min size: `44h / 132w`

### Hold and State Blocks

- Hold block min height: `228`
- Hold block horizontal padding: `18`
- Hold block internal gap: `10`
- Hold detail max width: `250`
- Generic auth state supporting max width: `320`
- Access context max width: `340`
- Access footnote max width: `340`
- Access gate card radius: `22`
- Access status card radius: `16`

### Typography Roles

- Brand label: `11 / 800 / letterSpacing 4`
- Hero title: `26/32` compact, `28/34` standard
- State title: `24/30` compact, `26/32` standard
- Hero supporting: `14/20`
- State supporting: `13/18`
- Field label: `12/16 / 700 / letterSpacing 0.2`
- Input text: `15/20`
- Inline validation: `11/15 / 600`
- Status banner: `12/17 / 600`
- Primary button text: `15/20 / 800 / letterSpacing 0.35`
- Secondary action text: `13/18 / 700`
- Recovery title: `18/22 / 800 / letterSpacing 0.2`
- Recovery supporting: `13/18`
- State lead: `17/22 / 800 / letterSpacing 0.2`
- State supporting: `13/19 / 600`
- Hold title: `18/22 / 800 / letterSpacing 0.2`
- Hold detail: `13/18`
- Loading text: `16/20 / 700 / letterSpacing 0.2`
- Loading detail: `12/18`
- Footer helper text: `12/17 / 600`
- Footer link text: `12/18 / 700 / letterSpacing 0.2`
- Footer version: `10/14 / 700 / letterSpacing 1.2`
- Access eyebrow: `10/14 / 800 / letterSpacing 2.2`
- Access title: `18/24 / 800`
- Access line: `12/17 / 600`
- Access detail: `13/19`
- Access emphasis message: `12/17 / 700`
- Access primary button text: `14/18 / 800 / letterSpacing 0.5`
- Access utility button text: `12/16 / 700`
- Access footnote: `11/16`
- Email badge: `12/16 / 700`

### Motion Tokens

- Screen reveal duration: `MOTION.screenFadeIn`
- State transition duration: `MOTION.stateTransition`
- Button press scale down: `PRESS.scaleDown`
- Button release scale: `PRESS.scaleUp`

## Part 2 — Shared Token and Component Ownership

- Core visual spec: [authVisualSpec.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/authVisualSpec.ts)
- Responsive size-class and width logic: [authResponsive.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/authResponsive.ts)
- Shared surface tokens for panel/input/button chrome: [authSurface.ts](/C:/Users/logan/Desktop/ECS_local/lib/auth/authSurface.ts)
- Brand lockup scaling and hierarchy: [AuthBrandLockup.tsx](/C:/Users/logan/Desktop/ECS_local/components/login/AuthBrandLockup.tsx)
- Form surface shell: [AuthFormSurface.tsx](/C:/Users/logan/Desktop/ECS_local/components/login/AuthFormSurface.tsx)
- Footer stack and quiet lower composition: [AuthFooterStack.tsx](/C:/Users/logan/Desktop/ECS_local/components/login/AuthFooterStack.tsx)
- Form/status feedback presentation: [AuthStatusBanner.tsx](/C:/Users/logan/Desktop/ECS_local/components/login/AuthStatusBanner.tsx)
- Password-entry utility behavior: [PasswordVisibilityToggle.tsx](/C:/Users/logan/Desktop/ECS_local/components/login/PasswordVisibilityToggle.tsx)

### Drift prevention rules

- Auth screens should use `resolveAuthLayoutMetrics()` for width, padding, and size-class behavior.
- Auth screen hierarchy should use `AuthBrandLockup`, `AuthFormSurface`, `AuthFooterStack`, and `AuthStatusBanner` rather than ad hoc wrappers.
- New auth screens should read typography, spacing, and component sizing from `AUTH_VISUAL_SPEC` and `AUTH_SURFACE`.
- New password-entry forms should keep the shared input/button/secondary-action cadence already used by login and credential setup.
- Auth hold and access-gate states should stay within the approved state variant and access-state card patterns instead of inventing new layout types.

## Part 3 — Screens Brought Into Compliance

- Login: [login.tsx](/C:/Users/logan/Desktop/ECS_local/app/login.tsx)
- Forgot password: [login.tsx](/C:/Users/logan/Desktop/ECS_local/app/login.tsx)
- Request access/create account entry: [initialize.tsx](/C:/Users/logan/Desktop/ECS_local/app/initialize.tsx)
- Reset password: [create-access-key.tsx](/C:/Users/logan/Desktop/ECS_local/app/create-access-key.tsx)
- Invite/activation setup: [create-access-key.tsx](/C:/Users/logan/Desktop/ECS_local/app/create-access-key.tsx)
- Session/auth hold route: [index.tsx](/C:/Users/logan/Desktop/ECS_local/app/index.tsx)
- Session/access/auth boundary states: [app/_layout.tsx](/C:/Users/logan/Desktop/ECS_local/app/_layout.tsx)
