import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildArtifactProvenance } from './verification/run-verification-lane.mjs';
import {
  findDirectWorkflowInputInterpolations,
  validateWorkflowArtifactPathInput,
} from './verification/workflow-input-safety.mjs';

const root = path.join(import.meta.dirname, '..');

test('workflow contract detects direct workflow_dispatch interpolation in run blocks', () => {
  const unsafe = [
    'on:',
    '  workflow_dispatch:',
    '    inputs:',
    '      artifact_path:',
    '        type: string',
    'jobs:',
    '  unsafe:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - run: node tool.mjs --artifact "${{ inputs.artifact_path }}"',
  ].join('\n');
  assert.equal(findDirectWorkflowInputInterpolations(unsafe).length, 1);
  assert.equal(findDirectWorkflowInputInterpolations(
    unsafe.replace('${{ inputs.artifact_path }}', "${{ format('{0}', inputs['artifact_path']) }}"),
  ).length, 1);

  const safe = unsafe.replace(
    '      - run: node tool.mjs --artifact "${{ inputs.artifact_path }}"',
    '      - env:\n          ARTIFACT_PATH: ${{ inputs.artifact_path }}\n        run: node tool.mjs --artifact "$ARTIFACT_PATH"',
  );
  assert.deepEqual(findDirectWorkflowInputInterpolations(safe), []);
});

test('no repository workflow injects dispatch inputs directly into shell source', () => {
  const workflowDirectory = path.join(root, '.github', 'workflows');
  const findings = fs.readdirSync(workflowDirectory)
    .filter((name) => /\.ya?ml$/i.test(name))
    .flatMap((name) => findDirectWorkflowInputInterpolations(
      fs.readFileSync(path.join(workflowDirectory, name), 'utf8'),
      { file: `.github/workflows/${name}` },
    ));
  assert.deepEqual(findings, []);
});

test('valid paths with spaces, quotes, and shell metacharacters remain a single inert path', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-workflow-input-'));
  try {
    const relativePath = "artifacts/release candidate's;not-a-command.apk";
    const absolutePath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, 'safe artifact bytes', 'utf8');

    const validated = validateWorkflowArtifactPathInput(relativePath, {
      rootDir,
      expectedType: 'file',
    });
    assert.equal(validated.relativePath, relativePath.replaceAll('\\', '/'));
    assert.equal(validated.absolutePath, absolutePath);

    const provenance = buildArtifactProvenance({
      rootDir,
      artifactPath: relativePath,
      expectedArtifactType: 'file',
      commandId: 'input-safety-fixture',
      artifactId: 'safe-fixture',
      now: new Date('2026-07-13T12:00:00.000Z'),
    });
    assert.equal(provenance.artifact.fileCount, 1);
    assert.equal(fs.existsSync(path.join(rootDir, 'not-a-command.apk')), false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('artifact path validation rejects traversal, absolute, scheme, control, missing, and type mismatches', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-workflow-input-'));
  try {
    fs.mkdirSync(path.join(rootDir, 'artifacts', 'directory'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'artifacts', 'app.apk'), 'bytes', 'utf8');
    const invalidPaths = [
      '../outside.apk',
      'artifacts/../../outside.apk',
      path.resolve(rootDir, 'artifacts/app.apk'),
      'file://artifacts/app.apk',
      'https://example.test/app.apk',
      'artifacts/app.apk\u0000ignored',
      'artifacts/app.apk\nignored',
      '',
    ];
    for (const value of invalidPaths) {
      assert.throws(() => validateWorkflowArtifactPathInput(value, {
        rootDir,
        expectedType: 'file',
      }), undefined, JSON.stringify(value));
    }
    assert.throws(() => validateWorkflowArtifactPathInput('artifacts/missing.apk', {
      rootDir,
      expectedType: 'file',
    }), /does not exist/i);
    assert.throws(() => validateWorkflowArtifactPathInput('artifacts/directory', {
      rootDir,
      expectedType: 'file',
    }), /file/i);
    assert.throws(() => validateWorkflowArtifactPathInput('artifacts/app.apk', {
      rootDir,
      expectedType: 'directory',
    }), /directory/i);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
