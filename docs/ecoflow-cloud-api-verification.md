# EcoFlow Supabase Edge Function And Cloud API Verification

Date: 2026-05-23

## Cloud Architecture

ECS mobile code does not hold EcoFlow secrets. The client calls the Supabase Edge Function at `supabase/functions/ecoflow/index.ts` through `supabase.functions.invoke("ecoflow")`.

Secrets are read only inside the Edge Function:

- `ECOFLOW_ACCESS_KEY`
- `ECOFLOW_SECRET_KEY`
- Optional region/base URL override: `ECOFLOW_API_BASE_URL` or `ECOFLOW_API_HOST`

The default EcoFlow API host is `https://api-a.ecoflow.com`.

## Signed Requests

The Edge Function signs EcoFlow Open API requests server-side with:

- `accessKey`
- `timestamp`
- `nonce`
- `sign`

Device list uses:

- `GET /iot-open/sign/device/list`

Telemetry uses:

- `GET /iot-open/sign/device/quota/all?sn=<deviceId>`

The `sn` query parameter is included in the signing string for telemetry requests.

## Normalized Edge Response

All function responses now include a safe cloud envelope:

```json
{
  "ok": true,
  "source": "ecoflow-cloud",
  "phase": "deviceList",
  "devices": []
}
```

Failures use:

```json
{
  "ok": false,
  "source": "ecoflow-cloud",
  "phase": "telemetry",
  "error": {
    "code": "ECOFLOW_DEVICE_UNAUTHORIZED",
    "message": "Safe user-readable message",
    "authRequired": true,
    "deviceUnauthorized": true,
    "retryable": false
  }
}
```

Legacy top-level `code` and `message` fields are still returned for existing callers.

## Failure Mapping

| Failure | Edge phase | Edge code | Client state |
|---|---|---|---|
| Missing Supabase env vars | `auth` | `MISSING_ECOFLOW_CREDENTIALS` | `authRequired` |
| Invalid key/signature/account/region | `deviceList` or `telemetry` | `ECOFLOW_AUTH_REQUIRED` | `authRequired` |
| Device denied by EcoFlow | `telemetry` | `ECOFLOW_DEVICE_UNAUTHORIZED` | `deviceUnauthorized` |
| EcoFlow API unreachable/rate limited/server error | `deviceList` or `telemetry` | `ECOFLOW_CLOUD_UNAVAILABLE` | `cloudUnavailable` |
| Device offline/unavailable | `telemetry` | `ECOFLOW_DEVICE_OFFLINE` | `deviceOffline` |
| Invalid/non-object device or telemetry payload | `normalize` | `ECOFLOW_NORMALIZE_ERROR` | `cloudUnavailable` |
| Cloud linked but no decoded telemetry | client poll | `NO_DECODED_TELEMETRY` | `cloudStale` |
| Polling active | client lifecycle | n/a | `cloudPolling` |

## Client Flow

The primary client path is:

1. `lib/ecoflowUnifiedScannerDiscovery.ts`
2. `src/power/cloud/providers/EcoFlowCloudProvider.ts`
3. `lib/ecoflowCloudConnection.ts`
4. `lib/ecoflowConnectionDiagnostics.ts`
5. `lib/useUnifiedDeviceConnections.ts`
6. `app/power/blu.tsx`

Cloud failures are stored per device through `EcoFlowDeviceConnectionState.cloudState`. Power Center cards use that state to show `Auth Required`, `Cloud Polling`, `Stale`, `Timeout`, or `Failed` without treating EcoFlow Cloud failures as native BLE failures.

## Secret Handling

The Edge Function does not log raw payloads and does not return EcoFlow access keys, secret keys, or signed headers. Error snippets are whitespace-normalized and redact configured secrets before returning to the client.

## Remaining Live Checks

Code-level verification passed, but hardware/account validation still requires:

- Supabase local or deployed function invocation with no EcoFlow credentials to confirm clean `authRequired`.
- Function invocation with valid EcoFlow credentials to confirm `deviceList`.
- Telemetry invocation for each known device serial to confirm whether failures are `deviceUnauthorized`, `deviceOffline`, `cloudUnavailable`, `cloudStale`, or live telemetry.
- VeePeak OBD2 live test to confirm EcoFlow cloud failures do not affect vehicle telemetry.
