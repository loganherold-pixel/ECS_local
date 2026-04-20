/* eslint-disable import/no-unresolved */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getMapboxToken(): string | null {
  const candidates = [
    Deno.env.get('MAPBOX_ACCESS_TOKEN'),
    Deno.env.get('EXPO_PUBLIC_MAPBOX_TOKEN'),
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().startsWith('pk.')) {
      return candidate.trim();
    }
  }

  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const token = getMapboxToken();
  if (!token) {
    return jsonResponse(
      {
        error: 'Mapbox token is not configured in edge function secrets',
        diagnostics: {
          expectedSecrets: ['MAPBOX_ACCESS_TOKEN', 'EXPO_PUBLIC_MAPBOX_TOKEN'],
        },
      },
      404,
    );
  }

  return jsonResponse({
    token,
    diagnostics: {
      source: token === Deno.env.get('MAPBOX_ACCESS_TOKEN') ? 'MAPBOX_ACCESS_TOKEN' : 'EXPO_PUBLIC_MAPBOX_TOKEN',
    },
  });
});
