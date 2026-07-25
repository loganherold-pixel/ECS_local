# Explore Android EAS build workflow

This document records the supported build-submission path for the two internal Explore acceptance artifacts. It changes build tooling only; it does not change application runtime behavior, Supabase configuration, or release authorization.

## Root cause and retired architecture

The source at `55efa1b4543197bf5c62c6eb1ccbe939de49cdfa` passed application and automated acceptance, but replacement Android builds stopped before EAS upload and no hosted build ID was created.

The repository had three conflicting entry paths:

- `android:fieldtest` and `android:route-discovery-qa` invoked an unpinned globally installed EAS CLI. The installed CLI was `18.9.1`; it started project configuration, rewrote generated Expo Updates settings in `AndroidManifest.xml`, then emitted no later EAS phase or build ID before it was terminated. The generated manifest delta was restored exactly.
- `scripts/eas-cloud-build-android-apk.mjs` invoked `eas.cmd` and injected `scripts/eas-windows-spawn-shim.cjs` through `NODE_OPTIONS`. The shim replaced `child_process.spawn` process-wide, short-circuited two Expo Updates commands, and fabricated a runtime version response.
- `scripts/run-eas-fieldtest-windows.mjs` downloaded `eas-cli@latest`, searched the npm cache, and rewrote four private implementation files: `eas-cli/build/utils/expoCli.js`, `eas-cli/build/utils/expoUpdatesCli.js`, `eas-cli/build/update/android/UpdatesModule.js`, and `eas-cli/build/project/resolveRuntimeVersionAsync.js`.

The cache rewriter depended on six exact source-text signatures: the Expo CLI spawn block, its stdio guard, the Expo Updates spawn block, its error-catch block, the Android Updates modern-CLI block, and the runtime-version fallback block. EAS CLI 21 changed the Expo Updates spawn source, so the launcher failed before the EAS build command with `expected spawn block was not found`.

The old cache rewriter and process-wide spawn shim are removed. No caller now reads, patches, or validates private EAS CLI implementation source.

## Failure phase

The stale Windows cache-rewriter failed during its own pre-launch patch phase, before EAS CLI build startup.

The direct installed-CLI attempt passed CLI startup and reached Expo project configuration/native update synchronization. It stopped at the project-configuration/fingerprinting boundary before archive upload, credential resolution output, upload initialization, archive upload, hosted build creation, or a build ID. The CLI emitted no later phase line, so a narrower internal step cannot be claimed from the available evidence.

Supported `build:inspect --stage archive` now completes for both profiles, which excludes archive creation itself as the current stall source.

## Supported CLI and archive inspection

`eas.json` is the single authoritative version source and pins EAS CLI `21.0.3`. The supported runner reads that exact value and invokes `npx.cmd --yes eas-cli@21.0.3` on Windows or `npx --yes eas-cli@21.0.3` elsewhere with `shell: false` and inherited output.

Read-only archive inspection ran with EAS CLI `21.0.3` and an external npm cache/output root:

| Profile | UTC start | UTC end | Raw files | Raw bytes | Raw tree-manifest SHA-256 |
| --- | --- | --- | ---: | ---: | --- |
| `fieldtest` | 2026-07-22T18:46:03.6147421Z | 2026-07-22T18:46:31.7937899Z | 2,767 | 565,516,592 | `abbf92eb929e1c947ce75dc0a665a7f064f2d78ab12ec2a2e955f5ea0d0e4707` |
| `route-discovery-qa` | 2026-07-22T18:47:47.7135855Z | 2026-07-22T18:48:20.4569930Z | 2,767 | 565,516,592 | `45cedef7a145ee9e521d79f0298de6e913a6b09512156e8e0a584cb1ce1bb783` |

The raw tree digest is SHA-256 over sorted relative path, byte length, and file SHA-256 records. EAS CLI 21.0.3 retained 28 `.git` metadata files totaling 260,669,560 bytes in each Windows inspection output; path-dependent Git metadata makes the two raw digests differ. Excluding only `.git` metadata, both profile payloads contain 2,739 files and 304,847,032 bytes with the identical content-manifest SHA-256 `5bf0ae131e9fa02480e2818fbd4b44ca1f9a17ef0cac386bbb6289b5f3c14da7`.

`node_modules`, Android build outputs, and generated-file contents were excluded. Empty `.npm-cache`, `.smoke`, and `dist` directory scaffolds remained. The only secret-shaped filename was the committed `.env.example`; no credential file was found. The largest non-Git payloads were the two expected authentication videos, Rive assets, and image assets. The source worktree remained clean, and hashes for `AndroidManifest.xml`, `app.config.js`, `app.json`, and `eas.json` were unchanged after both inspections.

Inspection output root: `C:/Users/logan/.codex/eas-inspect/20260722T184458_085Z`. It is local diagnostic output, not a hosted build or release artifact.

## Thin local build runner

The supported runner is `scripts/eas-cloud-build-android-apk.mjs`. It supports profile, platform, non-interactive mode, no-wait, clear-cache, verbose logs, build logger level, and a build message. It forwards Ctrl+C and termination signals where Node supports them, forwards the child exit code, and records a privacy-safe invocation manifest under the operating-system temp directory unless an explicit output path is supplied.

For `fieldtest`, `route-discovery-qa`, and `production`, the runner requires:

- a clean local worktree;
- the local SHA to equal the live `origin` branch head;
- the local SHA to equal the current PR head.

The manifest contains only Git SHA, clean/dirty state, profile, platform, EAS CLI version, start/end time, and exit code. It never records environment values, credentials, signing material, upload URLs, or the build-message text.

Examples:

```powershell
npm run android:fieldtest -- --non-interactive --no-wait --verbose-logs --build-logger-level trace --message "Explore acceptance Artifact A"
npm run android:route-discovery-qa -- --non-interactive --no-wait --verbose-logs --build-logger-level trace --message "Explore acceptance Artifact B"
```

## Manual exact-ref workflow

`.eas/workflows/explore-android-acceptance.yml` is manual-only. It has no push, pull-request, or schedule trigger. Artifact A builds `fieldtest` first; Artifact B depends on Artifact A and therefore cannot start after an Artifact A job failure. Both jobs run from the same workflow ref and use profiles committed in `eas.json`. The workflow has no submit, store, Supabase, database, deployment, promotion, or release job.

To run from an exact pushed commit without packaging or uploading the local Windows worktree:

```powershell
$ResolvedEasVersion = (Get-Content -Raw eas.json | ConvertFrom-Json).cli.version
$ExactPushedSha = git rev-parse HEAD
npx --yes "eas-cli@$ResolvedEasVersion" workflow:run .eas/workflows/explore-android-acceptance.yml --ref $ExactPushedSha --non-interactive --no-wait
```

EAS CLI documents that `workflow:run --ref` fetches the workflow from the supplied Git reference instead of uploading the local project. Confirm the local, remote branch, and PR heads match before invoking it.

This workflow must remain manually dispatched. It does not authorize internal-live use or public production. PR #5 remains draft until separately authorized.
