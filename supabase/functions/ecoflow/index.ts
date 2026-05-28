/* eslint-disable import/no-unresolved */
// supabase/functions/ecoflow/index.ts

import "@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_ECOFLOW_BASE = "https://api-a.ecoflow.com";

type EcoFlowEdgePhase = "auth" | "deviceList" | "telemetry" | "normalize";

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

  return errorResponse(
    "auth",
    "INVALID_REQUEST",
    "action must be 'devices' or 'telemetry'",
    { retryable: false },
  );
});
