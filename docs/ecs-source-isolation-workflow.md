# ECS Source Isolation Workflow

Goal: preserve the current working ECS build, then reduce the local repository to files that are demonstrably part of ECS without deleting useful source by accident.

## Baseline

- Branch: `codex/UI-Polish`
- Baseline tag: `ecs-working-baseline-2026-06-01`
- Baseline commit: `7541e88` (`feat: finish prepared-device offline sign-in`)

This tag is the rollback point before any cleanup. Do not prune, move, or delete source files from the primary checkout until an isolated cleanup workspace has passed verification.

## One Workflow

1. Freeze the working build.
   - Commit all intended ECS changes.
   - Tag the commit with a dated baseline tag.
   - Run auth-focused tests, typecheck, lint, build, and smoke.

2. Create an isolated cleanup workspace.
   - Use a new branch or worktree from the baseline tag.
   - Keep the primary checkout untouched as the source of truth.

3. Build the ECS file manifest.
   - Include app entry points, Expo and Metro config, TypeScript config, package files, native Android config, Supabase schema/functions, assets referenced by source, scripts used by package.json, tests, docs required by release gates, and ECS domain modules imported by those paths.
   - Mark generated outputs, historical experiments, orphaned scripts, old captures, and unused docs as cleanup candidates only after they are not referenced by source, scripts, docs gates, or release evidence.

4. Quarantine candidates before deletion.
   - Move candidate files into a cleanup branch commit or a temporary quarantine folder outside the runtime path.
   - Do not delete secrets, provider evidence, release evidence, or native config files based only on filename age.

5. Verify after every cleanup batch.
   - Run `npm run test:auth-offline-sign-in`.
   - Run `npm run test:auth-loading-flow`.
   - Run `npm run test:auth-single-login-request`.
   - Run `npm run test:auth-startup-route-selection`.
   - Run `npm run test:auth-production`.
   - Run `npm run typecheck`.
   - Run `npm run lint`.
   - Run `npm run build`.
   - Run `npm run smoke`.

6. Delete only after verification.
   - If a batch passes, keep the deletion commit small and named by area.
   - If a batch fails, restore that batch from the baseline tag and split it into smaller candidates.

## Cleanup Rules

- Never delete from the primary checkout first.
- Never use `git reset --hard` as a cleanup tool.
- Never remove mobile, Supabase, provider, release, or evidence files until their role is understood.
- Prefer many small cleanup commits over one broad purge.
- Treat Git object cleanup (`git gc`, `git prune`) as separate repository housekeeping, not ECS source cleanup.

## Done Criteria

- The isolated cleanup branch builds from a fresh clone or clean worktree.
- Auth, startup, typecheck, lint, build, and smoke commands pass.
- Removed files are documented by batch and can be restored from the baseline tag.
- The remaining tree has a clear manifest of active ECS app, provider, native, test, docs, and release assets.
