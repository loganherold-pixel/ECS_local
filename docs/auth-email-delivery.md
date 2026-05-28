# ECS Auth Email Delivery

ECS password recovery emails are still triggered by Supabase Auth through `supabase.auth.resetPasswordForEmail(...)`, but ECS owns the recovery email body in:

- `supabase/templates/recovery.html`

The local Supabase config wires the recovery template in:

- `supabase/config.toml`

## Production Sender

Production password reset emails must be sent through custom SMTP, not the default Supabase sender.

Required sender settings:

- From email: `admin@expeditioncommand.com`
- Sender name: `Expedition Command`
- Subject: `Reset Your Password`

SMTP credentials must be configured in Supabase project settings or Supabase secrets. Do not commit SMTP passwords, provider API keys, or service credentials.

The commented SMTP block in `supabase/config.toml` intentionally documents the required sender identity without enabling a local external SMTP dependency. Local development can continue using Inbucket.

## Hosted Supabase Checklist

1. Verify the `expeditioncommand.com` sender domain with the selected SMTP provider.
2. Configure Supabase Auth custom SMTP with the verified sender.
3. Set sender email to `admin@expeditioncommand.com`.
4. Set sender name to `Expedition Command`.
5. Host the email-safe logo at `https://expeditioncommand.com/assets/email/expedition-command-system-logo.png`, or update the template image URL to the approved public asset URL.
6. Copy the recovery template HTML into the hosted Supabase Reset Password email template, or deploy it through the approved Supabase config workflow for the environment.
7. Send a reset test to a non-team account and verify the message does not contain Supabase default footer copy.

## Template Rules

- The reset button must use `{{ .ConfirmationURL }}`.
- The email may show `{{ .Email }}` only as the account receiving the reset.
- The body must not include the default "powered by Supabase" footer.
- The email must never include passwords, tokens, service-role keys, or SMTP secrets.
