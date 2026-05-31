#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_SESSION_PATH = path.join(process.cwd(), '.tmp', 'ecoflow-ble-probe-session.json');
const DEFAULT_KEYDATA_PATH = path.join(
  process.env.TEMP || process.env.TMP || '',
  'ecoflow-ble-research',
  'ha-ef-ble',
  'custom_components',
  'ef_ble',
  'eflib',
  'keydata.py',
);

function crc16Arc(buffer) {
  let crc = 0x0000;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? ((crc >>> 1) ^ 0xa001) : (crc >>> 1);
    }
  }
  return crc & 0xffff;
}

function fnv1aBuffer(buffer) {
  let hash = 0x811c9dc5;
  for (const byte of buffer) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function readUInt16LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8);
}

function readUInt64LE(buffer, offset) {
  return buffer.readBigUInt64LE(offset);
}

function writeUInt64LE(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return buffer;
}

function parseSimpleFrame(base64) {
  const frame = Buffer.from(String(base64 || '').trim(), 'base64');
  if (frame.length < 8) throw new Error('Simple frame is too short.');
  if (frame[0] !== 0x5a || frame[1] !== 0x5a) throw new Error('Simple frame prefix is invalid.');
  const payloadLength = readUInt16LE(frame, 4) - 2;
  const payloadEnd = 6 + payloadLength;
  if (payloadLength < 0 || payloadEnd + 2 !== frame.length) {
    throw new Error(`Simple frame length mismatch: len=${frame.length} payloadLength=${payloadLength}`);
  }
  const crc = readUInt16LE(frame, payloadEnd);
  const expectedCrc = crc16Arc(frame.subarray(0, payloadEnd));
  if (crc !== expectedCrc) throw new Error(`Simple frame CRC mismatch: ${crc.toString(16)} != ${expectedCrc.toString(16)}`);
  return {
    frame,
    payload: frame.subarray(6, payloadEnd),
  };
}

function loadSession(sessionPath = DEFAULT_SESSION_PATH) {
  return JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
}

function loadKeyData(keydataPath = process.env.ECOFLOW_BLE_KEYDATA_PY || DEFAULT_KEYDATA_PATH) {
  const source = fs.readFileSync(keydataPath, 'utf8');
  const match = source.match(/_data\s*=\s*base64\.b64decode\(\s*b"\\([\s\S]*?)"\s*\)/);
  if (!match) throw new Error(`Unable to extract key data from ${keydataPath}`);
  const base64 = match[1].replace(/\\\r?\n/g, '').replace(/\s+/g, '');
  return Buffer.from(base64, 'base64');
}

function decryptAes128CbcPkcs7(ciphertext, key, iv) {
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function deriveInitialSession(session, publicKeyPayload) {
  if (publicKeyPayload[0] !== 0x01 || publicKeyPayload.length < 43) {
    throw new Error(`Expected public-key response payload; got ${publicKeyPayload.toString('hex')}`);
  }
  const curveType = publicKeyPayload[2];
  const devicePublicKey = Buffer.concat([Buffer.from([0x04]), publicKeyPayload.subarray(3, 43)]);
  const ecdh = crypto.createECDH(session.curve || 'secp160r1');
  ecdh.setPrivateKey(Buffer.from(session.privateKeyBase64, 'base64'));
  const sharedSecret = ecdh.computeSecret(devicePublicKey);
  return {
    curveType,
    sharedSecret,
    initialKey: sharedSecret.subarray(0, 16),
    iv: crypto.createHash('md5').update(sharedSecret).digest(),
  };
}

function deriveSessionKey(keyData, seed, srand) {
  const position = seed[0] * 0x10 + (((seed[1] - 1) & 0xff) * 0x100);
  if (position + 16 > keyData.length) {
    throw new Error(`Session-key seed points outside key data: position=${position}`);
  }
  const material = Buffer.concat([
    writeUInt64LE(readUInt64LE(keyData, position)),
    writeUInt64LE(readUInt64LE(keyData, position + 8)),
    writeUInt64LE(readUInt64LE(srand, 0)),
    writeUInt64LE(readUInt64LE(srand, 8)),
  ]);
  return {
    position,
    material,
    sessionKey: crypto.createHash('md5').update(material).digest(),
  };
}

function extractFramesFromCapture(capture) {
  const notifyPayloads = (capture.protocolFrames || [])
    .filter((frame) => frame.direction === 'notify')
    .map((frame) => ({
      base64: frame.valueBase64,
      payload: parseSimpleFrame(frame.valueBase64).payload,
    }));
  return {
    publicKeyNotify: notifyPayloads.find((entry) => entry.payload[0] === 0x01 && entry.payload.length >= 43)?.base64,
    keyInfoNotify: notifyPayloads.find((entry) => entry.payload[0] === 0x02)?.base64,
  };
}

function parseArgs(argv) {
  const options = {
    capturePath: null,
    sessionPath: DEFAULT_SESSION_PATH,
    keydataPath: process.env.ECOFLOW_BLE_KEYDATA_PY || DEFAULT_KEYDATA_PATH,
    publicKeyNotify: null,
    keyInfoNotify: null,
    json: false,
    unsafeShowKeys: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--unsafe-show-keys') options.unsafeShowKeys = true;
    else if (arg === '--session') options.sessionPath = argv[++index];
    else if (arg === '--keydata') options.keydataPath = argv[++index];
    else if (arg === '--public-key-notify') options.publicKeyNotify = argv[++index];
    else if (arg === '--key-info-notify') options.keyInfoNotify = argv[++index];
    else if (!options.capturePath) options.capturePath = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function decodeProbeCapture(options) {
  const session = loadSession(options.sessionPath);
  let publicKeyNotify = options.publicKeyNotify;
  let keyInfoNotify = options.keyInfoNotify;
  if (options.capturePath) {
    const capture = JSON.parse(fs.readFileSync(options.capturePath, 'utf8'));
    const extracted = extractFramesFromCapture(capture);
    publicKeyNotify = publicKeyNotify || extracted.publicKeyNotify;
    keyInfoNotify = keyInfoNotify || extracted.keyInfoNotify;
  }
  if (!publicKeyNotify || !keyInfoNotify) {
    throw new Error('Provide a capture JSON file, or --public-key-notify and --key-info-notify base64 frames.');
  }

  const publicKeyPayload = parseSimpleFrame(publicKeyNotify).payload;
  const keyInfoPayload = parseSimpleFrame(keyInfoNotify).payload;
  if (keyInfoPayload[0] !== 0x02) throw new Error(`Expected key-info payload type 0x02; got 0x${keyInfoPayload[0]?.toString(16)}`);

  const initial = deriveInitialSession(session, publicKeyPayload);
  const decryptedKeyInfo = decryptAes128CbcPkcs7(keyInfoPayload.subarray(1), initial.initialKey, initial.iv);
  if (decryptedKeyInfo.length < 18) throw new Error(`Decrypted key-info payload is too short: ${decryptedKeyInfo.length}`);
  const srand = decryptedKeyInfo.subarray(0, 16);
  const seed = decryptedKeyInfo.subarray(16, 18);
  const derived = deriveSessionKey(loadKeyData(options.keydataPath), seed, srand);

  return {
    curve: session.curve || 'secp160r1',
    curveType: initial.curveType,
    publicKeyResponseFingerprint: fnv1aBuffer(publicKeyPayload),
    keyInfoResponseFingerprint: fnv1aBuffer(keyInfoPayload),
    sharedSecretFingerprint: fnv1aBuffer(initial.sharedSecret),
    initialKeyFingerprint: fnv1aBuffer(initial.initialKey),
    ivFingerprint: fnv1aBuffer(initial.iv),
    srandFingerprint: fnv1aBuffer(srand),
    seedHex: seed.toString('hex'),
    keyDataPosition: derived.position,
    sessionKeyFingerprint: fnv1aBuffer(derived.sessionKey),
    ...(options.unsafeShowKeys ? {
      sharedSecretHex: initial.sharedSecret.toString('hex'),
      initialKeyHex: initial.initialKey.toString('hex'),
      ivHex: initial.iv.toString('hex'),
      srandHex: srand.toString('hex'),
      sessionKeyHex: derived.sessionKey.toString('hex'),
    } : {}),
  };
}

function printUsage() {
  console.log('Usage:');
  console.log('  node scripts/decode-ecoflow-ble-probe-capture.js <capture.json> [--json]');
  console.log('  node scripts/decode-ecoflow-ble-probe-capture.js --public-key-notify <base64> --key-info-notify <base64> [--json]');
  console.log('');
  console.log('Options: --session <path> --keydata <path> --unsafe-show-keys');
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (!options.capturePath && (!options.publicKeyNotify || !options.keyInfoNotify)) {
      printUsage();
      process.exitCode = 1;
      return;
    }
    const decoded = decodeProbeCapture(options);
    if (options.json) {
      console.log(JSON.stringify(decoded, null, 2));
      return;
    }
    console.log('[EcoFlow BLE Probe Decode] session key derived');
    console.log(`[EcoFlow BLE Probe Decode] curve=${decoded.curve} curveType=${decoded.curveType}`);
    console.log(`[EcoFlow BLE Probe Decode] seed=${decoded.seedHex} keyDataPosition=${decoded.keyDataPosition}`);
    console.log(`[EcoFlow BLE Probe Decode] sessionKeyFingerprint=${decoded.sessionKeyFingerprint}`);
    console.log('[EcoFlow BLE Probe Decode] raw keys hidden; use --unsafe-show-keys only for local diagnostics.');
  } catch (error) {
    console.error(`[EcoFlow BLE Probe Decode] ${error?.message || error}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  decodeProbeCapture,
  deriveInitialSession,
  deriveSessionKey,
  parseSimpleFrame,
};
