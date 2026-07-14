import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { loadVerificationPolicy } from './verification-policy.mjs';
import {
  promoteVerificationTimingBaselineCandidate,
  serializeVerificationTimingBaseline,
} from './verification-timing-baseline.mjs';
import { validateWorkflowArtifactPathInput } from './workflow-input-safety.mjs';

function parseArgs(argv) {
  const result = { candidate: null, baselineVersion: null, acceptedAt: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--candidate') result.candidate = argv[++index] ?? null;
    else if (argv[index] === '--baseline-version') result.baselineVersion = argv[++index] ?? null;
    else if (argv[index] === '--accepted-at') result.acceptedAt = argv[++index] ?? null;
  }
  return result;
}

export function promoteTimingBaselineFromFile(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const policy = options.policy ?? loadVerificationPolicy({ rootDir });
  if (!options.candidate) throw new Error('Pass --candidate <repository-relative-file>.');
  if (!options.baselineVersion) throw new Error('Pass --baseline-version <reviewed-version>.');
  const candidatePath = validateWorkflowArtifactPathInput(options.candidate, {
    rootDir,
    expectedType: 'file',
  }).realPath;
  const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
  const approved = promoteVerificationTimingBaselineCandidate(candidate, {
    baselineVersion: options.baselineVersion,
    generatedAt: options.acceptedAt ? new Date(options.acceptedAt) : new Date(),
  });
  const outputPath = path.resolve(rootDir, policy.timingPolicy.baselinePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serializeVerificationTimingBaseline(approved), 'utf8');
  return { outputPath, approved };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = promoteTimingBaselineFromFile({
    rootDir: process.cwd(),
    candidate: args.candidate,
    baselineVersion: args.baselineVersion,
    acceptedAt: args.acceptedAt,
  });
  process.stdout.write(`${result.approved.baselineVersion}\n`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch {
    process.stderr.write('Timing baseline promotion failed. Review the candidate path, schema, and version.\n');
    process.exitCode = 1;
  }
}
