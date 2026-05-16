const path = require('path');
const appConfig = require('./app.json');

if (process.platform === 'win32') {
  const spawnAsyncPath = require.resolve('@expo/spawn-async');
  const spawnAsync = require(spawnAsyncPath);

  // Node 24 on this Windows workstation can throw EPERM when Expo captures
  // child-process stdio. Keep Hermes and update metadata resolution unblocked.
  require.cache[spawnAsyncPath].exports = async (command, args, options = {}) => {
    const normalizedCommand = command.replace(/\\/g, '/');
    if (
      normalizedCommand.endsWith('/node_modules/expo-updates/bin/cli.js') &&
      args?.[0] === 'runtimeversion:resolve'
    ) {
      const platform = args[args.indexOf('--platform') + 1];
      const runtimeVersion =
        appConfig.expo?.[platform]?.runtimeVersion ?? appConfig.expo?.runtimeVersion ?? null;
      const stdout = `${JSON.stringify({
        runtimeVersion,
        fingerprintSources: null,
        workflow: 'generic',
      })}\n`;

      return {
        pid: process.pid,
        output: [stdout, ''],
        stdout,
        stderr: '',
        status: 0,
        signal: null,
      };
    }

    const spawnOptions =
      path.basename(command).toLowerCase() === 'hermesc.exe'
        ? {
            ...options,
            ignoreStdio: true,
            stdio: 'ignore',
          }
        : options;

    try {
      return await spawnAsync(command, args, spawnOptions);
    } catch (error) {
      if (error?.code === 'EPERM') {
        console.error(
          `[metro-config] spawn EPERM while running: ${[command, ...(args || [])].join(' ')}`,
        );
      }
      throw error;
    }
  };
}

const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const projectRootPattern = escapeRegExp(__dirname);
const rootDirBlock = (name) => new RegExp(`${projectRootPattern}[/\\\\]${escapeRegExp(name)}[/\\\\].*`);
const rootDirPrefixBlock = (prefix) =>
  new RegExp(`${projectRootPattern}[/\\\\]${escapeRegExp(prefix)}(?:-[^/\\\\]+)?[/\\\\].*`);
const androidDirBlock = (...segments) =>
  new RegExp(
    `${projectRootPattern}[/\\\\]android${segments
      .map((segment) => `[/\\\\]${escapeRegExp(segment)}`)
      .join('')}[/\\\\].*`,
  );

const generatedPathBlockList = [
  rootDirBlock('.android-home'),
  new RegExp(`${projectRootPattern}[/\\\\]\\.expo-(?:cli-home|export-check|home|local|runtime)[/\\\\].*`),
  rootDirPrefixBlock('.gradle-local'),
  rootDirBlock('.gradle-user-home'),
  rootDirBlock('.npm-cache'),
  rootDirBlock('.smoke'),
  androidDirBlock('.gradle'),
  androidDirBlock('.kotlin'),
  androidDirBlock('app', 'build'),
  rootDirBlock('artifacts'),
  rootDirBlock('dist'),
];

if (process.platform === 'win32') {
  config.maxWorkers = 1;
  config.stickyWorkers = false;
}

config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : config.resolver.blockList
      ? [config.resolver.blockList]
      : []),
  ...generatedPathBlockList,
];

// Ensure Metro can resolve ESM/mjs files
config.resolver.sourceExts = [...(config.resolver.sourceExts || []), 'mjs'];
config.resolver.assetExts = Array.from(
  new Set([...(config.resolver.assetExts || []), 'wav', 'riv']),
);

// Add alias for @supabase/node-fetch to prevent dynamic import issues
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@supabase/node-fetch': path.resolve(__dirname, 'shims', 'node-fetch.js'),
};

module.exports = config;
