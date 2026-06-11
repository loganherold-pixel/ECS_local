import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, '..');
const expoCli = path.join(root, 'node_modules', 'expo', 'bin', 'cli');
const sanitizedArgs = process.argv.slice(2).filter((arg) => arg.trim().length > 0);
const expoArgs = ['lint', ...sanitizedArgs];

const result = spawnSync(process.execPath, [expoCli, ...expoArgs], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

if (result.error) {
  console.error(result.error.message);
}

process.exit(1);
