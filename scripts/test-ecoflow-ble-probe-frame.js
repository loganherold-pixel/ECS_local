const assert = require('assert');

const {
  buildEcoFlowKeyInfoRequestProbe,
  buildEcoFlowPublicKeyExchangeProbe,
  buildSimpleEncPacket,
  createEcoFlowBleProbeSession,
  crc16Arc,
} = require('./build-ecoflow-ble-probe-frame');

function readUInt16LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8);
}

const emptyFrame = buildSimpleEncPacket(Buffer.alloc(0));
assert.strictEqual(emptyFrame.toString('hex'), '5a5a000102000457');
assert.strictEqual(crc16Arc(Buffer.from('5a5a00010200', 'hex')), 0x5704);

const probe = buildEcoFlowPublicKeyExchangeProbe();
assert.strictEqual(probe[0], 0x5a);
assert.strictEqual(probe[1], 0x5a);
assert.strictEqual(probe[2], 0x00);
assert.strictEqual(probe[3], 0x01);
assert.strictEqual(readUInt16LE(probe, 4), 44);
assert.strictEqual(probe[6], 0x01);
assert.strictEqual(probe[7], 0x00);
assert.strictEqual(probe.length, 50);
assert.strictEqual(
  readUInt16LE(probe, probe.length - 2),
  crc16Arc(probe.subarray(0, probe.length - 2)),
);

const base64 = probe.toString('base64');
assert(/^[A-Za-z0-9+/]+={0,2}$/.test(base64));
assert(base64.length <= 256);

const keyInfoProbe = buildEcoFlowKeyInfoRequestProbe();
assert.strictEqual(keyInfoProbe[0], 0x5a);
assert.strictEqual(keyInfoProbe[1], 0x5a);
assert.strictEqual(readUInt16LE(keyInfoProbe, 4), 3);
assert.strictEqual(keyInfoProbe[6], 0x02);
assert.strictEqual(keyInfoProbe.length, 9);
assert.strictEqual(
  readUInt16LE(keyInfoProbe, keyInfoProbe.length - 2),
  crc16Arc(keyInfoProbe.subarray(0, keyInfoProbe.length - 2)),
);

const session = createEcoFlowBleProbeSession();
assert.strictEqual(session.kind, 'ecoflow_ble_probe_session_v1');
assert.strictEqual(session.curve, 'secp160r1');
assert.strictEqual(session.frames.length, 2);
assert.strictEqual(session.frames[0].kind, 'public_key_exchange');
assert.strictEqual(session.frames[0].bytes, 50);
assert.strictEqual(session.frames[1].kind, 'key_info_request');
assert.strictEqual(session.frames[1].bytes, 9);
assert(/^[A-Za-z0-9+/]+={0,2}$/.test(session.privateKeyBase64));
assert(/^[A-Za-z0-9+/]+={0,2}$/.test(session.publicKeyBase64));

console.log('EcoFlow BLE public-key probe frame checks passed.');
