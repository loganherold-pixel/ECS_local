const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const metroConfig = fs.readFileSync(path.join(root, 'metro.config.js'), 'utf8');

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

assertIncludes(
  metroConfig,
  'stripMetroMultipartProgressForAndroidDebug',
  'Metro config should name the Android debug bundle transport guard.',
);
assertIncludes(
  metroConfig,
  "accept.includes('multipart/mixed')",
  'Metro config should detect React Native multipart progress bundle requests.',
);
assertIncludes(
  metroConfig,
  "url.includes('.bundle')",
  'Metro config should scope the transport guard to JS bundle requests.',
);
assertIncludes(
  metroConfig,
  "url.includes('platform=android')",
  'Metro config should scope the multipart suppression to Android bundle requests.',
);
assertIncludes(
  metroConfig,
  "req.headers.accept = 'application/javascript'",
  'Metro config should force a plain JS bundle response for Android debug clients.',
);
assertIncludes(
  metroConfig,
  'config.server.enhanceMiddleware',
  'Metro config should install the transport guard through enhanceMiddleware.',
);

console.log('Android Metro debug bundle transport checks passed.');
