# Explore route-discovery QA acceptance

The `route-discovery-qa` EAS profile is an internal-only Android APK profile for deterministic client-orchestration checks. It uses the production Explore request builder, fingerprint, active-request registry, normalization, cache, stale guard, lifecycle handling, and summary-first Trip Builder navigation.

## Activation contract

- Both `EXPO_PUBLIC_ECS_BUILD_PROFILE=route-discovery-qa` and `EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT=true` are required at build time.
- Requesting the transport under any other profile makes Expo configuration fail.
- Production and normal `fieldtest` profiles do not define the transport flag.
- Metro resolves the QA transport import to a fail-closed stub outside the exact QA profile, excluding synthetic fixture records from production bundles.
- The QA profile removes Supabase URL/key variables before Expo configuration and Metro transformation, never calls `createClient`, and reports non-QA cloud features as unavailable.
- The transport cannot be enabled by user settings, navigation, deep links, server responses, or remote configuration.
- No Supabase service-role key, production record, private coordinate, device identity, or provider credential is present.
- The synthetic region is a deterministic lattice near `0, -140`; it is not derived from device or user data.
- The QA metadata label is `ROUTE DISCOVERY QA — SYNTHETIC NON-PRODUCTION`.

The QA and field-test artifacts retain the same Android application ID. Install them sequentially and record the APK hash, embedded-JS hash, profile, commit, and build fingerprint before each run. Do not invent a second public application identity.

## Deterministic scenarios

The QA transport provides more than 51 qualifying summaries plus duplicate, pending-review, non-recommendable, restricted-access, and invalid-geometry records. It also supports deterministic delayed-A, provider-failure, and malformed-contract paths. Production normalization and validation select at most 20 unique public recommendations and reject continuation metadata.

Automated acceptance additionally drives controlled deferred transports directly through the production coordinator to prove active-request sharing, fingerprint isolation, stale success/failure ordering, last-good cache preservation, access-partition isolation, suspension/unmount invalidation, one foreground revalidation, malformed-envelope rejection, cap/deduplication, and summary-first navigation ordering.

## Build commands

```powershell
npm run test:explore-client-orchestration-acceptance
npm run test:route-discovery-qa-profile
npm run android:route-discovery-qa
```

Do not treat the QA APK as live-backend evidence. The normal `fieldtest` profile remains the production-backend integration artifact, with QA transport disabled.
