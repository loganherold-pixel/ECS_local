import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const shimPath = path.join(scriptDir, "eas-windows-spawn-shim.cjs");

const args = [
  "build",
  "--platform",
  "android",
  "--profile",
  "campops-preview",
  "--clear-cache",
];

const env = {
  ...process.env,
  EAS_PROJECT_ROOT: process.env.EAS_PROJECT_ROOT || projectRoot,
  EAS_SKIP_AUTO_FINGERPRINT: process.env.EAS_SKIP_AUTO_FINGERPRINT || "1",
};

if (process.platform === "win32") {
  env.EAS_NO_VCS = process.env.EAS_NO_VCS || "1";
  const requireShim = `--require ${shimPath}`;
  env.NODE_OPTIONS = env.NODE_OPTIONS
    ? `${env.NODE_OPTIONS} ${requireShim}`
    : requireShim;
}

if (process.argv.includes("--print-command")) {
  console.log(`eas ${args.join(" ")}`);
  process.exit(0);
}

const command = process.platform === "win32" ? "eas.cmd" : "eas";
const child = spawn(command, args, {
  cwd: projectRoot,
  env,
  shell: process.platform === "win32",
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`EAS build interrupted by ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
