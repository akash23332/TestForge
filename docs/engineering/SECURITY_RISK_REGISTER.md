# SECURITY RISK REGISTER: TESTFORGE

**Document ID:** DOC-ENG-005  
**Version:** 1.6.0  
**Status:** Active Security Risk Registry  
**Date:** November 13, 2026  
**Primary Architect:** Antigravity Engineering Agent  

---

## 1. Risk Governance & Severity Matrix

This register catalogs known architectural, implementation, and operational risks across TestForge. Each risk is evaluated by Impact and Likelihood to produce a Severity Rating (Critical, High, Medium, Low). Risks remain active until independently audited and verified with concrete runtime evidence.

In Milestone R1, hermetic local integration testing with a mock Judge0 server verified client-side credential redaction (`_sanitize`) and Zero-Leak hiding of test case inputs/outputs (`input: null`, `expectedOutput: null`). However, mock testing does not execute untrusted student binaries and provides zero kernel isolation. Finding **SEC-001 remains CRITICAL and UNRESOLVED**.

---

## 2. Active Security Risks

### RISK R-01 (SEC-001): Privileged Docker Container for Execution Worker
* **Severity:** **CRITICAL** (Likelihood: High, Impact: Critical)
* **Affected Component:** `deploy/judge0/docker-compose.yml` (`services.judge0-workers.privileged: true`)
* **Description:** Isolate requires root privileges and capability to manipulate Linux cgroups and namespaces, which prompted Judge0 to run containers in Docker privileged mode. Privileged containers disable seccomp, AppArmor, and cap-drop protections, providing direct access to host kernel devices (`/dev`) if any container escape occurs.
* **Formal Decision Reference:** [`docs/engineering/reports/PRIVILEGED_WORKER_SECURITY_DECISION.md`](file:///D:/TestForge/docs/engineering/reports/PRIVILEGED_WORKER_SECURITY_DECISION.md)
* **Mitigation in Phase 5.1C-13 & Milestone B:**
  * Implemented `isolate-wrapper.sh` allowlist and diverted `/usr/local/bin/isolate` to intercept all Judge0 calls.
  * Hardened Ruby caller to use `Open3.capture3(*cmd)` with array arguments, preventing shell injection.
  * Restrained Rails worker to unprivileged user `judge0` (UID 1000) with `0440` scoped sudoers.
* **Milestone G, G2 & G2.1 Architecture Resolution Analysis:**
  * Completed comparative architecture analysis across Kata Containers (Option A), Firecracker (Option B), and Rootless Docker (Option C) in [`docs/engineering/reports/MILESTONE_G_ISOLATION_ARCHITECTURE.md`](file:///D:/TestForge/docs/engineering/reports/MILESTONE_G_ISOLATION_ARCHITECTURE.md).
  * In Milestone G2 ([`docs/engineering/reports/MILESTONE_G2_KATA_FEASIBILITY.md`](file:///D:/TestForge/docs/engineering/reports/MILESTONE_G2_KATA_FEASIBILITY.md)), verified official Microsoft Learn specifications: **Azure does NOT support nested virtualization on ANY ARM-based VM series** (`Bps_v2`, `Dps_v5`, `Epsv5`).
  * In Milestone G2.1 ([`docs/engineering/reports/MILESTONE_G2_1_MSHV_FEASIBILITY.md`](file:///D:/TestForge/docs/engineering/reports/MILESTONE_G2_1_MSHV_FEASIBILITY.md)), audited the Microsoft Hypervisor (MSHV) interface. Proved that `/dev/mshv` is restricted to Hyper-V Root Partitions (hosts) and is completely blocked in Azure IaaS guest VMs (child partitions). AKS also explicitly marks ARM64 as unsupported for Kata MSHV sandboxing.
  * Therefore, hardware microVM isolation on Azure requires migrating to an x86_64 VM with nested virtualization (`Standard_D2as_v5` with AMD EPYC, ~$40–$63/mo) or bare-metal ARM64 hosting.
* **Status:** **CRITICAL and UNRESOLVED**. Mitigated for Phase C Staging via dedicated disposable single-tenant VM and Option C hardened wrapper jail. Finding SEC-001 remains **CRITICAL and UNRESOLVED** until hardware microVMs (Kata) are deployed on a virtualization-capable host in production. Active hostile-code container escape tests remain strictly prohibited on the current staging host.

---

### RISK R-02: Hybrid Cgroup v1/v2 Resource Accounting & Host OOM Risk
* **Severity:** **HIGH** (Likelihood: Medium, Impact: High)
* **Affected Component:** Linux kernel cgroup arrangement on Azure VM (`testforge-judge0-staging`).
* **Description:** The VM was reconfigured from cgroup v2 to a hybrid arrangement with v1 controllers mounted at `/sys/fs/cgroup/{memory, cpu, pids}` to satisfy Isolate's legacy cgroup v1 driver. If Isolate cgroups are not properly nested beneath Docker container cgroups, student allocations may be accounted at the root host level, risking a host Linux kernel OOM panic.
* **Mitigation in Phase 5.1C-13 & Milestone B:**
  * Strict cgroup hierarchy inspection scripts (`verify-resource-accounting.sh`).
  * Explicit container memory allocations: Worker (3072 MB), API (1024 MB), DB (512 MB), Redis (384 MB).
  * Over 3.1 GB unallocated RAM preserved on host VM for OS kernel, cgroups overhead, and system daemons. Concurrency capped at `COUNT=1`.
* **Action Required in Milestone E:** Execute controlled memory and process exhaustion tests on staging VM to prove that OOM kills terminate the Isolate sandbox process without destabilizing Docker or the Ubuntu host kernel.

---

### RISK R-03: Network Namespace Containment & Zero Egress Proof
* **Severity:** **HIGH** (Likelihood: Medium, Impact: High)
* **Affected Component:** `isolate-wrapper.sh` & Isolate sandbox execution.
* **Description:** Hostile student programs could attempt to probe internal Azure infrastructure (such as the Instance Metadata Service at `169.254.169.254`), reach out to botnet command-and-control servers, or exfiltrate test cases.
* **Mitigation in Phase 5.1C-13 & Milestone B:**
  * `isolate-wrapper.sh` explicitly rejects `--share-net` and any networking argument under Zero Egress Policy.
  * Isolate invokes unshare(CLONE_NEWNET) to instantiate a sterile, unrouted loopback-only network namespace.
  * `judge0.conf` sets `ENABLE_NETWORK=false` and `ALLOW_ENABLE_NETWORK=false`.
* **Action Required in Milestone E:** Perform active egress probes attempting TCP SYN, UDP, and raw ICMP packets against internal and external endpoints via `verify-containment.sh` on the live staging VM.

---

### RISK R-04: Host `execSync` in Mutation Testing Service
* **Severity:** **CRITICAL** (Likelihood: High, Impact: Critical)
* **Affected Component:** `server/src/services/mutation.service.js` & `server/src/services/codeRunner.service.js`.
* **Description:** While student grading in `attempt.controller.js` has been routed to BullMQ and sandbox providers, `mutation.service.js` previously called `runJavaIsolated` and `runPythonIsolated` which executed raw `child_process.execSync` on the host Node.js server.
* **Mitigation Status:** **REMEDIATED IN MILESTONE A**.
* **Remediation Implemented:**
  * Refactored `server/src/services/mutation.service.js` to dispatch execution exclusively through `ExecutionProvider` (`RenderSandboxProvider` / Judge0).
  * Added fail-closed production check throwing `[MutationService FAIL-CLOSED]` when no isolated provider exists.
  * Added production guard clauses in `codeRunner.service.js` lines 327, 835, 1083.
  * Verified with automated regression tests in `phaseAMilestoneVerification.test.js`.

---

### RISK R-05: Node.js `node:vm` Sandbox Escape Risk
* **Severity:** **HIGH** (Likelihood: Low, Impact: High)
* **Affected Component:** `server/src/services/codingAssessment.service.js` (line 113) & `codeRunner.service.js` (line 47).
* **Description:** Node.js `vm.runInContext` is used to evaluate input argument strings into JavaScript arrays/primitives. Node.js documentation explicitly notes that `vm` is not an adversarial security boundary.
* **Mitigation Status:** **AUDITED & CONFINED IN MILESTONES A & B**.
* **Remediation Implemented:**
  * Verified that zero untrusted student code is evaluated via `node:vm`. Student submissions strictly execute inside remote Judge0 / Isolate containers.
  * `codingAssessment.service.js:113` runs only on teacher-defined test case input arguments inside a frozen context (`vm.createContext(Object.freeze({}))`) with 1000ms timeout.
  * Fallback to `JSON.parse` implemented for clean structured inputs.

---

### RISK R-06: ActiveJob Retries & Duplicate Execution Races
* **Severity:** **MEDIUM** (Likelihood: Medium, Impact: Medium)
* **Affected Component:** Judge0 Rails backend (`isolate_job.rb`) & BullMQ queue.
* **Description:** If Judge0 crashes mid-execution, Sidekiq/ActiveJob retry policies could dispatch duplicate runs for the same submission token, potentially reusing or corrupting Isolate box IDs (`/var/local/lib/isolate/<box_id>`).
* **Mitigation in Phase 5.1C-13:**
  * Structured correlation IDs bind execution attempts to exact run indices and timestamps.
  * Exception handling in `isolate_job_correlation.patch` ensures sandbox cleanup occurs even on unhandled job aborts.

---

### RISK R-07: Secrets Leakage & Correlation Key Validation
* **Severity:** **HIGH** (Likelihood: Low, Impact: Critical)
* **Affected Component:** Judge0 configuration files (`judge0.conf`) and environment variables (`CORRELATION_KEY`, `AUTH_TOKEN`).
* **Description:** If `CORRELATION_KEY` or `X-Auth-Token` is exposed in repository commits, logs, or unredacted reports, attackers could forge correlation signatures or submit unauthorized execution payloads.
* **Mitigation in Phase 5.1C-13 & Milestone B:**
  * All test suites and documentation use redacted strings (`CORRELATION_KEY=[REDACTED]`).
  * `deploy-runner.sh` generates secrets with `umask 077` and enforces `0600` file permissions.
  * `isolate-wrapper.sh` and verifiers enforce a minimum key length of 32 bytes.
  * `RenderSandboxProvider.js` sanitizes error logs to scrub tokens.

---

### RISK R-08: Hidden Test Case & Reference Solution Leakage
* **Severity:** **HIGH** (Likelihood: Low, Impact: High)
* **Affected Component:** `server/src/controllers/attempt.controller.js` & student API endpoints.
* **Description:** Students attempting to game assessments could inspect network responses or error payloads for hidden test inputs or expected outputs.
* **Mitigation:**
  * Public APIs explicitly redact `testCase.input` and `testCase.expectedOutput` for all test cases where `visibility === 'hidden'`.
  * Score calculation is performed entirely on the backend server.
  * Verified in `tests/phaseAMilestoneVerification.test.js`.

---

### RISK R-09: Cloud Resource Sprawl & Azure Budget Exhaustion
* **Severity:** **HIGH** (Likelihood: Medium, Impact: High)
* **Affected Component:** Azure Subscription (Azure for Students, Central India).
* **Description:** Unmonitored VM provisioning, unattached managed disks, orphaned snapshots, or accidental Pay-As-You-Go conversion could deplete the student credit balance or trigger personal liability (Personal Cash Budget: **₹0**).
* **Mitigation Policy:**
  * Strict prohibition against provisioning new VMs or upgrading billing tiers.
  * All cloud operations require explicit, prior user authorization.
  * Use existing VM `testforge-judge0-staging` and existing snapshot `testforge-before-cgroup-change`.

---

### RISK R-10: Mutable Git Tag in Isolate Sandbox Build (`v1.10.1`)
* **Severity:** **MEDIUM** (Likelihood: Low, Impact: Medium)
* **Affected Component:** `deploy/judge0/docker/Dockerfile.compilers-arm64` (line 62).
* **Description:** The Isolate source repository is fetched via `git clone --depth 1 --branch v1.10.1`. In Git, tags can be moved or deleted upstream, which creates a supply-chain reproducibility risk.
* **Mitigation Plan:**
  * Staging build script will query `git ls-remote https://github.com/ioi/isolate.git refs/tags/v1.10.1` and record the immutable commit SHA before packaging.

---

### RISK R-11: Untrusted Code Execution Runtime Validation Pending
* **Severity:** **HIGH** (Likelihood: Medium, Impact: High)
* **Affected Component:** Live staging VM execution runner.
* **Description:** Static code and unit tests prove configuration correctness, but live runtime defense against hostile adversarial payloads (e.g. fork bombs, disk exhaustion, network probing) has not yet been executed against the live ARM64 container.
* **Mitigation Plan:**
  * Execute `verify-containment.sh` (25-point hostile code attack test suite) during Milestone D after the native container is built on staging.

---

### RISK R-12: Isolate Wrapper Infinite Recursion Loop via Fallback
* **Severity:** **HIGH** (Likelihood: High if binary missing, Impact: High)
* **Affected Component:** `deploy/judge0/docker/isolate-wrapper.sh` (lines 35-43).
* **Description:** During binary diversion, `/usr/local/bin/isolate` becomes a symlink pointing to `/usr/local/bin/isolate-wrapper`. Previously, if `/usr/local/bin/isolate-bin` was missing or unexecutable, the wrapper fell back to `REAL_ISOLATE="/usr/local/bin/isolate"`, causing the script to invoke itself in an infinite fork loop until OS PID exhaustion.
* **Mitigation Status:** **REMEDIATED IN FINAL MILESTONE B REVIEW**.
* **Remediation Implemented:**
  * Removed fallback assignment entirely. `REAL_ISOLATE` strictly points to `/usr/local/bin/isolate-bin`.
  * If the binary is missing or non-executable, the wrapper immediately logs a fatal error and terminates closed with `exit 127`.
  * Verified in `tests/milestoneBWrapperInterception.test.js` (Test 11 & Test 12).


---

### RISK R-13 (SEC-002): SUID Wrapper Bypass via World-Executable Mode 4755
* **Severity:** **HIGH** (Likelihood: Medium, Impact: High)
* **Affected Component:** `deploy/judge0/docker/Dockerfile.judge0-arm64` (line 99) & `/usr/local/bin/isolate-bin`.
* **Description:** `/usr/local/bin/isolate-bin` was previously configured with mode `4755` (`rwsr-xr-x`) owned by `root:root`. Although `/etc/sudoers.d/judge0` restricts the `sudo` command, mode `4755` granted read and execute permissions to "others" (UID 1000). Direct invocation via `execve` elevated to effective UID 0 without using `sudo`, bypassing `isolate-wrapper.sh` and its argument validation (Zero Egress, path traversal, directory mounts).
* **Mitigation Status:** **REMEDIATED IN CODEBASE (OPTION C APPLIED)**.
* **Remediation Implemented:**
  - `Dockerfile.judge0-arm64` line 99: Diverted binary is set to `chmod 4700 /usr/local/bin/isolate-bin` (root execution only; zero permissions for Others/UID 1000).
  - `isolate-wrapper.sh` lines 29–33: Implemented self-elevation via passwordless `sudo` (which is explicitly authorized in `/etc/sudoers.d/judge0`). Unprivileged callers automatically elevate through the wrapper, which strictly validates all arguments before executing `isolate-bin`.
  - Direct execution by UID 1000 is rejected by the Linux kernel with `Permission denied` (exit code 126).
  - Verified across 17 test suites (321/321 passing) including `tests/suidBypassInvestigation.test.js` and `tests/milestoneBWrapperInterception.test.js`.
