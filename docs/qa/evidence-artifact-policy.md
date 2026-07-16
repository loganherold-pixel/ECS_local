# ECS QA Evidence Artifact Policy

Last reviewed: 2026-07-13

## Current Inventory

| Location | Git state | Files | Approx size | Main file types | Current purpose |
| --- | --- | ---: | ---: | --- | --- |
| `.qa/` | partially tracked; future files ignored by policy | 243 local, 204 tracked | 110 MB | XML, PNG, TXT, LOG, JSON | Badge identity and Convoy native QA evidence |
| `qa-evidence/` | partially tracked; future files ignored by policy | 160 local, 142 tracked | 159 MB | XML, PNG, TXT, LOG, JSON | Active Trip and Offline Incident Packet native QA evidence |
| `.smoke/` | ignored | 1,572 local, 0 tracked | 1.24 GB | PNG, XML, TXT, LOG, HTML, JSON | Smoke-test runtime output |
| `artifacts/` | ignored | 1,983 local, 0 tracked | 3.24 GB | APK, PNG, XML, TXT, SO, LOG | Build artifacts and older Android smoke captures |

Tracked evidence currently includes 118 PNG screenshots, 124 UI XML dumps, 97 TXT files, 35 log/logcat files, and 7 JSON summaries under `.qa/` and `qa-evidence/`.

## Policy

### Uploaded verification artifacts

Verification uploads are schema-versioned, structured metadata only. The approved schemas are:

- `ecs.verification-lane-artifact.v5`: lane identity/outcome, executed scenario coverage, production-approval state, bounded check diagnostics, typed process-failure class, blocker IDs, duration, allowlisted timing comparisons, approved-baseline state, safe provenance, and allowlisted commit/migration-bound pgTAP evidence metadata. Raw TAP output is omitted.
- `ecs.verification-inventory-artifact.v3`: package/check identities, qualified behavioral test identities, planned declaration coverage, conservative execution classification, and counts. Raw package commands and target paths are omitted.
- `ecs.verification-provenance-artifact.v2`: stable command, workspace, and artifact identities plus file count, byte count, SHA-256, and safe CI identity. Raw command text and artifact paths are omitted.
- `ecs.verification-timings-artifact.v3`: stable package-qualified timing identities and at most 20 successful duration samples. This job-local file is diagnostic only.
- `ecs-verification-timing-baseline-v1`: reviewed per-check statistics and comparable runtime identity. The checked-in approved baseline is authoritative; scheduled candidates are review-only and cannot update it automatically.

Unstructured summaries are sanitized and bounded before disk writes. Structured diagnostics reject unknown fields. Restricted coordinates, geometry, traces, provider/auth payloads, credentials, contacts, device identifiers, command lines, and private paths are redacted or omitted recursively. Unexpected unserializable values become `[omitted_unserializable]`.

| Audience | Retention | Allowed upload posture |
| --- | ---: | --- |
| Pull request | 5 days | Inventory, lane, summary, timings |
| Scheduled CI | 7 days | Lane, summary, timings, sanitized provenance |
| Release candidate | 14 days | Lane, summary, timings, sanitized provenance |
| Restricted field test | 3 days | Lane/summary/timings and digest-only provenance |

These uploaded artifacts are not approved containers for real field data. Raw field screenshots, logs, device captures, provider payloads, routes, and location evidence remain local or in privacy-approved controlled storage. A digest proves artifact identity only; it does not make the underlying artifact upload-safe.

Commit:
- Concise QA summary markdown under `docs/qa/`.
- Small sanitized command-result JSON only when it gives durable review value.
- Curated screenshots only when a reviewer genuinely needs the visual proof and the image is checked for sensitive data.

Do not commit by default:
- Raw logcat dumps.
- Metro logs.
- Large screenshot batches.
- UI hierarchy XML dumps.
- APKs, bundles, build outputs, smoke output folders, or generated media batches.
- Raw device data, raw Bluetooth payloads, precise location traces, convoy membership dumps, account identifiers, tokens, or provider payloads.

Keep local or external:
- Full native QA capture folders.
- Large screenshot/log bundles.
- Field-device hardware evidence that contains identifiers or location.
- Crash/log bundles needed for debugging.

Summarize into markdown:
- Branch and commit tested.
- Device, platform, and app build.
- Scenario list with pass/fail.
- Key commands run and their results.
- Known caveats and gated systems.
- Local or external evidence pointer, if retained outside git.

## Sensitivity Findings

Representative scans of `.qa/` and `qa-evidence/` found raw evidence that can contain:
- Device/platform identifiers, including Android device details.
- Route/trip names and native UI text.
- Vehicle and Fleet surface text.
- Convoy fixture participant/status text.
- Location-related UI/log wording and route context.
- Token-like strings in raw logcat files.

Do not print suspected secrets or token-like values in review output. If a raw evidence file must be retained, redact or move it to controlled external storage.

## Git Cleanup Plan

The policy now ignores new `.qa/` and `qa-evidence/` artifacts, but already tracked files remain tracked until removed from the index.

Recommended cleanup commands, preserving local files:

```powershell
git rm --cached -r .qa
git rm --cached -r qa-evidence
git add .gitignore docs/qa/evidence-artifact-policy.md docs/qa/product-spine-qa-summary.md
git status --short
```

Do not delete local evidence folders unless an explicit retention decision has been made.

