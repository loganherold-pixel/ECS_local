import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { materializePgtapWorkflowResult } from './pgtap-workflow-evidence.mjs';
import { loadVerificationPolicy } from './verification-policy.mjs';

const CHECK_ID = 'supabase-pgtap-rls';

function parseArgs(argv) {
  const result = { output: '.smoke/verification/pgtap-coverage-result.json' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--output') result.output = argv[++index] ?? null;
  }
  return result;
}

function safeOutputPath(rootDir, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath)
    || path.win32.isAbsolute(relativePath) || /[\u0000-\u001f\u007f]/.test(relativePath)) {
    throw new Error('The pgTAP materialization output path is invalid.');
  }
  const absolutePath = path.resolve(rootDir, relativePath);
  const relative = path.relative(rootDir, absolutePath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('The pgTAP materialization output path must remain inside the repository root.');
  }
  return absolutePath;
}

export function materializeFromEnvironment(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const policy = options.policy ?? loadVerificationPolicy({ rootDir });
  const check = policy.checks.find((entry) => entry.id === CHECK_ID);
  if (!check) throw new Error('The registered pgTAP verification check is unavailable.');
  return materializePgtapWorkflowResult({
    rootDir,
    check,
    dependencyStatus: options.dependencyStatus ?? process.env.ECS_PGTAP_JOB_RESULT,
    rawResult: options.rawResult ?? process.env.ECS_PGTAP_COVERAGE_RESULT,
    expectedCommitSha: options.expectedCommitSha ?? process.env.GITHUB_SHA,
    now: options.now,
  });
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const rootDir = process.cwd();
  const result = materializeFromEnvironment({ rootDir });
  const outputPath = safeOutputPath(rootDir, args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const serialized = `${JSON.stringify(result)}\n`;
  fs.writeFileSync(outputPath, serialized, 'utf8');
  process.stdout.write(serialized);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch {
    process.stderr.write('pgTAP workflow result materialization failed with safe code pgtap_materialization_exception.\n');
    process.exitCode = 1;
  }
}
