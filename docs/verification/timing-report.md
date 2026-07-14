# ECS Verification Timing Baseline

Date: 2026-07-13

## Enforcement Model

`config/verification-timing-baseline.json` is the only authoritative per-check timing baseline. It is checked into the repository, schema validated, reviewed like code, and never updated automatically by a pull request or scheduled job.

Each baseline entry is keyed by the stable package-qualified timing identity, such as `root::build` or `apps/web::typecheck`, plus its check ID, package, workspace, script, working directory, and comparable runtime identity. A renamed check or a same-named script in another package cannot inherit an unrelated baseline.

The baseline contract is `ecs-verification-timing-baseline-v1`. It retains at most 20 accepted samples per check and records:

- sample count
- bounded duration samples
- median (p50)
- p95
- last accepted duration
- baseline version and source
- runtime provider, platform, architecture, and Node major version

The current approved baseline is version `2026-07-13.1`. Its entry list is intentionally empty because no comparable GitHub Actions Linux timing set has been reviewed yet. Consequently, the current 25 PR checks, 53 nightly checks, and 58 release-candidate checks are reported as `provisional` when evaluated against this baseline. They are not silently described as compliant.

## Regression Decision

The default robust allowance is the greatest of:

```text
median + 1,000 ms
median * 1.50
p95 * 1.25
```

Checks need at least three accepted samples before timing can fail a lane. Per-check policy may override the minimum sample count, absolute allowance, relative percentage, p95 multiplier, and improvement threshold.

Every executed check reports one timing state:

| State | Meaning |
| --- | --- |
| `within_budget` | Established, comparable, and at or below its allowance. |
| `regressed` | Established and comparable, but above its robust allowance. |
| `improved` | Established and materially faster; the approved baseline is unchanged. |
| `provisional` | New, renamed, missing sufficient samples, or missing a non-required baseline. |
| `incomparable` | Runtime provider, platform, architecture, or Node major differs. |

An established per-check regression fails an enforcing lane even when aggregate lane wall time remains within budget. Aggregate lane budgets remain a second independent guardrail. Missing or malformed baseline data fails closed when the lane requires an approved baseline; a new check does not fail only because it lacks history.

Timing enforcement is enabled for `pr-fast`, `affected-domain`, and `release-candidate`. The release-candidate lane requires a valid approved baseline file. `full-nightly` records results and, after a successful lane only, emits a candidate baseline artifact.

## Candidate Review

The scheduled workflow writes `.smoke/verification/timing-baseline-candidate.json`. A candidate:

- is derived only from a passed lane whose code and timing gates passed
- is bound to the approved parent baseline version
- carries `source: scheduled_candidate`
- remains separate from the checked-in baseline
- does not change enforcement until reviewed and committed

After reviewing the candidate, workload changes, runtime identity, and suspicious outliers, a developer deliberately promotes it with:

```bash
npm run verification:accept-timing-baseline -- --candidate .smoke/verification/timing-baseline-candidate.json --baseline-version 2026-07-13.2
```

The command validates the candidate, requires an explicit new version, converts it to `source: approved_repository`, and writes only the policy-approved baseline path. The resulting diff must then pass normal review and be committed explicitly. CI never accepts its own timing results.

## Reporting

Lane JSON artifact schema `ecs.verification-lane-artifact.v4` carries baseline status/version/source, regression/provisional/incomparable counts, and an allowlisted comparison for every check. Human summaries show measured duration, allowance, and timing state.

`.smoke/verification/timings.json` remains a bounded job-local diagnostic cache for inventory reporting. Its current schema is `ecs.verification-timings-artifact.v3`, with read compatibility for v2. It is not authoritative for release enforcement and cannot teach a future clean CI job that a slowdown is normal.

Historical Windows measurements in earlier reports remain useful for orientation only. They are not imported into the GitHub Actions Linux baseline and do not support Android/iOS frame-rate, memory, thermal, battery, map responsiveness, BLE, OBD2, or automotive claims.

## Lane Budgets

| Lane | Wall-time budget | Per-check posture |
| --- | ---: | --- |
| `pr-fast` | 90 seconds | Enforce established comparable entries. |
| `affected-domain` | 60 seconds | Enforce established comparable entries. |
| `full-nightly` | 40 minutes | Produce a review-only candidate after success. |
| `provider-scheduled` | 30 minutes | Report timings; provider evidence remains separate. |
| `release-candidate` | 90 minutes | Enforce and require the approved baseline. |
| `manual-hardware` | 30 minutes | Manifest timing only; field execution remains external evidence. |

## Remaining Device Evidence

CI timing does not replace real Android or iOS profiling. Startup, map panning, sustained list scrolling, memory, thermal behavior, battery drain, background navigation, BLE/OBD reconnect, and automotive update cadence still require representative physical-device measurements and approved field evidence.
