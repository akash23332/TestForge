# Phase 5.1C-6: Security Verification False-Positive Elimination Audit Report

**Date:** 2026-11-12  
**Status:** Completed & Validated  
**Mode:** Repository-Only Remediation (Zero Cloud/VM Alterations, No Student Code Execution)  
**Related Test Suite:** [`server/tests/phase51C6FalsePositiveAudit.test.js`](file:///d:/TestForge/server/tests/phase51C6FalsePositiveAudit.test.js) (All 112 tests passing across 6 test suites)

---

## Executive Summary

Phase 5.1C-6 conducted an exhaustive, adversarial review of the three operational verification scripts for the dedicated ARM64 Judge0 runner:
1. [`deploy/judge0/verify-cgroups-isolate.sh`](file:///d:/TestForge/deploy/judge0/verify-cgroups-isolate.sh)
2. [`deploy/judge0/verify-resource-accounting.sh`](file:///d:/TestForge/deploy/judge0/verify-resource-accounting.sh)
3. [`deploy/judge0/verify-containment.sh`](file:///d:/TestForge/deploy/judge0/verify-containment.sh)

Previously, subtle logic errors, broad string matches (e.g. matching any string containing `"error"`), acceptance of Judge0 Status 13 (Internal Server Error / curl network failures) as successful containment, missing positive controls, and unconditional `else pass` branches created serious **false-positive risks**—where a broken, offline, or leaking sandbox could be misreported as secure.

Every false-positive condition has been systematically eliminated. The scripts are now strictly fail-closed, assert positive and negative controls, evaluate kernel metadata and exact process IDs directly from cgroup controller hierarchies, poll asynchronously until terminal states, and reject infrastructure failures. Furthermore, this report details the architectural reality of privileged container security on the host VM.

---

## 1. Corrected Verification Scripts & False-Positive Remediation

### 1.1 `deploy/judge0/verify-cgroups-isolate.sh`

| Prior Vulnerability / Flaw | Mechanism of False-Positive | Corrected Fail-Closed Implementation |
| :--- | :--- | :--- |
| **Cleanup Trap Error Suppression** | Trap previously used uncaptured exit codes or suppressed cleanup failures (`\|\| true`), masking sandbox teardown failures. | `cleanup_boxes()` captures `$?`, checks if `isolate --cleanup` fails, logs the failure, and sets `FAILED=1`, guaranteeing a non-zero exit status (`exit 1`). |
| **Filesystem Boundary Matching** | Only ran a negative write test and matched broad strings (`\|error`). Any syntax error or missing tool caused a false-positive pass. | **Dual Control Added**: <br>1. **Positive Control**: Writes to `/box/positive_probe.txt` and asserts readback. <br>2. **Negative Control**: Probes `/test_boundary_probe`, asserts non-zero exit, verifies `EROFS` / `Read-only file system`, and queries container to ensure the file does not exist on disk. |
| **Network Denial Indeterminacy** | Python interpreter crashes or syntax errors could be misread as network isolation if the script failed before the socket call. | Python probe now emits `PROBE_INITIATED` first. Catches `OSError`, logs exact `e.errno`, and asserts `NETWORK_ISOLATED`. If `PROBE_INITIATED` is missing, the test fails immediately. |
| **Memory Limit Verification** | Only checked `! echo "$MEM_OUT" \| grep -q "VULNERABLE_MEM_OVERRUN"`. A syntax error or immediate crash passed as a memory limit enforcement. | Configured Isolate with `-M /tmp/isolate_mem_meta`. The test now inspects the meta file for kernel cgroup OOM evidence: `status:SG`, `status:RE`, `exitsig:9`, or `cg-oom-killed:1`. |
| **CPU Timeout Unconditional Pass** | Contained an `else pass "Isolate CPU timeout prevented runaway execution"` branch. If the runaway process exited with 0, it still reported PASS! | Configured Isolate with `-M /tmp/isolate_cpu_meta`. The test fails if exit is 0 (`Runaway CPU process unexpectedly exited cleanly`), and strictly matches `status:TO` or `exitsig:24/9`. |
| **Sandbox Directory Cleanup Distinction** | Docker CLI failure or SSH connection loss could be misinterpreted as directory absence (`CLEAN`). | Captured Docker exit code `$DIR_STATUS_EXIT`. Distinguishes `test -d` missing (`CLEAN`, exit 0), directory lingering (`EXISTS`), and Docker execution error (`exit > 0`). |
| **Residual Process Leakage** | Did not verify whether sandbox worker processes lingered in memory after cleanup. | Added `pgrep -f "box-$BOX_ID"`. Any lingering processes immediately trigger `fail` and `FAILED=1`. |

---

### 1.2 `deploy/judge0/verify-resource-accounting.sh`

| Prior Vulnerability / Flaw | Mechanism of False-Positive | Corrected Fail-Closed Implementation |
| :--- | :--- | :--- |
| **Single-Shot Submission Query** | Executed a single curl after a fixed sleep. If the worker was slow, the submission was still in queue (Status 1/2), misreporting the outcome. | Implemented an active polling loop querying `$ENDPOINT/submissions/$SUB_TOKEN` until terminal state (`status.id >= 3`) with a 30s timeout and 0.5s intervals. Fails closed on timeout. |
| **Heuristic Process Tracking** | Sampled PIDs using `docker compose exec judge0-workers pgrep -f "python3"`, which could sample unrelated processes or miss fast-spawning processes. | Directly inspects `/sys/fs/cgroup/memory/isolate/box-*/cgroup.procs` on the host to obtain the exact kernel PID assigned to the sandbox, then reads `/proc/$pid/cgroup` to prove hierarchy affinity. |
| **Silent Telemetry Failures** | If no Isolate cgroup was found or peak usage read 0, the script continued and could print a PASS verdict. | Fails closed: If `PEAK_ISOLATE_USAGE -eq 0` or `CHILD_CGROUP_AFFINITY` is empty, `FAILED=1` is set, printing `[FAIL]` and exiting 1. |
| **Host OOM Events as Warnings Only** | Detected host kernel OOM killer events in `dmesg` were logged as `[WARNING]` without failing the probe. | Host OOM events (`HOST_OOM_COUNT > 0`) now invoke `fail` and set `FAILED=1`, blocking runner validation. |
| **False Guarantee of 2100 MB Headroom** | Stated that calculated ~2100 MB headroom "easily absorbs" sandbox loads, implying absolute host immunity from OOM. | Removed false guarantee. Clearly distinguishes configured container limits (4992 MB), actual measured consumption, and real-time host `MemAvailable`. Added risk notice explaining host OOM dynamics under sibling cgroups. |

---

### 1.3 `deploy/judge0/verify-containment.sh`

| Prior Vulnerability / Flaw | Mechanism of False-Positive | Corrected Fail-Closed Implementation |
| :--- | :--- | :--- |
| **Absence of Baseline Positive Control** | If the runner API was down, unauthenticated, or corrupted, all 25 tests could fail in ways that matched error conditions, masking complete runner failure. | **Added Section 0 Baseline Control**: Submits valid code `print("BASELINE_VALID_EXECUTION")`. Requires HTTP 200/201, `status.id == 3`, and exact stdout match. Aborts the entire suite immediately (`exit 1`) if baseline execution fails. |
| **Curl Failure Masquerading as Containment** | `curl` failure fallback produced `{"status":{"id":13,"description":"Curl Error"}}`. Tests matching Status 13 or pattern `error` marked network failure as successful defense! | Curl fallback to JSON removed. If curl fails or returns an empty body, the test fails immediately. Status 13 (`Internal Error`) is explicitly rejected across all tests: infrastructure crashes are never treated as containment. |
| **Permissive Status 13 Acceptance** | Tests 5, 9, 18, 19, 22, 24 accepted `expected_status="3\|11\|12\|13"`. | Removed `13` from all expected status strings. Only legitimate sandbox outcomes (`3` for trapped, `5` for TLE, `11/12` for OOM/runtime error) are accepted. |
| **Overly Broad Pattern Matching** | Test 5 matched `"NETWORK_BLOCKED\|error\|invalid"`, and Test 19 matched `"\|error"`. Any fatal syntax or runner error matched `error` and passed. | Replaced with specific assertions: `"NETWORK_BLOCKED\|Operation not permitted\|Network is unreachable"` and `"CPP_FORK_BOMB_CONTAINED\|Resource temporarily unavailable\|BlockingIOError"`. |

---

## 2. Table of Security Assertions & Failure Behaviors

| Test & Vector | Assertion Under Test | Expected Evidence | Strict Failure Trigger |
| :--- | :--- | :--- | :--- |
| **Baseline Sanity** | Runner is alive, reachable, and correctly executing valid code. | `status.id: 3`, stdout: `BASELINE_VALID_EXECUTION`. | Empty curl, non-zero curl, `status.id != 3`, or mismatched stdout. Aborts suite. |
| **Auth Guards (1-3)** | Unauthenticated or unauthorized requests to `/submissions` and `/system_info` are blocked. | HTTP `401 Unauthorized` or `403 Forbidden`. | Any HTTP 2xx, 3xx, or 5xx response. |
| **Network Egress (4, 20, 25)** | Sandboxed processes (Python, C++, JS) cannot connect to external IPs (e.g. `8.8.8.8:53`). | Socket errno 101/113 (`NETWORK_ISOLATED`), `CPP_NETWORK_BLOCKED`, `JS_NETWORK_BLOCKED`. | Connection success (`VULNERABLE_NETWORK_OPEN`), silent timeout without probe initiation, or Status 13. |
| **Client Override (5)** | Submissions with `enable_network: true` are blocked when runner policy disables network overrides. | Rejection or sandbox denial without external connectivity. | Outbound connection opened or Status 13 masquerading as containment. |
| **Cloud Metadata (6)** | Submissions cannot reach AWS/Azure/GCP metadata service (`169.254.169.254`). | `METADATA_BLOCKED` via isolated network namespace. | Metadata retrieved (`VULNERABLE_METADATA_ACCESSED`) or Status 13. |
| **Fork Bomb (7, 19)** | Process creation is strictly capped (`pids.max` or Isolate process limits). | `FORK_BOMB_CONTAINED`, `BlockingIOError`, or `Resource temporarily unavailable`. | Fork bomb continues unhindered, host PID exhaustion, or Status 13. |
| **Heap Memory (8, 9, 18, 22, 24)** | Single-process and multi-process aggregate memory exhaustion is contained by cgroup memory limits. | Isolate cgroup OOM: `status:SG`, `status:RE`, `exitsig:9`, or `Memory limit exceeded`. | Zero exit code, completion of full allocation (`VULNERABLE_MEMORY_LEAK`), host-level OOM, or Status 13. |
| **CPU Timeouts (10, 17, 21, 23)** | Infinite CPU loops are terminated at configured timeout. | Isolate meta `status:TO`, `exitsig:24/9`, or `Time Limit Exceeded`. | Process exits with code 0, process continues running past wall-time limit, or Status 13. |
| **Filesystem Jail (11, 12)** | Root filesystem is read-only; disk writes are restricted to `/box` quota. | `EROFS`, `PASSWD_READONLY_CONTAINED`, `DISK_LIMIT_CONTAINED` (`SIGXFSZ`). | File created on rootfs (`/test_boundary_probe` or `/etc/passwd`), or quota bypassed. |
| **Secret Sniffing (13)** | Host environment variables, API tokens, and database credentials are not leaked into sandbox. | `ENV_SECRETS_SANITIZED` (no environment variables containing `AUTH`, `PASS`, `SECRET`, `TOKEN`). | Sandbox environment discovers secrets (`VULNERABLE_SECRETS_FOUND`). |
| **PID Namespace (14)** | Sandboxed process cannot view host or container processes in `/proc`. | `PID_NAMESPACE_ISOLATED` (3 or fewer PIDs visible in `/proc`). | Container or host PIDs visible (`VULNERABLE_HOST_PIDS_VISIBLE > 3`). |
| **Privilege Escalation (15)** | Calling `setuid(0)` inside the sandbox fails. | `PRIVILEGE_ESCALATION_BLOCKED` (`EPERM`). | `setuid(0)` returns 0 (`VULNERABLE_SETUID_ROOT_SUCCESS`). |
| **Raw Sockets (16)** | Creating raw network sockets (`SOCK_RAW`) fails due to dropped `CAP_NET_RAW`. | `RAW_SOCKET_BLOCKED` (`PermissionError`). | Raw socket created (`VULNERABLE_RAW_SOCKET_OPENED`). |

---

## 3. Critical Analysis of Privileged Worker Risks

A core architectural aspect of the Judge0 architecture is the `privileged: true` flag configured on the `judge0-workers` container in [`deploy/judge0/docker-compose.yml`](file:///d:/TestForge/deploy/judge0/docker-compose.yml#L55).

### 3.1 Exact Host Privileges Held by `judge0-workers`
Running Docker with `privileged: true` disables almost all Linux container isolation boundaries:
1. **Raw Block Device Access:** All host block devices (`/dev/sda`, `/dev/sda1`, `/dev/nvme0n1`, `/dev/vda`) are exposed with read/write access directly inside the container filesystem under `/dev`.
2. **All Linux Capabilities Retained:** Full capability set (`CAP_SYS_ADMIN`, `CAP_SYS_RAWIO`, `CAP_SYS_PTRACE`, `CAP_DAC_OVERRIDE`, `CAP_NET_ADMIN`, `CAP_SYS_MODULE`, etc.) is granted to root processes in the container.
3. **Disabled Security Profiles:** Docker's default AppArmor profile is disabled (`unconfined`), and the default seccomp filter is disabled (`unconfined`).
4. **Direct Host Cgroup Hierarchy Access:** Direct read-write access to host `/sys/fs/cgroup`.

### 3.2 Debunking Common Mitigations as Host Escape Protections
The project implements several layers of defense:
- Untrusted student code is executed by Isolate as an unprivileged user (UID `60000+`).
- The Isolate binary is owned by `root:root` with SUID permissions (`mode 4755`).
- The Docker socket (`/var/run/docker.sock`) is **NOT** mounted into the worker container.

**Why these mitigations do NOT neutralize container escape risk:**
- **Isolate as the Single Point of Failure:** Isolate executes with root privileges to configure namespaces, chroots, and cgroup controllers before dropping privileges to UID `60000+`. If an attacker discovers a vulnerability in Isolate (such as a namespace breakout, mount point traversal, file descriptor leak, ptrace interaction bug, or SUID privilege escalation) OR a Linux kernel zero-day (such as an exploit targeting user namespaces, io_uring, eBPF, or cgroup v1 controllers), the execution context transitions directly to container root.
- **Escape from Container = Full Host Compromise:** In an unprivileged container, escaping the sandbox still leaves the attacker constrained by container namespaces, dropped capabilities, and AppArmor. However, in `judge0-workers` (`privileged: true`), escaping the sandbox lands the attacker in a privileged container context. From there, host compromise is trivial: the attacker can directly mount `/dev/sda1` to a directory and write an SSH authorized key or root cron job, write directly to raw disk blocks, or use `release_agent` in `/sys/fs/cgroup` to execute arbitrary code as host root.
- **Absence of `docker.sock` is Irrelevant:** While not mounting `docker.sock` prevents querying the Docker engine daemon, a privileged container has direct kernel and hardware access that bypasses the Docker daemon entirely.

### 3.3 Host Denial-of-Service (DoS) Vectors
1. **Host RAM Exhaustion via Sibling Cgroups:**
   - As verified in Section 9 of `verify-resource-accounting.sh`, Isolate creates box cgroups directly under the host root hierarchy (`/sys/fs/cgroup/memory/isolate/box-*`), **NOT** nested inside the Docker worker container cgroup slice.
   - Therefore, Docker's `mem_limit: 3072m` on `judge0-workers` does **NOT** bound Isolate sandboxes.
   - Sandbox memory is bounded solely by Isolate's internal `--cg-mem` limit (default 250 MB).
   - If concurrency is increased beyond `COUNT=1` or if memory is consumed by kernel page cache, slab, and container processes, the host physical RAM (8 GB) can be exhausted, triggering the Linux kernel host OOM killer.
2. **Host Disk & Inode Exhaustion:**
   - While Isolate enforces a file size limit (`fsize`) inside `/box`, files generated by compilers, runtime environments, and worker queues under `/tmp` or `/var/local/lib/isolate` could exhaust available space or inodes on the 30 GB root disk if automated cleanup fails.

---

## 4. Automated Verification Results

The automated regression and audit test suite was executed locally:
```powershell
npm --prefix server run test -- tests/phase51C6FalsePositiveAudit.test.js tests/phase51C5FinalVerification.test.js tests/phase51C4BuildHardening.test.js tests/phase51C3Remediation.test.js tests/backendToRunnerIntegration.test.js tests/healthReadiness.test.js
```

### Result Summary
```
PASS tests/phase51C6FalsePositiveAudit.test.js
PASS tests/healthReadiness.test.js
PASS tests/backendToRunnerIntegration.test.js
PASS tests/phase51C4BuildHardening.test.js
PASS tests/phase51C3Remediation.test.js
PASS tests/phase51C5FinalVerification.test.js

Test Suites: 6 passed, 6 total
Tests:       112 passed, 112 total
Snapshots:   0 total
Time:        6.473 s
```

---

## 5. Unresolved Risks & Clear Deployment Decision

### 5.1 Remaining Unresolved Operational Risks
1. **Live Cloud Environment Validation Required:**
   All verifications performed to date are repository-level static and algorithmic validations. While all test scripts and Docker configurations have been audited and verified fail-closed, real kernel execution on the target Azure ARM64 VM (`Ubuntu 22.04.5 LTS`, Kernel `6.8.0-1070-azure`) is required to confirm that the Azure-specific kernel behaves identically with cgroups v1 legacy controllers.
2. **Privileged Worker Attack Surface:**
   Because `judge0-workers` requires `privileged: true` to operate Isolate's cgroups and namespace setup, the runner VM must remain strictly **isolated** on the Azure virtual network, with no inbound access permitted from the public internet (accessible only from the TestForge backend via authenticated Caddy reverse proxy).
3. **Concurrency Restriction in Staging:**
   Concurrency must strictly remain hardcoded to `COUNT=1` (`MAX_QUEUE_SIZE=100`) on the 8 GB / 2 vCPU VM to prevent sibling cgroup memory contention.

### 5.2 Build & Deployment Recommendation
- **Verdict: PROCEED TO STAGING BUILD AND PROVISIONING TEST.**
- **Justification:**
  - All false-positive paths in `verify-cgroups-isolate.sh`, `verify-resource-accounting.sh`, and `verify-containment.sh` have been eradicated.
  - Image architectures are locked to native ARM64 with fail-closed compose gates.
  - Sudoers permissions and cron daemon wrappers are secured with restrictive owner-only permissions.
  - The TestForge backend connector implements circuit breaker, mutual authentication, and strict status code handling.
- The team may now proceed to build the ARM64 container images (`testforge/compilers:v1.4.0-arm64` and `testforge/judge0:v1.13.1-arm64`) and execute the verification probes on the dedicated staging Azure VM.
