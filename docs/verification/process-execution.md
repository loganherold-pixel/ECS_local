# Verification Process Execution

ECS verification commands run through `verification-process-runner.mjs`. The runner uses executable and argument arrays with `shell: false`; Node package scripts that can be resolved directly use `process.execPath`. It never stores raw commands or argument arrays in uploaded artifacts.

## Failure classes

- `application_build_failure`: the child started and exited nonzero. This includes compile, type, test, assertion, and build failures.
- `verification_wrapper_failure`: the wrapper invocation is invalid, the executable is missing, the process is cancelled, or the child is terminated by a signal.
- `environment_process_spawn_restriction`: process creation itself failed with `spawn EPERM`.
- `permission_failure`: execution or a required local operation failed with `EACCES` or a non-spawn `EPERM`.
- `timeout`: the bounded execution window elapsed.

Every class is an internal verification failure. None becomes `passed` or `blocked_external`. Local environments that prohibit child processes cannot certify the web build; release evidence must come from the required GitHub lane for the exact candidate commit.

The real `apps/web::build` check invokes the installed Next CLI and runs the complete production `next build`. TypeScript-only, source-contract, manual Git assertions, and partial build substitutes do not satisfy it.

## Diagnostics

Process results retain the stable command/check ID, status, failure class, safe code, duration, exit code, signal, and bounded sanitized output excerpts. Temporary evidence directories owned by the lane runner are removed in `finally` blocks. Raw executable paths, command strings, argument arrays, credentials, URLs, and unbounded stdout/stderr are not written to verification artifacts.
