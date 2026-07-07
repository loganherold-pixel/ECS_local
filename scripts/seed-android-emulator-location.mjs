#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const DEFAULT_PACKAGE = 'com.expeditioncommand.planningofflinesync';
const DEFAULT_LAT = 38.5733;
const DEFAULT_LNG = -109.5498;
const DEFAULT_ACCURACY_M = 8;

function parseArgs(argv) {
  const args = {
    serial: process.env.ECS_ANDROID_SERIAL ?? null,
    packageName: process.env.ECS_ANDROID_PACKAGE ?? DEFAULT_PACKAGE,
    lat: Number(process.env.ECS_ANDROID_LAT ?? DEFAULT_LAT),
    lng: Number(process.env.ECS_ANDROID_LNG ?? DEFAULT_LNG),
    accuracyM: Number(process.env.ECS_ANDROID_ACCURACY_M ?? DEFAULT_ACCURACY_M),
    skipGrant: process.env.ECS_ANDROID_SKIP_GRANT === '1',
    verbose: process.env.ECS_ANDROID_VERBOSE === '1',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const { name: arg, value: inlineValue } = splitInlineArg(argv[i]);
    const next = argv[i + 1];
    const readValue = (optionName) => {
      if (inlineValue !== undefined) {
        return { value: inlineValue, consumed: 0 };
      }
      if (next === undefined) {
        throw new Error(`Missing value for ${optionName}`);
      }
      return { value: next, consumed: 1 };
    };
    if (arg === '--serial') {
      const parsed = readValue('--serial');
      args.serial = parsed.value;
      i += parsed.consumed;
    } else if (arg === '--package') {
      const parsed = readValue('--package');
      args.packageName = parsed.value;
      i += parsed.consumed;
    } else if (arg === '--lat') {
      const parsed = readValue('--lat');
      args.lat = Number(parsed.value);
      i += parsed.consumed;
    } else if (arg === '--lng') {
      const parsed = readValue('--lng');
      args.lng = Number(parsed.value);
      i += parsed.consumed;
    } else if (arg === '--accuracy-m') {
      const parsed = readValue('--accuracy-m');
      args.accuracyM = Number(parsed.value);
      i += parsed.consumed;
    } else if (arg === '--skip-grant') {
      args.skipGrant = true;
    } else if (arg === '--verbose') {
      args.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.lat) || args.lat < -90 || args.lat > 90) {
    throw new Error(`Invalid --lat value: ${args.lat}`);
  }
  if (!Number.isFinite(args.lng) || args.lng < -180 || args.lng > 180) {
    throw new Error(`Invalid --lng value: ${args.lng}`);
  }
  if (!Number.isFinite(args.accuracyM) || args.accuracyM <= 0) {
    throw new Error(`Invalid --accuracy-m value: ${args.accuracyM}`);
  }

  return args;
}

function splitInlineArg(arg) {
  const equalsIndex = arg.indexOf('=');
  if (equalsIndex === -1) {
    return { name: arg, value: undefined };
  }
  return {
    name: arg.slice(0, equalsIndex),
    value: arg.slice(equalsIndex + 1),
  };
}

function printUsage() {
  console.log(`Usage: node scripts/seed-android-emulator-location.mjs [options]

Seeds an Android emulator GPS fix for ECS Navigate QA.

Options:
  --serial <adb serial>       adb target serial. Defaults to the first connected emulator/device.
  --package <package id>      Android package. Defaults to ${DEFAULT_PACKAGE}.
  --lat <latitude>            Latitude. Defaults to ${DEFAULT_LAT}.
  --lng <longitude>           Longitude. Defaults to ${DEFAULT_LNG}.
  --accuracy-m <meters>       Expected accuracy for reporting context. Defaults to ${DEFAULT_ACCURACY_M}.
  --skip-grant                Do not grant/appops location permissions before seeding.
  --verbose                   Print adb commands.

Environment overrides:
  ECS_ANDROID_SERIAL, ECS_ANDROID_PACKAGE, ECS_ANDROID_LAT, ECS_ANDROID_LNG,
  ECS_ANDROID_ACCURACY_M, ECS_ANDROID_SKIP_GRANT=1, ECS_ANDROID_VERBOSE=1
`);
}

function runAdb(args, options = {}) {
  const { allowFailure = false, verbose = false } = options;
  if (verbose) console.log(`adb ${args.join(' ')}`);
  const result = spawnSync('adb', args, {
    encoding: 'utf8',
    windowsHide: true,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  if (!allowFailure && result.status !== 0) {
    throw new Error(`adb ${args.join(' ')} failed\n${stdout}${stderr}`.trim());
  }
  return {
    status: result.status ?? 0,
    stdout,
    stderr,
    output: `${stdout}${stderr}`,
  };
}

function resolveSerial(explicitSerial, verbose) {
  if (explicitSerial) return explicitSerial;
  const devices = runAdb(['devices'], { verbose }).stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /\tdevice$/.test(line));
  if (devices.length === 0) {
    throw new Error('No adb devices are online. Start an emulator before seeding location.');
  }
  return devices[0].split(/\s+/)[0];
}

function adbForSerial(serial, args) {
  return ['-s', serial, ...args];
}

function grantLocationPermissions(serial, packageName, verbose) {
  const permissions = [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
  ];
  for (const permission of permissions) {
    runAdb(adbForSerial(serial, ['shell', 'pm', 'grant', packageName, permission]), {
      allowFailure: true,
      verbose,
    });
  }

  const appOps = [
    ['ACCESS_FINE_LOCATION', 'allow'],
    ['ACCESS_COARSE_LOCATION', 'allow'],
  ];
  for (const [operation, value] of appOps) {
    runAdb(adbForSerial(serial, ['shell', 'appops', 'set', packageName, operation, value]), {
      allowFailure: true,
      verbose,
    });
  }
}

function coordinateAppearsInOutput(output, lat, lng) {
  const latNeedle = Number(lat).toFixed(3);
  const lngNeedle = Number(lng).toFixed(3);
  return output.includes(latNeedle) && output.includes(lngNeedle);
}

function countProviderLocationEvents(output) {
  return (
    output.match(/\b(?:gps|fused|network|passive)\s+provider\s+(?:received|delivered)\s+location\[/gi) ??
    []
  ).length;
}

function readLocationDebug(serial, verbose) {
  const checks = [
    ['shell', 'cmd', 'location', 'get-location', 'gps'],
    ['shell', 'cmd', 'location', 'get-location', 'network'],
    ['shell', 'dumpsys', 'location'],
  ];
  const outputs = [];
  for (const check of checks) {
    const result = runAdb(adbForSerial(serial, check), { allowFailure: true, verbose });
    outputs.push(result.output);
  }
  return outputs.join('\n');
}

function waitForSeededLocation(serial, lat, lng, verbose, providerEventBaseline, allowCommandOnly) {
  let lastOutput = '';
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    lastOutput = readLocationDebug(serial, verbose);
    if (coordinateAppearsInOutput(lastOutput, lat, lng)) {
      return {
        attempts: attempt,
        mode: 'coordinate',
        coordinateVerified: true,
        providerEventObserved: countProviderLocationEvents(lastOutput) > providerEventBaseline,
        output: lastOutput,
      };
    }
    if (countProviderLocationEvents(lastOutput) > providerEventBaseline) {
      return {
        attempts: attempt,
        mode: 'provider_event',
        coordinateVerified: false,
        providerEventObserved: true,
        output: lastOutput,
      };
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }

  if (allowCommandOnly) {
    return {
      attempts: 10,
      mode: 'emulator_command',
      coordinateVerified: false,
      providerEventObserved: false,
      output: lastOutput,
    };
  }

  const tail = lastOutput.split(/\r?\n/).slice(-30).join('\n');
  throw new Error(`Seeded location was not visible in adb location diagnostics.\n${tail}`);
}

function seedEmulatorLocation(serial, lat, lng, verbose) {
  // adb emu geo fix expects longitude first, then latitude.
  const result = runAdb(adbForSerial(serial, ['emu', 'geo', 'fix', String(lng), String(lat)]), { verbose });
  return {
    accepted: !/\b(?:KO|error|failed)\b/i.test(result.output),
    output: result.output.trim(),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const serial = resolveSerial(args.serial, args.verbose);

  if (!args.skipGrant) {
    grantLocationPermissions(serial, args.packageName, args.verbose);
  }

  const beforeSeedLocationDebug = readLocationDebug(serial, args.verbose);
  const providerEventBaseline = countProviderLocationEvents(beforeSeedLocationDebug);
  const seedResult = seedEmulatorLocation(serial, args.lat, args.lng, args.verbose);
  const verified = waitForSeededLocation(
    serial,
    args.lat,
    args.lng,
    args.verbose,
    providerEventBaseline,
    seedResult.accepted,
  );

  console.log(JSON.stringify({
    ok: true,
    serial,
    packageName: args.packageName,
    latitude: args.lat,
    longitude: args.lng,
    expectedAccuracyMeters: args.accuracyM,
    adbGeoFixAccepted: seedResult.accepted,
    verificationMode: verified.mode,
    coordinateVerified: verified.coordinateVerified,
    providerEventObserved: verified.providerEventObserved,
    diagnosticsWarning:
      verified.mode === 'emulator_command'
        ? 'adb accepted emu geo fix, but this emulator did not expose the seeded coordinate or a new provider event in location diagnostics.'
        : null,
    verificationAttempts: verified.attempts,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
