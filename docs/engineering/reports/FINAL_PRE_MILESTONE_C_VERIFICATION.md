# Final Pre-Milestone C Verification Report

**Document ID:** DOC-ENG-REP-FMC-001  
**Date:** November 12, 2026  
**Auditor:** Antigravity Autonomous Engineering Agent  
**Classification:** Pre-Milestone C Architectural & Security Verification  
**Boundary:** Strictly Repository-Only (Zero Azure, Zero SSH, Zero Docker Builds/Runs, ₹0 Personal Budget)  
**Status:** COMPLETE / AWAITING HUMAN APPROVAL  

---

## 1. Executive Summary

This report completes the exhaustive pre-Milestone C verification for TestForge. It audits the Isolate wrapper execution flow, resolves a critical recursion vulnerability, independently assesses SUID privileges, reconciles all historical test counts, reviews the privileged worker threat model, and evaluates the Isolate supply-chain pinning strategy.

No cloud infrastructure was accessed, no SSH connections were made, and no container builds or student code executions were performed during this audit.

---

## 2. Isolate Wrapper Execution Flow & Recursion Resolution

### 2.1 Source Files Inspected
1. [`deploy/judge0/docker/isolate-wrapper.sh`](file:///d:/TestForge/deploy/judge0/docker/isolate-wrapper.sh) (Owner: root:root, Mode: 0755)
2. [`deploy/judge0/docker/Dockerfile.judge0-arm64`](file:///d:/TestForge/deploy/judge0/docker/Dockerfile.judge0-arm64) (Multi-stage ARM64 Dockerfile)
3. [`deploy/judge0/docker/patches/isolate_job_correlation.patch`](file:///d:/TestForge/deploy/judge0/docker/patches/isolate_job_correlation.patch) (ActiveJob correlation patch)
4. [`deploy/judge0/verify-cgroups-isolate.sh`](file:///d:/TestForge/deploy/judge0/verify-cgroups-isolate.sh) (Cgroups & sandbox lifecycle probe)
5. [`deploy/judge0/verify-arm64-binaries.sh`](file:///d:/TestForge/deploy/judge0/verify-arm64-binaries.sh) (ELF header verification probe)
6. [`deploy/judge0/verify-resource-accounting.sh`](file:///d:/TestForge/deploy/judge0/verify-resource-accounting.sh) (Memory headroom probe)
7. [`server/src/services/execution/RenderSandboxProvider.js`](file:///d:/TestForge/server/src/services/execution/RenderSandboxProvider.js) (API caller)

---

### 2.2 Potential Recursion Finding & Fail-Closed Resolution
* **The Vulnerability Identified:**
  During static analysis, the wrapper was initially structured to dynamically check:
  ```bash
  if [ -x "/usr/local/bin/isolate-bin" ]; then
    REAL_ISOLATE="/usr/local/bin/isolate-bin"
  else
    REAL_ISOLATE="/usr/local/bin/isolate"
  fi
  ```
  **Critical Defect:** After binary diversion, `/usr/local/bin/isolate` points to the wrapper itself (`/usr/local/bin/isolate-wrapper`). If `/usr/local/bin/isolate-bin` is missing, unbuilt, or unmounted, falling back to `/usr/local/bin/isolate` causes the wrapper to invoke itself recursively, triggering an **uncontrolled recursive fork loop**.

* **Resolution Implemented:**
  Removed all fallback logic from [`deploy/judge0/docker/isolate-wrapper.sh`](file:///d:/TestForge/deploy/judge0/docker/isolate-wrapper.sh#L29-L37). The wrapper now strictly requires `/usr/local/bin/isolate-bin` and fails closed immediately:
  ```bash
  # Canonical real Isolate SUID binary target after wrapper diversion (Phase 5.1C / Milestone B)
  # The wrapper must NEVER fall back to /usr/local/bin/isolate when isolate-bin is missing,
  # because that path points back to this wrapper and would cause infinite recursive execution loops.
  REAL_ISOLATE="/usr/local/bin/isolate-bin"

  if [ ! -x "$REAL_ISOLATE" ]; then
    echo "[FATAL isolate-wrapper] Real isolate binary $REAL_ISOLATE not found or not executable. Refusing fallback to prevent recursive invocation loops." >&2
    exit 127
  fi
  ```

---

### 2.3 Actual Execution Flow Across Lifecycle
Every execution path in Judge0 follows a deterministic chain:

```text
[Judge0 Rails Worker (isolate_job.rb)]
          │
          ▼  Calls `["isolate", ...]` (resolves via PATH)
[/usr/local/bin/isolate (Symlink -> /usr/local/bin/isolate-wrapper)]
          │
          ▼  1. Validates argument count, operation uniqueness, and syntax
          ▼  2. Enforces box ID range [0, 2147483647]
          ▼  3. Enforces Zero Egress Policy (rejects --share-net and --net)
          ▼  4. Filters directory mounts (permits only /box and /tmp; blocks traversal)
          ▼  5. Validates cgroup options (--cg-mem, --time, --wall-time)
          ▼  6. Sanitizes command tokens (rejects ;, ``, $, <, >, |)
          │
          ▼  Executes: exec "/usr/local/bin/isolate-bin" "${VALIDATED_ARGS[@]}"
[/usr/local/bin/isolate-bin (Real Compiled IOI Isolate Binary, Mode 4755 root:root)]
          │
          ▼  1. Sets up namespaces (CLONE_NEWNS, CLONE_NEWPID, CLONE_NEWIPC, CLONE_NEWNET)
          ▼  2. Mounts tmpfs on /box and read-only rootfs
          ▼  3. Writes to /sys/fs/cgroup/memory/isolate/box-<id>
          ▼  4. Drops privileges to isolate-XXXXX (UID 60000+)
          ▼  5. Executes student binary
```

* **Initialization:** Handled via `--init` (requires exactly one `-b <id>` and `--cg`; rejects all extra flags). Emits `[CORRELATION]` only upon exit status 0 and confirmed directory existence.
* **Execution:** Handled via `--run` (requires validated resource limits, approved directories, and non-empty command after `--`).
* **Cleanup:** Handled via `--cleanup` (requires `-b <id>`). Fails closed if sandbox directory still exists.

---

## 3. SUID Execution Assessment

| Property | Target Component | Configured State | Audit Verification & Findings |
|---|---|---|---|
| **Binary Path** | Real Isolate Executable | `/usr/local/bin/isolate-bin` | Diverted from `/usr/local/bin/isolate` in [Dockerfile.judge0-arm64:94-100](file:///d:/TestForge/deploy/judge0/docker/Dockerfile.judge0-arm64#L94-L100). |
| **Ownership** | Real Binary | `root:root` | Explicitly chowned `root:root` in Dockerfile. |
| **File Mode** | Real Binary | `4755` (rwsr-xr-x) | SUID root bit set. Allows non-root `judge0` caller to transition to kernel namespaces. |
| **Wrapper Path** | Wrapper Script | `/usr/local/bin/isolate-wrapper` | Copied to `/usr/local/bin/isolate-wrapper` and symlinked to `/usr/local/bin/isolate`. |
| **Wrapper Mode** | Wrapper Script | `0755` (rwxr-xr-x) | Owned by `root:root`. Scripts cannot and do not carry SUID. |
| **Sudoers Scope** | `/etc/sudoers.d/judge0` | `0440` (r--r-----) | Grants `judge0 ALL=(ALL) NOPASSWD: /usr/local/bin/start-cron-daemon, /usr/local/bin/isolate-wrapper, /usr/local/bin/isolate...` |

* **Runtime SUID Assessment Limitation:**
  In compliance with repository-only boundaries, SUID transitions (from user `judge0` UID 1000 to root kernel namespace creation) are verified statically by permissions audits and Dockerfile declarations. Actual live kernel namespace creation will be tested during **Milestone D** using `verify-cgroups-isolate.sh`.

---

## 4. Test Count Reconciliation & Full Inventory

### 4.1 Reconciliation of Historical Test Counts
Earlier engineering reports cited different numbers (237, 251, 277, 308, 334). This section provides the exact technical explanation for every reported count:

1. **237 Tests (11 Suites):**
   * *Command:* `npm test -- tests/phase51C`
   * *Scope:* The 11 specific Phase 5.1C regression suites (`phase51C3` through `phase51C13`).
   * *Result:* Exactly 237 tests pass.
2. **251 Tests (12 Suites):**
   * *Command:* `npm test -- tests/phase51C tests/phaseAMilestoneVerification.test.js`
   * *Scope:* The 11 Phase 5.1C suites (237) + Milestone A verification suite (14) = **251 tests**.
3. **277 Tests (14 Suites):**
   * *Command:* `npm test -- tests/milestoneBWrapperInterception.test.js tests/phaseAMilestoneVerification.test.js tests/phase51C tests/sandboxProvider.test.js`
   * *Scope:* 251 tests + Milestone B wrapper interception (14) + sandbox provider (12) = **277 tests**.
4. **308 Tests (16 Suites):**
   * *Command:* Combined execution of above 14 suites + `tests/executionProvider.test.js` (4) + `tests/remoteExecutionAndConcurrentGrading.test.js` (27) = **308 tests**.
5. **334 Tests (18 Suites):**
   * *Scope:* Occurs when adding `tests/backendToRunnerIntegration.test.js` (18) and `tests/queueAndWorker.test.js` (8) to the 308-test set.
6. **570 Total Declared Tests (35 Test Files):**
   * The complete repository holds 35 test files containing 570 test cases covering the entire platform (auth, questions, analytics, exams, rate limiters, mutations).

---

### 4.2 Current Master Test Execution Results
Executing the primary 14 verification and hardening suites:

```bash
npm test -- tests/milestoneBWrapperInterception.test.js tests/phaseAMilestoneVerification.test.js tests/phase51C tests/sandboxProvider.test.js
```
* **Suites Executed:** 14 Passed, 0 Failed, 14 Total.
* **Tests Passed:** **277 Passed, 0 Failed, 277 Total (100% Green)**.
* **Snapshots:** 0 Total.
* **Runtime:** ~9.1 seconds.

Executing the provider and grading suites:
```bash
npm test -- tests/executionProvider.test.js tests/remoteExecutionAndConcurrentGrading.test.js
```
* **Suites Executed:** 2 Passed, 0 Failed, 2 Total.
* **Tests Passed:** **31 Passed, 0 Failed, 31 Total (100% Green)**.

**Combined Active Regression Footprint: 16 Suites / 308 Tests Verified Green.**

---

## 5. Privileged Worker Risk (SEC-001) Deep Investigation

* **Status:** **UNRESOLVED ARCHITECTURAL HOST RISK (CRITICAL)**.
* **Why `privileged: true` is Required under cgroups v1:**
  IOI Isolate v1.10.1 calls low-level syscalls: `clone(CLONE_NEWNS|CLONE_NEWNET|CLONE_NEWPID)`, `mount("tmpfs", "/box", ...)`, and writes to `/sys/fs/cgroup/memory/isolate`. Under standard Docker on Ubuntu 22.04 with cgroups v1, container isolation profiles (AppArmor, Seccomp) block these syscalls.
* **Investigation of Narrower Linux Capabilities:**
  - Replacing `privileged: true` with `cap_add: [SYS_ADMIN, SETUID, SETGID, SYS_CHROOT]` still fails under default Docker unless AppArmor and Seccomp are unconfined (`security_opt: [seccomp=unconfined, apparmor=unconfined]`) and `/sys/fs/cgroup` is mounted read-write.
  - In Linux kernel security, granting `CAP_SYS_ADMIN` with unconfined profiles inside a container without user namespaces provides a trivially exploitable path to host root. It does not provide meaningful isolation over `privileged: true`.
* **Permanent Architectural Strategy:**
  - Milestone G: Migration to **rootless cgroups v2** (delegating cgroup subtree via systemd) or lightweight microVM hypervisors (**AWS Firecracker / Kata Containers**).
* **Mitigation Maintained:**
  - Execution runner VM is dedicated and single-tenant.
  - Zero databases or private user data on runner host.
  - Unprivileged `judge0` user inside container.
  - Diverted `isolate-wrapper` enforcing strict argument allowlist.
  - Inner Isolate sandbox enforcing nobody user UID 60000+ and read-only rootfs.

---

## 6. Isolate Source Tag & Immutable Commit Pin Strategy

* **Current Implementation:**
  In [`deploy/judge0/docker/Dockerfile.compilers-arm64:62`](file:///d:/TestForge/deploy/judge0/docker/Dockerfile.compilers-arm64#L62):
  ```dockerfile
  RUN git clone --depth 1 --branch v1.10.1 https://github.com/ioi/isolate.git .
  ```
* **Supply-Chain Reproducibility Risk:**
  Git release tags are mutable pointers. If the upstream repository alters or re-tags `v1.10.1`, future image builds could incorporate unverified changes.
* **Verification Constraint & Recommendation:**
  In strict compliance with repository-only boundaries, we do not guess or hardcode an unverified commit SHA into the Dockerfile.
  **Recommendation for Milestone C:**
  During the native ARM64 build on the staging VM, query the remote tag directly:
  ```bash
  git ls-remote https://github.com/ioi/isolate.git refs/tags/v1.10.1
  ```
  Once verified on the build machine, pin the Dockerfile to the immutable 40-character commit SHA:
  ```dockerfile
  ARG ISOLATE_COMMIT_SHA="<verified_40_char_sha>"
  RUN git clone https://github.com/ioi/isolate.git . && \
      git checkout "$ISOLATE_COMMIT_SHA"
  ```

---

## 7. Exact Files Changed in this Verification Turn

1. [`deploy/judge0/docker/isolate-wrapper.sh`](file:///d:/TestForge/deploy/judge0/docker/isolate-wrapper.sh):
   * Removed fallback to `/usr/local/bin/isolate`.
   * Set `REAL_ISOLATE="/usr/local/bin/isolate-bin"`.
   * Configured immediate fail-closed exit with code `127` if `$REAL_ISOLATE` is missing or unexecutable, eliminating the recursion vulnerability.
2. [`server/tests/milestoneBWrapperInterception.test.js`](file:///d:/TestForge/server/tests/milestoneBWrapperInterception.test.js):
   * Updated test suite to explicitly assert absence of recursive fallback and verified fail-closed behavior on missing binary.

---

## 8. Final Pre-Milestone C Acceptance & Gating

* **Milestone B Status:** **COMPLETED, HARDENED & VERIFIED**.
* **Milestone C Status:** **NOT STARTED (STRICTLY GATED)**.
* **Cloud & Budget Restrictions Respected:**
  - Zero Azure API calls.
  - Zero SSH connections.
  - Zero Docker container builds.
  - Zero deployments.
  - ₹0 budget consumed.

**Approval Request:**
Human authorization is requested to proceed to **Milestone C (Native ARM64 Image Build on Azure Staging VM)**. No cloud actions will be initiated without explicit approval.
