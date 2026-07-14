# Smart Rally

Smart Rally is a restricted Mission Command workflow inside the existing Dispatch tab. It proposes a known ECS regroup point for operator review. It does not create roadside coordinates, send a command, replace guidance, reroute a member, publish a hazard, or contact an external service.

## Ownership

- `lib/convoy/convoyRegroupPlanner.ts` owns deterministic posture, candidate eligibility, scoring, confidence, and proposal output.
- `lib/convoy/convoyRegroupPlannerAdapter.ts` normalizes live convoy positions and locally available route, waypoint, camp, resupply, bailout, hazard, daylight, and rig context.
- `components/dispatch/ConvoyRegroupPlannerSheet.tsx` presents the proposal and its source state.
- Mission Command's existing Rally composer owns explicit command creation and delivery. Rally commands require acknowledgment by default.
- Navigate's existing linked-context handoff owns map preview and active-guidance replacement protection.

## Candidate Contract

Smart Rally can select only an existing rally point, route waypoint, verified turnaround, camp, resupply point, or bailout. Legacy staging or generic context records are not eligible until an adapter normalizes them into one of those supported classes with truthful source evidence.

The planner considers route relation, projected member arrival spread, access and stopping evidence, vehicle and trailer suitability when known, hazard conflicts, daylight margin, candidate freshness, and live-location confidence. Missing factors remain visible as unknowns and lower confidence; they never become a positive safety or legal conclusion.

Restricted member locations are excluded anonymously. Stale, cached, simulated, inaccurate, offline, or unavailable positions are never treated as live inputs.

## Rollout

- Authoritative capability: `dispatch_smart_rally`
- Environment flag: `EXPO_PUBLIC_ECS_SMART_RALLY`
- Kill switch: `EXPO_PUBLIC_ECS_KILL_SMART_RALLY`
- Compatibility rollout key: `convoyRegroupPlanner`
- Default: off
- Maturity: restricted field test

Enablement fails closed unless Mission Command, authentication, Supabase, GPS, location permission, position-sharing privacy approval, and the registered multi-client/device evidence are available. The compatibility key remains so existing deployments do not acquire a second independently mutable Smart Rally flag.

Offline route and candidate context remains inspectable, but disconnected or cached member positions cannot produce a live Smart Rally proposal.
