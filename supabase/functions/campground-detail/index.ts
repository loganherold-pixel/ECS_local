/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  buildCampgroundDetailResponse,
  type CampgroundAvailabilityRow,
  type CampgroundDbRow,
  type CampgroundSourceSummaryRow,
} from '../_shared/campgroundApi.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function cleanId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

const admin = createClient(getEnv('ECS_SUPABASE_URL'), getEnv('ECS_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function requestId(req: Request): Promise<string | null> {
  const url = new URL(req.url);
  const queryId = cleanId(url.searchParams.get('id'));
  if (queryId) return queryId;
  if (req.method !== 'POST') return null;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return cleanId(body.id);
}

async function fetchCampground(id: string): Promise<CampgroundDbRow | null> {
  const { data, error } = await admin
    .from('campgrounds')
    .select('id, name, latitude, longitude, facility_type, managing_agency, managing_org, reservation_url, detail_url, status, availability_status, site_count, site_types, amenities, source_confidence, primary_provider, attribution, last_synced_at, last_verified_at, last_availability_checked_at')
    .eq('id', id)
    .neq('status', 'removed')
    .maybeSingle();

  if (error) throw new Error('Unable to read campground detail.');
  return data ? (data as CampgroundDbRow) : null;
}

async function fetchSources(id: string): Promise<CampgroundSourceSummaryRow[]> {
  const { data, error } = await admin
    .from('campground_source_records')
    .select('provider_id, provider_record_id, source_url, payload_hash, first_seen_at, last_seen_at')
    .eq('campground_id', id)
    .order('provider_id', { ascending: true });

  if (error) throw new Error('Unable to read campground source summaries.');
  return Array.isArray(data) ? (data as CampgroundSourceSummaryRow[]) : [];
}

async function fetchAvailability(id: string): Promise<CampgroundAvailabilityRow[]> {
  const { data, error } = await admin
    .from('campground_availability')
    .select('campground_id, provider_id, date, availability_status, available_site_count, reservable, first_come_first_served, last_checked_at, expires_at')
    .eq('campground_id', id)
    .order('last_checked_at', { ascending: false });

  if (error) throw new Error('Unable to read campground availability.');
  return Array.isArray(data) ? (data as CampgroundAvailabilityRow[]) : [];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') return jsonResponse({ ok: false, error: 'GET or POST required' }, 405);

  try {
    const id = await requestId(req);
    if (!id) return jsonResponse({ ok: false, error: 'Valid campground id required' }, 400);

    const campground = await fetchCampground(id);
    if (!campground) return jsonResponse({ ok: false, error: 'Campground not found' }, 404);

    const [sources, availability] = await Promise.all([
      fetchSources(id),
      fetchAvailability(id),
    ]);

    return jsonResponse({
      ok: true,
      ...buildCampgroundDetailResponse(campground, sources, availability, new Date()),
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Campground detail failed.',
    }, 500);
  }
});
