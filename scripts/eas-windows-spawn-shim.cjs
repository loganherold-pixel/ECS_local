const childProcess = require("node:child_process");
const path = require("node:path");

const originalSpawn = childProcess.spawn;

function completedChild(stdout = "") {
  const { EventEmitter } = require("node:events");
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = process.pid;
  process.nextTick(() => {
    if (stdout) {
      child.stdout.emit("data", Buffer.from(stdout));
    }
    child.emit("close", 0, null);
  });
  return child;
}

childProcess.spawn = function patchedSpawn(command, args, options) {
  const normalizedCommand =
    typeof command === "string" ? path.normalize(command) : "";
  const normalizedExpoUpdatesCli = path.normalize(
    "node_modules/expo-updates/bin/cli",
  );
  const argText = Array.isArray(args) ? args.join(" ") : "";
  const invocationText = `${normalizedCommand} ${argText}`;

  if (
    invocationText.includes("expo-updates") &&
    invocationText.includes("configuration:syncnative")
  ) {
    return completedChild();
  }

  if (
    invocationText.includes("expo-updates") &&
    invocationText.includes("runtimeversion:resolve")
  ) {
    return completedChild(`${JSON.stringify({ runtimeVersion: "1.0.0" })}\n`);
  }

  if (
    normalizedCommand.endsWith(normalizedExpoUpdatesCli) ||
    normalizedCommand.endsWith(`${normalizedExpoUpdatesCli}.js`)
  ) {
    return originalSpawn(process.execPath, [command, ...(args || [])], options);
  }

  return originalSpawn.apply(this, arguments);
};
