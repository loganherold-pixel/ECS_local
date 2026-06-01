#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const tls = require('tls');
const { createClient } = require('@supabase/supabase-js');
const ts = require('typescript');

const DEFAULT_BASE_URL = 'https://api-a.ecoflow.com';
const DEFAULT_TIMEOUT_MS = 0;
const DEFAULT_TABLE = 'ecoflow_mqtt_telemetry_latest';
const QUOTA_MERGE_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_POWER_QUOTAS = [
  'bmsMaster.soc',
  'bmsMaster.inputWatts',
  'bmsMaster.outputWatts',
  'pd.remainTime',
  'mppt.carState',
  'mppt.cfgDcChgCurrent',
  'mppt.cfgChgType',
  'mppt.cfgChgPauseFlag',
  'mppt.cfgChgWatts',
  'mppt.chgType',
  'mppt.chgState',
  'mppt.chgPauseFlag',
  'mppt.chgWatts',
  'mppt.inputWatts',
  'mppt.carInputWatts',
  'mppt.pvPower',
  'mppt.solarWatts',
  'pd.pvPower',
  'pd.pvInputWatts',
  'pd.pvTotalPower',
  'pd.pv1InputWatts',
  'pd.pv2InputWatts',
  'pd.pv1Power',
  'pd.pv2Power',
  'pd.pvHInputWatts',
  'pd.pvLInputWatts',
  'pd.powGetPvH',
  'pd.powGetPvL',
  'pd.solarInputWatts',
];

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    if (!key || process.env[key]) continue;
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnvFile(path.join(process.cwd(), '.env'));
loadDotEnvFile(path.join(process.cwd(), '.env.local'));

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

const { normalizeEcoFlowMqttQuotaTelemetry } = require('../lib/ecoflowMqttQuotaTelemetry.ts');

function parseArgs(argv) {
  const serials = parseSerialList(process.env.ECOFLOW_MQTT_SERIALS || process.env.npm_config_sn);
  const activeRequested = isTruthyEnv(
    process.env.ECOFLOW_MQTT_ACTIVE_GET ||
    process.env.npm_config_active_get,
  );
  const passiveRequested = isTruthyEnv(
    process.env.ECOFLOW_MQTT_PASSIVE ||
    process.env.npm_config_passive ||
    process.env.npm_config_no_active_get,
  );
  const options = {
    timeoutMs: Number(process.env.ECOFLOW_MQTT_BRIDGE_TIMEOUT_MS || process.env.npm_config_timeout_ms) || DEFAULT_TIMEOUT_MS,
    baseUrl: process.env.ECOFLOW_API_BASE_URL || process.env.ECOFLOW_API_HOST || DEFAULT_BASE_URL,
    tableName: process.env.ECOFLOW_MQTT_TELEMETRY_TABLE || DEFAULT_TABLE,
    debug: isTruthyEnv(process.env.ECOFLOW_MQTT_BRIDGE_DEBUG || process.env.npm_config_debug),
    activeGet: passiveRequested && !activeRequested
      ? false
      : !/^(0|false|no|off)$/i.test(String(process.env.ECOFLOW_MQTT_ACTIVE_GET || process.env.npm_config_active_get || 'true').trim()),
    activeGetIntervalMs:
      Number(process.env.ECOFLOW_MQTT_ACTIVE_GET_INTERVAL_MS || process.env.npm_config_active_get_interval_ms) || 60_000,
    publishQos: Number(process.env.ECOFLOW_MQTT_PUBLISH_QOS || process.env.npm_config_publish_qos) === 1 ? 1 : 0,
    quotas: DEFAULT_POWER_QUOTAS,
  };

  for (const arg of argv) {
    if (arg.startsWith('--sn=')) {
      serials.push(...parseSerialList(arg.slice('--sn='.length)));
    } else if (arg.startsWith('--timeout-ms=')) {
      options.timeoutMs = Number(arg.slice('--timeout-ms='.length)) || options.timeoutMs;
    } else if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length).trim() || options.baseUrl;
    } else if (arg.startsWith('--table=')) {
      options.tableName = arg.slice('--table='.length).trim() || options.tableName;
    } else if (arg === '--debug') {
      options.debug = true;
    } else if (arg === '--active-get' || arg === '--publish-get') {
      options.activeGet = true;
    } else if (arg === '--passive' || arg === '--no-active-get') {
      options.activeGet = false;
    } else if (arg.startsWith('--active-get-interval-ms=')) {
      options.activeGetIntervalMs = Number(arg.slice('--active-get-interval-ms='.length)) || options.activeGetIntervalMs;
    } else if (arg.startsWith('--publish-qos=')) {
      options.publishQos = Number(arg.slice('--publish-qos='.length)) === 1 ? 1 : 0;
    } else if (arg.startsWith('--quotas=')) {
      options.quotas = arg.slice('--quotas='.length).split(',').map((value) => value.trim()).filter(Boolean);
    } else if (!arg.startsWith('--')) {
      serials.push(...parseSerialList(arg));
    }
  }

  return { serials: [...new Set(serials)], options };
}

function getForwardedArgv() {
  return process.argv
    .slice(1)
    .filter((arg) => !/[\\/]ecoflow-mqtt-bridge\.js$/i.test(arg));
}

function parseSerialList(value) {
  return String(value ?? '')
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isTruthyEnv(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? '').trim());
}

function requiredEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  throw new Error(`${names.join(' or ')} is required for the EcoFlow MQTT bridge. Use a server-only Supabase service_role JWT or newly generated sb_secret_ API key, not an Edge Function secret digest.`);
}

function describeSupabaseKey(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return { present: false, kind: 'missing', projectRef: null };
  if (/^sb_secret_/i.test(trimmed)) return { present: true, kind: 'secret_key', projectRef: null };
  if (/^sb_publishable_/i.test(trimmed)) return { present: true, kind: 'publishable_key', projectRef: null };
  const parts = trimmed.split('.');
  if (parts.length !== 3) return { present: true, kind: 'unknown', projectRef: null };
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return {
      present: true,
      kind: payload?.role ? `jwt:${payload.role}` : 'jwt',
      projectRef: typeof payload?.ref === 'string' ? payload.ref : null,
    };
  } catch {
    return { present: true, kind: 'jwt:unreadable', projectRef: null };
  }
}

function getSupabaseProjectRefFromUrl(url) {
  const match = String(url || '').match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return match?.[1] ?? null;
}

async function assertSupabaseServiceAccess(supabase, supabaseUrl, serviceRoleKey, tableName) {
  const keyInfo = describeSupabaseKey(serviceRoleKey);
  const urlRef = getSupabaseProjectRefFromUrl(supabaseUrl);
  if (keyInfo.kind === 'publishable_key' || keyInfo.kind === 'jwt:anon' || keyInfo.kind === 'jwt:authenticated') {
    throw new Error(`Supabase service access requires a service_role key; received ${keyInfo.kind}.`);
  }
  if (keyInfo.projectRef && urlRef && keyInfo.projectRef !== urlRef) {
    throw new Error(`Supabase URL/key project mismatch: urlRef=${urlRef} keyRef=${keyInfo.projectRef}.`);
  }

  const { error } = await supabase
    .from(tableName)
    .select('device_id')
    .limit(1);

  if (error) {
    throw new Error(`Supabase service access preflight failed (${error.message}). urlRef=${urlRef ?? 'unknown'} keyKind=${keyInfo.kind}. Use Project Settings > API Keys > create/copy a Secret API key (sb_secret_...) or the legacy service_role JWT.`);
  }
}

function hmacSha256Hex(secret, message) {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

function buildSignedHeaders(accessKey, secretKey, params = {}) {
  const timestamp = Date.now().toString();
  const nonce = String(Math.floor(100000 + Math.random() * 900000));
  const paramString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  const signingString = `${paramString ? `${paramString}&` : ''}accessKey=${accessKey}&nonce=${nonce}&timestamp=${timestamp}`;
  return {
    accessKey,
    nonce,
    timestamp,
    sign: hmacSha256Hex(secretKey, signingString),
  };
}

function queryString(params = {}) {
  const entries = Object.entries(params);
  if (entries.length === 0) return '';
  return `?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')}`;
}

async function ecoflowGet(baseUrl, pathName, params, accessKey, secretKey) {
  const headers = buildSignedHeaders(accessKey, secretKey, params);
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}${pathName}${queryString(params)}`, {
    method: 'GET',
    headers,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`EcoFlow returned non-JSON response (${res.status}).`);
  }
  if (!res.ok || String(json.code ?? '') !== '0') {
    throw new Error(`EcoFlow API error (${res.status}, code ${json.code ?? 'unknown'}): ${json.message ?? 'request failed'}`);
  }
  return json.data;
}

function encodeLength(value) {
  const bytes = [];
  let remaining = value;
  do {
    let encoded = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) encoded |= 128;
    bytes.push(encoded);
  } while (remaining > 0);
  return Buffer.from(bytes);
}

function utf8Field(value) {
  const payload = Buffer.from(String(value), 'utf8');
  const prefix = Buffer.alloc(2);
  prefix.writeUInt16BE(payload.length, 0);
  return Buffer.concat([prefix, payload]);
}

function packet(typeAndFlags, body) {
  return Buffer.concat([Buffer.from([typeAndFlags]), encodeLength(body.length), body]);
}

function connectPacket(clientId, username, password) {
  const variableHeader = Buffer.concat([
    utf8Field('MQTT'),
    Buffer.from([4, 0xc2, 0, 60]),
  ]);
  return packet(0x10, Buffer.concat([
    variableHeader,
    utf8Field(clientId),
    utf8Field(username),
    utf8Field(password),
  ]));
}

function subscribePacket(packetId, topics) {
  const id = Buffer.alloc(2);
  id.writeUInt16BE(packetId, 0);
  const topicPayload = Buffer.concat(topics.map((topic) => Buffer.concat([utf8Field(topic), Buffer.from([0])])));
  return packet(0x82, Buffer.concat([id, topicPayload]));
}

function publishPacket(topic, payload, qos = 0, packetId = 0) {
  const topicField = utf8Field(topic);
  const packetIdField = qos > 0
    ? (() => {
        const id = Buffer.alloc(2);
        id.writeUInt16BE(packetId, 0);
        return id;
      })()
    : Buffer.alloc(0);
  return packet(qos > 0 ? 0x32 : 0x30, Buffer.concat([
    topicField,
    packetIdField,
    Buffer.from(String(payload), 'utf8'),
  ]));
}

function pingPacket() {
  return Buffer.from([0xc0, 0x00]);
}

function readRemainingLength(buffer, offset) {
  let multiplier = 1;
  let value = 0;
  let pos = offset;
  let encoded;
  do {
    if (pos >= buffer.length) return null;
    encoded = buffer[pos++];
    value += (encoded & 127) * multiplier;
    multiplier *= 128;
  } while ((encoded & 128) !== 0);
  return { value, bytes: pos - offset };
}

function parsePublish(body, headerByte = 0x30) {
  if (body.length < 2) return null;
  const topicLength = body.readUInt16BE(0);
  const topicStart = 2;
  const packetIdBytes = ((headerByte >> 1) & 0x03) > 0 ? 2 : 0;
  const payloadStart = topicStart + topicLength + packetIdBytes;
  if (payloadStart > body.length) return null;
  return {
    topic: body.slice(topicStart, topicStart + topicLength).toString('utf8'),
    payload: body.slice(payloadStart).toString('utf8'),
  };
}

const quotaParamState = new Map();

function parseJsonPayload(payload) {
  try {
    const parsed = JSON.parse(String(payload || ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function inferDeviceIdFromTopic(topic) {
  const match = String(topic || '').match(/^\/open\/[^/]+\/([^/]+)\/(?:quota|status|set_reply|get_reply)$/);
  return match?.[1] ?? null;
}

function mergeEcoFlowMqttQuotaPayload(topic, payload, receivedAt) {
  if (!String(topic || '').endsWith('/quota')) return payload;
  const parsed = parseJsonPayload(payload);
  const params = parsed?.params && typeof parsed.params === 'object' && !Array.isArray(parsed.params)
    ? parsed.params
    : null;
  const deviceId = inferDeviceIdFromTopic(topic);
  if (!deviceId || !params) return payload;

  const current = quotaParamState.get(deviceId);
  const previousParams =
    current && receivedAt - current.updatedAt <= QUOTA_MERGE_WINDOW_MS
      ? current.params
      : {};
  const mergedParams = {
    ...previousParams,
    ...params,
  };
  quotaParamState.set(deviceId, {
    params: mergedParams,
    updatedAt: receivedAt,
  });

  return JSON.stringify({
    ...parsed,
    params: mergedParams,
  });
}

function inspectPacket(packetBuffer) {
  const type = packetBuffer[0] >> 4;
  const remaining = readRemainingLength(packetBuffer, 1);
  if (!remaining) return { type, name: 'partial' };
  const bodyStart = 1 + remaining.bytes;
  const body = packetBuffer.slice(bodyStart, bodyStart + remaining.value);

  if (type === 2) return { type, name: 'CONNACK', returnCode: body[1] };
  if (type === 3) return { type, name: 'PUBLISH', ...parsePublish(body, packetBuffer[0]) };
  if (type === 4) return { type, name: 'PUBACK', packetId: body.length >= 2 ? body.readUInt16BE(0) : null };
  if (type === 9) {
    return {
      type,
      name: 'SUBACK',
      packetId: body.length >= 2 ? body.readUInt16BE(0) : null,
      granted: Array.from(body.slice(2)),
    };
  }
  if (type === 13) return { type, name: 'PINGRESP' };
  return { type, name: `MQTT_TYPE_${type}` };
}

function buildGetPayload(options) {
  return JSON.stringify({
    id: `${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
    version: '1.0',
    operateType: 'TCP',
    from: 'Web',
    params: {
      quotas: options.quotas,
    },
  });
}

function splitPackets(buffer) {
  const packets = [];
  let offset = 0;
  while (offset < buffer.length) {
    const remaining = readRemainingLength(buffer, offset + 1);
    if (!remaining) break;
    const length = 1 + remaining.bytes + remaining.value;
    if (offset + length > buffer.length) break;
    packets.push(buffer.slice(offset, offset + length));
    offset += length;
  }
  return { packets, rest: buffer.slice(offset) };
}

async function listEcoFlowSerials(baseUrl, accessKey, secretKey) {
  const data = await ecoflowGet(baseUrl, '/iot-open/sign/device/list', {}, accessKey, secretKey);
  if (!Array.isArray(data)) return [];
  return data.map((device) => String(device?.sn ?? '').trim()).filter(Boolean);
}

function sanitizeTelemetryForStorage(telemetry) {
  return {
    timestamp: telemetry.timestamp,
    source: telemetry.source,
    sourceLabel: telemetry.sourceLabel,
    isLive: telemetry.isLive,
    truth: telemetry.truth,
    device: telemetry.device,
    battery: telemetry.battery,
    solar: telemetry.solar,
    flags: telemetry.flags,
    capabilities: telemetry.capabilities,
    quality: telemetry.quality,
  };
}

function hasCorePowerTelemetry(telemetry) {
  return (
    telemetry?.battery?.socPct !== undefined ||
    telemetry?.battery?.wattsIn !== undefined ||
    telemetry?.battery?.wattsOut !== undefined ||
    telemetry?.battery?.estRuntimeMin !== undefined ||
    telemetry?.solar?.watts !== undefined
  );
}

async function upsertTelemetry(supabase, tableName, frame) {
  const row = {
    provider_id: 'ecoflow',
    device_id: frame.deviceId,
    device_name: frame.telemetry.device?.model ?? frame.deviceId,
    model: frame.telemetry.device?.model ?? null,
    source: 'mqtt_quota',
    telemetry: sanitizeTelemetryForStorage(frame.telemetry),
    raw_topic: frame.topic,
    raw_type_code: frame.typeCode,
    received_at: new Date(frame.receivedAt).toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from(tableName)
    .upsert(row, { onConflict: 'provider_id,device_id' });

  if (error) throw error;
}

async function run() {
  const { serials: requestedSerials, options } = parseArgs(getForwardedArgv());
  const accessKey = requiredEnv('ECOFLOW_ACCESS_KEY');
  const secretKey = requiredEnv('ECOFLOW_SECRET_KEY');
  const supabaseUrl = requiredEnv('SUPABASE_URL', 'ECS_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requiredEnv('ECS_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await assertSupabaseServiceAccess(supabase, supabaseUrl, serviceRoleKey, options.tableName);

  const cert = await ecoflowGet(options.baseUrl, '/iot-open/sign/certification', {}, accessKey, secretKey);
  const host = String(cert.url || '').trim();
  const port = Number(cert.port || 8883);
  const username = String(cert.certificateAccount || '').trim();
  const password = String(cert.certificatePassword || '');
  if (!host || !username || !password) {
    throw new Error('EcoFlow certification response did not include complete MQTT credentials.');
  }

  const serials = requestedSerials.length > 0
    ? requestedSerials
    : await listEcoFlowSerials(options.baseUrl, accessKey, secretKey);
  if (serials.length === 0) {
    throw new Error('No EcoFlow serials available. Pass --sn=SERIAL or set ECOFLOW_MQTT_SERIALS.');
  }

  const topics = serials.flatMap((sn) => [
    { sn, usage: 'quota', topic: `/open/${username}/${sn}/quota` },
    { sn, usage: 'status', topic: `/open/${username}/${sn}/status` },
    { sn, usage: 'set_reply', topic: `/open/${username}/${sn}/set_reply` },
  ]);
  const topicNames = topics.map((entry) => entry.topic);

  console.log(`[EcoFlow MQTT Bridge] starting host=${host} port=${port} serials=${serials.length} table=${options.tableName}`);
  console.log(`[EcoFlow MQTT Bridge] mode=${options.activeGet ? 'active-get' : 'passive'}${options.activeGet ? ` intervalMs=${options.activeGetIntervalMs} publishQos=${options.publishQos}` : ''}`);

  await new Promise((resolve, reject) => {
    const clientId = `ecs-bridge-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true });
    let buffer = Buffer.alloc(0);
    let publishCount = 0;
    let storedCount = 0;
    let pubAckCount = 0;
    let getRequestCount = 0;
    let nextPublishPacketId = 100;
    let lastPublishAt = Date.now();
    let settled = false;

    const publishGetRequests = () => {
      if (!options.activeGet || settled) return;
      for (const sn of serials) {
        const topic = `/open/${username}/${sn}/get`;
        const payload = buildGetPayload(options);
        const packetId = options.publishQos > 0 ? nextPublishPacketId++ : 0;
        socket.write(publishPacket(topic, payload, options.publishQos, packetId));
        getRequestCount += 1;
      }
      console.log(`[EcoFlow MQTT Bridge] published get requests count=${serials.length} total=${getRequestCount}`);
    };

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearInterval(pingTimer);
      clearInterval(statusTimer);
      clearInterval(activeGetTimer);
      clearTimeout(timeoutTimer);
      socket.end();
      console.log(`[EcoFlow MQTT Bridge] stopped publishCount=${publishCount} storedCount=${storedCount} getRequestCount=${getRequestCount} pubAckCount=${pubAckCount}`);
      if (error) reject(error);
      else resolve();
    };

    const timeoutTimer = options.timeoutMs > 0
      ? setTimeout(() => finish(), options.timeoutMs)
      : setTimeout(() => {}, 2 ** 31 - 1);
    const pingTimer = setInterval(() => socket.write(pingPacket()), 20_000);
    const statusTimer = setInterval(() => {
      const quietMs = Date.now() - lastPublishAt;
      console.log(`[EcoFlow MQTT Bridge] listening publishCount=${publishCount} storedCount=${storedCount} quietMs=${quietMs}`);
    }, 30_000);
    const activeGetTimer = setInterval(publishGetRequests, Math.max(15_000, options.activeGetIntervalMs));

    socket.once('secureConnect', () => {
      socket.write(connectPacket(clientId, username, password));
    });

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const split = splitPackets(buffer);
      buffer = split.rest;
      for (const raw of split.packets) {
        const msg = inspectPacket(raw);
        if (msg.name === 'CONNACK') {
          if (msg.returnCode !== 0) {
            finish(new Error(`MQTT CONNACK failed with return code ${msg.returnCode}`));
            return;
          }
          console.log('[EcoFlow MQTT Bridge] connected');
          socket.write(subscribePacket(1, topicNames));
        } else if (msg.name === 'SUBACK') {
          const grants = Array.isArray(msg.granted) ? msg.granted : [];
          const rejected = grants.filter((code) => code === 0x80).length;
          console.log(`[EcoFlow MQTT Bridge] subscribed granted=${grants.map((code) => code === 0x80 ? 'fail' : `qos${code}`).join(',')} rejected=${rejected}`);
          publishGetRequests();
        } else if (msg.name === 'PUBACK') {
          pubAckCount += 1;
          if (options.debug) {
            console.log(`[EcoFlow MQTT Bridge] puback packetId=${msg.packetId}`);
          }
        } else if (msg.name === 'PUBLISH') {
          publishCount += 1;
          lastPublishAt = Date.now();
          const receivedAt = Date.now();
          const mergedPayload = mergeEcoFlowMqttQuotaPayload(msg.topic, msg.payload, receivedAt);
          const normalized = normalizeEcoFlowMqttQuotaTelemetry({
            topic: msg.topic,
            payload: mergedPayload,
            receivedAt,
          });
          if (!normalized.telemetry || !normalized.deviceId) {
            if (options.debug) {
              console.log(`[EcoFlow MQTT Bridge] ignored non-telemetry frame topic=${msg.topic}`);
            }
            continue;
          }
          if (!hasCorePowerTelemetry(normalized.telemetry)) {
            if (options.debug) {
              console.log(`[EcoFlow MQTT Bridge] ignored weak telemetry frame deviceId=${normalized.deviceId}`);
            }
            continue;
          }
          upsertTelemetry(supabase, options.tableName, {
            deviceId: normalized.deviceId,
            telemetry: normalized.telemetry,
            topic: msg.topic,
            typeCode: normalized.typeCode,
            receivedAt,
          })
            .then(() => {
              storedCount += 1;
              const battery = normalized.telemetry.battery ?? {};
              const solar = normalized.telemetry.solar ?? {};
              console.log(`[EcoFlow MQTT Bridge] stored ${normalized.deviceId} SOC=${battery.socPct ?? '?'} IN=${battery.wattsIn ?? '?'}W OUT=${battery.wattsOut ?? '?'}W SOLAR=${solar.watts ?? '?'}W`);
            })
            .catch((error) => {
              console.error(`[EcoFlow MQTT Bridge] failed to store ${normalized.deviceId}: ${error.message}`);
            });
        }
      }
    });

    socket.on('error', finish);
    socket.on('end', () => finish());
  });
}

run().catch((error) => {
  console.error(`[EcoFlow MQTT Bridge] ${error.message}`);
  process.exitCode = 1;
});
