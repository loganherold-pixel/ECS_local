# ECS Release Evidence Process

Date: 2026-07-13

## Two Independent Decisions

ECS release decisions have three independent outputs:

1. Check outcomes: selected commands or workflows executed and returned valid process results.
2. `coverageChecksPassed`: authoritative executed results satisfy the scenario evidence required by that lane. PR and nightly report gaps; release candidate enforces them.
3. `productionApproval`: always `not_granted_by_code_checks` in automated lane output.

A lane may report `blocked_external` while every code check passes. That is the correct result when hardware, provider, privacy, multi-client, or owner evidence is absent. `--allow-blocked-external` permits scheduled or manual evidence collection to finish successfully while preserving the blocked status in JSON. Release-candidate promotion does not use that option.

Static capability `evidenceBlockers` entries describe possible release requirements. They are inventory metadata only. The lane's unresolved blocker list is derived exclusively from valid results emitted by evidence checks selected for that run.

## Evidence Result Contract

Every `evidence-only` policy check declares `resultContract: ecs-evidence-v1`. During a lane run, the runner provides an isolated `ECS_VERIFICATION_RESULT_FILE` and expected `ECS_VERIFICATION_CHECK_ID`. The producer writes exactly one schema-valid envelope to that file:

```json
{
  "schemaVersion": 1,
  "checkId": "android-evidence",
  "status": "blocked_external",
  "safeCode": "external_evidence_required",
  "blockerIds": ["android_device_qa_incomplete"],
  "summary": "Android QA evidence remains incomplete.",
  "commitSha": "optional-git-sha",
  "evidenceDigest": "optional-sha256",
  "diagnostics": { "artifactId": "android-qa-evidence-result", "failedCount": 1 }
}
```

The schema rejects unknown statuses, unknown safe codes, mismatched check IDs, duplicate or malformed blocker IDs, unsupported diagnostic fields, and unexpected top-level fields. `passed` and `failed` results cannot carry blocker IDs. `blocked_external` requires at least one blocker ID.

Mixed readiness producers also use explicit external-blocker allowlists. A failed code, policy, privacy, or safety contract is not converted into external evidence merely because the same producer also checks hardware or owner evidence. Unknown producer blocker IDs fail closed.

Process exit semantics are explicit:

- `0`: a valid `passed` envelope.
- `20`: a valid `blocked_external` envelope.
- `1` or any other exit, timeout, signal, stderr output, missing result, malformed JSON, or schema mismatch: `failed`.

Lane CLI exit semantics use the same values. `--allow-blocked-external` changes only the command exit from `20` to `0` for scheduled/manual reporting; the JSON lane status remains `blocked_external`. It never converts an internal failure into an external blocker.

The evidence producers still retain their direct human and legacy `--json` gate output when no lane result file is supplied. This compatibility path does not parse wording and is not used for lane classification. It can be removed after direct gate consumers migrate to the lane artifact or `ecs-evidence-v1` envelope.

## CI Lanes

| Lane | Trigger | Purpose | External evidence behavior |
| --- | --- | --- | --- |
| `pr-fast` | Pull request and main push | Lint, core TypeScript, cross-cutting behavioral contracts | Contains no evidence-only checks |
| `affected-domain` | Pull request and main push | Select behavioral checks by changed path | Unknown/global paths select every capability |
| `full-nightly` | Daily or manual | Broad domain, migration, offline, performance, and Expo export | Code lane only; no production grant |
| `provider-scheduled` | Twice weekly or manual | Provider adapters and shadow posture | Finishes with explicit external blockers where applicable |
| `release-candidate` | Manual | Full code/export plus privacy, provider, visibility, and device evidence gates | Any missing evidence blocks promotion |
| `manual-hardware` | Manual | Validate device/head-unit evidence manifests | Never claims that CI ran real hardware |
| Supabase pgTAP | Pull request, push, and required release-candidate dependency | Local database migrations and RLS behavior | Does not validate deployed production policies |

The pull-request workflow uploads a planned inventory plus an executed lane matrix, human-readable Markdown summaries, and timing samples even when a check fails. Scheduled and release workflows upload executed lane matrices and also append the summary to the GitHub job summary. Release promotion requires the reusable pgTAP job and consumes `ecs-pgtap-workflow-evidence-v1`. That envelope binds the result to the exact commit, ordered migration-set digest, schema/test configuration digest and version, explicit suite list, execution timestamp, TAP-stream digest, and evidence-envelope digest. Failed, skipped, cancelled, absent, malformed, stale-commit, stale-migration, or incomplete-suite results remain internal failures. The source/workflow contract test validates wiring only and cannot satisfy behavioral RLS coverage.

Uploaded JSON uses five explicit schemas: `ecs.verification-lane-artifact.v4`, `ecs.verification-inventory-artifact.v2`, `ecs.verification-provenance-artifact.v2`, `ecs.verification-timings-artifact.v3`, and `ecs.verification-release-evidence-artifact.v1`. Lane v4 adds allowlisted per-check timing comparisons and baseline state while retaining the commit-bound pgTAP record; it does not persist TAP output. Timings v3 keys bounded diagnostic samples by stable package-qualified timing identity. The release-evidence artifact contains only allowlisted requirement state, bindings, digests, safe references, and bounded notes. Lane and inventory artifacts distinguish declared, selected, executed, passing, and verified scenario evidence. Diagnostic fields are allowlisted by type; arbitrary result objects, stdout/stderr, commands, argument arrays, paths, provider bodies, and authentication payloads are not serialized. Human summaries are bounded to 500 sanitized characters.

Per-check release enforcement reads only the reviewed `ecs-verification-timing-baseline-v1` file at `config/verification-timing-baseline.json`. A successful nightly run may upload a `scheduled_candidate`, but CI cannot promote it. Promotion requires explicit local review, a new baseline version, and a committed diff. The job-local timing artifact remains diagnostic and cannot replace the approved baseline.

Artifact audiences fail closed and carry their policy in the envelope. Pull-request files retain for 5 days, scheduled files for 7, restricted field-test metadata for 3, and release-candidate files for 14. Workflows enumerate each uploaded file instead of uploading the complete `.smoke/verification` directory.

## Determinism

Lane processes receive:

- `CI=1`
- `TZ=UTC`
- fixed `ECS_TEST_SEED`
- fixed per-run `ECS_TEST_NOW`
- `ECS_TEST_NETWORK=disabled` for ordinary code lanes
- Expo telemetry disabled

Behavioral tests remain responsible for isolated storage, restoring patched globals, fixed coordinates, controlled clocks, seeded IDs, and provider fixtures. The inventory flags likely uncontrolled network use; it does not make an unsafe test deterministic by declaration.

## Artifact Provenance

Use the provenance command after a build or field evidence collection:

```bash
node scripts/verification/record-artifact-provenance.mjs \
  --artifact dist \
  --command-id expo-web-export \
  --artifact-id web-export \
  --artifact-kind web-export \
  --workspace-id root \
  --artifact-audience scheduled_ci \
  --output .smoke/verification/web-export-provenance.json
```

The manifest records stable command/workspace/artifact identities, byte count, file count, SHA-256, generation time, and safe CI/EAS identifiers. It omits the command text, argument list, artifact path, and arbitrary environment variables, and records `productionApproval: not_granted_by_artifact_creation`.

Workflow-dispatch artifact paths are passed through environment variables, quoted as one argument, and validated before file access. They must be existing repository-relative files with no traversal, absolute path, URI scheme, control character, symlink escape, or type mismatch. Workflow contract checks reject direct `${{ inputs.* }}` or `${{ github.event.inputs.* }}` interpolation inside every `run` block.

`--command` remains a temporary local compatibility input and is immediately converted to a one-way stable identity; it is never persisted. Workflow callers use `--command-id`. Remove the legacy option after downstream local wrappers migrate.

Build provenance proves artifact identity, not app-store acceptance, device execution, provider correctness, privacy approval, or field safety. Raw screenshots, logs, traces, provider responses, credentials, and exact restricted coordinates must not be added to tracked evidence.

## Required Evidence

The authoritative requirement and acceptance source is `config/release-evidence-registry.json`; see `docs/verification/release-evidence-registry.md`. It starts with no accepted submissions. Static documents and legacy `.smoke` artifacts do not populate it.

Legacy provider, Android, device, automotive, privacy/storage, and closed-field evidence gates remain collection-readiness diagnostics in scheduled or manual lanes. They are not selected as independent release-candidate authorities. Their output may help identify work, but only an explicitly reviewed submission in the registry can resolve a release evidence ID.

Static capability blockers describe possible requirements and never block a lane by declaration alone. Release remains blocked only when a selected typed evidence gate reports unresolved blocker IDs, or when strict executed coverage is missing or failed. External evidence still required for public production approval includes:

- Android and iOS release-build journeys, background/foreground restoration, and no-network navigation.
- Real BLE, OBD2, power provider, automotive/head-unit, and disconnect behavior.
- Real provider coverage, freshness, conflict, quota, and degraded-state evidence.
- Isolated two-identity Supabase/RLS and Dispatch realtime ordering.
- Privacy approval for restricted locations, trip traces, telemetry, support exports, and community data.
- Migration deployment and rollback rehearsal.
- Product/engineering/QA/privacy/support owner acceptance appropriate to the rollout.

Evidence manifests must identify device/build/provider, UTC capture time, artifact hash, scenario, result, reviewer, expiration where applicable, and redacted references. Missing fields remain missing; old evidence is not silently treated as current.
