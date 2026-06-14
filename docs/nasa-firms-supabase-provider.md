# NASA FIRMS Supabase Provider

NASA FIRMS is a server-side ECS 5.0 intelligence provider. NASA calls the credential a MAP_KEY, but ECS uses the runtime variable name `NASA_FIRMS_API_KEY` for provider health consistency.

## Required Supabase Edge Function Config

Set these values for the `nasa-firms-intelligence` Edge Function:

```powershell
supabase secrets set NASA_FIRMS_ENABLED=true
supabase secrets set NASA_FIRMS_API_BASE_URL=https://firms.modaps.eosdis.nasa.gov
supabase secrets set NASA_FIRMS_DEFAULT_SOURCE=VIIRS_SNPP_NRT
supabase secrets set NASA_FIRMS_DEFAULT_DAY_RANGE=1
```

Set the API key from a local shell variable so it is not pasted into scripts or docs:

```powershell
$env:NASA_FIRMS_API_KEY="<your-firms-map-key>"
supabase secrets set NASA_FIRMS_API_KEY="$env:NASA_FIRMS_API_KEY"
Remove-Item Env:\NASA_FIRMS_API_KEY
```

Do not store the real key in frontend env, Supabase tables, `.env.example`, source files, or logs.

## Function

The Edge Function is registered as `nasa-firms-intelligence` and supports:

- `health`
- `map_key_status`
- `data_availability`
- `area`

Area requests must include a bounded `west,south,east,north` area. ECS intentionally does not default to a world query because FIRMS global queries can return very large result sets.

## Secret Safety

FIRMS embeds the key in URL paths and query strings. ECS builds full request URLs only inside the Edge Function, redacts URLs before error output, and returns `apiKeyPresent: true | false` in health responses instead of the key.
