/* eslint-disable import/no-unresolved */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createReservationProviderSyncHandler } from '../_shared/campgroundReservationProviderSync.ts';

serve(createReservationProviderSyncHandler({
  providerId: 'reserveamerica',
  displayName: 'ReserveAmerica',
  defaultBaseUrl: 'https://api.reserveamerica.com',
  requiredSecretRefs: ['RESERVEAMERICA_API_KEY'],
  buildAuthHeaders: (secrets) => ({
    'X-API-Key': secrets.RESERVEAMERICA_API_KEY,
  }),
}));
