import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const shimPath = path.join(scriptDir, "eas-windows-spawn-shim.cjs");

function resolveProfileArg(argv) {
  const profilePrefix = "--profile=";
  const inline = argv.find((arg) => arg.startsWith(profilePrefix));
  if (inline) return inline.slice(profilePrefix.length) || "fieldtest";
  const profileIndex = argv.indexOf("--profile");
  if (profileIndex >= 0 && argv[profileIndex + 1]) return argv[profileIndex + 1];
  return process.env.ECS_BUILD_PROFILE || process.env.EAS_BUILD_PROFILE || "fieldtest";
}

function readGitValue(command) {
  try {
    return execSync(command, {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch (_error) {
    return "";
  }
}

function resolveDirtyFlag() {
  if (process.env.ECS_BUILD_DIRTY) return process.env.ECS_BUILD_DIRTY;
  return readGitValue("git status --porcelain").length > 0 ? "dirty" : "clean";
}

const buildProfile = resolveProfileArg(process.argv.slice(2));

const args = [
  "build",
  "--platform",
  "android",
  "--profile",
  buildProfile,
  "--clear-cache",
];

const env = {
  ...process.env,
  EAS_PROJECT_ROOT: process.env.EAS_PROJECT_ROOT || projectRoot,
  EAS_SKIP_AUTO_FINGERPRINT: process.env.EAS_SKIP_AUTO_FINGERPRINT || "1",
  ECS_BUILD_PROFILE: buildProfile,
  ECS_BUILD_COMMIT_SHA:
    process.env.ECS_BUILD_COMMIT_SHA ||
    process.env.EAS_BUILD_GIT_COMMIT_HASH ||
    readGitValue("git rev-parse HEAD") ||
    "unknown",
  ECS_BUILD_TIME: process.env.ECS_BUILD_TIME || new Date().toISOString(),
  ECS_BUILD_DIRTY: resolveDirtyFlag(),
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
