# ECS Operational Weather Broker

## Authority Boundary

`lib/weatherBroker.ts` is the public weather broker facade.

- Current-position and waypoint OpenWeather requests flow through `weatherService` -> `weatherBroker` -> `weatherStore` -> `openWeatherClient`.
- Normalized NWS, OpenWeather One Call, AirNow, NASA FIRMS, WFIGS, and InciWeb observations flow through `weatherBrokerEnvironment`, which is re-exported by `weatherBroker`.
- Route-corridor sampling calls the normalized environmental broker. It must not call provider adapters directly.
- Provider adapters fetch and normalize provider data. They do not decide route risk, closures, or user-facing safety status.

Direct provider calls are allowed only inside provider adapters, edge functions, adapter fixtures, and focused provider tests.

## Data Products

The broker preserves these products as separate typed records:

- `observation`: a measured/current fact. A forecast without a current block is never promoted to an observation.
- `forecast`: a prediction with forecast-valid start/end times.
- `alert`: a provider-issued alert with authority and effective/expiry times.
- `air_quality`: an AQI or smoke observation/forecast; absence remains unavailable.
- `fire_detection`: satellite, perimeter, or incident evidence. Detection never implies a legal closure.
- `derived_route_hazard`: deterministic ECS output derived from broker facts, not a provider fact.

Every record keeps provider, authority, observed time, forecast-valid time, retrieval time, expiry, cache state, confidence, and limitations. Conflicting provider facts remain separate and receive an explicit conflict record.

Derived route segments expose `live`, `cached`, `stale`, `mixed`, or `unavailable` source state, provider IDs, and latest observation time. Stale and mixed inputs add an explicit verification reason and cap confidence; they are not silently presented as current.

## Request Policy

- Coordinate requests use a 0.05-degree bucket to suppress insignificant GPS jitter.
- Coordinate, time bucket, provider set, data-kind set, units, and fixture identity form the request key.
- Consumer/screen identity does not form the request key, so Dashboard, Navigate, Dispatch, and ECS Brief can join identical work.
- In-flight requests are single-flight and provider failures are isolated.
- Joined callers are reference-counted. One caller cancelling cannot abort work still needed by another caller.
- Provider requests have abort propagation and a bounded timeout.
- Route jobs cancel when their route/sample fingerprint changes. A stale result cannot replace newer corridor state.
- Route samples are bounded to 12 points, 500 miles, 72 forecast hours, and 24 provider calls by default. Callers may choose lower limits.

## Cache And Offline Semantics

- Broker result cache: 64 entries by default.
- Per-provider last-good cache: 128 entries by default.
- Default fresh TTL: 15 minutes.
- Default stale retention: 24 hours.
- Cache and last-good data may be exported/hydrated through the versioned persisted-state contract.
- Offline or failed refreshes preserve usable data as `cache_stale` or `last_good`; both are visibly stale.
- A provider failure never clears usable records from another provider.

OpenWeather mobile snapshots continue to use the existing persisted `weatherStore` cache. Normalized provider callers must hydrate the broker state before relying on cross-restart offline use.

## Advisories And Fire Truth

Weather advisory publication uses one bounded ledger. Duplicate advisories are suppressed across repeated Dashboard, ECS Brief, and Dispatch publication attempts; severity escalation and meaningful changes still publish.

NASA FIRMS detections are checked for timestamp validity, expiry, age, and confidence. Stale, future-dated, missing-time, or low-confidence detections cannot independently produce a current critical result. FIRMS detections and fire perimeters remain condition evidence and never establish legal closure.

## Diagnostics

The broker exposes low-overhead counters for request count, provider calls, joins, cache hits, last-good fallback, timeout, cancellation, eviction, subscriber fan-out, and outstanding work. Provider-health output is marked `devOnly` and is intended for operator/development diagnostics, not ordinary user surfaces. Error text is credential-redacted and exact route traces are not logged.

Subscribers are notified only when source work publishes a new result. Cache reads return directly to their caller and do not fan out unchanged data.

Run:

```text
npm run test:operational-weather-environment-broker
npm run test:operational-weather-route-jobs
npm run test:operational-weather-fire-truthfulness
npm run test:operational-weather-performance
```

The performance command emits JSON. A representative deterministic CI fixture reduced 20 direct provider calls to 1 brokered call (95%); 40 logical requests produced 1 provider call with a 97.5% join/cache avoidance rate. A 5,000-point route was bounded to 10 samples and 10 provider calls in that run. These are CI fixture measurements, not device frame-rate, memory, radio, or battery claims.

## Rollout And Evidence

`weather_route_intelligence` remains beta and default-enabled. It allows degraded cached/unavailable behavior and uses `EXPO_PUBLIC_ECS_KILL_WEATHER_INTELLIGENCE` as its kill switch. The production readiness gate remains `gate:weather-production`.

Production approval still requires real-provider source/freshness/error evidence, Android route-weather visual QA, alert-to-Dispatch/ECS-Brief end-to-end evidence, offline/stale device QA, and owner acceptance. Supported Android and iOS devices still require profiling for frame time, memory, GPS/radio wakeups, background behavior, and battery impact.
