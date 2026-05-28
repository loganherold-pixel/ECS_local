# Native Mapbox Prep For Convoy Command

This prepares ECS for a future native Convoy Command tracker using `@rnmapbox/maps`. The package and Expo config plugin are installed, but no production screen is wired to the native map yet.

## Runtime Token

Set the public runtime token outside source control:

```bash
EXPO_PUBLIC_MAPBOX_TOKEN=pk.your-public-token
```

Do not commit real Mapbox tokens, default public tokens, secret download tokens, or `.env` files.

## Native Build Requirement

`@rnmapbox/maps` requires custom native code. Expo Go will not run this native module. Use an EAS build, development build, or local native rebuild after changing native config:

```bash
npx expo prebuild --clean
npx expo run:android
```

For EAS, configure any build-only Mapbox SDK download credentials as EAS secrets or local machine credentials. Do not place secret download tokens in `app.json`.

`@rnmapbox/maps` resolves native Android artifacts from Mapbox Maven:

```text
https://api.mapbox.com/downloads/v2/releases/maven
```

Android release builds require `MAPBOX_DOWNLOADS_TOKEN` to be available as an environment variable or Gradle property. For EAS, define `MAPBOX_DOWNLOADS_TOKEN` as a secret environment variable. The token must be a Mapbox secret token with `Downloads:Read` scope. Do not use the public `EXPO_PUBLIC_MAPBOX_TOKEN` for this value.

During Android Gradle configuration, the build prints only:

```text
Mapbox downloads token present: true
```

or:

```text
Mapbox downloads token present: false
```

If EAS shows `false`, the secret is not attached to the selected EAS environment/profile. If EAS shows `true` but Mapbox returns `403 Forbidden`, rotate the token and confirm it is a secret Mapbox token with Downloads/package read access.

## Fallback Behavior

Use `lib/mapbox/mapboxConfig.ts` before rendering a native Mapbox surface. It reports:

- `missing_token` when `EXPO_PUBLIC_MAPBOX_TOKEN` is not set.
- `invalid_token` when the value looks like a placeholder.
- `native_module_unavailable` when the native bridge is not present, such as Expo Go.
- `ready` after the public token is applied to `@rnmapbox/maps`.

Future Convoy Command UI should show an honest unavailable state for anything other than `ready`; it should not fall back to fake locations or implied live tracking.
