import { spawn } from "node:child_process";
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
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

function resolveEasEnvironmentName(profile) {
  try {
    const easJsonPath = path.join(projectRoot, "eas.json");
    const easJson = JSON.parse(fs.readFileSync(easJsonPath, "utf8"));
    return easJson?.build?.[profile]?.environment || profile;
  } catch (_error) {
    return profile;
  }
}

function runFieldtestMapboxEnvGuard(profile) {
  if (profile !== "fieldtest") return;

  const environmentName = resolveEasEnvironmentName(profile);
  const command = process.platform === "win32" ? "eas.cmd" : "eas";
  const guardCommand =
    "node ./scripts/check-fieldtest-mapbox-token-split.mjs --require-runtime-env --require-build-env";
  const result =
    process.platform === "win32"
      ? spawnSync(
          `${command} env:exec ${environmentName} "${guardCommand}" --non-interactive`,
          {
            cwd: projectRoot,
            env: process.env,
            shell: true,
            stdio: "inherit",
          },
        )
      : spawnSync(
          command,
          ["env:exec", environmentName, guardCommand, "--non-interactive"],
          {
            cwd: projectRoot,
            env: process.env,
            stdio: "inherit",
          },
        );

  if (result.error) {
    console.error(`Fieldtest Mapbox token split guard failed to run: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(
      `Fieldtest Mapbox token split guard failed for EAS environment "${environmentName}". ` +
        "Fix EXPO_PUBLIC_MAPBOX_TOKEN/MAPBOX_DOWNLOADS_TOKEN before building.",
    );
    process.exit(result.status ?? 1);
  }
}

const buildProfile = resolveProfileArg(process.argv.slice(2));
runFieldtestMapboxEnvGuard(buildProfile);

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
