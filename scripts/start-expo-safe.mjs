import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const expoCli = path.join(projectRoot, 'node_modules', 'expo', 'bin', 'cli');
const expoArgs = ['start', ...process.argv.slice(2)];

const child = spawn(process.execPath, [expoCli, ...expoArgs], {
  cwd: projectRoot,
  env: {
    ...process.env,
    EXPO_NO_DEPENDENCY_VALIDATION: process.env.EXPO_NO_DEPENDENCY_VALIDATION || '1',
  },
  stdio: 'inherit',
  windowsHide: false,
});

child.on('error', (error) => {
  console.error(`Unable to start Expo CLI: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
