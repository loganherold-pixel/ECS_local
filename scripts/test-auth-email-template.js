const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const config = fs.readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8');
const recovery = fs.readFileSync(path.join(root, 'supabase', 'templates', 'recovery.html'), 'utf8');
const docs = fs.readFileSync(path.join(root, 'docs', 'auth-email-delivery.md'), 'utf8');

const RECOVERY_SUBJECT = 'Reset your ECS password';
const LOGO_URL = 'https://expeditioncommand.com/assets/email/expedition-command-system-logo.png';
const APP_SCHEME = 'planning-offline-sync';

function assertIncludes(source, value, message) {
  assert.ok(source.includes(value), message);
}

function assertNotMatches(source, pattern, message) {
  assert.equal(pattern.test(source), false, message);
}

assert.ok(
  config.includes('[auth.email.template.recovery]') &&
    config.includes(`subject = "${RECOVERY_SUBJECT}"`) &&
    config.includes('content_path = "./supabase/templates/recovery.html"'),
  'Supabase config should wire the ECS recovery template with the branded reset-password subject.',
);

assert.ok(
  config.includes('# admin_email = "admin@expeditioncommand.com"') &&
    config.includes('# sender_name = "Expedition Command"'),
  'Supabase config should document the required production sender without committing credentials.',
);

assert.ok(
  config.includes('minimum_password_length = 10') &&
    config.includes('password_requirements = "lower_upper_letters_digits_symbols"') &&
    config.includes('otp_expiry = 3600'),
  'Supabase config should align password reset safety rules with the app password policy and 1-hour recovery expiry.',
);

assert.ok(
  config.includes(`${APP_SCHEME}://create-access-key?mode=reset`) &&
    config.includes(`${APP_SCHEME}:///create-access-key?mode=reset`),
  'Supabase config should allow the ECS native reset redirect variants used by the app.',
);

assert.ok(
  recovery.includes('{{ .ConfirmationURL }}') &&
    recovery.includes('{{ .Email }}') &&
    recovery.includes(RECOVERY_SUBJECT) &&
    recovery.includes(LOGO_URL) &&
    recovery.includes('Expedition Command System') &&
    recovery.includes('ECS') &&
    recovery.includes('This link expires after 1 hour') &&
    recovery.includes('will never ask for your password, one-time codes, or recovery tokens by email'),
  'Recovery template should include branded ECS reset content and required Supabase template variables.',
);

assertNotMatches(
  recovery,
  /powered by supabase|application powered by supabase|supabase auth/i,
  'Recovery template should not include Supabase default footer copy.',
);

assertNotMatches(
  recovery,
  /{{\s*\.(Token|TokenHash)\s*}}/,
  'Recovery template should not expose raw token template variables.',
);

assertNotMatches(
  recovery,
  /RIDB_API_KEY|NPS_API_KEY|CAMPFLARE_API_KEY|ACTIVE_API_SECRET|ECS_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY|SENDGRID_API_KEY|SMTP_PASS/i,
  'Recovery template should not include provider, service-role, or SMTP secret names.',
);

assert.ok(
  docs.includes('admin@expeditioncommand.com') &&
    docs.includes('custom SMTP') &&
    docs.includes(RECOVERY_SUBJECT) &&
    docs.includes(LOGO_URL) &&
    docs.includes(`${APP_SCHEME}://create-access-key`) &&
    docs.includes('minimum 10 characters') &&
    docs.includes('Do not commit SMTP passwords') &&
    docs.includes('cannot verify hosted Supabase SMTP domain validation'),
  'Auth email delivery docs should document production SMTP sender requirements without secrets.',
);

assertIncludes(
  config,
  '# pass = "env(SENDGRID_API_KEY)"',
  'Supabase config should document SMTP secret injection through env substitution only.',
);

assertNotMatches(
  config,
  /^\s*pass\s*=\s*"(?!env\()/m,
  'Supabase config should not commit a plaintext SMTP password.',
);

console.log('auth recovery email template checks passed.');
