import { ec as EC, curves } from 'elliptic';
import CryptoJS from 'crypto-js';

import { ECOFLOW_BLE_KEY_DATA_BASE64 } from './ecoflowBleKeyData';

const SHA256 = require('hash.js/lib/hash/sha/256');

const SECP160R1 = new curves.PresetCurve({
  type: 'short',
  prime: null,
  p: 'ffffffffffffffffffffffffffffffff7fffffff',
  a: 'ffffffffffffffffffffffffffffffff7ffffffc',
  b: '1c97befc54bd7a8b65acf89f81d4d4adc565fa45',
  n: '0100000000000000000001f4c8f927aed3ca752257',
  h: '1',
  g: [
    '4a96b5688ef573284664698968c38bb913cbfc82',
    '23a628553168947d59dcc912042351377ac5fb32',
  ],
  hash: SHA256,
} as any);

const EC_SECP160R1 = new EC(SECP160R1);
const AES_BLOCK_SIZE_BYTES = 16;

export type EcoFlowBleSessionProbePhase =
  | 'created'
  | 'public_key_sent'
  | 'shared_key_ready'
  | 'session_key_ready'
  | 'auth_status_sent'
  | 'auth_status_received'
  | 'account_auth_sent'
  | 'account_auth_accepted'
  | 'encrypted_packet_received'
  | 'failed';

export interface EcoFlowBlePacketSummary {
  valid: boolean;
  src?: number;
  dst?: number;
  cmdSet?: number;
  cmdId?: number;
  payloadLength?: number;
  payloadFirstByte?: number;
  payloadBase64?: string;
  payloadFingerprint?: string;
  packetBase64?: string;
  packetFingerprint?: string;
  authStatusCode?: number;
  authStatusLabel?: string;
  authStatusOk?: boolean;
  version?: number;
  decryptedPayloadLength?: number;
  decryptedPayloadFingerprint?: string;
  decryptedPayloadPrefix?: string;
  decryptedPayloadBase64?: string;
  parseError?: string;
}

export interface EcoFlowBleSessionProbeStep {
  phase: EcoFlowBleSessionProbePhase;
  writeFrameBase64?: string;
  writeFrameKind?: 'public_key_exchange' | 'key_info_request' | 'auth_status_request' | 'account_auth_request';
  valueLength?: number;
  valueFingerprint?: string | null;
  sessionKeyFingerprint?: string | null;
  packetVersion?: number;
  packetSummaries?: EcoFlowBlePacketSummary[];
  error?: string;
}

export interface EcoFlowBleSessionProbeOptions {
  privateKeyBytes?: number[];
  randomBytes?: (length: number) => number[];
  packetVersion?: number;
  authHeaderDst?: number;
  includeDecryptedPayloadBase64?: boolean;
}

interface ParsedOuterFrame {
  payload: number[];
}

interface Type7EncryptionState {
  key: number[];
  iv: number[];
}

const ECOFLOW_BLE_ACCOUNT_AUTH_STATUS_LABELS: Record<number, string> = {
  0x00: 'authorized',
  0x01: 'need_refresh_token',
  0x02: 'device_internal_error',
  0x03: 'device_already_bound',
  0x04: 'need_bind_install_first',
  0x05: 'app_send_data_error',
  0x06: 'wrong_key',
  0x07: 'maximum_devices_error',
};

function boolFromEnv(globalName: string, envNames: string[]): boolean {
  let raw: unknown = null;
  try {
    raw = (globalThis as Record<string, unknown>)[globalName];
  } catch {}
  try {
    for (const envName of envNames) raw = raw ?? process.env?.[envName];
  } catch {}
  return raw === true || raw === '1' || raw === 'true';
}

export function isEcoFlowBleDynamicSessionProbeEnabled(): boolean {
  return boolFromEnv('__ECS_ECOFLOW_BLE_DYNAMIC_SESSION_PROBE', [
    'EXPO_PUBLIC_ECS_ECOFLOW_BLE_DYNAMIC_SESSION_PROBE',
    'ECS_ECOFLOW_BLE_DYNAMIC_SESSION_PROBE',
  ]);
}

function stringFromEnv(globalName: string, envNames: string[]): string | null {
  let raw: unknown = null;
  try {
    raw = (globalThis as Record<string, unknown>)[globalName];
  } catch {}
  try {
    for (const envName of envNames) raw = raw ?? process.env?.[envName];
  } catch {}
  const value = String(raw ?? '').trim();
  return value.length > 0 ? value : null;
}

function getEcoFlowBleProbePrivateKeyFromEnv(): number[] | null {
  const value = stringFromEnv('__ECS_ECOFLOW_BLE_PROBE_PRIVATE_KEY_BASE64', [
    'EXPO_PUBLIC_ECS_ECOFLOW_BLE_PROBE_PRIVATE_KEY_BASE64',
    'ECS_ECOFLOW_BLE_PROBE_PRIVATE_KEY_BASE64',
  ]);
  if (!value) return null;
  const bytes = base64ToBytes(value);
  return bytes.length === 20 ? bytes : null;
}

export function hasEcoFlowBleProbePrivateKeyConfigured(): boolean {
  return Boolean(getEcoFlowBleProbePrivateKeyFromEnv()?.length);
}

function normalizeEcoFlowBlePacketVersion(value?: number | null): number {
  return value === 0x02 || value === 2 ? 0x02 : 0x03;
}

export function inferEcoFlowBlePacketVersionFromHints(hints: Array<string | null | undefined>): number {
  const combined = hints
    .map((hint) => String(hint ?? '').trim().toUpperCase())
    .filter(Boolean)
    .join(' ');

  if (
    /\bD361/.test(combined) ||
    /\bDBAB/.test(combined) ||
    /\bEF-D36/.test(combined) ||
    /DELTA\s*3\s*1500/.test(combined) ||
    /DELTA\s*MINI/.test(combined) ||
    /\bR33[15]/.test(combined) ||
    /\bR35[14]/.test(combined) ||
    /\bEF-R3[35]/.test(combined) ||
    /DELTA\s*2/.test(combined)
  ) {
    return 0x02;
  }

  return 0x03;
}

function getSecureRandomBytes(length: number): number[] {
  const cryptoLike = (globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array } }).crypto;
  if (cryptoLike?.getRandomValues) {
    const bytes = new Uint8Array(length);
    cryptoLike.getRandomValues(bytes);
    return Array.from(bytes);
  }
  throw new Error('Secure random bytes are unavailable in this runtime.');
}

function normalizeByteArray(value: number[]): number[] {
  return value.map((byte) => byte & 0xff);
}

function bytesToHex(bytes: number[]): string {
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): number[] {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const bytes: number[] = [];
  for (let index = 0; index < clean.length; index += 2) {
    bytes.push(parseInt(clean.slice(index, index + 2), 16));
  }
  return bytes;
}

function bytesToBase64(bytes: number[]): string {
  const binary = String.fromCharCode(...normalizeByteArray(bytes));
  if (typeof btoa === 'function') return btoa(binary);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  throw new Error('Base64 encoding is unavailable in this runtime.');
}

function base64ToBytes(value: string): number[] {
  const normalized = String(value ?? '').trim();
  if (!normalized) return [];
  if (typeof atob === 'function') {
    const binary = atob(normalized);
    return Array.from(binary, (char) => char.charCodeAt(0));
  }
  if (typeof Buffer !== 'undefined') return Array.from(Buffer.from(normalized, 'base64'));
  throw new Error('Base64 decoding is unavailable in this runtime.');
}

function bytesToWordArray(bytes: number[]): CryptoJS.lib.WordArray {
  return CryptoJS.lib.WordArray.create(Uint8Array.from(normalizeByteArray(bytes)) as unknown as number[]);
}

function wordArrayToBytes(wordArray: CryptoJS.lib.WordArray): number[] {
  const bytes: number[] = [];
  for (let index = 0; index < wordArray.sigBytes; index += 1) {
    bytes.push((wordArray.words[index >>> 2] >>> (24 - (index % 4) * 8)) & 0xff);
  }
  return bytes;
}

function md5Bytes(bytes: number[]): number[] {
  return wordArrayToBytes(CryptoJS.MD5(bytesToWordArray(bytes)));
}

function aesCbcEncryptPkcs7(plaintext: number[], key: number[], iv: number[]): number[] {
  const encrypted = CryptoJS.AES.encrypt(bytesToWordArray(plaintext), bytesToWordArray(key), {
    iv: bytesToWordArray(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return wordArrayToBytes(encrypted.ciphertext);
}

function aesCbcDecryptPkcs7(ciphertext: number[], key: number[], iv: number[]): number[] {
  const cipherParams = CryptoJS.lib.CipherParams.create({
    ciphertext: bytesToWordArray(ciphertext),
  });
  const decrypted = CryptoJS.AES.decrypt(
    cipherParams,
    bytesToWordArray(key),
    {
      iv: bytesToWordArray(iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    },
  );
  return wordArrayToBytes(decrypted);
}

function crc8Ccitt(bytes: number[]): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte & 0xff;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x80) ? ((crc << 1) ^ 0x07) : (crc << 1);
      crc &= 0xff;
    }
  }
  return crc & 0xff;
}

function crc16Arc(bytes: number[]): number {
  let crc = 0x0000;
  for (const byte of bytes) {
    crc ^= byte & 0xff;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? ((crc >>> 1) ^ 0xa001) : (crc >>> 1);
    }
  }
  return crc & 0xffff;
}

function pushUInt16LE(target: number[], value: number): void {
  target.push(value & 0xff, (value >>> 8) & 0xff);
}

function readUInt16LE(bytes: number[], offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readUInt64LE(bytes: number[], offset: number): bigint {
  let value = 0n;
  for (let index = 7; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(bytes[offset + index] ?? 0);
  }
  return value;
}

function writeUInt64LE(value: bigint): number[] {
  const bytes: number[] = [];
  let current = value;
  for (let index = 0; index < 8; index += 1) {
    bytes.push(Number(current & 0xffn));
    current >>= 8n;
  }
  return bytes;
}

function fingerprintBytes(bytes: number[]): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte & 0xff;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function fingerprintText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function encodeOuterFrame(payload: number[], frameType = 0): number[] {
  const frame = [0x5a, 0x5a, (frameType << 4) & 0xff, 0x01];
  pushUInt16LE(frame, payload.length + 2);
  frame.push(...payload);
  pushUInt16LE(frame, crc16Arc(frame));
  return frame;
}

function parseOuterFrame(base64: string): ParsedOuterFrame {
  const frame = base64ToBytes(base64);
  if (frame.length < 8 || frame[0] !== 0x5a || frame[1] !== 0x5a) {
    throw new Error('EcoFlow BLE frame prefix is invalid.');
  }
  const payloadLength = readUInt16LE(frame, 4) - 2;
  const payloadEnd = 6 + payloadLength;
  if (payloadLength < 0 || payloadEnd + 2 !== frame.length) {
    throw new Error('EcoFlow BLE frame length is invalid.');
  }
  const actualCrc = readUInt16LE(frame, payloadEnd);
  const expectedCrc = crc16Arc(frame.slice(0, payloadEnd));
  if (actualCrc !== expectedCrc) throw new Error('EcoFlow BLE frame CRC is invalid.');
  return { payload: frame.slice(6, payloadEnd) };
}

function encodePacket(input: {
  src: number;
  dst: number;
  cmdSet: number;
  cmdId: number;
  payload?: number[];
  dsrc?: number;
  ddst?: number;
  version?: number;
}): number[] {
  const version = input.version ?? 0x03;
  const payload = input.payload ?? [];
  const packet = [0xaa, version & 0xff];
  pushUInt16LE(packet, payload.length);
  packet.push(crc8Ccitt(packet));
  packet.push(0x0d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
  packet.push(input.src & 0xff, input.dst & 0xff);
  if (version >= 0x03) packet.push(input.dsrc ?? 0x01, input.ddst ?? 0x01);
  packet.push(input.cmdSet & 0xff, input.cmdId & 0xff, ...payload);
  pushUInt16LE(packet, crc16Arc(packet));
  return packet;
}

function parsePacket(bytes: number[], includeDecryptedPayloadBase64 = false): EcoFlowBlePacketSummary {
  if (bytes.length < 2) throw new Error('EcoFlow packet is too short.');
  if (bytes[0] !== 0xaa) throw new Error('EcoFlow packet prefix is invalid.');
  const version = bytes[1] & 0x0f;
  const payloadStart = version >= 3 ? 18 : 16;
  const minimumLength = payloadStart + 2;
  if (bytes.length < minimumLength) {
    throw new Error(`EcoFlow packet v${version} is too short.`);
  }
  const payloadLength = readUInt16LE(bytes, 2);
  const availablePayloadLength = bytes.length - payloadStart - 2;
  if (payloadLength > availablePayloadLength) {
    throw new Error('EcoFlow packet payload length exceeds decrypted packet length.');
  }
  const payload = bytes.slice(payloadStart, payloadStart + payloadLength);
  const cmdSet = bytes[payloadStart - 2];
  const cmdId = bytes[payloadStart - 1];
  const accountAuthStatusCode =
    cmdSet === 0x35 && cmdId === 0x86 && payload.length === 1 ? payload[0] : undefined;
  const accountAuthStatusLabel =
    accountAuthStatusCode == null
      ? undefined
      : ECOFLOW_BLE_ACCOUNT_AUTH_STATUS_LABELS[accountAuthStatusCode] ?? 'unknown_error';
  const summary: EcoFlowBlePacketSummary = {
    valid: true,
    src: bytes[12],
    dst: bytes[13],
    cmdSet,
    cmdId,
    payloadLength,
    payloadFirstByte: payload.length > 0 ? payload[0] : undefined,
    authStatusCode: accountAuthStatusCode,
    authStatusLabel: accountAuthStatusLabel,
    authStatusOk: accountAuthStatusCode == null ? undefined : accountAuthStatusCode === 0,
    version: bytes[1],
  };
  if (includeDecryptedPayloadBase64) {
    summary.payloadBase64 = bytesToBase64(payload);
    summary.payloadFingerprint = fingerprintBytes(payload);
    summary.packetBase64 = bytesToBase64(bytes);
    summary.packetFingerprint = fingerprintBytes(bytes);
  }
  return summary;
}

function encodeEncryptedPacketFrame(packet: number[], encryption: Type7EncryptionState): number[] {
  return encodeOuterFrame(aesCbcEncryptPkcs7(packet, encryption.key, encryption.iv), 0x01);
}

function decodeEncryptedPacketFrame(
  base64: string,
  encryption: Type7EncryptionState,
  includeDecryptedPayloadBase64 = false,
): EcoFlowBlePacketSummary[] {
  let decrypted: number[] | null = null;
  try {
    const { payload } = parseOuterFrame(base64);
    decrypted = aesCbcDecryptPkcs7(payload, encryption.key, encryption.iv);
    if (decrypted.length <= 0) return [];
    return [parsePacket(decrypted, includeDecryptedPayloadBase64)];
  } catch (error) {
    return [{
      valid: false,
      decryptedPayloadLength: decrypted?.length,
      decryptedPayloadFingerprint: decrypted ? fingerprintBytes(decrypted) : undefined,
      decryptedPayloadPrefix: decrypted ? bytesToHex(decrypted.slice(0, 4)) : undefined,
      decryptedPayloadBase64: includeDecryptedPayloadBase64 && decrypted ? bytesToBase64(decrypted) : undefined,
      parseError: String((error as any)?.message ?? error ?? 'EcoFlow encrypted payload did not parse as a packet.'),
    }];
  }
}

function deriveSessionKey(seed: number[], srand: number[]): { position: number; sessionKey: number[] } {
  const keyData = base64ToBytes(ECOFLOW_BLE_KEY_DATA_BASE64);
  const position = (seed[0] ?? 0) * 0x10 + ((((seed[1] ?? 0) - 1) & 0xff) * 0x100);
  if (position + 16 > keyData.length) throw new Error('EcoFlow BLE session-key seed is outside key data.');
  const material = [
    ...writeUInt64LE(readUInt64LE(keyData, position)),
    ...writeUInt64LE(readUInt64LE(keyData, position + 8)),
    ...writeUInt64LE(readUInt64LE(srand, 0)),
    ...writeUInt64LE(readUInt64LE(srand, 8)),
  ];
  return {
    position,
    sessionKey: md5Bytes(material),
  };
}

function createPrivateKeyBytes(options?: EcoFlowBleSessionProbeOptions): number[] {
  const provided = options?.privateKeyBytes;
  if (provided?.length) return normalizeByteArray(provided).slice(0, 20);
  const envPrivateKey = getEcoFlowBleProbePrivateKeyFromEnv();
  if (envPrivateKey?.length) return envPrivateKey;
  const random = options?.randomBytes ?? getSecureRandomBytes;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const bytes = normalizeByteArray(random(20));
    if (bytes.some((byte) => byte !== 0)) return bytes;
  }
  throw new Error('Unable to generate EcoFlow BLE ECDH private key.');
}

export class EcoFlowBleType7SessionProbe {
  private phase: EcoFlowBleSessionProbePhase = 'created';
  private readonly privateKeyBytes: number[];
  private readonly publicKeyBytes: number[];
  private readonly packetVersion: number;
  private readonly authHeaderDst: number;
  private readonly includeDecryptedPayloadBase64: boolean;
  private initialEncryption: Type7EncryptionState | null = null;
  private sessionEncryption: Type7EncryptionState | null = null;

  constructor(options?: EcoFlowBleSessionProbeOptions) {
    this.privateKeyBytes = createPrivateKeyBytes(options);
    this.packetVersion = normalizeEcoFlowBlePacketVersion(options?.packetVersion);
    this.authHeaderDst = options?.authHeaderDst === 0x32 ? 0x32 : 0x35;
    this.includeDecryptedPayloadBase64 = options?.includeDecryptedPayloadBase64 === true;
    const key = EC_SECP160R1.keyFromPrivate(bytesToHex(this.privateKeyBytes), 'hex');
    this.publicKeyBytes = key.getPublic(false, 'array').slice(1);
  }

  getPublicKeyExchangeFrame(): EcoFlowBleSessionProbeStep {
    this.phase = 'public_key_sent';
    const frame = encodeOuterFrame([0x01, 0x00, ...this.publicKeyBytes]);
    return this.buildWriteStep('public_key_exchange', frame, this.phase);
  }

  getCurrentPhase(): EcoFlowBleSessionProbePhase {
    return this.phase;
  }

  getAccountAuthFrame(authPayloadBase64: string): EcoFlowBleSessionProbeStep {
    if (!this.sessionEncryption) throw new Error('EcoFlow BLE session key is not ready.');
    const payload = base64ToBytes(authPayloadBase64);
    const payloadText = String.fromCharCode(...payload);
    if (payload.length !== 32 || !/^[0-9A-F]{32}$/.test(payloadText)) {
      throw new Error('EcoFlow BLE account auth payload is invalid.');
    }
    const accountAuthPacket = encodePacket({
      src: 0x21,
      dst: this.authHeaderDst,
      cmdSet: 0x35,
      cmdId: 0x86,
      payload,
      version: this.packetVersion,
    });
    const frame = encodeEncryptedPacketFrame(accountAuthPacket, this.sessionEncryption);
    this.phase = 'account_auth_sent';
    return this.buildWriteStep('account_auth_request', frame, this.phase);
  }

  processNotifyFrame(valueBase64: string): EcoFlowBleSessionProbeStep | null {
    try {
      let payload: number[];
      try {
        ({ payload } = parseOuterFrame(valueBase64));
      } catch (error) {
        if (this.sessionEncryption) {
          const packetSummaries = decodeEncryptedPacketFrame(
            valueBase64,
            this.sessionEncryption,
            this.includeDecryptedPayloadBase64,
          );
          return { phase: this.phase, packetSummaries };
        }
        throw error;
      }
      if (payload[0] === 0x01 && payload.length >= 43) {
        return this.handlePublicKeyResponse(payload);
      }
      if (!this.sessionEncryption && payload[0] === 0x02) {
        return this.handleKeyInfoResponse(payload);
      }
      if (this.sessionEncryption) {
        const previousPhase = this.phase;
        const packetSummaries = decodeEncryptedPacketFrame(
          valueBase64,
          this.sessionEncryption,
          this.includeDecryptedPayloadBase64,
        );
        const hasValidPacket = packetSummaries.some((summary) => summary.valid === true);
        const accountAuthReply = packetSummaries.find((summary) => (
          summary.valid === true &&
          summary.cmdSet === 0x35 &&
          summary.cmdId === 0x86 &&
          summary.authStatusCode != null
        ));
        if (
          accountAuthReply?.authStatusOk === true ||
          (previousPhase === 'account_auth_sent' && hasValidPacket && !accountAuthReply)
        ) {
          this.phase = 'account_auth_accepted';
        } else if (previousPhase === 'auth_status_sent') {
          this.phase = 'auth_status_received';
        } else if (hasValidPacket || previousPhase !== 'account_auth_sent') {
          this.phase = 'encrypted_packet_received';
        }
        return { phase: this.phase, packetSummaries };
      }
      return null;
    } catch (error) {
      this.phase = 'failed';
      return {
        phase: this.phase,
        error: String((error as any)?.message ?? error ?? 'EcoFlow BLE session probe failed.'),
      };
    }
  }

  private handlePublicKeyResponse(payload: number[]): EcoFlowBleSessionProbeStep {
    const devicePublicKeyBytes = [0x04, ...payload.slice(3, 43)];
    const ownKey = EC_SECP160R1.keyFromPrivate(bytesToHex(this.privateKeyBytes), 'hex');
    const deviceKey = EC_SECP160R1.keyFromPublic(bytesToHex(devicePublicKeyBytes), 'hex');
    const sharedSecret = ownKey.derive(deviceKey.getPublic()).toArray('be', 20);
    this.initialEncryption = {
      key: sharedSecret.slice(0, 16),
      iv: md5Bytes(sharedSecret),
    };
    this.phase = 'shared_key_ready';
    return this.buildWriteStep('key_info_request', encodeOuterFrame([0x02]), this.phase);
  }

  private handleKeyInfoResponse(payload: number[]): EcoFlowBleSessionProbeStep {
    if (!this.initialEncryption) throw new Error('EcoFlow BLE shared key is not ready.');
    const decrypted = aesCbcDecryptPkcs7(payload.slice(1), this.initialEncryption.key, this.initialEncryption.iv);
    if (decrypted.length < 18) throw new Error('EcoFlow BLE key-info response is too short.');
    const srand = decrypted.slice(0, 16);
    const seed = decrypted.slice(16, 18);
    const { sessionKey } = deriveSessionKey(seed, srand);
    this.sessionEncryption = {
      key: sessionKey,
      iv: this.initialEncryption.iv,
    };
    this.phase = 'session_key_ready';
    const authStatusPacket = encodePacket({
      src: 0x21,
      dst: this.authHeaderDst,
      cmdSet: 0x35,
      cmdId: 0x89,
      version: this.packetVersion,
    });
    const frame = encodeEncryptedPacketFrame(authStatusPacket, this.sessionEncryption);
    this.phase = 'auth_status_sent';
    return {
      ...this.buildWriteStep('auth_status_request', frame, this.phase),
      sessionKeyFingerprint: fingerprintBytes(sessionKey),
    };
  }

  private buildWriteStep(
    kind: NonNullable<EcoFlowBleSessionProbeStep['writeFrameKind']>,
    frame: number[],
    phase: EcoFlowBleSessionProbePhase,
  ): EcoFlowBleSessionProbeStep {
    const writeFrameBase64 = bytesToBase64(frame);
    return {
      phase,
      writeFrameKind: kind,
      writeFrameBase64,
      valueLength: frame.length,
      valueFingerprint: fingerprintText(writeFrameBase64),
      packetVersion: this.packetVersion,
    };
  }
}

export function createEcoFlowBleSessionProbe(options?: EcoFlowBleSessionProbeOptions): EcoFlowBleType7SessionProbe {
  return new EcoFlowBleType7SessionProbe(options);
}

export const __ecoflowBleSessionProbeTest = {
  aesCbcDecryptPkcs7,
  aesCbcEncryptPkcs7,
  bytesToBase64,
  base64ToBytes,
  crc16Arc,
  deriveSessionKey,
  encodePacket,
  encodeEncryptedPacketFrame,
  encodeOuterFrame,
  fingerprintBytes,
  fingerprintText,
  parseOuterFrame,
};
