#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = process.cwd();

function loadTsModule(filePath, extraRequire = {}) {
  const source = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (id) => {
    if (Object.prototype.hasOwnProperty.call(extraRequire, id)) return extraRequire[id];
    return require(id);
  };
  const fn = new Function('require', 'module', 'exports', compiled);
  fn(localRequire, module, module.exports);
  return module.exports;
}

const keyData = loadTsModule(path.join(root, 'lib', 'ecoflowBleKeyData.ts'));
const probeModule = loadTsModule(path.join(root, 'lib', 'ecoflowBleSessionProbe.ts'), {
  './ecoflowBleKeyData': keyData,
  'expo-crypto': {
    getRandomBytes: (length) => Uint8Array.from({ length }, (_, index) => index + 1),
  },
});

const fixtureSession = {
  privateKeyBase64: 'MZVFmx8IDKIDQM3ICfa5JaEWcKo=',
  frames: [
    {
      base64: 'WloAASwAAQB8U8CPT/eyIay+GUF2pShqYpDwm7g2CBPo2FzQT43S1VKv4UwOlUTVJRM=',
      fingerprint: 'fnv1a:f8b5ace5',
    },
    {
      base64: 'WloAAQMAAobC',
      fingerprint: 'fnv1a:508ae8e5',
    },
  ],
};

assert.strictEqual(
  probeModule.isEcoFlowBleDynamicSessionProbeEnabled(),
  true,
  'EcoFlow protocol-capable BLE devices should negotiate a session without a hidden build flag',
);
global.__ECS_ECOFLOW_BLE_DYNAMIC_SESSION_PROBE = false;
assert.strictEqual(
  probeModule.isEcoFlowBleDynamicSessionProbeEnabled(),
  false,
  'EcoFlow BLE session negotiation must retain an explicit emergency opt-out',
);
delete global.__ECS_ECOFLOW_BLE_DYNAMIC_SESSION_PROBE;
const privateKeyBytes = Array.from(Buffer.from(fixtureSession.privateKeyBase64, 'base64'));

const publicKeyNotify =
  'WloAAS0AAQAAjO3JPW2Eh2QmeyVfPERhDQNBC714g6gs/EGUjEdOzh4uOy9t9iLdQtLr';
const keyInfoNotify =
  'WloAASMAAs976Tq53kUKkLqHGB280IjIA0qdXUNVs1mvRknK8gYs8dI=';

const probe = probeModule.createEcoFlowBleSessionProbe({ privateKeyBytes });
const firstStep = probe.getPublicKeyExchangeFrame();
assert.strictEqual(firstStep.writeFrameKind, 'public_key_exchange');
assert.strictEqual(firstStep.writeFrameBase64, fixtureSession.frames[0].base64);
assert.strictEqual(firstStep.valueFingerprint, fixtureSession.frames[0].fingerprint);

const keyInfoStep = probe.processNotifyFrame(publicKeyNotify);
assert.strictEqual(keyInfoStep.writeFrameKind, 'key_info_request');
assert.strictEqual(keyInfoStep.writeFrameBase64, fixtureSession.frames[1].base64);
assert.strictEqual(keyInfoStep.valueFingerprint, fixtureSession.frames[1].fingerprint);

const authStatusStep = probe.processNotifyFrame(keyInfoNotify);
assert.strictEqual(authStatusStep.writeFrameKind, 'auth_status_request');
assert.strictEqual(authStatusStep.phase, 'auth_status_sent');
assert.strictEqual(probe.getCurrentPhase(), 'auth_status_sent');
assert.strictEqual(authStatusStep.sessionKeyFingerprint, 'fnv1a:6c80d797');
assert.strictEqual(authStatusStep.valueLength, 40);
assert.strictEqual(authStatusStep.packetVersion, 3);
assert.ok(authStatusStep.writeFrameBase64.length > 0);

const accountAuthPayloadBase64 = Buffer.from('0123456789ABCDEFFEDCBA9876543210', 'ascii').toString('base64');
const accountAuthStep = probe.getAccountAuthFrame(accountAuthPayloadBase64);
assert.strictEqual(accountAuthStep.writeFrameKind, 'account_auth_request');
assert.strictEqual(accountAuthStep.phase, 'account_auth_sent');
assert.strictEqual(probe.getCurrentPhase(), 'account_auth_sent');
assert.strictEqual(accountAuthStep.valueLength, 72);
assert.strictEqual(accountAuthStep.packetVersion, 3);
assert.ok(accountAuthStep.writeFrameBase64.length > 0);

const delta31500Probe = probeModule.createEcoFlowBleSessionProbe({ privateKeyBytes, packetVersion: 2 });
delta31500Probe.getPublicKeyExchangeFrame();
delta31500Probe.processNotifyFrame(publicKeyNotify);
const delta31500AuthStatusStep = delta31500Probe.processNotifyFrame(keyInfoNotify);
assert.strictEqual(delta31500AuthStatusStep.writeFrameKind, 'auth_status_request');
assert.strictEqual(delta31500AuthStatusStep.phase, 'auth_status_sent');
assert.strictEqual(delta31500AuthStatusStep.packetVersion, 2);
assert.strictEqual(delta31500AuthStatusStep.valueLength, 40);
assert.strictEqual(delta31500AuthStatusStep.writeFrameBase64, 'WloQASIAsXMvVgaq/AknFS1HhNRgWsQ5XD/UqQEVmV1GzQwEttlkKg==');
assert.notStrictEqual(delta31500AuthStatusStep.writeFrameBase64, authStatusStep.writeFrameBase64);
const delta31500AccountAuthStep = delta31500Probe.getAccountAuthFrame(accountAuthPayloadBase64);
assert.strictEqual(delta31500AccountAuthStep.writeFrameKind, 'account_auth_request');
assert.strictEqual(delta31500AccountAuthStep.packetVersion, 2);
assert.strictEqual(delta31500AccountAuthStep.valueLength, 72);
assert.strictEqual(
  delta31500AccountAuthStep.writeFrameBase64,
  'WloQAUIAkkQA0FP9Qyu6sTOL+PPk4QQEICiaayQQwwzEciFQgsKm/olPsBJurjNzxFdCe4RdhTkNRrWXCyvPk6A8NwSJ083Y',
);
const accountAuthReplyPacket = probeModule.__ecoflowBleSessionProbeTest.encodePacket({
  src: 0x35,
  dst: 0x21,
  cmdSet: 0x35,
  cmdId: 0x86,
  payload: [0x00],
  version: 2,
});
assert.strictEqual(accountAuthReplyPacket.length, 19);
const accountAuthReplyFrame = probeModule.__ecoflowBleSessionProbeTest.encodeEncryptedPacketFrame(
  accountAuthReplyPacket,
  delta31500Probe.sessionEncryption,
);
const accountAuthReplyStep = delta31500Probe.processNotifyFrame(
  probeModule.__ecoflowBleSessionProbeTest.bytesToBase64(accountAuthReplyFrame),
);
assert.strictEqual(accountAuthReplyStep.phase, 'account_auth_accepted');
assert.strictEqual(accountAuthReplyStep.packetSummaries.length, 1);
assert.strictEqual(accountAuthReplyStep.packetSummaries[0].valid, true);
assert.strictEqual(accountAuthReplyStep.packetSummaries[0].version, 2);
assert.strictEqual(accountAuthReplyStep.packetSummaries[0].payloadLength, 1);
assert.strictEqual(accountAuthReplyStep.packetSummaries[0].payloadFirstByte, 0);
assert.strictEqual(accountAuthReplyStep.packetSummaries[0].authStatusCode, 0);
assert.strictEqual(accountAuthReplyStep.packetSummaries[0].authStatusLabel, 'authorized');
assert.strictEqual(accountAuthReplyStep.packetSummaries[0].authStatusOk, true);

const dataAfterAuthProbe = probeModule.createEcoFlowBleSessionProbe({
  privateKeyBytes,
  packetVersion: 2,
  includeDecryptedPayloadBase64: true,
});
dataAfterAuthProbe.getPublicKeyExchangeFrame();
dataAfterAuthProbe.processNotifyFrame(publicKeyNotify);
dataAfterAuthProbe.processNotifyFrame(keyInfoNotify);
dataAfterAuthProbe.getAccountAuthFrame(accountAuthPayloadBase64);
const firstDataPacket = probeModule.__ecoflowBleSessionProbeTest.encodePacket({
  src: 0x03,
  dst: 0x21,
  cmdSet: 0x20,
  cmdId: 0x02,
  payload: [0x00, 0x01, 0x02],
  version: 2,
});
const firstDataFrame = probeModule.__ecoflowBleSessionProbeTest.encodeEncryptedPacketFrame(
  firstDataPacket,
  dataAfterAuthProbe.sessionEncryption,
);
const firstDataStep = dataAfterAuthProbe.processNotifyFrame(
  probeModule.__ecoflowBleSessionProbeTest.bytesToBase64(firstDataFrame),
);
assert.strictEqual(firstDataStep.phase, 'account_auth_accepted');
assert.strictEqual(firstDataStep.packetSummaries[0].cmdSet, 0x20);
assert.strictEqual(firstDataStep.packetSummaries[0].cmdId, 0x02);
assert.strictEqual(firstDataStep.packetSummaries[0].payloadBase64, Buffer.from([0x00, 0x01, 0x02]).toString('base64'));
assert.strictEqual(firstDataStep.packetSummaries[0].payloadFingerprint.startsWith('fnv1a:'), true);
assert.strictEqual(firstDataStep.packetSummaries[0].packetBase64.length > 0, true);
assert.strictEqual(firstDataStep.packetSummaries[0].packetFingerprint.startsWith('fnv1a:'), true);
const malformedOuterFrameStep = dataAfterAuthProbe.processNotifyFrame(
  probeModule.__ecoflowBleSessionProbeTest.bytesToBase64([0x5a, 0x5a, 0x10, 0x01, 0x20, 0x00, 0x00, 0x00]),
);
assert.strictEqual(malformedOuterFrameStep.phase, 'account_auth_accepted');
assert.strictEqual(malformedOuterFrameStep.packetSummaries.length, 1);
assert.strictEqual(malformedOuterFrameStep.packetSummaries[0].valid, false);
assert(
  malformedOuterFrameStep.packetSummaries[0].parseError.includes('frame length is invalid'),
  'malformed encrypted notifications should be captured without failing the session probe',
);
const wrongKeyReplyPacket = probeModule.__ecoflowBleSessionProbeTest.encodePacket({
  src: 0x35,
  dst: 0x21,
  cmdSet: 0x35,
  cmdId: 0x86,
  payload: [0x06],
  version: 2,
});
const wrongKeyReplyFrame = probeModule.__ecoflowBleSessionProbeTest.encodeEncryptedPacketFrame(
  wrongKeyReplyPacket,
  delta31500Probe.sessionEncryption,
);
const wrongKeyReplyStep = delta31500Probe.processNotifyFrame(
  probeModule.__ecoflowBleSessionProbeTest.bytesToBase64(wrongKeyReplyFrame),
);
assert.strictEqual(wrongKeyReplyStep.packetSummaries[0].valid, true);
assert.strictEqual(wrongKeyReplyStep.packetSummaries[0].payloadFirstByte, 6);
assert.strictEqual(wrongKeyReplyStep.packetSummaries[0].authStatusCode, 6);
assert.strictEqual(wrongKeyReplyStep.packetSummaries[0].authStatusLabel, 'wrong_key');
assert.strictEqual(wrongKeyReplyStep.packetSummaries[0].authStatusOk, false);
const invalidEncryptedFrame = probeModule.__ecoflowBleSessionProbeTest.encodeEncryptedPacketFrame(
  [0x42, 0x01, 0x02, 0x03],
  delta31500Probe.sessionEncryption,
);
const invalidEncryptedStep = delta31500Probe.processNotifyFrame(
  probeModule.__ecoflowBleSessionProbeTest.bytesToBase64(invalidEncryptedFrame),
);
assert.strictEqual(invalidEncryptedStep.phase, 'encrypted_packet_received');
assert.strictEqual(invalidEncryptedStep.packetSummaries.length, 1);
assert.strictEqual(invalidEncryptedStep.packetSummaries[0].valid, false);
assert.strictEqual(invalidEncryptedStep.packetSummaries[0].decryptedPayloadLength, 4);
assert.strictEqual(invalidEncryptedStep.packetSummaries[0].decryptedPayloadPrefix, '42010203');
assert.strictEqual(delta31500Probe.getCurrentPhase(), 'encrypted_packet_received');

let encryptedPayloadStartsWithKeyInfoMarker = null;
for (let value = 0; value < 65536; value += 1) {
  const plaintext = [value & 0xff, (value >>> 8) & 0xff, 0xaa, 0xbb, 0xcc];
  const frame = probeModule.__ecoflowBleSessionProbeTest.encodeEncryptedPacketFrame(
    plaintext,
    delta31500Probe.sessionEncryption,
  );
  const parsed = probeModule.__ecoflowBleSessionProbeTest.parseOuterFrame(
    probeModule.__ecoflowBleSessionProbeTest.bytesToBase64(frame),
  );
  if (parsed.payload[0] === 0x02) {
    encryptedPayloadStartsWithKeyInfoMarker = {
      frame,
      decryptedPrefix: Buffer.from(plaintext.slice(0, 4)).toString('hex'),
    };
    break;
  }
}
assert(encryptedPayloadStartsWithKeyInfoMarker, 'Fixture should find an encrypted frame whose ciphertext begins with 0x02.');
const markerCollisionStep = delta31500Probe.processNotifyFrame(
  probeModule.__ecoflowBleSessionProbeTest.bytesToBase64(encryptedPayloadStartsWithKeyInfoMarker.frame),
);
assert.strictEqual(markerCollisionStep.phase, 'encrypted_packet_received');
assert.strictEqual(markerCollisionStep.packetSummaries[0].valid, false);
assert.strictEqual(markerCollisionStep.packetSummaries[0].decryptedPayloadPrefix, encryptedPayloadStartsWithKeyInfoMarker.decryptedPrefix);

assert.strictEqual(probeModule.inferEcoFlowBlePacketVersionFromHints(['EF-D36F5055']), 2);
assert.strictEqual(probeModule.inferEcoFlowBlePacketVersionFromHints(['D361FAH4ZH9F5055']), 2);
assert.strictEqual(probeModule.inferEcoFlowBlePacketVersionFromHints(['DELTA 3 1500-5055']), 2);
assert.strictEqual(probeModule.inferEcoFlowBlePacketVersionFromHints(['DBABZ5XDA220341']), 2);
assert.strictEqual(probeModule.inferEcoFlowBlePacketVersionFromHints(['DELTA mini-0341']), 2);
assert.strictEqual(probeModule.inferEcoFlowBlePacketVersionFromHints(['P351 DELTA 3 Plus']), 3);

global.__ECS_ECOFLOW_BLE_PROBE_PRIVATE_KEY_BASE64 = fixtureSession.privateKeyBase64;
const envProbe = probeModule.createEcoFlowBleSessionProbe();
assert.strictEqual(envProbe.getPublicKeyExchangeFrame().writeFrameBase64, fixtureSession.frames[0].base64);
delete global.__ECS_ECOFLOW_BLE_PROBE_PRIVATE_KEY_BASE64;

console.log('[test-ecoflow-ble-session-probe] ok');
