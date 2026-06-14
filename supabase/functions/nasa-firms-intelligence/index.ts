/* eslint-disable import/no-unresolved */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  NASA_FIRMS_DATA_AVAILABILITY_TTL_SECONDS,
  NasaFirmsMemoryCache,
  buildNasaFirmsDataAvailabilityUrl,
  buildNasaFirmsEdgeConfig,
  buildNasaFirmsHealth,
  buildNasaFirmsMapKeyStatusUrl,
  buildNasaFirmsRequest,
  normalizeNasaFirmsDetections,
  parseNasaFirmsCsv,
  processNasaFirmsWildfireSignals,
  redactNasaFirmsUrl,
  sanitizeNasaFirmsError,
} from '../_shared/nasaFirms.ts';

type RequestBody = {
  action?: 'health' | 'map_key_status' | 'data_availability' | 'area' | string;
  area?: string;
  source?: string;
  dayRange?: number;
  date?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const cache = new NasaFirmsMemoryCache();

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getFirmsConfig() {
  return buildNasaFirmsEdgeConfig((name) => Deno.env.get(name));
}

async function fetchTextWithCache(cacheKey: string, url: string, ttlSeconds: number, apiKey: string | null): Promise<{
  text: string;
  cacheStatus: 'hit' | 'miss';
}> {
  const cached = cache.get<string>(cacheKey);
  if (cached != null) return { text: cached, cacheStatus: 'hit' };

  const response = await fetch(url, {
    headers: {
      Accept: 'text/csv, text/plain, application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`NASA FIRMS request failed ${response.status}: ${redactNasaFirmsUrl(response.url, apiKey)}`);
  }
  const text = await response.text();
  cache.set(cacheKey, text, ttlSeconds);
  return { text, cacheStatus: 'miss' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const config = getFirmsConfig();
  const now = new Date();

  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const action = String(body.action ?? 'area');
    const baseHealth = buildNasaFirmsHealth(config, { now });

    if (action === 'health') {
      return jsonResponse({ ok: true, health: baseHealth });
    }

    if (!config.enabled || config.missingEnv.length > 0) {
      return jsonResponse({
        ok: false,
        health: baseHealth,
        error: baseHealth.lastError ?? 'NASA FIRMS is disabled.',
      }, config.enabled ? 500 : 200);
    }

    if (action === 'map_key_status') {
      const url = buildNasaFirmsMapKeyStatusUrl(config);
      const { text, cacheStatus } = await fetchTextWithCache('nasa_firms:map_key_status', url, 15 * 60, config.apiKey);
      return jsonResponse({
        ok: true,
        cacheStatus,
        health: buildNasaFirmsHealth(config, {
          now,
          authenticated: true,
          lastAuthCheckAt: now.toISOString(),
        }),
        statusText: redactNasaFirmsUrl(text.slice(0, 500), config.apiKey),
      });
    }

    if (action === 'data_availability') {
      const url = buildNasaFirmsDataAvailabilityUrl(config);
      const { text, cacheStatus } = await fetchTextWithCache(
        'nasa_firms:data_availability:all',
        url,
        NASA_FIRMS_DATA_AVAILABILITY_TTL_SECONDS,
        config.apiKey,
      );
      return jsonResponse({
        ok: true,
        cacheStatus,
        health: buildNasaFirmsHealth(config, {
          now,
          authenticated: true,
          lastAuthCheckAt: now.toISOString(),
          lastFetchAt: now.toISOString(),
        }),
        csv: text,
      });
    }

    if (action === 'area') {
      const request = buildNasaFirmsRequest(config, {
        area: body.area,
        source: body.source,
        dayRange: body.dayRange,
        date: body.date,
      });
      const { text, cacheStatus } = await fetchTextWithCache(request.cacheKey, request.url, request.ttlSeconds, config.apiKey);
      const rows = parseNasaFirmsCsv(text);
      const signals = normalizeNasaFirmsDetections(rows, { now, source: request.source });
      const intelligence = processNasaFirmsWildfireSignals(signals, { now });
      return jsonResponse({
        ok: true,
        cacheStatus,
        health: buildNasaFirmsHealth(config, {
          now,
          authenticated: true,
          lastAuthCheckAt: now.toISOString(),
          lastFetchAt: now.toISOString(),
          lastProcessedAt: now.toISOString(),
          lastRecordCount: rows.length,
        }),
        source: request.source,
        area: request.area,
        dayRange: request.dayRange,
        date: request.date,
        recordCount: rows.length,
        signals,
        intelligence,
      });
    }

    return jsonResponse({ ok: false, error: 'Unsupported NASA FIRMS action.' }, 400);
  } catch (error: any) {
    return jsonResponse({
      ok: false,
      health: buildNasaFirmsHealth(config, {
        now,
        lastError: sanitizeNasaFirmsError(error?.message ?? 'NASA FIRMS request failed.', config.apiKey),
      }),
      error: sanitizeNasaFirmsError(error?.message ?? 'NASA FIRMS request failed.', config.apiKey),
    }, 500);
  }
});
