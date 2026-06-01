/* eslint-disable import/no-unresolved */
// supabase/functions/ecoflow/index.ts

import "@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_ECOFLOW_BASE = "https://api-a.ecoflow.com";

type EcoFlowEdgePhase =
  | "auth"
  | "deviceList"
  | "telemetry"
  | "mqttCertification"
  | "mqttTelemetry"
  | "bleAuthPayload"
  | "normalize";

type EcoFlowEdgeError = {
  code: string;
  message: string;
  authRequired?: boolean;
  deviceUnauthorized?: boolean;
  retryable?: boolean;
};

type EcoFlowErrorClassification = EcoFlowEdgeError & {
  details?: Record<string, unknown>;
};

/* ------------------------- Utilities ------------------------- */

function getEnvOrNull(key: string): string | null {
  const v = Deno.env.get(key);
  return v && v.trim().length > 0 ? v.trim() : null;
}

function getEcoFlowBaseUrl(): string {
  const configured =
    getEnvOrNull("ECOFLOW_API_BASE_URL") ??
    getEnvOrNull("ECOFLOW_API_HOST") ??
    DEFAULT_ECOFLOW_BASE;
  return configured.replace(/\/+$/, "");
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));

  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function buildSignedHeaders(
  accessKey: string,
  secretKey: string,
  requestParams?: Record<string, string>
) {
  const timestamp = Date.now().toString();
  const nonce = String(Math.floor(100000 + Math.random() * 900000));

  let signingString = "";

  if (requestParams && Object.keys(requestParams).length > 0) {
    const sortedKeys = Object.keys(requestParams).sort();
    const paramParts = sortedKeys.map((k) => `${k}=${requestParams[k]}`);
    signingString = paramParts.join("&") + "&";
  }

  signingString += `accessKey=${accessKey}&nonce=${nonce}&timestamp=${timestamp}`;

  const sign = await hmacSha256Hex(secretKey, signingString);

  let queryString = "";

  if (requestParams && Object.keys(requestParams).length > 0) {
    const qParts = Object.entries(requestParams).map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
    );

    queryString = "?" + qParts.join("&");
  }

  return {
    headers: { accessKey, timestamp, nonce, sign },
    queryString,
  };
}

function successResponse(
  phase: EcoFlowEdgePhase,
  body: Record<string, unknown>,
): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      source: "ecoflow-cloud",
      phase,
      ...body,
      timestamp: Date.now(),
    }),
    { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
}

function errorResponse(
  phase: EcoFlowEdgePhase,
  code: string,
  message: string,
  options: {
    authRequired?: boolean;
    deviceUnauthorized?: boolean;
    retryable?: boolean;
    details?: Record<string, unknown>;
  } = {},
): Response {
  const error: EcoFlowEdgeError = {
    code,
    message,
    authRequired: options.authRequired,
    deviceUnauthorized: options.deviceUnauthorized,
    retryable: options.retryable,
  };

  return new Response(
    JSON.stringify({
      ok: false,
      source: "ecoflow-cloud",
      phase,
      error,
      // Backward-compatible fields for older client paths.
      code,
      message,
      details: options.details,
      timestamp: Date.now(),
    }),
    { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
}

function safeSnippet(text: string, secrets: string[] = []): string {
  let safe = text.replace(/\s+/g, " ");
  for (const secret of secrets) {
    if (secret) safe = safe.replaceAll(secret, "[redacted]");
  }
  return safe.slice(0, 240);
}

function fingerprintValue(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a:${hash.toString(16).padStart(8, "0")}`;
}

function normalizeMatchText(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function extractMatchSuffixes(...values: unknown[]): string[] {
  const suffixes = new Set<string>();
  for (const value of values) {
    const normalized = normalizeMatchText(value);
    if (normalized.length >= 4) suffixes.add(normalized.slice(-4));
    for (const match of normalized.matchAll(/[a-z]*\d[a-z0-9]{3,}/g)) {
      const token = match[0];
      if (token.length >= 4) suffixes.add(token.slice(-4));
    }
  }
  return [...suffixes];
}

function leftRotate(value: number, amount: number): number {
  return ((value << amount) | (value >>> (32 - amount))) >>> 0;
}

function md5Hex(input: string): string {
  const bytes = Array.from(new TextEncoder().encode(input));
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 0; i < 8; i += 1) {
    bytes.push(Math.floor(bitLength / 2 ** (8 * i)) & 0xff);
  }

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const k = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const m = Array.from({ length: 16 }, (_, i) => {
      const j = offset + i * 4;
      return (bytes[j] | (bytes[j + 1] << 8) | (bytes[j + 2] << 16) | (bytes[j + 3] << 24)) >>> 0;
    });
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i += 1) {
      let f = 0;
      let g = 0;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const nextD = d;
      d = c;
      c = b;
      b = (b + leftRotate((a + f + k[i] + m[g]) >>> 0, s[i])) >>> 0;
      a = nextD;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return [a0, b0, c0, d0]
    .flatMap((word) => [word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff])
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function classifyEcoFlowApiFailure(
  status: number,
  bodyText: string,
  fallbackCode: string,
  fallbackMessage: string,
  secrets: string[] = [],
): EcoFlowErrorClassification {
  const haystack = bodyText.toLowerCase();
  const retryable = status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
  const credentialsInvalid =
    status === 401 ||
    haystack.includes("invalid access") ||
    haystack.includes("access key") ||
    haystack.includes("apikey") ||
    haystack.includes("api key") ||
    haystack.includes("secret") ||
    haystack.includes("signature") ||
    haystack.includes("sign is") ||
    haystack.includes("sign error") ||
    haystack.includes("timestamp") ||
    haystack.includes("nonce") ||
    haystack.includes("region") ||
    haystack.includes("account binding");
  const deviceUnauthorized =
    status === 401 ||
    status === 403 ||
    haystack.includes("not allowed") ||
    haystack.includes("not authorized") ||
    haystack.includes("not authorised") ||
    haystack.includes("unauthorized") ||
    haystack.includes("forbidden") ||
    haystack.includes("permission denied");
  const deviceOffline =
    haystack.includes("offline") ||
    haystack.includes("not online") ||
    haystack.includes("device unavailable") ||
    haystack.includes("device status");

  if (credentialsInvalid && !haystack.includes("device")) {
    return {
      code: "ECOFLOW_AUTH_REQUIRED",
      message:
        "EcoFlow cloud credentials are missing, invalid, expired, or configured for the wrong account/region.",
      authRequired: true,
      deviceUnauthorized: false,
      retryable: false,
      details: {
        status,
        authorization: "credentials_invalid_or_wrong_region",
        remediation:
          "Verify the Supabase Edge Function environment has a valid EcoFlow access key, secret key, and the correct EcoFlow API base URL for the account region.",
        bodySnippet: safeSnippet(bodyText, secrets),
      },
    };
  }

  if (deviceUnauthorized) {
    return {
      code: "ECOFLOW_DEVICE_UNAUTHORIZED",
      message:
        "EcoFlow cloud access is not authorized for this account or device. Verify the EcoFlow developer app has device access and the device is bound to the authorized EcoFlow account.",
      authRequired: true,
      deviceUnauthorized: true,
      retryable: false,
      details: {
        status,
        authorization: "device_not_authorized",
        remediation:
          "Use an EcoFlow secret access key pair with device read/quota access for this device serial. Do not put EcoFlow secrets in client code.",
        bodySnippet: safeSnippet(bodyText, secrets),
      },
    };
  }

  if (deviceOffline) {
    return {
      code: "ECOFLOW_DEVICE_OFFLINE",
      message: "EcoFlow Cloud reports this device is offline or unavailable.",
      authRequired: false,
      deviceUnauthorized: false,
      retryable: true,
      details: {
        status,
        deviceStatus: "offline_or_unavailable",
        bodySnippet: safeSnippet(bodyText, secrets),
      },
    };
  }

  return {
    code: fallbackCode,
    message: fallbackMessage,
    authRequired: false,
    deviceUnauthorized: false,
    retryable,
    details: {
      status,
      bodySnippet: safeSnippet(bodyText, secrets),
    },
  };
}

/* ------------------------- Device List ------------------------- */

async function handleDevices(accessKey: string, secretKey: string): Promise<Response> {
  const { headers, queryString } = await buildSignedHeaders(accessKey, secretKey);

  const url = `${getEcoFlowBaseUrl()}/iot-open/sign/device/list${queryString}`;

  let res: Response;

  try {
    res = await fetch(url, { method: "GET", headers });
  } catch (err) {
    return errorResponse("deviceList", "ECOFLOW_CLOUD_UNAVAILABLE", "Unable to reach EcoFlow API.", {
      retryable: true,
    });
  }

  const text = await res.text();

  if (!res.ok) {
    const failure = classifyEcoFlowApiFailure(
      res.status,
      text,
      "ECOFLOW_CLOUD_UNAVAILABLE",
      `EcoFlow device list returned HTTP ${res.status}`,
      [accessKey, secretKey],
    );
    return errorResponse("deviceList", failure.code, failure.message, {
      authRequired: failure.authRequired,
      deviceUnauthorized: failure.deviceUnauthorized,
      retryable: failure.retryable,
      details: failure.details,
    });
  }

  let json: any;

  try {
    json = JSON.parse(text);
  } catch {
    return errorResponse("normalize", "ECOFLOW_NORMALIZE_ERROR", "Invalid device list response from EcoFlow.", {
      retryable: true,
    });
  }

  if (String(json.code ?? "") !== "0") {
    const failure = classifyEcoFlowApiFailure(
      200,
      JSON.stringify(json),
      "ECOFLOW_API_ERROR",
      json.message || "EcoFlow device list returned an error.",
      [accessKey, secretKey],
    );
    return errorResponse("deviceList", failure.code, failure.message, {
      authRequired: failure.authRequired,
      deviceUnauthorized: failure.deviceUnauthorized,
      retryable: failure.retryable,
      details: {
        ...failure.details,
        ecoflowCode: String(json.code ?? ""),
      },
    });
  }

  if (!Array.isArray(json.data)) {
    return errorResponse("normalize", "ECOFLOW_NORMALIZE_ERROR", "EcoFlow device list response did not include a device array.", {
      retryable: true,
      details: {
        bodySnippet: safeSnippet(text, [accessKey, secretKey]),
      },
    });
  }

  const rawDevices: any[] = json.data;

  const devices = rawDevices.map((d: any) => ({
    id: String(d.sn ?? ""),
    deviceId: String(d.sn ?? ""),
    name: String(d.deviceName ?? "EcoFlow Device"),
    deviceName: String(d.deviceName ?? "EcoFlow Device"),
    online: d.online === 1 || d.online === true,
    model: String(d.model ?? d.productName ?? d.deviceModel ?? d.deviceType ?? ""),
    productType: String(d.productType ?? d.productTypeName ?? d.deviceType ?? d.productName ?? ""),
    serial: String(d.sn ?? ""),
  }));

  return successResponse("deviceList", {
    devices,
    deviceCount: devices.length,
  });
}

/* ------------------------- BLE Account Auth Payload ------------------------- */

function resolveBleAuthDeviceSerial(
  devices: Array<{ id?: string; deviceId?: string; serial?: string; name?: string; deviceName?: string; model?: string }>,
  body: Record<string, unknown>,
): { serial: string | null; ambiguous: boolean; matchCount: number } {
  const hints = [
    body.deviceId,
    body.deviceIdHint,
    body.bleDeviceId,
    body.deviceName,
    body.deviceNameHint,
    body.model,
    body.modelHint,
  ];
  const directHints = hints.map(normalizeMatchText).filter(Boolean);
  const suffixHints = extractMatchSuffixes(...hints);
  const scored = devices
    .map((device) => {
      const serial = String(device.serial ?? device.deviceId ?? device.id ?? "").trim();
      const serialText = normalizeMatchText(serial);
      const labelText = normalizeMatchText(`${device.name ?? ""} ${device.deviceName ?? ""} ${device.model ?? ""}`);
      if (!serial || !serialText) return null;
      let score = 0;
      if (directHints.includes(serialText)) score = Math.max(score, 100);
      if (directHints.some((hint) => hint.length >= 4 && (serialText.includes(hint) || hint.includes(serialText)))) {
        score = Math.max(score, 80);
      }
      if (suffixHints.some((suffix) => suffix.length >= 4 && serialText.endsWith(suffix))) {
        score = Math.max(score, 70);
      }
      if (suffixHints.some((suffix) => suffix.length >= 4 && labelText.includes(suffix))) {
        score = Math.max(score, 50);
      }
      return score > 0 ? { serial, score } : null;
    })
    .filter((entry): entry is { serial: string; score: number } => Boolean(entry))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { serial: null, ambiguous: false, matchCount: 0 };
  const bestScore = scored[0].score;
  const best = scored.filter((entry) => entry.score === bestScore);
  return {
    serial: best.length === 1 ? best[0].serial : null,
    ambiguous: best.length > 1,
    matchCount: best.length,
  };
}

async function handleBleAuthPayload(
  accessKey: string,
  secretKey: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const accountUserId =
    getEnvOrNull("ECOFLOW_BLE_ACCOUNT_USER_ID") ??
    getEnvOrNull("ECOFLOW_ACCOUNT_USER_ID") ??
    getEnvOrNull("ECOFLOW_USER_ID");
  if (!accountUserId) {
    return errorResponse(
      "bleAuthPayload",
      "ECOFLOW_BLE_AUTH_USER_ID_MISSING",
      "EcoFlow BLE account user id is not configured server-side.",
      {
        authRequired: true,
        retryable: false,
        details: {
          requiredServerEnv: "ECOFLOW_BLE_ACCOUNT_USER_ID",
        },
      },
    );
  }

  const devicesResponse = await handleDevices(accessKey, secretKey);
  let devicesBody: any = null;
  try {
    devicesBody = await devicesResponse.json();
  } catch {
    return errorResponse(
      "bleAuthPayload",
      "ECOFLOW_BLE_AUTH_DEVICE_LOOKUP_FAILED",
      "EcoFlow BLE auth could not read the cloud device list.",
      { retryable: true },
    );
  }
  if (!devicesBody?.ok || !Array.isArray(devicesBody.devices)) {
    return errorResponse(
      "bleAuthPayload",
      String(devicesBody?.code ?? "ECOFLOW_BLE_AUTH_DEVICE_LOOKUP_FAILED"),
      String(devicesBody?.message ?? "EcoFlow BLE auth could not resolve the cloud device."),
      {
        authRequired: Boolean(devicesBody?.error?.authRequired),
        deviceUnauthorized: Boolean(devicesBody?.error?.deviceUnauthorized),
        retryable: Boolean(devicesBody?.error?.retryable),
        details: devicesBody?.details,
      },
    );
  }

  const resolved = resolveBleAuthDeviceSerial(devicesBody.devices, body);
  if (!resolved.serial) {
    return errorResponse(
      "bleAuthPayload",
      resolved.ambiguous ? "ECOFLOW_BLE_AUTH_DEVICE_AMBIGUOUS" : "ECOFLOW_BLE_AUTH_DEVICE_NOT_FOUND",
      resolved.ambiguous
        ? "EcoFlow BLE auth matched more than one cloud device. Provide a more specific serial hint."
        : "EcoFlow BLE auth could not match the local Bluetooth device to an EcoFlow cloud serial.",
      {
        retryable: false,
        details: {
          matchCount: resolved.matchCount,
          hintFingerprint: fingerprintValue(JSON.stringify({
            deviceId: body.deviceId ?? body.deviceIdHint ?? null,
            name: body.deviceName ?? body.deviceNameHint ?? null,
            model: body.model ?? body.modelHint ?? null,
          })),
        },
      },
    );
  }

  const authPayloadText = md5Hex(`${accountUserId}${resolved.serial}`).toUpperCase();
  return successResponse("bleAuthPayload", {
    bleAuth: {
      authPayloadBase64: btoa(authPayloadText),
      authPayloadEncoding: "base64_ascii_upper_md5_hex",
      authPayloadFingerprint: fingerprintValue(authPayloadText),
      deviceSerialFingerprint: fingerprintValue(resolved.serial),
      deviceSerialSuffix: resolved.serial.slice(-4),
      accountFingerprint: fingerprintValue(accountUserId),
      handling: "session_only_do_not_log_raw_payload",
    },
  });
}

/* ------------------------- Telemetry ------------------------- */

async function handleTelemetry(
  accessKey: string,
  secretKey: string,
  deviceId: string
): Promise<Response> {

  const requestParams = { sn: deviceId };

  const { headers, queryString } = await buildSignedHeaders(
    accessKey,
    secretKey,
    requestParams
  );

  const url = `${getEcoFlowBaseUrl()}/iot-open/sign/device/quota/all${queryString}`;

  let res: Response;

  try {
    res = await fetch(url, { method: "GET", headers });
  } catch {
    return errorResponse(
      "telemetry",
      "ECOFLOW_CLOUD_UNAVAILABLE",
      "Unable to reach EcoFlow telemetry API.",
      { retryable: true },
    );
  }

  const text = await res.text();

  if (!res.ok) {
    const failure = classifyEcoFlowApiFailure(
      res.status,
      text,
      "ECOFLOW_CLOUD_UNAVAILABLE",
      `EcoFlow telemetry returned HTTP ${res.status}`,
      [accessKey, secretKey],
    );
    return errorResponse("telemetry", failure.code, failure.message, {
      authRequired: failure.authRequired,
      deviceUnauthorized: failure.deviceUnauthorized,
      retryable: failure.retryable,
      details: failure.details,
    });
  }

  let json: any;

  try {
    json = JSON.parse(text);
  } catch {
    return errorResponse("normalize", "ECOFLOW_NORMALIZE_ERROR", "Invalid telemetry response from EcoFlow.", {
      retryable: true,
    });
  }

  if (String(json.code ?? "") !== "0") {
    const failure = classifyEcoFlowApiFailure(
      200,
      JSON.stringify(json),
      "ECOFLOW_API_ERROR",
      json.message || "EcoFlow telemetry returned an error.",
      [accessKey, secretKey],
    );
    return errorResponse("telemetry", failure.code, failure.message, {
      authRequired: failure.authRequired,
      deviceUnauthorized: failure.deviceUnauthorized,
      retryable: failure.retryable,
      details: {
        ...failure.details,
        ecoflowCode: String(json.code ?? ""),
      },
    });
  }

  if (!json.data || typeof json.data !== "object") {
    return errorResponse("normalize", "ECOFLOW_NORMALIZE_ERROR", "EcoFlow telemetry response did not include a telemetry object.", {
      retryable: true,
      details: {
        bodySnippet: safeSnippet(text, [accessKey, secretKey]),
      },
    });
  }

  return successResponse("telemetry", {
    deviceId,
    telemetry: json.data ?? {},
  });
}

/* ------------------------- MQTT Certification ------------------------- */

async function handleMqttCertification(accessKey: string, secretKey: string): Promise<Response> {
  const { headers, queryString } = await buildSignedHeaders(accessKey, secretKey);
  const url = `${getEcoFlowBaseUrl()}/iot-open/sign/certification${queryString}`;

  let res: Response;

  try {
    res = await fetch(url, { method: "GET", headers });
  } catch {
    return errorResponse(
      "mqttCertification",
      "ECOFLOW_CLOUD_UNAVAILABLE",
      "Unable to reach EcoFlow MQTT certification API.",
      { retryable: true },
    );
  }

  const text = await res.text();

  if (!res.ok) {
    const failure = classifyEcoFlowApiFailure(
      res.status,
      text,
      "ECOFLOW_CLOUD_UNAVAILABLE",
      `EcoFlow MQTT certification returned HTTP ${res.status}`,
      [accessKey, secretKey],
    );
    return errorResponse("mqttCertification", failure.code, failure.message, {
      authRequired: failure.authRequired,
      deviceUnauthorized: failure.deviceUnauthorized,
      retryable: failure.retryable,
      details: failure.details,
    });
  }

  let json: any;

  try {
    json = JSON.parse(text);
  } catch {
    return errorResponse("normalize", "ECOFLOW_NORMALIZE_ERROR", "Invalid MQTT certification response from EcoFlow.", {
      retryable: true,
    });
  }

  if (String(json.code ?? "") !== "0") {
    const failure = classifyEcoFlowApiFailure(
      200,
      JSON.stringify(json),
      "ECOFLOW_API_ERROR",
      json.message || "EcoFlow MQTT certification returned an error.",
      [accessKey, secretKey],
    );
    return errorResponse("mqttCertification", failure.code, failure.message, {
      authRequired: failure.authRequired,
      deviceUnauthorized: failure.deviceUnauthorized,
      retryable: failure.retryable,
      details: {
        ...failure.details,
        ecoflowCode: String(json.code ?? ""),
      },
    });
  }

  const cert = json.data && typeof json.data === "object" ? json.data : {};
  const certificateAccount = String(cert.certificateAccount ?? "");
  const urlValue = String(cert.url ?? "");
  const portValue = String(cert.port ?? "");
  const protocolValue = String(cert.protocol ?? "");
  const passwordPresent = String(cert.certificatePassword ?? "").length > 0;

  return successResponse("mqttCertification", {
    mqtt: {
      available: Boolean(certificateAccount && urlValue && portValue && protocolValue && passwordPresent),
      url: urlValue,
      port: portValue,
      protocol: protocolValue,
      certificateAccountFingerprint: certificateAccount ? fingerprintValue(certificateAccount) : null,
      passwordPresent,
      topics: {
        quota: "/open/{certificateAccount}/{sn}/quota",
        status: "/open/{certificateAccount}/{sn}/status",
        get: "/open/{certificateAccount}/{sn}/get",
        getReply: "/open/{certificateAccount}/{sn}/get_reply",
      },
    },
  });
}

/* ------------------------- MQTT Telemetry Bridge Read ------------------------- */

function getSupabaseServiceContext(): { url: string; serviceKey: string } | null {
  const url = getEnvOrNull("SUPABASE_URL") ?? getEnvOrNull("PROJECT_URL");
  const serviceKey = getEnvOrNull("ECS_SERVICE_ROLE_KEY") ?? getEnvOrNull("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  return {
    url: url.replace(/\/+$/, ""),
    serviceKey,
  };
}

async function handleMqttTelemetry(deviceId: string): Promise<Response> {
  const service = getSupabaseServiceContext();
  if (!service) {
    return errorResponse(
      "mqttTelemetry",
      "ECOFLOW_MQTT_BRIDGE_UNAVAILABLE",
      "EcoFlow MQTT bridge storage is not configured.",
      {
        retryable: false,
        details: {
          requiredServerEnv:
            "SUPABASE_URL and ECS_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY",
        },
      },
    );
  }

  const query = new URLSearchParams({
    provider_id: "eq.ecoflow",
    device_id: `eq.${deviceId}`,
    select: "device_id,device_name,model,source,telemetry,raw_type_code,received_at,updated_at",
    limit: "1",
  });
  const url = `${service.url}/rest/v1/ecoflow_mqtt_telemetry_latest?${query.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: service.serviceKey,
        authorization: `Bearer ${service.serviceKey}`,
        accept: "application/json",
      },
    });
  } catch {
    return errorResponse(
      "mqttTelemetry",
      "ECOFLOW_MQTT_BRIDGE_UNAVAILABLE",
      "Unable to reach EcoFlow MQTT bridge storage.",
      { retryable: true },
    );
  }

  const text = await res.text();
  if (!res.ok) {
    return errorResponse(
      "mqttTelemetry",
      "ECOFLOW_MQTT_BRIDGE_UNAVAILABLE",
      `EcoFlow MQTT bridge storage returned HTTP ${res.status}`,
      {
        retryable: res.status >= 500,
        details: {
          status: res.status,
          bodySnippet: safeSnippet(text, [service.serviceKey]),
        },
      },
    );
  }

  let rows: any[] = [];
  try {
    rows = JSON.parse(text);
  } catch {
    return errorResponse(
      "normalize",
      "ECOFLOW_NORMALIZE_ERROR",
      "Invalid EcoFlow MQTT telemetry storage response.",
      { retryable: true },
    );
  }

  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || !row.telemetry || typeof row.telemetry !== "object") {
    return errorResponse(
      "mqttTelemetry",
      "ECOFLOW_MQTT_TELEMETRY_UNAVAILABLE",
      "No EcoFlow MQTT telemetry has been received for this device yet.",
      {
        retryable: true,
        details: {
          deviceId,
          source: "mqtt_bridge",
        },
      },
    );
  }

  return successResponse("mqttTelemetry", {
    deviceId,
    telemetry: row.telemetry,
    rawQuota: null,
    polledAt: row.received_at,
    mqtt: {
      source: row.source ?? "mqtt_quota",
      receivedAt: row.received_at,
      updatedAt: row.updated_at,
      typeCode: row.raw_type_code ?? null,
      deviceName: row.device_name ?? null,
      model: row.model ?? null,
    },
  });
}

/* ------------------------- Main Handler ------------------------- */

Deno.serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("auth", "INVALID_REQUEST", "POST required", { retryable: false });
  }

  let body: any = {};

  try {
    body = await req.json();
  } catch {
    return errorResponse("auth", "INVALID_REQUEST", "Invalid JSON body", { retryable: false });
  }

  const action = body.action;

  if (action === "mqttTelemetry") {
    if (!body.deviceId) {
      return errorResponse(
        "mqttTelemetry",
        "INVALID_REQUEST",
        "deviceId required for MQTT telemetry",
        { retryable: false },
      );
    }

    return await handleMqttTelemetry(String(body.deviceId));
  }

  const accessKey = getEnvOrNull("ECOFLOW_ACCESS_KEY");
  const secretKey = getEnvOrNull("ECOFLOW_SECRET_KEY");

  if (!accessKey || !secretKey) {
    return errorResponse(
      "auth",
      "MISSING_ECOFLOW_CREDENTIALS",
      "EcoFlow API keys not configured",
      {
        authRequired: true,
        deviceUnauthorized: false,
        retryable: false,
      },
    );
  }

  if (action === "devices") {
    return await handleDevices(accessKey, secretKey);
  }

  if (action === "telemetry") {
    if (!body.deviceId) {
      return errorResponse(
        "telemetry",
        "INVALID_REQUEST",
        "deviceId required for telemetry",
        { retryable: false },
      );
    }

    return await handleTelemetry(accessKey, secretKey, body.deviceId);
  }

  if (action === "mqttCertification") {
    return await handleMqttCertification(accessKey, secretKey);
  }

  if (action === "bleAuthPayload") {
    return await handleBleAuthPayload(accessKey, secretKey, body);
  }

  return errorResponse(
    "auth",
    "INVALID_REQUEST",
    "action must be 'devices', 'telemetry', 'mqttCertification', 'mqttTelemetry', or 'bleAuthPayload'",
    { retryable: false },
  );
});
