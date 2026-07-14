import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { buildArtifactProvenance } from './run-verification-lane.mjs';
import {
  sanitizeVerificationArtifactText,
  serializeVerificationArtifact,
} from './verification-artifact-policy.mjs';

export function parseArtifactProvenanceArgs(argv) {
  const result = {
    artifactPath: null,
    commandId: null,
    legacyCommand: null,
    artifactId: null,
    artifactKind: null,
    expectedType: 'any',
    workspaceId: 'root',
    audience: null,
    output: null,
  };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--artifact') result.artifactPath = argv[++index] ?? null;
    else if (argv[index] === '--command-id') result.commandId = argv[++index] ?? null;
    else if (argv[index] === '--command') result.legacyCommand = argv[++index] ?? null;
    else if (argv[index] === '--artifact-id') result.artifactId = argv[++index] ?? null;
    else if (argv[index] === '--artifact-kind') result.artifactKind = argv[++index] ?? null;
    else if (argv[index] === '--expected-type') result.expectedType = argv[++index] ?? null;
    else if (argv[index] === '--workspace-id') result.workspaceId = argv[++index] ?? null;
    else if (argv[index] === '--artifact-audience') result.audience = argv[++index] ?? null;
    else if (argv[index] === '--output') result.output = argv[++index] ?? null;
    else if (argv[index].startsWith('--artifact=')) result.artifactPath = argv[index].slice('--artifact='.length);
    else if (argv[index].startsWith('--command-id=')) result.commandId = argv[index].slice('--command-id='.length);
    else if (argv[index].startsWith('--command=')) result.legacyCommand = argv[index].slice('--command='.length);
    else if (argv[index].startsWith('--artifact-id=')) result.artifactId = argv[index].slice('--artifact-id='.length);
    else if (argv[index].startsWith('--artifact-kind=')) result.artifactKind = argv[index].slice('--artifact-kind='.length);
    else if (argv[index].startsWith('--expected-type=')) result.expectedType = argv[index].slice('--expected-type='.length);
    else if (argv[index].startsWith('--workspace-id=')) result.workspaceId = argv[index].slice('--workspace-id='.length);
    else if (argv[index].startsWith('--artifact-audience=')) result.audience = argv[index].slice('--artifact-audience='.length);
    else if (argv[index].startsWith('--output=')) result.output = argv[index].slice('--output='.length);
    else if (!argv[index].startsWith('--')) positionals.push(argv[index]);
  }
  // npm on Windows can consume unknown named options while forwarding their values.
  result.artifactPath ??= positionals[0] ?? null;
  result.commandId ??= positionals[1] ?? null;
  result.output ??= positionals[2] ?? null;
  return result;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArtifactProvenanceArgs(argv);
  if (!args.artifactPath) throw new Error('Pass --artifact <repository-relative file or directory>.');
  if (!args.commandId && !args.legacyCommand) throw new Error('Pass --command-id <stable command identity>.');

  const rootDir = process.cwd();
  const manifest = buildArtifactProvenance({
    rootDir,
    artifactPath: args.artifactPath,
    expectedArtifactType: args.expectedType,
    commandId: args.commandId,
    command: args.legacyCommand,
    artifactId: args.artifactId,
    artifactKind: args.artifactKind,
    workspaceId: args.workspaceId,
    audience: args.audience,
  });
  const output = serializeVerificationArtifact(manifest);
  if (args.output) {
    const outputPath = path.resolve(rootDir, args.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output, 'utf8');
  }
  process.stdout.write(output);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${sanitizeVerificationArtifactText(error instanceof Error ? error.message : String(error))}\n`);
    process.exitCode = 1;
  }
}
