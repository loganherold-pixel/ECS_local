#!/usr/bin/env node

const crypto = require('crypto');
const tls = require('tls');

const DEFAULT_BASE_URL = 'https://api-a.ecoflow.com';
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

function parseArgs(argv) {
  const serials = [];
  const options = {
    timeoutMs: Number(process.env.ECOFLOW_MQTT_TIMEOUT_MS || process.env.npm_config_timeout_ms) || 45_000,
    baseUrl: process.env.ECOFLOW_API_BASE_URL || process.env.ECOFLOW_API_HOST || DEFAULT_BASE_URL,
    activeGet: resolveInitialActiveGet(),
    debugArgs: isTruthyEnv(process.env.ECOFLOW_MQTT_DEBUG_ARGS || process.env.npm_config_debug_args),
    publishQos: parseQos(process.env.ECOFLOW_MQTT_PUBLISH_QOS || process.env.npm_config_publish_qos),
    quotas: DEFAULT_POWER_QUOTAS,
    paramsJson: null,
  };

  if (process.env.npm_config_sn) {
    serials.push(...parseSerialList(process.env.npm_config_sn));
  }

  for (const arg of argv) {
    if (arg.startsWith('--sn=')) {
      serials.push(...parseSerialList(arg.slice('--sn='.length)));
    } else if (arg.startsWith('--timeout-ms=')) {
      options.timeoutMs = Number(arg.slice('--timeout-ms='.length)) || options.timeoutMs;
    } else if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length).trim() || options.baseUrl;
    } else if (arg === '--active-get' || arg === '--publish-get' || arg === '--active') {
      options.activeGet = true;
    } else if (arg === '--passive' || arg === '--no-active-get') {
      options.activeGet = false;
    } else if (arg.startsWith('--active-get=')) {
      options.activeGet = isTruthyEnv(arg.slice('--active-get='.length));
    } else if (arg === '--debug-args') {
      options.debugArgs = true;
    } else if (arg.startsWith('--publish-qos=')) {
      options.publishQos = parseQos(arg.slice('--publish-qos='.length));
    } else if (arg.startsWith('--quotas=')) {
      options.quotas = arg.slice('--quotas='.length).split(',').map((value) => value.trim()).filter(Boolean);
    } else if (arg.startsWith('--params-json=')) {
      options.paramsJson = arg.slice('--params-json='.length).trim();
    } else if (!arg.startsWith('--')) {
      serials.push(...parseSerialList(arg));
    }
  }

  return { serials: [...new Set(serials)], options };
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

function resolveInitialActiveGet() {
  if (isTruthyEnv(process.env.ECOFLOW_MQTT_PASSIVE || process.env.npm_config_passive || process.env.npm_config_no_active_get)) {
    return false;
  }
  return isTruthyEnv(process.env.ECOFLOW_MQTT_ACTIVE_GET || process.env.npm_config_active_get);
}

function parseQos(value) {
  return Number(value) === 1 ? 1 : 0;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is required. Set EcoFlow credentials in your shell, not in app code.`);
  }
  return value.trim();
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

async function ecoflowGet(baseUrl, path, params, accessKey, secretKey) {
  const headers = buildSignedHeaders(accessKey, secretKey, params);
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}${queryString(params)}`, {
    method: 'GET',
    headers,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`EcoFlow returned non-JSON response (${res.status}): ${text.slice(0, 180)}`);
  }
  if (!res.ok || String(json.code ?? '') !== '0') {
    throw new Error(`EcoFlow API error (${res.status}, code ${json.code ?? 'unknown'}): ${json.message ?? text.slice(0, 180)}`);
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
  const topicPayload = Buffer.concat(topics.map((topic) => Buffer.concat([utf8Field(topic), Buffer.from([0])])))
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
    topic: body.slice(topicStart, payloadStart).toString('utf8'),
    payload: body.slice(payloadStart).toString('utf8'),
  };
}

function parseJsonPayload(payload) {
  try {
    return JSON.parse(String(payload || ''));
  } catch {
    return null;
  }
}

function summarizeTelemetryPayload(topic, payload) {
  const json = parseJsonPayload(payload);
  if (!json || typeof json !== 'object') return null;
  const params = json.params && typeof json.params === 'object' ? json.params : {};
  const get = (...keys) => {
    for (const key of keys) {
      const value = params[key];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
  };
  const soc = get('bmsMaster.soc', 'soc', 'batPct', 'lcdSoc', 'f32LcdSoc');
  const inputWatts = get('bmsMaster.inputWatts', 'inWatts', 'wattsInSum');
  const outputWatts = get('bmsMaster.outputWatts', 'outWatts', 'wattsOutSum');
  const solarWatts = get(
    'mppt.inputWatts',
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
  );
  const remainTime = get('pd.remainTime', 'remainTime', 'dsgRemain', 'batTime');
  const carState = get('mppt.carState');
  const cfgDcChgCurrent = get('mppt.cfgDcChgCurrent');
  const status = get('status', 'mppt.chgState', 'mppt.chgType');
  const interesting = { soc, inputWatts, outputWatts, solarWatts, remainTime, status, carState, cfgDcChgCurrent };
  const hasInterestingValue = Object.values(interesting).some((value) => value !== null);
  if (!hasInterestingValue) return null;
  const typeCode = json.typeCode ? ` typeCode=${json.typeCode}` : '';
  return `[EcoFlow MQTT] telemetry summary topic=${topic}${typeCode} SOC=${soc ?? '?'} IN=${inputWatts ?? '?'}W OUT=${outputWatts ?? '?'}W SOLAR=${solarWatts ?? '?'}W RT=${remainTime ?? '?'} status=${status ?? '?'} carState=${carState ?? '?'} cfgDcChgCurrent=${cfgDcChgCurrent ?? '?'}`;
}

function inspectPacket(packetBuffer) {
  const type = packetBuffer[0] >> 4;
  const remaining = readRemainingLength(packetBuffer, 1);
  if (!remaining) return { type, name: 'partial' };
  const bodyStart = 1 + remaining.bytes;
  const body = packetBuffer.slice(bodyStart, bodyStart + remaining.value);

  if (type === 2) {
    return { type, name: 'CONNACK', returnCode: body[1] };
  }
  if (type === 3) {
    return { type, name: 'PUBLISH', ...parsePublish(body, packetBuffer[0]) };
  }
  if (type === 4) {
    return { type, name: 'PUBACK', packetId: body.length >= 2 ? body.readUInt16BE(0) : null };
  }
  if (type === 9) {
    const packetId = body.length >= 2 ? body.readUInt16BE(0) : null;
    return {
      type,
      name: 'SUBACK',
      packetId,
      granted: Array.from(body.slice(2)),
    };
  }
  if (type === 13) {
    return { type, name: 'PINGRESP' };
  }
  return { type, name: `MQTT_TYPE_${type}` };
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

function parseParamsJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`--params-json must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function buildGetPayload(sn, options) {
  const paramsFromJson = parseParamsJson(options.paramsJson);
  const id = `${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
  return JSON.stringify({
    id,
    version: '1.0',
    operateType: 'TCP',
    from: 'Web',
    params: paramsFromJson ?? {
      quotas: options.quotas,
    },
  });
}

async function run() {
  const { serials, options } = parseArgs(process.argv.slice(2));
  if (serials.length === 0) {
    throw new Error('Pass at least one serial: node scripts/probe-ecoflow-mqtt.js --sn=SERIAL');
  }
  console.log(`[EcoFlow MQTT] parsed serials=${serials.length} activeGet=${options.activeGet}`);
  if (options.debugArgs) {
    console.log(`[EcoFlow MQTT] argv=${process.argv.slice(2).join(' ')}`);
    console.log(`[EcoFlow MQTT] serials=${serials.join(', ')}`);
  }

  const accessKey = requiredEnv('ECOFLOW_ACCESS_KEY');
  const secretKey = requiredEnv('ECOFLOW_SECRET_KEY');
  const cert = await ecoflowGet(options.baseUrl, '/iot-open/sign/certification', {}, accessKey, secretKey);

  const host = String(cert.url || '').trim();
  const port = Number(cert.port || 8883);
  const username = String(cert.certificateAccount || '').trim();
  const password = String(cert.certificatePassword || '');
  if (!host || !username || !password) {
    throw new Error('EcoFlow certification response did not include complete MQTT credentials.');
  }

  const topics = serials.flatMap((sn) => [
    { sn, usage: 'quota', topic: `/open/${username}/${sn}/quota` },
    { sn, usage: 'status', topic: `/open/${username}/${sn}/status` },
    { sn, usage: 'set_reply', topic: `/open/${username}/${sn}/set_reply` },
    { sn, usage: 'get_reply', topic: `/open/${username}/${sn}/get_reply` },
  ]);
  const topicNames = topics.map((entry) => entry.topic);

  console.log(`[EcoFlow MQTT] certification OK host=${host} port=${port} protocol=${cert.protocol || 'mqtts'} serials=${serials.length}`);
  console.log(`[EcoFlow MQTT] mode=${options.activeGet ? 'active-get' : 'passive-subscribe'}`);
  console.log(`[EcoFlow MQTT] subscribing to quota/status/set_reply/get_reply for ${serials.join(', ')}`);
  if (options.activeGet) {
    console.log(`[EcoFlow MQTT] active get enabled; quota keys=${options.paramsJson ? 'custom params JSON' : options.quotas.join(',')}`);
    console.log(`[EcoFlow MQTT] publish qos=${options.publishQos}`);
  }

  await new Promise((resolve, reject) => {
    const clientId = `ecs-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true });
    let buffer = Buffer.alloc(0);
    let publishCount = 0;
    let pubAckCount = 0;
    let nextPublishPacketId = 100;
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearInterval(pingTimer);
      clearTimeout(timeoutTimer);
      socket.end();
      if (error) reject(error);
      else resolve();
    };

    const timeoutTimer = setTimeout(() => {
      console.log(`[EcoFlow MQTT] probe complete; publishCount=${publishCount} pubAckCount=${pubAckCount}`);
      finish();
    }, options.timeoutMs);
    const pingTimer = setInterval(() => socket.write(pingPacket()), 20_000);

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
          console.log('[EcoFlow MQTT] connected');
          socket.write(subscribePacket(1, topicNames));
        } else if (msg.name === 'SUBACK') {
          const grants = Array.isArray(msg.granted) ? msg.granted : [];
          const rejected = grants.filter((code) => code === 0x80).length;
          console.log(`[EcoFlow MQTT] subscribed; granted=${grants.map((code) => code === 0x80 ? 'fail' : `qos${code}`).join(',')} rejected=${rejected}; waiting for telemetry frames`);
          grants.forEach((code, index) => {
            const topic = topics[index];
            if (!topic) return;
            console.log(`[EcoFlow MQTT] suback ${code === 0x80 ? 'rejected' : `qos${code}`} ${topic.sn} ${topic.usage} ${topic.topic}`);
          });
          if (options.activeGet) {
            for (const sn of serials) {
              const topic = `/open/${username}/${sn}/get`;
              const payload = buildGetPayload(sn, options);
              const publishPacketId = options.publishQos > 0 ? nextPublishPacketId++ : 0;
              console.log(`[EcoFlow MQTT] publishing get request topic=${topic}`);
              console.log(payload);
              socket.write(publishPacket(topic, payload, options.publishQos, publishPacketId));
            }
          }
        } else if (msg.name === 'PUBACK') {
          pubAckCount += 1;
          console.log(`[EcoFlow MQTT] puback packetId=${msg.packetId}`);
        } else if (msg.name === 'PUBLISH') {
          publishCount += 1;
          console.log(`[EcoFlow MQTT] publish topic=${msg.topic}`);
          console.log(String(msg.payload || '').slice(0, 2000));
          const summary = summarizeTelemetryPayload(msg.topic, msg.payload);
          if (summary) console.log(summary);
        }
      }
    });

    socket.on('error', finish);
    socket.on('end', () => finish());
  });
}

run().catch((error) => {
  console.error(`[EcoFlow MQTT] ${error.message}`);
  process.exitCode = 1;
});
