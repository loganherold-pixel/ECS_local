// supabase/functions/ecoflow/index.ts

import "@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ECOFLOW_BASE = "https://api-a.ecoflow.com";

/* ------------------------- Utilities ------------------------- */

function getEnvOrNull(key: string): string | null {
  const v = Deno.env.get(key);
  return v && v.trim().length > 0 ? v.trim() : null;
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

function successResponse(body: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({ ok: true, ...body, timestamp: Date.now() }),
    { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
}

function errorResponse(code: string, message: string): Response {
  return new Response(
    JSON.stringify({ ok: false, code, message, timestamp: Date.now() }),
    { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
}

/* ------------------------- Device List ------------------------- */

async function handleDevices(accessKey: string, secretKey: string): Promise<Response> {
  const { headers, queryString } = await buildSignedHeaders(accessKey, secretKey);

  const url = `${ECOFLOW_BASE}/iot-open/sign/device/list${queryString}`;

  let res: Response;

  try {
    res = await fetch(url, { method: "GET", headers });
  } catch (err) {
    return errorResponse("ECOFLOW_API_ERROR", "Unable to reach EcoFlow API.");
  }

  const text = await res.text();

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      return errorResponse(
        "ECOFLOW_AUTH_FAILED",
        "EcoFlow credentials rejected."
      );
    }

    return errorResponse(
      "ECOFLOW_API_ERROR",
      `EcoFlow API returned HTTP ${res.status}`
    );
  }

  let json: any;

  try {
    json = JSON.parse(text);
  } catch {
    return errorResponse("ECOFLOW_API_ERROR", "Invalid response from EcoFlow.");
  }

  if (String(json.code ?? "") !== "0") {
    return errorResponse(
      "ECOFLOW_API_ERROR",
      json.message || "EcoFlow returned error"
    );
  }

  const rawDevices: any[] = Array.isArray(json.data) ? json.data : [];

  const devices = rawDevices.map((d: any) => ({
    id: String(d.sn ?? ""),
    name: String(d.deviceName ?? "EcoFlow Device"),
    online: d.online === 1 || d.online === true,
  }));

  return successResponse({ devices });
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

  const url = `${ECOFLOW_BASE}/iot-open/sign/device/quota/all${queryString}`;

  let res: Response;

  try {
    res = await fetch(url, { method: "GET", headers });
  } catch {
    return errorResponse(
      "ECOFLOW_API_ERROR",
      "Unable to reach EcoFlow telemetry API."
    );
  }

  const text = await res.text();

  if (!res.ok) {
    return errorResponse(
      "ECOFLOW_API_ERROR",
      `EcoFlow telemetry HTTP ${res.status}`
    );
  }

  let json: any;

  try {
    json = JSON.parse(text);
  } catch {
    return errorResponse("ECOFLOW_API_ERROR", "Invalid telemetry response.");
  }

  if (String(json.code ?? "") !== "0") {
    return errorResponse(
      "ECOFLOW_API_ERROR",
      json.message || "EcoFlow telemetry error"
    );
  }

  return successResponse({
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
    return errorResponse("INVALID_REQUEST", "POST required");
  }

  let body: any = {};

  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "Invalid JSON body");
  }

  const action = body.action;

  const accessKey = getEnvOrNull("ECOFLOW_ACCESS_KEY");
  const secretKey = getEnvOrNull("ECOFLOW_SECRET_KEY");

  if (!accessKey || !secretKey) {
    return errorResponse(
      "MISSING_ECOFLOW_CREDENTIALS",
      "EcoFlow API keys not configured"
    );
  }

  if (action === "devices") {
    return await handleDevices(accessKey, secretKey);
  }

  if (action === "telemetry") {
    if (!body.deviceId) {
      return errorResponse(
        "INVALID_REQUEST",
        "deviceId required for telemetry"
      );
    }

    return await handleTelemetry(accessKey, secretKey, body.deviceId);
  }

  return errorResponse(
    "INVALID_REQUEST",
    "action must be 'devices' or 'telemetry'"
  );
});
