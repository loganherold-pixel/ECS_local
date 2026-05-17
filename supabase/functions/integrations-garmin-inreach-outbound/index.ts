/* eslint-disable import/no-unresolved */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  handleGarminInreachOutboundWebhook,
} from "../../../lib/garmin/garminInreachOutboundWebhook.ts";
import {
  GARMIN_INREACH_ENV_KEYS,
  resolveGarminInreachConfigFromEnv,
  type GarminInreachEnv,
} from "../../../lib/garmin/garminInreachConfig.ts";

function env(): GarminInreachEnv {
  return {
    [GARMIN_INREACH_ENV_KEYS.enabled]: Deno.env.get(GARMIN_INREACH_ENV_KEYS.enabled) ?? undefined,
    [GARMIN_INREACH_ENV_KEYS.mode]: Deno.env.get(GARMIN_INREACH_ENV_KEYS.mode) ?? undefined,
    [GARMIN_INREACH_ENV_KEYS.commandsRequireConfirmation]: Deno.env.get(GARMIN_INREACH_ENV_KEYS.commandsRequireConfirmation) ?? undefined,
    [GARMIN_INREACH_ENV_KEYS.webhookStaticToken]: Deno.env.get(GARMIN_INREACH_ENV_KEYS.webhookStaticToken) ?? undefined,
    [GARMIN_INREACH_ENV_KEYS.ipcBaseUrl]: Deno.env.get(GARMIN_INREACH_ENV_KEYS.ipcBaseUrl) ?? undefined,
    [GARMIN_INREACH_ENV_KEYS.ipcApiKey]: Deno.env.get(GARMIN_INREACH_ENV_KEYS.ipcApiKey) ?? undefined,
    [GARMIN_INREACH_ENV_KEYS.kmlFeeds]: Deno.env.get(GARMIN_INREACH_ENV_KEYS.kmlFeeds) ?? undefined,
    [GARMIN_INREACH_ENV_KEYS.logPii]: Deno.env.get(GARMIN_INREACH_ENV_KEYS.logPii) ?? undefined,
  };
}

serve((request) => {
  return handleGarminInreachOutboundWebhook(request, {
    config: resolveGarminInreachConfigFromEnv(env()),
  });
});
