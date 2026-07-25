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
- The v2 synthetic region is a deterministic land grid centered at `38.5, -115.5`; it is not derived from device or user data and does not represent a real trail catalog.
- The QA metadata label is `ROUTE DISCOVERY QA — SYNTHETIC NON-PRODUCTION — LOCAL SYNTHETIC FIXTURES` and is mounted above authentication so it remains visible from login through Explore and Trip Builder.
- Persisted production search filters do not hydrate into this profile, and QA filter changes are not written into the production filter snapshot.
- Before the normal auth/route policy mounts, a finite QA gate hydrates the canonical vehicle stores and installs exactly one local profile: `qa-route-discovery-vehicle` / `QA SYNTHETIC 4X4`.
- The synthetic vehicle uses fixed generic truck, 4x4, fuel-range, weight, clearance, tire, and lift values. It has no VIN, plate, user owner, device identity, OBD identity, Bluetooth identity, provider record, or real vehicle make/model/year.
- Vehicle records, vehicle specs, tires/lift, active-vehicle state, and setup completion use the `ecs_route_discovery_qa__` native-file namespace (and `ecs:route-discovery-qa:` web-key namespace). Unrelated session/offline caches keep their existing behavior.
- QA bootstrap calls replace only the isolated local vehicle snapshot. Vehicle cloud synchronization returns without work in this profile, and an invalid/non-isolated QA profile fails closed instead of entering production onboarding.
- The normal distribution-entry resolver runs only after the QA vehicle, active ID, onboarding flag, and setup-complete vehicle ID have been verified. No generic setup or route-policy bypass exists.

The QA and field-test artifacts retain the same Android application ID. Install them sequentially and record the APK hash, embedded-JS hash, profile, commit, and build fingerprint before each run. Do not invent a second public application identity.

## Deterministic scenarios

The QA transport provides at least 26 qualifying synthetic summaries inside 100 miles and at least four more outside 100 miles but inside 500 miles. It also includes duplicate-source, pending-review, non-recommendable, restricted-access, missing/swapped-center, missing-geometry, and out-of-region records. Production normalization and validation select the authoritative top 20 unique public recommendations and reject continuation metadata. The radius badge and empty state use the final visible-card projection, so the displayed count cannot diverge from the rendered QA card list.

The transport emits bounded privacy-safe stage diagnostics for fixture creation, provider normalization, access/review/recommendation/verification gates, QA region resolution, radius and viewport filtering, category and refinement filtering, deduplication, ranking, result capping, availability classification, visible-card projection, and list commit. Events contain counts, region identifiers, radius categories, fingerprints, and exclusion-reason counts, but no coordinates or credentials.

Automated acceptance additionally drives controlled deferred transports directly through the production coordinator to prove active-request sharing, fingerprint isolation, stale success/failure ordering, last-good cache preservation, access-partition isolation, suspension/unmount invalidation, one foreground revalidation, malformed-envelope rejection, cap/deduplication, and summary-first navigation ordering.

## Build commands

```powershell
npm run test:explore-client-orchestration-acceptance
npm run test:route-discovery-qa-profile
npm run test:route-discovery-qa-vehicle-bootstrap
npm run test:explore-route-discovery-qa-physical-prerequisites
npm run android:route-discovery-qa
```

Do not treat the QA APK as live-backend evidence. The normal `fieldtest` profile remains the production-backend integration artifact, with QA transport disabled.
