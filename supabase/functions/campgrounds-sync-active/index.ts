/* eslint-disable import/no-unresolved */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createReservationProviderSyncHandler } from '../_shared/campgroundReservationProviderSync.ts';

serve(createReservationProviderSyncHandler({
  providerId: 'active',
  displayName: 'ACTIVE',
  defaultBaseUrl: 'https://api.amp.active.com',
  requiredSecretRefs: ['ACTIVE_API_KEY', 'ACTIVE_API_SECRET'],
  buildAuthHeaders: (secrets) => ({
    'X-API-Key': secrets.ACTIVE_API_KEY,
    'X-API-Secret': secrets.ACTIVE_API_SECRET,
  }),
}));
