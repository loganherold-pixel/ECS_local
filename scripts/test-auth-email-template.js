const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const config = fs.readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8');
const recovery = fs.readFileSync(path.join(root, 'supabase', 'templates', 'recovery.html'), 'utf8');
const docs = fs.readFileSync(path.join(root, 'docs', 'auth-email-delivery.md'), 'utf8');

assert.ok(
  config.includes('[auth.email.template.recovery]') &&
    config.includes('subject = "Reset Your Password"') &&
    config.includes('content_path = "./supabase/templates/recovery.html"'),
  'Supabase config should wire the ECS recovery template with the reset-password subject.',
);

assert.ok(
  config.includes('# admin_email = "admin@expeditioncommand.com"') &&
    config.includes('# sender_name = "Expedition Command"'),
  'Supabase config should document the required production sender without committing credentials.',
);

assert.ok(
  recovery.includes('{{ .ConfirmationURL }}') &&
    recovery.includes('{{ .Email }}') &&
    recovery.includes('Reset Your Password') &&
    recovery.includes('https://expeditioncommand.com/assets/email/expedition-command-system-logo.png') &&
    recovery.includes('Expedition Command System') &&
    recovery.includes('ECS'),
  'Recovery template should include branded ECS reset content and required Supabase template variables.',
);

assert.ok(
  !/powered by supabase|application powered by supabase|supabase auth/i.test(recovery),
  'Recovery template should not include Supabase default footer copy.',
);

assert.ok(
  docs.includes('admin@expeditioncommand.com') &&
    docs.includes('custom SMTP') &&
    docs.includes('https://expeditioncommand.com/assets/email/expedition-command-system-logo.png') &&
    docs.includes('Do not commit SMTP passwords'),
  'Auth email delivery docs should document production SMTP sender requirements without secrets.',
);

console.log('auth recovery email template checks passed.');
