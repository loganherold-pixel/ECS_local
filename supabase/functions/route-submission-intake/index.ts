/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getEnvAny(names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  throw new Error(`Missing environment variable: ${names.join(' or ')}`);
}

function createAdminClient() {
  return createClient(
    getEnvAny(['ECS_SUPABASE_URL', 'SUPABASE_URL']),
    getEnvAny(['ECS_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function createUserClient(req: Request) {
  return createClient(
    getEnvAny(['ECS_SUPABASE_URL', 'SUPABASE_URL']),
    getEnvAny(['ECS_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY']),
    {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization') ?? '',
        },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

function isCoordinatePair(value: unknown): value is [number, number] {
  if (!Array.isArray(value) || value.length < 2) return false;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

function extractPairs(geometry: Record<string, unknown>): [number, number][] {
  if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.filter(isCoordinatePair);
  }
  if (geometry.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.flatMap((line) => Array.isArray(line) ? line.filter(isCoordinatePair) : []);
  }
  return [];
}

function validGeometry(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const geometry = value as Record<string, unknown>;
  if (geometry.type !== 'LineString' && geometry.type !== 'MultiLineString') return null;
  return extractPairs(geometry).length >= 2 ? geometry : null;
}

function centerFromGeometry(geometry: Record<string, unknown>) {
  const pairs = extractPairs(geometry);
  if (pairs.length === 0) return { latitude: null, longitude: null };
  const totals = pairs.reduce(
    (acc, pair) => ({
      longitude: acc.longitude + Number(pair[0]),
      latitude: acc.latitude + Number(pair[1]),
    }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: totals.latitude / pairs.length,
    longitude: totals.longitude / pairs.length,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'POST required' }, 405);

  try {
    const userClient = createUserClient(req);
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return jsonResponse({ ok: false, error: 'Authentication required' }, 401);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = cleanText(body.name, 120);
    const description = cleanText(body.description, 2000);
    const routeGeometry = validGeometry(body.routeGeometry ?? body.route_geometry);
    const certifies = body.certifiesRightToShare === true || body.certifies_right_to_share === true;
    const acknowledges =
      body.acknowledgesPrivateLandAndClosureReview === true ||
      body.acknowledges_private_land_and_closure_review === true;

    if (!name || !routeGeometry) {
      return jsonResponse({ ok: false, error: 'Route name and valid LineString/MultiLineString geometry are required' }, 400);
    }
    if (!certifies || !acknowledges) {
      return jsonResponse({
        ok: false,
        error: 'Route suggestions require sharing rights certification and private-land/closure review acknowledgement',
      }, 400);
    }

    const center = centerFromGeometry(routeGeometry);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('route_community_submissions')
      .insert({
        submitted_by: userData.user.id,
        name,
        description,
        route_geometry: routeGeometry,
        center_latitude: center.latitude,
        center_longitude: center.longitude,
        distance_miles: Number.isFinite(Number(body.distanceMiles ?? body.distance_miles))
          ? Number(body.distanceMiles ?? body.distance_miles)
          : null,
        vehicle_fit: Array.isArray(body.vehicleFit ?? body.vehicle_fit)
          ? (body.vehicleFit ?? body.vehicle_fit)
          : null,
        certifies_right_to_share: true,
        acknowledges_private_land_and_closure_review: true,
        privacy_sanitized: true,
        review_status: 'pending_review',
        verification_status: 'not_started',
      })
      .select('id, review_status, verification_status, created_at')
      .single();

    if (error) throw new Error('Unable to save route suggestion.');

    return jsonResponse({
      ok: true,
      submission: data,
      message: 'Route suggestion saved privately for ECS review. It is not public or recommended until deterministic source checks pass.',
    }, 201);
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Route submission intake failed.',
    }, 500);
  }
});
