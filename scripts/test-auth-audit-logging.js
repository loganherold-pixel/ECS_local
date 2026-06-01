const assert = require('assert');
const fs = require('fs');
const path = require('path');

const authSource = fs.readFileSync(path.join(process.cwd(), 'lib', 'auth.ts'), 'utf8');
const appContextSource = fs.readFileSync(path.join(process.cwd(), 'context', 'AppContext.tsx'), 'utf8');

assert(
  authSource.includes('function logOptionalAuditFailure'),
  'Optional auth audit failures should use a dedicated downgraded logger.',
);
assert(
  authSource.includes("console.debug(label, sanitizeAuthLogPayload(error));"),
  'Optional auth audit failures should be debug-only and redacted, not warning-level.',
);
assert(
  !authSource.includes("console.warn('[Auth] Audit log failed:'"),
  'Generic optional audit failure should not warn noisily.',
);
assert(
  !authSource.includes("console.warn('[Auth] Login failed audit failed:'"),
  'Failed-login optional audit failure should not warn noisily.',
);
assert(
  appContextSource.includes("return { error: sanitizeAuthError(error.message) };"),
  'Auth failures should still return sanitized user-facing errors.',
);
assert(
  appContextSource.includes('logLoginFailed(email).catch(() => {});'),
  'Failed-login audit logging should remain fire-and-forget.',
);
assert(
  authSource.includes('metadata: sanitizeAuthLogPayload(metadata || {})'),
  'Generic auth audit metadata should be redacted before telemetry emission.',
);
assert(
  authSource.includes('metadata: sanitizeAuthLogPayload({ email })'),
  'Failed-login audit metadata should redact the email before telemetry emission.',
);

console.log('Auth audit logging regression checks passed.');
