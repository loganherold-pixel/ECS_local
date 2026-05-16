/* eslint-disable import/no-unresolved */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createReservationProviderSyncHandler } from '../_shared/campgroundReservationProviderSync.ts';

serve(createReservationProviderSyncHandler({
  providerId: 'aspira',
  displayName: 'Aspira',
  defaultBaseUrl: 'https://api.aspira.com',
  requiredSecretRefs: ['ASPIRA_API_KEY'],
  buildAuthHeaders: (secrets) => ({
    'X-API-Key': secrets.ASPIRA_API_KEY,
  }),
}));
