# ECS Auth Email Delivery

ECS password recovery emails are still triggered by Supabase Auth through `supabase.auth.resetPasswordForEmail(...)`, but ECS owns the recovery email body in:

- `supabase/templates/recovery.html`

The local Supabase config wires the recovery template in:

- `supabase/config.toml`

The app reset request is owned by `context/AppContext.tsx` through `sendPasswordReset(...)`, which sends users back to `/create-access-key?mode=reset`. Hosted Supabase must allow the ECS app redirect scheme before production reset links are considered ready.

## Production Sender

Production password reset emails must be sent through custom SMTP, not the default Supabase sender.

Required sender settings:

- From email: `admin@expeditioncommand.com`
- Sender name: `Expedition Command`
- Subject: `Reset your ECS password`

SMTP credentials must be configured in Supabase project settings or Supabase secrets. Do not commit SMTP passwords, provider API keys, or service credentials.

The commented SMTP block in `supabase/config.toml` intentionally documents the required sender identity without enabling a local external SMTP dependency. Local development can continue using Inbucket.

## Hosted Supabase Checklist

1. Verify the `expeditioncommand.com` sender domain with the selected SMTP provider.
2. Configure Supabase Auth custom SMTP with the verified sender.
3. Set sender email to `admin@expeditioncommand.com`.
4. Set sender name to `Expedition Command`.
5. Set the Reset Password subject to `Reset your ECS password`.
6. Add the ECS app reset redirect allow-list entries for the production scheme and route, including `planning-offline-sync://create-access-key` and the reset-mode variant used by the app.
7. Keep the password policy aligned with the app: minimum 10 characters with lower, upper, digit, and symbol requirements.
8. Keep password recovery tokens at 1 hour unless product/security explicitly approve a different value.
9. Host the email-safe logo at `https://expeditioncommand.com/assets/email/expedition-command-system-logo.png`, or update the template image URL to the approved public asset URL.
10. Copy the recovery template HTML into the hosted Supabase Reset Password email template, or deploy it through the approved Supabase config workflow for the environment.
11. Send a reset test to a non-team account and verify the message does not contain Supabase default footer copy.

## Template Rules

- The reset button must use `{{ .ConfirmationURL }}`.
- The email may show `{{ .Email }}` only as the account receiving the reset.
- The body must not include the default "powered by Supabase" footer.
- The email must never include passwords, tokens, service-role keys, or SMTP secrets.
- The template must not render raw `{{ .Token }}` or `{{ .TokenHash }}` values. Users should only receive the Supabase-generated confirmation URL.
- The email must state that ECS never asks for passwords, one-time codes, or recovery tokens by email.
- If the recovery token expiry changes from 1 hour, update both `supabase/config.toml` and the template copy in the same change.

## Local Validation

Run the local template contract before shipping auth email changes:

- `npm run test:auth-email-template`
- `npm run test:auth-production`

The local checks can verify repo-owned config, template copy, redirect guidance, and secret hygiene. They cannot verify hosted Supabase SMTP domain validation, the production sender reputation, hosted template deployment, or real inbox delivery.
