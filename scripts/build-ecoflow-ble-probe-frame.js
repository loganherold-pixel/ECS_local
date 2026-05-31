#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_SESSION_PATH = path.join(process.cwd(), '.tmp', 'ecoflow-ble-probe-session.json');

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

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function buildSimpleEncPacket(payload) {
  const header = Buffer.alloc(6);
  header.writeUInt16BE(0x5a5a, 0);
  header.writeUInt8(0x00, 2);
  header.writeUInt8(0x01, 3);
  header.writeUInt16LE(payload.length + 2, 4);

  const frameWithoutCrc = Buffer.concat([header, payload]);
  const crc = Buffer.alloc(2);
  crc.writeUInt16LE(crc16Arc(frameWithoutCrc), 0);
  return Buffer.concat([frameWithoutCrc, crc]);
}

function buildEcoFlowPublicKeyExchangeProbeFromPublicKey(publicKey) {
  if (publicKey.length !== 41 || publicKey[0] !== 0x04) {
    throw new Error(`Unexpected secp160r1 public key shape: ${publicKey.length} bytes.`);
  }
  const payload = Buffer.concat([
    Buffer.from([0x01, 0x00]),
    publicKey.subarray(1),
  ]);
  return buildSimpleEncPacket(payload);
}

function buildEcoFlowKeyInfoRequestProbe() {
  return buildSimpleEncPacket(Buffer.from([0x02]));
}

function createEcoFlowBleProbeSession() {
  const ecdh = crypto.createECDH('secp160r1');
  ecdh.generateKeys();
  const publicKey = ecdh.getPublicKey();
  const publicKeyExchangeFrame = buildEcoFlowPublicKeyExchangeProbeFromPublicKey(publicKey);
  const keyInfoRequestFrame = buildEcoFlowKeyInfoRequestProbe();

  return {
    kind: 'ecoflow_ble_probe_session_v1',
    curve: 'secp160r1',
    privateKeyBase64: ecdh.getPrivateKey().toString('base64'),
    publicKeyBase64: publicKey.toString('base64'),
    frames: [
      {
        kind: 'public_key_exchange',
        base64: publicKeyExchangeFrame.toString('base64'),
        bytes: publicKeyExchangeFrame.length,
        fingerprint: fnv1a(publicKeyExchangeFrame.toString('base64')),
      },
      {
        kind: 'key_info_request',
        base64: keyInfoRequestFrame.toString('base64'),
        bytes: keyInfoRequestFrame.length,
        fingerprint: fnv1a(keyInfoRequestFrame.toString('base64')),
      },
    ],
  };
}

function buildEcoFlowPublicKeyExchangeProbe() {
  return Buffer.from(createEcoFlowBleProbeSession().frames[0].base64, 'base64');
}

function writeProbeSession(session, sessionPath = DEFAULT_SESSION_PATH) {
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(sessionPath, `${JSON.stringify({
    ...session,
    createdAt: new Date().toISOString(),
  }, null, 2)}\n`);
  return sessionPath;
}

function main() {
  const session = createEcoFlowBleProbeSession();
  const sessionPath = writeProbeSession(session);
  const frameEnvValue = session.frames.map((frame) => frame.base64).join(',');
  console.log('[EcoFlow BLE Probe] kind=public_key_exchange,key_info_request');
  for (const frame of session.frames) {
    console.log(`[EcoFlow BLE Probe] ${frame.kind} bytes=${frame.bytes} fingerprint=${frame.fingerprint}`);
  }
  console.log(`[EcoFlow BLE Probe] session=${sessionPath}`);
  console.log('');
  console.log('$env:EXPO_PUBLIC_ECS_ECOFLOW_BLE_CAPTURE="1"');
  console.log('$env:EXPO_PUBLIC_ECS_ECOFLOW_BLE_DYNAMIC_SESSION_PROBE="1"');
  console.log('$env:EXPO_PUBLIC_ECS_ECOFLOW_BLE_NOTIFICATION_CAPTURE_MS="8000"');
  console.log('$env:EXPO_PUBLIC_ECS_ECOFLOW_BLE_NOTIFICATION_CAPTURE_MAX_FRAMES="64"');
  console.log(`$env:EXPO_PUBLIC_ECS_ECOFLOW_BLE_PROBE_BASE64="${frameEnvValue}"`);
  console.log(`$env:EXPO_PUBLIC_ECS_ECOFLOW_BLE_PROBE_PRIVATE_KEY_BASE64="${session.privateKeyBase64}"`);
  console.log('');
  console.log('Restart Expo after setting these env vars, then retry the Delta 3 cloud connection.');
  console.log('This probe starts EcoFlow BLE key exchange diagnostics and an auth-status wake-up; it does not send a control/config command.');
}

if (require.main === module) {
  main();
}

module.exports = {
  buildEcoFlowKeyInfoRequestProbe,
  buildEcoFlowPublicKeyExchangeProbe,
  buildEcoFlowPublicKeyExchangeProbeFromPublicKey,
  buildSimpleEncPacket,
  createEcoFlowBleProbeSession,
  crc16Arc,
  writeProbeSession,
};
