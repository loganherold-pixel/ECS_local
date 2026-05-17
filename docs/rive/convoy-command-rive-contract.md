# Convoy Command Rive Contract

## Asset

- Repo asset path: `assets/rive/ConvoyCommand.riv`
- Source file copied from: `C:\Users\logan\Downloads\ConvoyCommand.riv`
- SHA-256 verified identical after copy.
- Artboard size: `960 x 640`

## Existing ECS Rive Runtime Patterns

- `components/dashboard/PowerModuleRiveWidget.tsx` uses `@rive-app/react-webgl2` on web, resolves a Metro-bundled `.riv` asset first, and uses a public fallback path.
- `components/dashboard/PowerModuleRiveWidget.native.tsx` and `components/dashboard/RouteGuidanceProgressRive.native.tsx` lazy-load `@rive-app/react-native` outside Expo Go, load bundled `.riv` assets with `useRiveFile`, and bind runtime values through view models.
- Current ECS Rive files prefer static `require(...)` asset references so Metro includes the binary in native builds.

## Discovered Rive File Contract

Inspected with the installed `@rive-app/webgl2` runtime against `assets/rive/ConvoyCommand.riv`.

### Artboards

| Index | Name | Size | Notes |
| --- | --- | --- | --- |
| 0 | `ConvoyCommand` | `960 x 640` | Default/only artboard. |

### State Machines

| Artboard | Index | Name | Input count |
| --- | --- | --- | --- |
| `ConvoyCommand` | 0 | `ConvoyCommand` | 0 |

### State Machine Inputs

No state-machine inputs are exposed. The expected `state`, `lostUnitIndex`, and `cautionLevel` controls are not state-machine inputs in this file.

### View Models

| Index | Name | Property count | Instance count |
| --- | --- | ---: | ---: |
| 0 | `ConvoyCommand` | 17 | 7 |

View model instances:

- `_legacy_Instance`
- `Instance`
- `Alert_v2`
- `Offline_v2`
- `_deprecated_Offline`
- `Default`
- `_deprecated_Alert`

Use `Instance` or `Default` for app-side binding. Avoid `_legacy_*` and `_deprecated_*` instances for new UI work.

### View Model Properties

| Name | Type | Recommended app-side source |
| --- | --- | --- |
| `acknowledged` | boolean | Explicit user/system acknowledgement only. Default `false`. |
| `cautionLevel` | number | Deterministic convoy status severity: `0` none, `1` caution, `2` urgent. |
| `copperAlert` | color | Theme/design color. Do not bind to convoy data. |
| `copperCritical` | color | Theme/design color. Do not bind to convoy data. |
| `gapWarning` | boolean | Deterministic gap threshold result when convoy spacing data exists. |
| `goldBright` | color | Theme/design color. Do not bind to convoy data. |
| `goldDim` | color | Theme/design color. Do not bind to convoy data. |
| `goldPrimary` | color | Theme/design color. Do not bind to convoy data. |
| `inkPanel` | color | Theme/design color. Do not bind to convoy data. |
| `leadPosition` | number | Normalized lead/progress position if available. Keep explicit when estimated/missing. |
| `lostUnitIndex` | number | `-1` for none, otherwise affected convoy member index clamped to visible convoy count. |
| `reducedMotion` | boolean | App/system reduced-motion preference. |
| `regroupSuggested` | boolean | Deterministic regroup recommendation only. Do not infer from animation state. |
| `signalQuality` | number | Normalized signal confidence/quality, expected `0..1`. `0` means no signal. |
| `state` | number | Deterministic convoy state code. See mapping below. |
| `topoLine` | color | Theme/design color. Do not bind to convoy data. |
| `vehicleCount` | number | Visible convoy member count when known. Avoid fake counts. |

### Text Fields

No settable text runs were discovered through runtime probing of candidate names. The binary contains internal strings such as `STATE_CODE`, `STATE_LABEL`, `STATE_HINT`, `LIVE`, `ESTIMATED`, `PARTIAL`, `OFFLINE`, and `ALERT`, but they did not resolve as directly addressable `textRun(...)` handles during this audit.

Treat the current file as view-model driven, not text-run driven. If UI copy needs to change, render it in React Native outside the Rive asset unless the designer exposes named text runs in a future file.

## Mismatches From Expected Planning Contract

| Planned expectation | Actual file |
| --- | --- |
| Artboard likely `ConvoyCommand` | Confirmed: `ConvoyCommand`. |
| State machine likely `ConvoyCommandStateMachine` | Actual state machine is `ConvoyCommand`. |
| State-machine input `state` number | Not exposed as a state-machine input. It is a view model number property. |
| State-machine input `lostUnitIndex` number | Not exposed as a state-machine input. It is a view model number property. |
| State-machine input `cautionLevel` number | Not exposed as a state-machine input. It is a view model number property. |
| State machine has controllable inputs | Actual state machine input count is `0`. |

## Recommended App-Side Mapping

Do not wire this into Dashboard behavior until the convoy data adapter is deterministic and explicit about stale/missing/mock/manual inputs.

Recommended state mapping:

| ECS convoy status | `state` |
| --- | ---: |
| Live/current convoy data | 0 |
| Estimated/stale-but-usable position | 1 |
| Partial/degraded convoy signal | 2 |
| Offline/unavailable convoy state | 3 |
| Alert/safety-critical convoy issue | 4 |

Recommended values:

- `lostUnitIndex`: `-1` when no unit is lost; otherwise a zero-based index for the affected convoy member.
- `cautionLevel`: `0` none, `1` caution, `2` urgent.
- `signalQuality`: clamp to `0..1`; do not treat missing data as healthy.
- `vehicleCount`: use known convoy member count only. Leave conservative/default when unknown.
- `gapWarning`: set from deterministic spacing rules only.
- `regroupSuggested`: set from deterministic convoy rules only.
- `acknowledged`: set only after an explicit acknowledgement event.
- `reducedMotion`: bind from the app/system reduced-motion setting.
- Color properties: bind from ECS theme tokens only if implementation needs runtime theming; otherwise leave the Rive instance defaults.

## Implementation Notes For Future Wiring

- Native pattern should mirror `PowerModuleRiveWidget.native.tsx`: lazy-load `@rive-app/react-native`, use `useRiveFile(require('../../assets/rive/ConvoyCommand.riv'))`, bind view model `ConvoyCommand` with instance `Instance`, and write numeric/boolean properties through the view model instance.
- Web pattern, if needed, should mirror `PowerModuleRiveWidget.tsx`: use `@rive-app/react-webgl2`, a static Metro `require(...)`, and visible fallback UI while the Rive file loads.
- Do not fake convoy data to make the animation look active. Default unknown/missing convoy state should map conservatively to offline or partial according to the deterministic convoy adapter.
