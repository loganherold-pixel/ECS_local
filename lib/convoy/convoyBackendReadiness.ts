export type ConvoyBackendReadinessIssue =
  | 'supabase_unconfigured'
  | 'missing_migration'
  | 'schema_cache_stale'
  | 'edge_function_missing'
  | 'edge_function_secret_missing'
  | 'realtime_unavailable'
  | 'unknown';

export interface ConvoyBackendReadinessGuidance {
  issue: ConvoyBackendReadinessIssue;
  title: string;
  userMessage: string;
  operatorSteps: string[];
}

const MIGRATION_STEPS = [
  'Apply supabase/migrations/022_convoy_team_tracking.sql to the target Supabase database.',
  'Apply supabase/migrations/023_convoy_location_retention_cleanup.sql for cleanup and retention support.',
  "Reload the PostgREST schema cache with NOTIFY pgrst, 'reload schema'; or restart the Supabase API.",
];

const FUNCTION_STEPS = [
  'Deploy supabase/functions/convoy-membership to the target Supabase project.',
  'Set the CONVOY_INVITE_HASH_PEPPER Edge Function secret.',
  'Confirm the function runs with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or the ECS_* overrides documented in docs/dispatch/CONVOY_TRACKING_RLS.md.',
];

const REALTIME_STEPS = [
  'Enable Realtime/Postgres Changes for public.convoy_member_locations.',
  'Confirm public.convoy_member_locations is in the supabase_realtime publication.',
  'Confirm public.convoy_member_locations uses replica identity full so delete events include member_id.',
];

function lower(value: unknown): string {
  return String(value ?? '').toLowerCase();
}

export function convoyBackendErrorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;

  const maybe = error as {
    message?: unknown;
    details?: unknown;
    hint?: unknown;
    code?: unknown;
    status?: unknown;
    statusText?: unknown;
    context?: {
      status?: unknown;
      statusText?: unknown;
      code?: unknown;
      functionName?: unknown;
    };
  } | null;

  return [
    maybe?.message,
    maybe?.details,
    maybe?.hint,
    maybe?.code,
    maybe?.status,
    maybe?.statusText,
    maybe?.context?.status,
    maybe?.context?.statusText,
    maybe?.context?.code,
    maybe?.context?.functionName,
  ].filter((part) => part != null).map(String).join(' ');
}

export function classifyConvoyBackendReadinessIssue(error: unknown): ConvoyBackendReadinessIssue {
  const text = lower(convoyBackendErrorText(error));

  if (!text) return 'unknown';
  if (text.includes('supabase not configured') || text.includes('supabase_config_unavailable')) {
    return 'supabase_unconfigured';
  }
  if (text.includes('convoy invite hashing secret') || text.includes('convoy_invite_hash_pepper')) {
    return 'edge_function_secret_missing';
  }
  if (
    text.includes('edge_function_unavailable') ||
    text.includes('functionunavailableerror') ||
    text.includes('edge function convoy-membership is not deployed') ||
    (text.includes('convoy-membership') && text.includes('404')) ||
    (text.includes('convoy-membership') && text.includes('not found')) ||
    (text.includes('function') && text.includes('404') && text.includes('not found'))
  ) {
    return 'edge_function_missing';
  }
  if (
    (text.includes('schema cache') || text.includes('pgrst202') || text.includes('pgrst205')) &&
    (text.includes('convoy') || text.includes('claim_convoy_invite'))
  ) {
    return 'schema_cache_stale';
  }
  if (
    (text.includes('relation') && text.includes('does not exist') && text.includes('convoy')) ||
    (text.includes('undefined_table') && text.includes('convoy')) ||
    (text.includes('42p01') && text.includes('convoy'))
  ) {
    return 'missing_migration';
  }
  if (
    text.includes('realtime') ||
    text.includes('postgres changes') ||
    text.includes('supabase_realtime') ||
    text.includes('publication')
  ) {
    return 'realtime_unavailable';
  }

  return 'unknown';
}

export function getConvoyBackendReadinessGuidance(
  issue: ConvoyBackendReadinessIssue,
): ConvoyBackendReadinessGuidance {
  switch (issue) {
    case 'supabase_unconfigured':
      return {
        issue,
        title: 'Supabase not configured',
        userMessage: 'Convoy cloud features are offline because this build is not connected to Supabase. You can keep using local/manual convoy planning.',
        operatorSteps: ['Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY for this build, then sign in again.'],
      };
    case 'missing_migration':
      return {
        issue,
        title: 'Convoy schema missing',
        userMessage: 'Convoy tracking is not deployed on this backend yet. Roster and live tracking need the convoy database migrations before they can run.',
        operatorSteps: [...MIGRATION_STEPS],
      };
    case 'schema_cache_stale':
      return {
        issue,
        title: 'Supabase schema cache stale',
        userMessage: 'Convoy tracking tables or helpers are not visible through the Supabase API yet. The migration may be applied, but the API schema cache still needs a reload.',
        operatorSteps: [...MIGRATION_STEPS],
      };
    case 'edge_function_missing':
      return {
        issue,
        title: 'Convoy Edge Function missing',
        userMessage: 'Convoy invite actions are not deployed on this backend yet. Creating and joining convoys require the convoy-membership Edge Function.',
        operatorSteps: [...FUNCTION_STEPS],
      };
    case 'edge_function_secret_missing':
      return {
        issue,
        title: 'Convoy invite secret missing',
        userMessage: 'Convoy invite hashing is not configured on this backend. Invite creation and join are blocked until the server-side secret is set.',
        operatorSteps: ['Set CONVOY_INVITE_HASH_PEPPER for supabase/functions/convoy-membership.', 'Redeploy or restart the Edge Function after setting the secret.'],
      };
    case 'realtime_unavailable':
      return {
        issue,
        title: 'Convoy Realtime unavailable',
        userMessage: 'Convoy roster data loaded, but live location updates are not available. ECS will show last known or manual convoy state until Realtime is enabled.',
        operatorSteps: [...REALTIME_STEPS],
      };
    case 'unknown':
    default:
      return {
        issue: 'unknown',
        title: 'Convoy backend unavailable',
        userMessage: 'Convoy backend is not fully available right now. Existing local/manual convoy state remains usable.',
        operatorSteps: ['Check the Supabase project logs, migration status, Edge Function deployment, and Realtime publication.'],
      };
  }
}

export function formatConvoyBackendUserMessage(error: unknown): string | null {
  const issue = classifyConvoyBackendReadinessIssue(error);
  return issue === 'unknown' ? null : getConvoyBackendReadinessGuidance(issue).userMessage;
}

export function formatConvoyBackendOperatorDetails(error: unknown): string[] | null {
  const issue = classifyConvoyBackendReadinessIssue(error);
  return issue === 'unknown' ? null : getConvoyBackendReadinessGuidance(issue).operatorSteps;
}
