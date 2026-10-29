# Bounded readiness qualification (candidate, not platform acceptance)

`.github/workflows/readiness.yml` is separate from existing CI, which is unchanged.
It proposes Ubuntu and native Windows hosted runners on Node 22, with finite
8-minute jobs. No secrets, deployments, write permissions, `pull_request_target`,
readiness skips or `continue-on-error` are used. Checkout does not retain credentials.

## Installation boundary

`npm ci --ignore-scripts` honors the existing lockfile, with lifecycle scripts
(including other native dependencies and browser downloads) disabled. The only
explicit native provisioning is the installed `prebuild-install/bin.js -r napi`,
run in the installed sqlite3 package directory with a 60-second deadline. This is
the first branch of sqlite3 5.1.7's inspected install script. It selects that
package/version's upstream N-API prebuilt; there is no source-build fallback,
ad-hoc executable, broad rebuild, or local binary copied into CI. Failure is a
qualification failure, not permission to try unrelated packaging repairs.

This upstream native asset is version-selected by the package but not independently
checksum-pinned by package-lock.json. The runtime log records the loaded native
SHA256, Node/OS/arch, Express, sqlite3 and SQLite versions. This is provenance,
not independent supply-chain authentication. Existing local author receipts show
a source build failed because Python lacked distutils, then this supported N-API
route worked on Linux. That does not prove either hosted download will succeed.

## Local isolated execution

Use an absolute, private synthetic output directory, not a source/user data path:

```sh
env -i PATH=/opt/node-runtime/bin:/usr/bin:/bin \
  HOME="$O/home" TMPDIR="$O/tmp" npm_config_cache="$O/cache" \
  TPC_RUNTIME_FIXTURE_ROOT="$O/fixtures" \
  timeout 35 node scripts/readiness-ci.cjs "$O/fixtures"

env -i PATH=/opt/node-runtime/bin:/usr/bin:/bin \
  HOME="$O/home" TMPDIR="$O/tmp" npm_config_cache="$O/cache" \
  TPC_RUNTIME_FIXTURE_ROOT="$O/fixtures" \
  timeout 15 node --test --test-timeout=10000 scripts/readiness-ci.test.cjs
```

The runner creates a unique synthetic root and a minimal child environment,
including Windows system/path variables when present. It never inherits
NODE_OPTIONS/NODE_PATH, credentials or CI/proxy variables. It runs only the two
existing test files, byte-for-byte unchanged, in a Node child with a 25-second
process deadline and 1 MiB output bound. Nonzero exits propagate; signals,
spawn/output errors and deadlines fail closed. Parent finally removes its entire
synthetic tree even after killing the child. This is not process-tree containment
for arbitrary subprocesses, and hard termination of the parent cannot guarantee
cleanup. Neither test starts MCP/provider children or the main server listener.

The original integration harness uses a Windows-compatible directory junction,
module-relative synthetic files, native SQLite and 127.0.0.1 ephemeral HTTP only.
The six startup contracts and four native integration states are not weakened.
The probe file tests allowlist behavior, actual child isolation, exit 7, a stalled
child deadline, invalid relative parent rejection and success/failure cleanup.
Additional regressions cover output overflow and signals, plus real bounded child
stdout/stderr diagnostic redaction (including a spaces/Unicode synthetic parent).
ANSI regressions cover static Windows roots and actual child stdout/stderr with
exit 13 and cleanup; these fail against the previous sanitizer. Numeric/semicolon
SGR sequences (`ESC [` followed by zero or more digits/semicolons and `m`) are
recognized only as root boundaries, retained byte-for-byte in output. This narrow
correction avoids treating the final `m` of a color prefix or the ESC of a reset
as a path character; it does not strip colors or change subprocess handling.

## Authorized-root handoff and acceptance

Only after independent review and authorization, root may push the supplied
branch or integrate its exact commit. This worker has not pushed or dispatched
Actions. If using a non-default branch, ensure the workflow exists on the default
branch before attempting manual `workflow_dispatch`, or use an authorized PR.
Inspect the actual run and both distinct matrix jobs, not only workflow syntax:

1. Confirm remote head equals the reviewed candidate SHA.
2. Confirm locked install, sqlite3 provisioning, runner probes and native runtime
   steps all succeed on **both** Ubuntu and Windows without skips.
3. Download `readiness-ubuntu-latest-node22` and
   `readiness-windows-latest-node22`. Inspect native provenance, 11 pass/0 fail,
   no skips, uninitialized 503, initialized 200, closed-handle 503 and independent
   health 200. Confirm synthetic root removal and compare exact tested SHA.
4. If setup fails, inspect the Actions step output; no install log is uploaded.
   An absent runtime artifact is not success. Artifacts contain only the sanitized
   bounded test/provenance log, not DBs or binaries, and expire after seven days.
   The runner redacts its known synthetic root in raw and forward-slash-normalized
   forms, each also with doubled backslashes (Node inspection) or one JSON string
   escaping layer. Descendant suffixes and unrelated diagnostic text are retained;
   path-prefix/sibling lookalikes are not replaced. This is a finite literal-root
   diagnostic filter, **not arbitrary secret or user-data scrubbing**. It does not
   promise case-folded paths, mixed separator spellings, URL/HTML encodings,
   repeated JSON encoding, truncated roots, or every inspection quoting/control
   character convention. Other terminal sequences (including non-SGR CSI, OSC,
   colon-form SGR and incomplete/malformed escapes) are not recognized framing.
   Input must remain synthetic and environment-allowlisted; never upload arbitrary
   program output on the assumption this filter makes it safe.

Windows path/case-insensitive environment handling and junction support are
static reasoning until the actual native Windows job succeeds. Local Linux
verification is not Windows, hosted-CI, service, deployment or broad Jest proof.
All existing approval/publication/ownership gates remain. Rollback is revert the
workflow/runner/docs commit; production and dependency files are unchanged.
