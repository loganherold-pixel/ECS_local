import { supportsGarminOutboundCommands, type GarminInreachIntegrationConfig } from './garminInreachConfig';
import { isSosAutomationCommand, maskGarminDeviceIdentifier, stableHashGarminIdentifier } from './garminInreachAdapter';
import type { GarminInreachCommandType } from './garminInreachTypes';

export type GarminInreachIpcCommandAction =
  | 'send_text_message'
  | 'send_reference_point'
  | 'request_current_location'
  | 'start_tracking'
  | 'stop_tracking'
  | 'change_tracking_interval';

export type GarminInreachQueryAction =
  | 'query_last_known_location'
  | 'query_location_history';

export type GarminInreachCommandClientStatus =
  | 'queued_requested'
  | 'rejected'
  | 'validation_error'
  | 'rate_limited'
  | 'unauthorized'
  | 'forbidden'
  | 'transport_error'
  | 'circuit_open';

export interface GarminInreachOperatorConfirmation {
  confirmed: true;
  confirmationToken: string;
  operatorUserId: string;
  confirmedAt: string;
  source: 'operator_action';
}

export interface GarminInreachCommandContext {
  expeditionId?: string | null;
  deviceIdentifier: string;
  operatorUserId?: string | null;
  routeId?: string | null;
  messageDraftedBy?: 'operator' | 'ai_agent' | 'system' | null;
}

export interface GarminInreachCommandRequest {
  action: GarminInreachIpcCommandAction;
  context: GarminInreachCommandContext;
  confirmation?: GarminInreachOperatorConfirmation | null;
  message?: string;
  latitude?: number;
  longitude?: number;
  label?: string;
  trackingIntervalMinutes?: number;
}

export interface GarminInreachQueryRequest {
  action: GarminInreachQueryAction;
  context: GarminInreachCommandContext;
  since?: string;
  until?: string;
  limit?: number;
}

export interface GarminInreachCommandAuditRecord {
  id: string;
  action: GarminInreachIpcCommandAction | GarminInreachQueryAction;
  operatorUserId?: string | null;
  expeditionId?: string | null;
  deviceRef: {
    maskedIdentifier: string;
    identifierHash: string;
  };
  requestedAt: string;
  resultStatus: GarminInreachCommandClientStatus;
  httpStatus?: number | null;
  warning: string;
  details?: Record<string, unknown>;
}

export interface GarminInreachCommandAuditSink {
  record(record: GarminInreachCommandAuditRecord): void | Promise<void>;
}

export interface GarminInreachCircuitState {
  failureCount: number;
  openedUntil: number | null;
}

export interface GarminInreachCommandClientOptions {
  config: GarminInreachIntegrationConfig;
  fetchImpl?: typeof fetch;
  auditSink?: GarminInreachCommandAuditSink;
  circuitState?: GarminInreachCircuitState;
  now?: () => Date;
}

export interface GarminInreachCommandClientResult {
  ok: boolean;
  status: GarminInreachCommandClientStatus;
  action: GarminInreachIpcCommandAction | GarminInreachQueryAction;
  requestId: string;
  queued: boolean;
  delivered: false;
  warning: string;
  userMessage: string;
  retryAfterSeconds?: number;
  httpStatus?: number;
  validationSuggestion?: string;
  safeRequest: {
    endpoint: string;
    method: 'GET' | 'POST';
    deviceRef: {
      maskedIdentifier: string;
      identifierHash: string;
    };
  };
}

const COMMAND_CHARGE_WARNING = 'Garmin inReach command usage may incur Garmin/Iridium plan charges. Delivery is queued/requested, not confirmed delivered.';
const MAX_MESSAGE_LENGTH = 160;
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 10_000;

export function createGarminInreachCommandClient(options: GarminInreachCommandClientOptions) {
  return {
    sendShortTextMessage(input: Omit<GarminInreachCommandRequest, 'action'>) {
      return executePostCommand({ ...input, action: 'send_text_message' }, options);
    },
    sendReferencePoint(input: Omit<GarminInreachCommandRequest, 'action'>) {
      return executePostCommand({ ...input, action: 'send_reference_point' }, options);
    },
    requestCurrentLocation(input: Omit<GarminInreachCommandRequest, 'action'>) {
      return executePostCommand({ ...input, action: 'request_current_location' }, options);
    },
    startTracking(input: Omit<GarminInreachCommandRequest, 'action'>) {
      return executePostCommand({ ...input, action: 'start_tracking' }, options);
    },
    stopTracking(input: Omit<GarminInreachCommandRequest, 'action'>) {
      return executePostCommand({ ...input, action: 'stop_tracking' }, options);
    },
    changeTrackingInterval(input: Omit<GarminInreachCommandRequest, 'action'>) {
      return executePostCommand({ ...input, action: 'change_tracking_interval' }, options);
    },
    queryLastKnownLocation(input: Omit<GarminInreachQueryRequest, 'action'>) {
      return executeQuery({ ...input, action: 'query_last_known_location' }, options);
    },
    queryLocationHistory(input: Omit<GarminInreachQueryRequest, 'action'>) {
      return executeQuery({ ...input, action: 'query_location_history' }, options);
    },
  };
}

export function isGarminInreachCommandClientEnabled(config: GarminInreachIntegrationConfig): boolean {
  return supportsGarminOutboundCommands(config) &&
    !!config.secrets.ipcBaseUrl &&
    !!config.secrets.ipcApiKey;
}

export function createGarminInreachConfirmation(input: {
  operatorUserId: string;
  confirmationToken: string;
  confirmedAt?: string;
}): GarminInreachOperatorConfirmation {
  return {
    confirmed: true,
    confirmationToken: input.confirmationToken,
    operatorUserId: input.operatorUserId,
    confirmedAt: input.confirmedAt ?? new Date().toISOString(),
    source: 'operator_action',
  };
}

export function validateGarminInreachCommandMessage(message: string | undefined): { ok: true } | { ok: false; reason: string; suggestion: string } {
  const normalized = String(message ?? '').trim();
  if (!normalized) {
    return {
      ok: false,
      reason: 'Message is required.',
      suggestion: 'Add a short message before sending.',
    };
  }
  if (normalized.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      reason: `Message is ${normalized.length} characters; the limit is ${MAX_MESSAGE_LENGTH}.`,
      suggestion: `Shorten the message by ${normalized.length - MAX_MESSAGE_LENGTH} characters and try again.`,
    };
  }
  return { ok: true };
}

export function createSafeGarminInreachCommandLogPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(createSafeGarminInreachCommandLogPayload);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (/api.*key|token|secret|authorization/i.test(key)) {
        return [key, entry ? '[redacted]' : null];
      }
      if (/imei|device.*id|identifier/i.test(key) && (typeof entry === 'string' || typeof entry === 'number')) {
        return [key, maskGarminDeviceIdentifier(String(entry))];
      }
      return [key, createSafeGarminInreachCommandLogPayload(entry)];
    }),
  );
}

async function executePostCommand(
  request: GarminInreachCommandRequest,
  options: GarminInreachCommandClientOptions,
): Promise<GarminInreachCommandClientResult> {
  const deviceRef = toDeviceRef(request.context.deviceIdentifier);
  const endpoint = commandEndpoint(options.config, request.action);
  const requestId = createRequestId(request.action, request.context.deviceIdentifier, options.now?.() ?? new Date());

  const preflight = validatePostCommandPreflight(request, options, endpoint, requestId, deviceRef);
  if (preflight) {
    await audit(options, request, preflight);
    return preflight;
  }

  const result = await sendIpcRequest({
    action: request.action,
    endpoint,
    method: 'POST',
    body: commandBody(request, deviceRef, requestId),
    deviceRef,
    requestId,
  }, options);
  await audit(options, request, result);
  return result;
}

async function executeQuery(
  request: GarminInreachQueryRequest,
  options: GarminInreachCommandClientOptions,
): Promise<GarminInreachCommandClientResult> {
  const deviceRef = toDeviceRef(request.context.deviceIdentifier);
  const requestId = createRequestId(request.action, request.context.deviceIdentifier, options.now?.() ?? new Date());
  const endpoint = queryEndpoint(options.config, request);
  const disabled = disabledResultIfNeeded(options, request.action, endpoint, requestId, deviceRef);
  if (disabled) {
    await audit(options, request, disabled);
    return disabled;
  }
  const circuit = circuitOpenResult(options, request.action, endpoint, requestId, deviceRef);
  if (circuit) {
    await audit(options, request, circuit);
    return circuit;
  }

  const result = await sendIpcRequest({
    action: request.action,
    endpoint,
    method: 'GET',
    deviceRef,
    requestId,
  }, options);
  await audit(options, request, result);
  return result;
}

function validatePostCommandPreflight(
  request: GarminInreachCommandRequest,
  options: GarminInreachCommandClientOptions,
  endpoint: string,
  requestId: string,
  deviceRef: GarminInreachCommandClientResult['safeRequest']['deviceRef'],
): GarminInreachCommandClientResult | null {
  const disabled = disabledResultIfNeeded(options, request.action, endpoint, requestId, deviceRef);
  if (disabled) return disabled;

  const circuit = circuitOpenResult(options, request.action, endpoint, requestId, deviceRef);
  if (circuit) return circuit;

  if (!hasExplicitConfirmation(request.confirmation)) {
    return rejectedResult(request.action, endpoint, requestId, deviceRef, 'Commands require explicit operator confirmation before Garmin inReach submission.');
  }
  if (request.context.messageDraftedBy === 'ai_agent') {
    return rejectedResult(request.action, endpoint, requestId, deviceRef, 'AI may draft text, but a human operator must approve and submit the command.');
  }
  if (isSosAutomationCommand(commandTypeFromAction(request.action))) {
    return rejectedResult(request.action, endpoint, requestId, deviceRef, 'SOS confirm/cancel commands are blocked from automation.');
  }
  if (request.action === 'send_text_message') {
    const validation = validateGarminInreachCommandMessage(request.message);
    if (!validation.ok) {
      return {
        ...baseResult(request.action, endpoint, requestId, deviceRef),
        ok: false,
        status: 'validation_error',
        userMessage: validation.reason,
        validationSuggestion: validation.suggestion,
      };
    }
  }
  if ((request.action === 'send_reference_point') && !validCoordinate(request.latitude, request.longitude)) {
    return {
      ...baseResult(request.action, endpoint, requestId, deviceRef),
      ok: false,
      status: 'validation_error',
      userMessage: 'Reference point requires valid latitude and longitude.',
      validationSuggestion: 'Choose a valid map point and try again.',
    };
  }
  if (request.action === 'change_tracking_interval' && !validTrackingInterval(request.trackingIntervalMinutes)) {
    return {
      ...baseResult(request.action, endpoint, requestId, deviceRef),
      ok: false,
      status: 'validation_error',
      userMessage: 'Tracking interval must be between 2 and 240 minutes.',
      validationSuggestion: 'Choose a conservative interval supported by the configured IPC service.',
    };
  }
  return null;
}

async function sendIpcRequest(
  input: {
    action: GarminInreachIpcCommandAction | GarminInreachQueryAction;
    endpoint: string;
    method: 'GET' | 'POST';
    body?: Record<string, unknown>;
    deviceRef: GarminInreachCommandClientResult['safeRequest']['deviceRef'];
    requestId: string;
  },
  options: GarminInreachCommandClientOptions,
): Promise<GarminInreachCommandClientResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchWithTimeout(fetchImpl, input.endpoint, {
      method: input.method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.config.secrets.ipcApiKey ?? ''}`,
        'X-ECS-Request-Id': input.requestId,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
    });
    resetCircuit(options.circuitState);
    return resultFromResponse(response, input);
  } catch {
    registerCircuitFailure(options.circuitState);
    return {
      ...baseResult(input.action, input.endpoint, input.requestId, input.deviceRef),
      ok: false,
      status: 'transport_error',
      userMessage: 'Garmin IPC command request could not be submitted. Retry after verifying connectivity.',
    };
  }
}

function resultFromResponse(
  response: Response,
  input: {
    action: GarminInreachIpcCommandAction | GarminInreachQueryAction;
    endpoint: string;
    method: 'GET' | 'POST';
    deviceRef: GarminInreachCommandClientResult['safeRequest']['deviceRef'];
    requestId: string;
  },
): GarminInreachCommandClientResult {
  const base = baseResult(input.action, input.endpoint, input.requestId, input.deviceRef, input.method);
  if (response.ok) {
    return {
      ...base,
      ok: true,
      status: 'queued_requested',
      queued: input.method === 'POST',
      userMessage: input.method === 'POST'
        ? 'Garmin IPC request queued. Delivery is not confirmed.'
        : 'Garmin IPC query request completed.',
      httpStatus: response.status,
    };
  }
  if (response.status === 401) {
    return { ...base, ok: false, status: 'unauthorized', httpStatus: 401, userMessage: 'Garmin IPC credentials were rejected.' };
  }
  if (response.status === 403) {
    return { ...base, ok: false, status: 'forbidden', httpStatus: 403, userMessage: 'Garmin IPC command is not permitted for this account or device.' };
  }
  if (response.status === 422) {
    return {
      ...base,
      ok: false,
      status: 'validation_error',
      httpStatus: 422,
      userMessage: 'Garmin IPC rejected the command format.',
      validationSuggestion: 'Review the device, message length, coordinates, and tracking interval before retrying.',
    };
  }
  if (response.status === 429) {
    const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));
    return {
      ...base,
      ok: false,
      status: 'rate_limited',
      httpStatus: 429,
      retryAfterSeconds,
      userMessage: `Garmin IPC rate limit reached. Wait ${retryAfterSeconds ?? 60} seconds before retrying.`,
    };
  }
  return {
    ...base,
    ok: false,
    status: 'transport_error',
    httpStatus: response.status,
    userMessage: `Garmin IPC returned HTTP ${response.status}. Retry conservatively after verifying status.`,
  };
}

function disabledResultIfNeeded(
  options: GarminInreachCommandClientOptions,
  action: GarminInreachIpcCommandAction | GarminInreachQueryAction,
  endpoint: string,
  requestId: string,
  deviceRef: GarminInreachCommandClientResult['safeRequest']['deviceRef'],
): GarminInreachCommandClientResult | null {
  if (isGarminInreachCommandClientEnabled(options.config)) return null;
  return {
    ...baseResult(action, endpoint, requestId, deviceRef),
    ok: false,
    status: 'rejected',
    userMessage: 'Garmin IPC command client is disabled. Enable GARMIN_INREACH_MODE=ipc_command with IPC credentials before use.',
  };
}

function circuitOpenResult(
  options: GarminInreachCommandClientOptions,
  action: GarminInreachIpcCommandAction | GarminInreachQueryAction,
  endpoint: string,
  requestId: string,
  deviceRef: GarminInreachCommandClientResult['safeRequest']['deviceRef'],
): GarminInreachCommandClientResult | null {
  const openedUntil = options.circuitState?.openedUntil;
  const now = options.now?.().getTime() ?? Date.now();
  if (openedUntil && openedUntil > now) {
    return {
      ...baseResult(action, endpoint, requestId, deviceRef),
      ok: false,
      status: 'circuit_open',
      userMessage: 'Garmin IPC command client is temporarily paused after repeated failures. Retry later.',
      retryAfterSeconds: Math.ceil((openedUntil - now) / 1000),
    };
  }
  return null;
}

function baseResult(
  action: GarminInreachIpcCommandAction | GarminInreachQueryAction,
  endpoint: string,
  requestId: string,
  deviceRef: GarminInreachCommandClientResult['safeRequest']['deviceRef'],
  method: 'GET' | 'POST' = 'POST',
): GarminInreachCommandClientResult {
  return {
    ok: false,
    status: 'rejected',
    action,
    requestId,
    queued: false,
    delivered: false,
    warning: COMMAND_CHARGE_WARNING,
    userMessage: 'Garmin IPC command request was not submitted.',
    safeRequest: {
      endpoint,
      method,
      deviceRef,
    },
  };
}

function rejectedResult(
  action: GarminInreachIpcCommandAction,
  endpoint: string,
  requestId: string,
  deviceRef: GarminInreachCommandClientResult['safeRequest']['deviceRef'],
  userMessage: string,
): GarminInreachCommandClientResult {
  return {
    ...baseResult(action, endpoint, requestId, deviceRef),
    ok: false,
    status: 'rejected',
    userMessage,
  };
}

function commandEndpoint(config: GarminInreachIntegrationConfig, action: GarminInreachIpcCommandAction): string {
  return `${baseUrl(config)}/commands/${action.replace(/_/g, '-')}`;
}

function queryEndpoint(config: GarminInreachIntegrationConfig, request: GarminInreachQueryRequest): string {
  const url = `${baseUrl(config)}/devices/${stableHashGarminIdentifier(request.context.deviceIdentifier)}/${request.action.replace(/^query_/, '').replace(/_/g, '-')}`;
  const params = new URLSearchParams();
  if (request.since) params.set('since', request.since);
  if (request.until) params.set('until', request.until);
  if (request.limit) params.set('limit', String(request.limit));
  const query = params.toString();
  return query ? `${url}?${query}` : url;
}

function baseUrl(config: GarminInreachIntegrationConfig): string {
  return String(config.secrets.ipcBaseUrl ?? '').replace(/\/+$/, '');
}

function commandBody(
  request: GarminInreachCommandRequest,
  deviceRef: GarminInreachCommandClientResult['safeRequest']['deviceRef'],
  requestId: string,
): Record<string, unknown> {
  return {
    requestId,
    action: request.action,
    device: deviceRef,
    expeditionId: request.context.expeditionId ?? null,
    routeId: request.context.routeId ?? null,
    operatorUserId: request.confirmation?.operatorUserId ?? request.context.operatorUserId ?? null,
    confirmedAt: request.confirmation?.confirmedAt ?? null,
    message: request.message ? request.message.trim() : undefined,
    referencePoint: validCoordinate(request.latitude, request.longitude)
      ? {
          latitude: request.latitude,
          longitude: request.longitude,
          label: request.label ?? null,
        }
      : undefined,
    trackingIntervalMinutes: request.trackingIntervalMinutes ?? undefined,
    deliveryExpectation: 'queued_requested_not_delivered',
    chargeWarning: COMMAND_CHARGE_WARNING,
  };
}

async function fetchWithTimeout(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function audit(
  options: GarminInreachCommandClientOptions,
  request: GarminInreachCommandRequest | GarminInreachQueryRequest,
  result: GarminInreachCommandClientResult,
): Promise<void> {
  if (!options.auditSink) return;
  await options.auditSink.record({
    id: result.requestId,
    action: request.action,
    operatorUserId: 'confirmation' in request ? request.confirmation?.operatorUserId ?? request.context.operatorUserId : request.context.operatorUserId,
    expeditionId: request.context.expeditionId,
    deviceRef: result.safeRequest.deviceRef,
    requestedAt: options.now?.().toISOString() ?? new Date().toISOString(),
    resultStatus: result.status,
    httpStatus: result.httpStatus ?? null,
    warning: result.warning,
    details: createSafeGarminInreachCommandLogPayload({
      action: request.action,
      endpoint: result.safeRequest.endpoint,
      hasApiKey: !!options.config.secrets.ipcApiKey,
      userMessage: result.userMessage,
      retryAfterSeconds: result.retryAfterSeconds ?? null,
      validationSuggestion: result.validationSuggestion ?? null,
    }) as Record<string, unknown>,
  });
}

function hasExplicitConfirmation(value: GarminInreachOperatorConfirmation | null | undefined): value is GarminInreachOperatorConfirmation {
  return !!value &&
    value.confirmed === true &&
    value.source === 'operator_action' &&
    typeof value.operatorUserId === 'string' &&
    value.operatorUserId.trim().length > 0 &&
    typeof value.confirmationToken === 'string' &&
    value.confirmationToken.trim().length >= 8;
}

function commandTypeFromAction(action: GarminInreachIpcCommandAction): GarminInreachCommandType {
  switch (action) {
    case 'send_text_message':
    case 'send_reference_point':
      return 'send_message';
    case 'request_current_location':
      return 'request_location';
    case 'start_tracking':
    case 'stop_tracking':
    case 'change_tracking_interval':
      return 'set_tracking';
    default:
      return 'incident_note';
  }
}

function toDeviceRef(deviceIdentifier: string): GarminInreachCommandClientResult['safeRequest']['deviceRef'] {
  return {
    maskedIdentifier: maskGarminDeviceIdentifier(deviceIdentifier),
    identifierHash: stableHashGarminIdentifier(deviceIdentifier),
  };
}

function createRequestId(action: string, deviceIdentifier: string, now: Date): string {
  return `garmin-command-${stableHashGarminIdentifier(`${action}:${deviceIdentifier}:${now.toISOString()}`)}`;
}

function validCoordinate(latitude: unknown, longitude: unknown): boolean {
  const lat = Number(latitude);
  const lon = Number(longitude);
  return Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180;
}

function validTrackingInterval(value: unknown): boolean {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 2 && minutes <= 240;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.max(0, Math.round(numeric));
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

function registerCircuitFailure(state: GarminInreachCircuitState | undefined): void {
  if (!state) return;
  state.failureCount += 1;
  if (state.failureCount >= CIRCUIT_FAILURE_THRESHOLD) {
    state.openedUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
  }
}

function resetCircuit(state: GarminInreachCircuitState | undefined): void {
  if (!state) return;
  state.failureCount = 0;
  state.openedUntil = null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
