#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function compileTypeScript(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypeScript;

function loadTypeScriptModule(relativePath) {
  const fullPath = path.join(process.cwd(), relativePath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScript(mod, fullPath);
  return mod.exports;
}

function printUsage() {
  console.log([
    'Usage:',
    '  node scripts/replay-ecoflow-ble-capture.js <capture.json|directory> [--allow-empty] [--json]',
    '',
    'Capture files use schema ecs.ecoflow_ble.replay_capture and can be copied from',
    '[ECOFLOW_BLE_REPLAY_CAPTURE] dev logs into .smoke/ecoflow-ble-captures/*.json.',
  ].join('\n'));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }
  const target = args.find((arg) => !arg.startsWith('-'));
  if (!target) {
    printUsage();
    process.exit(2);
  }
  return {
    target,
    allowEmpty: args.includes('--allow-empty'),
    json: args.includes('--json'),
  };
}

function readCaptureFiles(target) {
  const resolved = path.resolve(process.cwd(), target);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Capture path does not exist: ${target}`);
  }
  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    return fs.readdirSync(resolved)
      .filter((entry) => entry.toLowerCase().endsWith('.json'))
      .map((entry) => path.join(resolved, entry))
      .sort();
  }
  return [resolved];
}

function assertSafeCapture(capture, filename) {
  if (capture.schema !== 'ecs.ecoflow_ble.replay_capture') {
    throw new Error(`${filename}: unsupported schema ${capture.schema ?? 'missing'}`);
  }
  if (capture.providerId !== 'ecoflow') {
    throw new Error(`${filename}: providerId must be ecoflow`);
  }
  if (capture.safety?.rawManufacturerDataIncluded !== false) {
    throw new Error(`${filename}: capture must not include raw manufacturer data`);
  }
  if (capture.safety?.providerSecretsIncluded !== false) {
    throw new Error(`${filename}: capture must not include provider secrets`);
  }
  if (capture.safety?.preciseLocationIncluded !== false) {
    throw new Error(`${filename}: capture must not include precise location`);
  }
  if (!Array.isArray(capture.characteristics)) {
    throw new Error(`${filename}: characteristics must be an array`);
  }
  if (capture.protocolFrames != null && !Array.isArray(capture.protocolFrames)) {
    throw new Error(`${filename}: protocolFrames must be an array when present`);
  }
  if (capture.decodedProtocolPackets != null && !Array.isArray(capture.decodedProtocolPackets)) {
    throw new Error(`${filename}: decodedProtocolPackets must be an array when present`);
  }
}

function buildCharacteristicMap(capture) {
  return new Map(capture.characteristics.map((entry) => [
    `${String(entry.serviceUuid ?? '').toLowerCase()}:${String(entry.characteristicUuid ?? '').toLowerCase()}`,
    {
      serviceUuid: String(entry.serviceUuid ?? '').toLowerCase(),
      characteristicUuid: String(entry.characteristicUuid ?? '').toLowerCase(),
      valueBase64: typeof entry.valueBase64 === 'string' ? entry.valueBase64 : null,
    },
  ]));
}

function decodedFieldKeys(decoded) {
  return [
    'battery_percent',
    'input_watts',
    'output_watts',
    'solar_input_watts',
    'ac_input_watts',
    'ac_output_watts',
    'dc_output_watts',
    'temperature_celsius',
    'battery_volts',
    'battery_amps',
    'estimated_runtime_minutes',
    'capacity_wh',
    'charge_cycles',
    'health_percent',
    'signal_strength',
  ].filter((key) => typeof decoded[key] === 'number' && Number.isFinite(decoded[key]));
}

function replayFile(filename, decodeEcoFlowBleTelemetry) {
  const capture = JSON.parse(fs.readFileSync(filename, 'utf8'));
  assertSafeCapture(capture, filename);
  const decoded = decodeEcoFlowBleTelemetry({
    device: {
      id: capture.device?.idFingerprint ?? path.basename(filename),
      name: capture.device?.name ?? 'EcoFlow capture',
      model: capture.device?.model ?? null,
      serviceUUIDs: capture.device?.serviceUuids ?? [],
    },
    characteristicMap: buildCharacteristicMap(capture),
    decodedProtocolPackets: Array.isArray(capture.decodedProtocolPackets) ? capture.decodedProtocolPackets : [],
    rssi: typeof capture.device?.rssi === 'number' ? capture.device.rssi : null,
  });
  const decodedKeys = decodedFieldKeys(decoded);
  return {
    file: path.relative(process.cwd(), filename),
    decodedKeys,
    decoded,
    captureSummary: {
      capturedAt: capture.capturedAt ?? null,
      deviceName: capture.device?.name ?? null,
      characteristicCount: capture.characteristics.length,
      protocolFrameCount: Array.isArray(capture.protocolFrames) ? capture.protocolFrames.length : 0,
      decodedProtocolPacketCount: Array.isArray(capture.decodedProtocolPackets) ? capture.decodedProtocolPackets.length : 0,
      payloadBytes: capture.characteristics.reduce((sum, entry) => sum + (Number(entry.valueLength) || 0), 0),
      rawManufacturerDataIncluded: capture.safety?.rawManufacturerDataIncluded,
      providerSecretsIncluded: capture.safety?.providerSecretsIncluded,
      preciseLocationIncluded: capture.safety?.preciseLocationIncluded,
      rawProtocolFramesIncluded: capture.safety?.rawProtocolFramesIncluded,
      decryptedProtocolPayloadsIncluded: capture.safety?.decryptedProtocolPayloadsIncluded,
    },
  };
}

function main() {
  const options = parseArgs(process.argv);
  const { decodeEcoFlowBleTelemetry } = loadTypeScriptModule('src/power/drivers/vendors/EcoFlowDriver.ts');
  const files = readCaptureFiles(options.target);
  if (files.length === 0) {
    throw new Error(`No capture JSON files found in ${options.target}`);
  }

  const results = files.map((file) => replayFile(file, decodeEcoFlowBleTelemetry));
  const decodedCount = results.filter((result) => result.decodedKeys.length > 0).length;
  const output = {
    ok: options.allowEmpty ? true : decodedCount > 0,
    decodedCount,
    fileCount: results.length,
    results,
  };

  if (options.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    for (const result of results) {
      console.log(`${result.file}: ${result.decodedKeys.length > 0 ? result.decodedKeys.join(', ') : 'no decoded fields'}`);
    }
    console.log(`Decoded ${decodedCount}/${results.length} EcoFlow BLE capture(s).`);
  }

  if (!options.allowEmpty && decodedCount === 0) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
