const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

const trackedNextArtifacts = git(['ls-files', 'apps/web/.next'])
  .split(/\r?\n/)
  .filter(Boolean);
assert.deepStrictEqual(
  trackedNextArtifacts,
  [],
  'Next.js generated output under apps/web/.next must not be tracked',
);

const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
assert(
  /(^|\r?\n)(apps\/web\/)?\.next\/(\r?\n|$)/.test(gitignore),
  '.gitignore should ignore Next.js .next output so local web dev servers do not dirty the tree',
);

for (const generatedPath of ['apps/web/.next/dev/trace', 'apps/web/.next/cache']) {
  const ignored = git(['check-ignore', generatedPath]);
  assert.strictEqual(
    ignored.replace(/\\/g, '/'),
    generatedPath,
    `${generatedPath} should be ignored by git`,
  );
}

console.log('Generated artifact hygiene checks passed');
