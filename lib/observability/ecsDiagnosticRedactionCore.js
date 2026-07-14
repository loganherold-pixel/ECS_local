'use strict';

const REDACTED = '[redacted]';
const REDACTED_CONTACT = '[redacted_contact]';
const REDACTED_LOCATION = '[redacted_location]';
const REDACTED_LOCATION_HISTORY = '[redacted_convoy_location_history]';
const REDACTED_TRIP_TRACE = '[redacted_trip_trace]';
const REDACTED_PROVIDER_PAYLOAD = '[redacted_provider_payload]';
const REDACTED_TELEMETRY_PAYLOAD = '[redacted_telemetry_payload]';
const REDACTED_PATH = '[redacted_path]';
const REDACTED_COMMAND = '[omitted_command]';
const REDACTED_SIGNED_URL = '[redacted_signed_url]';
const OMITTED_UNSERIALIZABLE = '[omitted_unserializable]';
const TRUNCATED = '[truncated]';
const CIRCULAR = '[circular]';

const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_MAX_ARRAY_LENGTH = 24;
const DEFAULT_MAX_OBJECT_KEYS = 32;
const DEFAULT_MAX_STRING_LENGTH = 600;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?<!\d)(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}(?!\d)/g;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const MAC_ADDRESS_PATTERN = /\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?\b/g;
const MAPBOX_TOKEN_PATTERN = /\b(?:pk|sk)\.[A-Za-z0-9._-]{8,}\b/g;
const OPENAI_KEY_PATTERN = /\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}\b/g;
const SUPABASE_SECRET_PATTERN = /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}\b/g;
const KEY_VALUE_SECRET_PATTERN = /\b(token|secret|password|passphrase|api[_-]?key|access[_-]?key|service[_-]?role[_-]?key|authorization|credential|refresh[_-]?token|access[_-]?token|signature|sig|auth)=([^\s&#]+)/gi;
const LABELED_SECRET_PATTERN = /\b(token|secret|password|passphrase|api[_-]?key|access[_-]?key|service[_-]?role[_-]?key|authorization|credential|refresh[_-]?token|access[_-]?token|signature|sig)\s*(?:=|:|\s)\s*([A-Za-z0-9._~+/=-]{6,})/gi;
const CLI_SECRET_PATTERN = /(--?(?:token|secret|password|passphrase|api[-_]?key|access[-_]?key|service[-_]?role[-_]?key|authorization|credential|refresh[-_]?token|access[-_]?token|signature|sig)(?:=|\s+))([^\s"']+)/gi;
const COORDINATE_PAIR_PATTERN = /(-?\d{1,3}\.\d{4,})\s*[,/]\s*(-?\d{1,3}\.\d{4,})/g;
const LABELED_COORDINATE_PATTERN = /\b(lat(?:itude)?|lon(?:gitude)?|lng)\b\s*(?:=|:)\s*["']?-?\d{1,3}(?:\.\d+)?["']?/gi;
const COORDINATE_NUMBER_PATTERN = /\b-?\d{1,3}\.\d{4,}\b/g;
const LONG_HEX_PATTERN = /\b[0-9a-f]{24,}\b/gi;
const WINDOWS_USER_PATH_PATTERN = /\b[A-Z]:\\Users\\[^\\\s]+(?:\\[^\s():]+)*/gi;
const POSIX_USER_PATH_PATTERN = /\/(?:Users|home)\/[^/\s]+(?:\/[^\s():]+)*/g;
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;
const RAW_PAYLOAD_TEXT_PATTERN = /\b(?:raw[_-]?(?:(?:provider|auth|request|response)(?:[_-]?(?:payload|body))?|payload)|provider[_-]?(?:request|response|payload|body)|request[_-]?body|response[_-]?body|auth[_-]?payload)\s*[:=]\s*(?:\{[^\n]*|\[[^\n]*|[^\s,;]+)/gi;
const TRACE_TEXT_PATTERN = /\b(?:geometry|geojson|polyline|gpx|route[_-]?trace|trip[_-]?trace|member[_-]?positions?|bounding[_-]?box|bbox)\s*[:=]\s*(?:\{[^\n]*|\[[^\n]*|[^\s,;]+)/gi;

function normalizeKey(key) {
  return String(key).replace(/[_\-\s.]/g, '').toLowerCase();
}

function finiteInteger(value, fallback, minimum) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.floor(value))
    : fallback;
}

function hashDiagnosticIdentifier(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function createECSDiagnosticToken(prefix, value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const safePrefix = String(prefix || 'ref')
    .replace(/[^a-z0-9_]/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 24) || 'ref';
  return `${safePrefix}_${hashDiagnosticIdentifier(normalized)}`;
}

function isSecretKey(key) {
  const normalized = normalizeKey(key);
  return normalized.includes('token')
    || normalized.includes('secret')
    || normalized.includes('password')
    || normalized.includes('passphrase')
    || normalized.includes('authorization')
    || normalized.includes('credential')
    || normalized.includes('apikey')
    || normalized.includes('accesskey')
    || normalized.includes('servicerole')
    || normalized.includes('privatekey')
    || normalized.includes('signedurl')
    || normalized.includes('signature')
    || normalized === 'sig'
    || normalized.includes('cookie')
    || normalized === 'auth'
    || normalized === 'authstate'
    || normalized === 'authpayload'
    || normalized === 'session'
    || normalized === 'sessiondata'
    || normalized === 'headers'
    || normalized === 'requestheaders'
    || normalized === 'responseheaders';
}

function isContactKey(key) {
  const normalized = normalizeKey(key);
  return normalized === 'email'
    || normalized.endsWith('email')
    || normalized === 'phone'
    || normalized.endsWith('phone')
    || normalized.includes('contact');
}

function isSensitiveIdentifierKey(key) {
  const normalized = normalizeKey(key);
  return normalized === 'id'
    || normalized === 'userid'
    || normalized === 'actorid'
    || normalized === 'recipientid'
    || normalized === 'memberid'
    || normalized === 'deviceid'
    || normalized === 'actionid'
    || normalized === 'recordid'
    || normalized === 'channelkey'
    || normalized === 'serial'
    || normalized === 'serialnumber'
    || normalized.endsWith('serial')
    || normalized === 'routeid'
    || normalized === 'tripid'
    || normalized === 'runid'
    || normalized === 'expeditionid'
    || normalized === 'packageid'
    || normalized === 'attemptid'
    || normalized === 'sessionid'
    || normalized.endsWith('userid')
    || normalized.endsWith('memberid');
}

function isCorrelationKey(key) {
  const normalized = normalizeKey(key);
  return normalized === 'requestid'
    || normalized === 'requestkey'
    || normalized === 'correlationid'
    || normalized === 'correlationkey'
    || normalized === 'idempotencykey';
}

function isLocationHistoryKey(key) {
  const normalized = normalizeKey(key);
  return normalized.includes('locationhistory')
    || normalized.includes('positionhistory')
    || normalized.includes('memberpositions')
    || normalized.includes('memberposition')
    || normalized.includes('restrictedposition')
    || normalized.includes('convoypositions')
    || normalized.includes('convoyposition');
}

function isLocationKey(key) {
  const normalized = normalizeKey(key);
  return normalized === 'latitude'
    || normalized === 'longitude'
    || normalized === 'lat'
    || normalized === 'lon'
    || normalized === 'lng'
    || normalized === 'bbox'
    || normalized === 'bounds'
    || normalized === 'boundingbox'
    || normalized === 'geometry'
    || normalized === 'geojson';
}

function isTripTraceKey(key) {
  const normalized = normalizeKey(key);
  return normalized.includes('completetriptrace')
    || normalized.includes('triptrace')
    || normalized.includes('routetrace')
    || normalized.includes('routegeometry')
    || normalized.includes('tripgeometry')
    || normalized.includes('recapgeometry')
    || normalized.includes('replaydata')
    || normalized.includes('breadcrumbpoints')
    || normalized.includes('routepoints')
    || normalized.includes('waypoints')
    || normalized.includes('gpx')
    || normalized === 'polyline'
    || normalized === 'coordinates';
}

function isProviderPayloadKey(key) {
  const normalized = normalizeKey(key);
  return normalized.includes('providerresponse')
    || normalized.includes('providerrequest')
    || normalized.includes('rawprovider')
    || normalized.includes('providerpayload')
    || normalized.includes('responsebody')
    || normalized.includes('requestbody')
    || normalized === 'rawresponse'
    || normalized === 'rawrequest'
    || normalized === 'authpayload';
}

function isTelemetryPayloadKey(key) {
  const normalized = normalizeKey(key);
  return normalized.includes('rawble')
    || normalized.includes('blepayload')
    || normalized.includes('rawpayload')
    || normalized.includes('advertisementpayload')
    || normalized.includes('manufacturerdata')
    || normalized.includes('rawframe')
    || normalized.includes('packetbytes');
}

function isPrivatePathKey(key) {
  const normalized = normalizeKey(key);
  return normalized.includes('screenshotpath')
    || normalized.includes('filepath')
    || normalized === 'pathuri'
    || normalized === 'fileuri';
}

function isCommandKey(key) {
  const normalized = normalizeKey(key);
  return normalized === 'command'
    || normalized === 'commandline'
    || normalized === 'argv'
    || normalized === 'arguments'
    || normalized === 'processargs';
}

function hasCoordinateKeys(value) {
  const keys = new Set(Object.keys(value).map(normalizeKey));
  return (keys.has('latitude') && keys.has('longitude'))
    || (keys.has('lat') && (keys.has('lon') || keys.has('lng')))
    || (keys.has('startlat') && keys.has('startlon'))
    || (keys.has('coords') && (keys.has('accuracy') || keys.has('timestamp')));
}

function isCoordinatePairArray(value) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
    return false;
  }
  const [first, second] = value;
  return (Math.abs(first) <= 180 && Math.abs(second) <= 90)
    && (!Number.isInteger(first) || !Number.isInteger(second));
}

function isSensitiveUrlParameter(key) {
  const normalized = normalizeKey(key);
  return isSecretKey(key)
    || normalized === 'key'
    || normalized === 'auth'
    || normalized === 'signature'
    || normalized === 'sig'
    || normalized.startsWith('xamz')
    || normalized === 'access_token';
}

function isLocationUrlParameter(key) {
  const normalized = normalizeKey(key);
  return isLocationKey(key)
    || normalized === 'coordinates'
    || normalized === 'center'
    || normalized === 'location';
}

function sanitizeUrl(raw) {
  const trailingMatch = raw.match(/[),.;]+$/);
  const trailing = trailingMatch?.[0] ?? '';
  const candidate = trailing ? raw.slice(0, -trailing.length) : raw;
  try {
    const parsed = new URL(candidate);
    const keys = [...parsed.searchParams.keys()];
    const isSigned = keys.some((key) => {
      const normalized = normalizeKey(key);
      return normalized === 'sig' || normalized.includes('signature') || normalized.startsWith('xamz');
    });
    if (isSigned) return `${REDACTED_SIGNED_URL}${trailing}`;
    if (parsed.username || parsed.password) {
      parsed.username = 'redacted';
      parsed.password = 'redacted';
    }
    for (const key of keys) {
      if (isSensitiveUrlParameter(key)) parsed.searchParams.set(key, REDACTED);
      else if (isLocationUrlParameter(key)) parsed.searchParams.set(key, REDACTED_LOCATION);
    }
    return `${parsed.toString()}${trailing}`;
  } catch {
    return candidate
      .replace(/([?&](?:token|key|secret|sig|signature|auth|password|access_token|api_key)=)[^&#\s]+/gi, `$1${REDACTED}`)
      .replace(COORDINATE_NUMBER_PATTERN, REDACTED_LOCATION) + trailing;
  }
}

function sanitizeECSDiagnosticText(value, maxLength = DEFAULT_MAX_STRING_LENGTH) {
  const sanitized = String(value)
    .replace(URL_PATTERN, sanitizeUrl)
    .replace(RAW_PAYLOAD_TEXT_PATTERN, REDACTED_PROVIDER_PAYLOAD)
    .replace(TRACE_TEXT_PATTERN, REDACTED_TRIP_TRACE)
    .replace(BEARER_PATTERN, 'Bearer [redacted]')
    .replace(JWT_PATTERN, '[redacted_token]')
    .replace(MAPBOX_TOKEN_PATTERN, '[redacted_token]')
    .replace(OPENAI_KEY_PATTERN, '[redacted_key]')
    .replace(SUPABASE_SECRET_PATTERN, '[redacted_key]')
    .replace(CLI_SECRET_PATTERN, (_match, key) => `${key}${REDACTED}`)
    .replace(LABELED_SECRET_PATTERN, (_match, key) => `${key} [redacted]`)
    .replace(KEY_VALUE_SECRET_PATTERN, (_match, key) => `${key}=[redacted]`)
    .replace(EMAIL_PATTERN, REDACTED_CONTACT)
    .replace(PHONE_PATTERN, REDACTED_CONTACT)
    .replace(UUID_PATTERN, (match) => createECSDiagnosticToken('id', match) ?? REDACTED)
    .replace(MAC_ADDRESS_PATTERN, '[redacted_device]')
    .replace(LABELED_COORDINATE_PATTERN, (_match, key) => `${key}=${REDACTED_LOCATION}`)
    .replace(COORDINATE_PAIR_PATTERN, REDACTED_LOCATION)
    .replace(COORDINATE_NUMBER_PATTERN, REDACTED_LOCATION)
    .replace(LONG_HEX_PATTERN, '[redacted_payload]')
    .replace(WINDOWS_USER_PATH_PATTERN, REDACTED_PATH)
    .replace(POSIX_USER_PATH_PATTERN, REDACTED_PATH);
  const normalized = sanitized.replace(/[ \t]+/g, ' ').trim();
  const limit = finiteInteger(maxLength, DEFAULT_MAX_STRING_LENGTH, 32);
  return normalized.length <= limit ? normalized : `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

function sanitizeStack(value, maxStringLength) {
  return sanitizeECSDiagnosticText(String(value).split('\n').slice(0, 6).join('\n'), maxStringLength);
}

function sanitizeByKey(key, value, depth, context) {
  if (isCommandKey(key)) return value == null ? null : REDACTED_COMMAND;
  if (isSecretKey(key)) return value == null ? null : REDACTED;
  if (isContactKey(key)) return value == null ? null : REDACTED_CONTACT;
  if (isLocationHistoryKey(key)) return value == null ? null : REDACTED_LOCATION_HISTORY;
  if (isLocationKey(key)) return value == null ? null : REDACTED_LOCATION;
  if (isTripTraceKey(key)) return value == null ? null : REDACTED_TRIP_TRACE;
  if (isProviderPayloadKey(key)) return value == null ? null : REDACTED_PROVIDER_PAYLOAD;
  if (isTelemetryPayloadKey(key)) return value == null ? null : REDACTED_TELEMETRY_PAYLOAD;
  if (isPrivatePathKey(key)) return value == null ? null : REDACTED_PATH;
  if (isSensitiveIdentifierKey(key)) return createECSDiagnosticToken('id', value) ?? null;
  if (isCorrelationKey(key)) {
    const prefix = normalizeKey(key).startsWith('correlation') ? 'correlation' : 'request';
    return createECSDiagnosticToken(prefix, value) ?? null;
  }
  return sanitizeValue(value, depth + 1, context);
}

function sanitizeValue(value, depth, context) {
  if (value == null) return null;
  if (typeof value === 'string') return sanitizeECSDiagnosticText(value, context.maxStringLength);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return '[unsupported]';
  if (depth > context.maxDepth) return TRUNCATED;

  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : '[invalid_date]';
  if (value instanceof Error) {
    const output = {
      name: sanitizeECSDiagnosticText(value.name || 'Error', 80),
      message: sanitizeECSDiagnosticText(value.message || 'Unexpected error', context.maxStringLength),
      stack: value.stack ? sanitizeStack(value.stack, context.maxStringLength) : null,
    };
    if ('cause' in value && value.cause !== undefined) output.cause = sanitizeValue(value.cause, depth + 1, context);
    return output;
  }
  if (typeof ArrayBuffer !== 'undefined' && (value instanceof ArrayBuffer || ArrayBuffer.isView(value))) {
    return REDACTED_TELEMETRY_PAYLOAD;
  }
  if (typeof value !== 'object') return sanitizeECSDiagnosticText(String(value), context.maxStringLength);
  if (context.seen.has(value)) return CIRCULAR;
  context.seen.add(value);

  if (isCoordinatePairArray(value)) return REDACTED_LOCATION;
  if (Array.isArray(value)) {
    const sanitized = value
      .slice(0, context.maxArrayLength)
      .map((item) => sanitizeValue(item, depth + 1, context));
    if (value.length > context.maxArrayLength) sanitized.push(TRUNCATED);
    return sanitized;
  }

  const source = value;
  if (hasCoordinateKeys(source)) return REDACTED_LOCATION;
  const output = {};
  const entries = Object.entries(source).slice(0, context.maxObjectKeys);
  for (const [key, item] of entries) {
    const safeKey = sanitizeECSDiagnosticText(key, 80).replace(/[^a-z0-9_.:-]/gi, '_');
    output[safeKey || 'field'] = sanitizeByKey(key, item, depth, context);
  }
  if (Object.keys(source).length > entries.length) output.__truncated__ = true;
  return output;
}

function sanitizeECSDiagnosticValue(value, options = {}) {
  const context = {
    maxDepth: finiteInteger(options.maxDepth, DEFAULT_MAX_DEPTH, 1),
    maxArrayLength: finiteInteger(options.maxArrayLength, DEFAULT_MAX_ARRAY_LENGTH, 1),
    maxObjectKeys: finiteInteger(options.maxObjectKeys, DEFAULT_MAX_OBJECT_KEYS, 1),
    maxStringLength: finiteInteger(options.maxStringLength, DEFAULT_MAX_STRING_LENGTH, 32),
    seen: new WeakSet(),
  };
  try {
    return sanitizeValue(value, 0, context);
  } catch {
    return OMITTED_UNSERIALIZABLE;
  }
}

function stableSortValue(value) {
  if (Array.isArray(value)) return value.map(stableSortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableSortValue(value[key]);
    return result;
  }, {});
}

function fingerprintECSDiagnosticValue(value) {
  const sanitized = sanitizeECSDiagnosticValue(value, {
    maxDepth: 4,
    maxArrayLength: 12,
    maxObjectKeys: 20,
    maxStringLength: 160,
  });
  try {
    return JSON.stringify(stableSortValue(sanitized));
  } catch {
    return 'unserializable';
  }
}

module.exports = {
  OMITTED_UNSERIALIZABLE,
  createECSDiagnosticToken,
  fingerprintECSDiagnosticValue,
  sanitizeECSDiagnosticText,
  sanitizeECSDiagnosticValue,
};
