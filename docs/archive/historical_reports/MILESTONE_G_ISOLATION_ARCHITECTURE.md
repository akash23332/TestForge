# TESTFORGE: MILESTONE G ARCHITECTURAL REPORT
## SEC-001 Isolation Architecture, Runtime Evaluation & Elimination Roadmap

**Document ID:** DOC-ENG-013  
**Version:** 1.0.0  
**Milestone:** G (SEC-001 Isolation Architecture & Remediation)  
**Target Platform:** Native ARM64 Linux Infrastructure  
**Current Staging VM:** `testforge-judge0-staging` (`20.219.18.70`, `Standard_B2ps_v2`)  
**Target Production SKU:** `Standard_D2ps_v5` / `Standard_D4ps_v5` (ARM64 with KVM Nested Virtualization)  
**Date:** November 12, 2026  
**Primary Architect:** Antigravity Engineering Agent  
**Status:** Architectural Assessment Completed — SEC-001 Remains CRITICAL & UNRESOLVED  

---

## 1. Executive Summary

Milestone G delivers an authoritative, evidence-backed architectural design to eliminate the critical vulnerability **SEC-001 (`privileged: true` on Judge0 workers)**.

In the current deployment, `testforge-judge0-workers` runs with Docker `privileged: true`. While Option C (`isolate-bin` mode `0700 root:root`) and the constrained wrapper (`isolate-wrapper.sh`) provide defense-in-depth against argument injection and direct binary execution by UID 1000, running a Docker container with `privileged: true` fundamentally eliminates the container isolation boundary. The container process shares the host Linux kernel, exposes raw host device nodes (`/dev/sda1`), disables Seccomp and AppArmor, and exposes host cgroups as read-write.

This report:
1. Proves why `privileged: true` is currently required by Judge0 and IOI Isolate.
2. Evaluates the three primary replacement architectures for ARM64:
   * **Option A: Kata Containers (OCI MicroVMs)**
   * **Option B: Firecracker MicroVMs**
   * **Option C: Rootless Docker with Cgroups v2 & User Namespaces**
3. Inspects and validates the recent CodeRabbit code review fixes in `Dockerfile.compilers-arm64` and `mutation.service.js`.
4. Delivers an objective decision matrix and recommends **Option A (Kata Containers on ARM64 nested virtualization SKU `Standard_D2ps_v5`)**, while articulating the strongest counterargument against it.
5. Formulates an 8-stage migration roadmap with clear acceptance gates, ensuring zero production disruption.

> [!CRITICAL]
> **GOVERNANCE STATUS: SEC-001 REMAINS CRITICAL AND UNRESOLVED.**  
> SEC-001 cannot be marked resolved by documentation alone. It will remain classified as **CRITICAL and UNRESOLVED** in the project risk register until the microVM replacement architecture is provisioned, deployed, and independently validated under live adversarial testing.

---

## 2. Workstream 1: Establishing the Actual Security Boundary

### 2.1 The Current Worker Architecture
In `deploy/judge0/docker-compose.yml`, the runner stack separates API routing from code execution:
* `judge0-server`: Runs Puma HTTP server with `privileged: false`. Binds strictly to `127.0.0.1:2358`.
* `judge0-workers`: Runs Sidekiq/Resque background daemon (`./scripts/workers`) with `privileged: true`.

### 2.2 Deep Kernel Analysis: Why Isolate Requires Root and Privileges
IOI Isolate (`isolate-bin`) is a low-level C sandbox utility designed for competitive programming. It operates directly at the Linux kernel syscall boundary. An inspection of Isolate's source code and runtime behavior reveals the exact kernel capabilities and subsystems it requires:

```
┌────────────────────────────────────────────────────────────────────────┐
│ IOI ISOLATE (isolate-bin) OPERATIONAL REQUIREMENT MAPPING              │
├───────────────────────────────┬────────────────────────────────────────┤
│ Kernel Subsystem / Operation  │ Required Linux Privilege / Capability  │
├───────────────────────────────┼────────────────────────────────────────┤
│ unshare(CLONE_NEWNS)          │ CAP_SYS_ADMIN (Mount namespace)        │
│ mount("tmpfs", box_dir, ...)  │ CAP_SYS_ADMIN (Filesystem creation)    │
│ mount(..., MS_BIND | MS_REC)  │ CAP_SYS_ADMIN (Directory bind-mounting)│
│ pivot_root() / chroot()       │ CAP_SYS_ADMIN + CAP_SYS_CHROOT         │
│ mount("proc", "/proc", ...)   │ CAP_SYS_ADMIN (Fresh procfs mount)     │
│ mknod(/dev/null, /dev/zero)   │ CAP_MKNOD (Device node creation)       │
│ unshare(CLONE_NEWNET)         │ CAP_SYS_ADMIN (Network isolation)      │
│ ip link set lo up             │ CAP_NET_ADMIN (Loopback activation)    │
│ unshare(CLONE_NEWPID)         │ CAP_SYS_ADMIN (PID isolation)          │
│ unshare(CLONE_NEWIPC/UTS)     │ CAP_SYS_ADMIN (IPC/hostname isolation) │
│ setresuid() / setresgid()     │ CAP_SETUID + CAP_SETGID (Drop to 60001)│
│ /sys/fs/cgroup/* manipulation │ Read-write host cgroup v1 filesystem   │
└───────────────────────────────┴────────────────────────────────────────┘
```

### 2.3 Why `cap_add` Alone Fails in Standard Docker
A common architectural inquiry is whether `privileged: true` can be replaced simply by adding specific capabilities (`cap_add: [SYS_ADMIN, CHROOT, MKNOD, NET_ADMIN]`). In standard unprivileged Docker, this fails due to four structural container boundaries:
1. **Read-Only Cgroups (`/sys/fs/cgroup`):** In unprivileged Docker, the host cgroup filesystem is mounted strictly read-only (`:ro`). Isolate must create subdirectories (`/sys/fs/cgroup/memory/isolate/box-<id>`) and write resource limits. Bind-mounting `/sys/fs/cgroup:rw` into an unprivileged container is rejected by systemd and causes namespace permission errors.
2. **Docker AppArmor Profile (`docker-default`):** Docker's default AppArmor profile explicitly denylists the `mount` and `umount2` syscalls inside containers, regardless of granted capabilities. Overriding this requires `security_opt: [apparmor=unconfined]`.
3. **Docker Seccomp Profile:** Docker's default Seccomp filter intercepts and blocks `clone` when called with specific namespace flag combinations and restricts `unshare`. Overriding this requires `security_opt: [seccomp=unconfined]`.
4. **Masked and Read-Only System Paths:** Unprivileged containers automatically mask `/proc/sys`, `/proc/sysrq-trigger`, `/proc/irq`, and `/proc/bus`. When Isolate attempts to instantiate a clean chroot and mount a localized `procfs`, the kernel rejects the mount operation because the parent procfs contains masked paths.

Because resolving these issues individually across heterogeneous cloud environments was historically fragile, upstream Judge0 chose `privileged: true` as a convenient shortcut.

### 2.4 The Fatal Vulnerability of `privileged: true`
When Docker runs a container with `privileged: true`:
1. It grants all 41 Linux capabilities to container root.
2. It completely disables Seccomp and AppArmor.
3. It mounts the **entire host `/dev` filesystem** directly into the container.
4. If an adversarial student payload escapes the Isolate sandbox, it lands in the worker container. If it escalates to container root (UID 0), container root **IS** the real host root on the shared kernel.
5. Container root can execute:
   ```bash
   mount /dev/sda1 /mnt
   echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5..." >> /mnt/root/.ssh/authorized_keys
   ```
   This gives the attacker immediate, persistent root access over the physical/virtual Azure host.

---

## 3. Workstream 2: Comparative Evaluation of Isolation Architectures

To eliminate `privileged: true` on the shared host kernel, three primary architecture options were evaluated against the TestForge ARM64 platform:

```
┌────────────────────────────────────────────────────────────────────────┐
│ ARCHITECTURE ISOLATION COMPARISON                                      │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Current Baseline (Shared Host Kernel - Privileged Docker)           │
│    [Host Kernel] ◄──(SHARED)──► [Docker privileged: true] ──► [Isolate]│
│    Risk: Container breakout = Immediate Host Kernel Compromise         │
├────────────────────────────────────────────────────────────────────────┤
│ 2. Option A: Kata Containers (Hardware MicroVM Boundary)               │
│    [Host Kernel] ──(KVM)──► [Guest Kernel in MicroVM] ──► [Judge0/Iso] │
│    Benefit: Privileged inside Guest Kernel only. Host Kernel Untouched │
├────────────────────────────────────────────────────────────────────────┤
│ 3. Option B: Firecracker (Direct MicroVM Sandboxing)                   │
│    [Host Kernel] ──(KVM)──► [Minimal Firecracker uVM] ──► [Process]    │
│    Benefit: ~5ms boot, 5MB RAM. Drawback: Complete Judge0 rewrite      │
├────────────────────────────────────────────────────────────────────────┤
│ 4. Option C: Rootless Docker with Cgroups v2                           │
│    [Host Kernel] ──(CLONE_NEWUSER)──► [Rootless Docker] ──► [Runner]   │
│    Drawback: Incompatible with IOI Isolate v1; Still shares host kernel│
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Option A: Kata Containers (Recommended Architecture)
Kata Containers is an open-source, OCI-compliant runtime that runs containers inside dedicated, hardware-isolated lightweight Virtual Machines using QEMU or Cloud-Hypervisor.

* **ARM64 Compatibility:** Excellent. Kata Containers has official, production-verified ARM64 (`aarch64`) support with pre-built guest kernels and rootfs images.
* **Host Compatibility:** Fully supported on Ubuntu 22.04 LTS via containerd (`io.containerd.kata.v2`).
* **Judge0 Compatibility:** **100% Unmodified Compatibility.** `judge0-workers` runs inside the Kata MicroVM with `privileged: true`. The container has full root privileges and access to `/dev`, but **exclusively within its isolated guest virtual machine**. The host kernel is completely insulated behind hardware KVM boundaries.
* **KVM Hardware Virtualization Requirement:** Requires `/dev/kvm`.
  * **Critical Host Constraint:** The current staging VM (`Standard_B2ps_v2`) is an Azure burstable ARM64 VM that does **NOT** support nested virtualization.
  * **Production Target:** Deploying Kata on Azure ARM64 requires migrating to a nested-virtualization-capable SKU: `Standard_D2ps_v5` (2 vCPUs, 8 GiB RAM) or `Standard_D4ps_v5` (4 vCPUs, 16 GiB RAM).
* **Resource Overhead:** ~30 to 50 MiB of RAM per MicroVM.
* **Startup Latency:** ~300 to 500 ms one-time startup delay when `judge0-workers` launches. Zero latency per student submission, because submissions are processed by the persistent Sidekiq daemon already running inside the microVM.
* **Operational Complexity:** Low-to-Medium. Configured via `/etc/docker/daemon.json` and a single Compose attribute (`runtime: kata`).

### 3.2 Option B: Firecracker MicroVMs
Firecracker is AWS's minimalist, hyper-optimized hypervisor developed for AWS Lambda and Fargate.

* **ARM64 Compatibility:** Full official support on ARM64 Neoverse-N1 cores.
* **Judge0 Integration:** **Extremely High Engineering Effort.**
  * Firecracker does not implement the Docker OCI runtime standard out of the box.
  * Adopting Firecracker directly requires either completely replacing Judge0's Rails worker and Isolate architecture with a custom daemon, or orchestrating tap networking, drive image overlays, and vsock communication manually.
* **Startup Latency & Overhead:** ~5 ms boot time, ~5 MiB memory overhead.
* **Verdict:** While technically elegant for greenfield function-as-a-service runners, integrating Firecracker with Judge0 requires abandoning upstream Judge0 CE, rewriting the queue consumer in Go or Rust, and rebuilding all 60+ language compiler environments into raw ext4 drive images.

### 3.3 Option C: Rootless Docker with Cgroups v2
Rootless Docker runs `dockerd` and container processes inside user namespaces (`CLONE_NEWUSER`), mapping container UID 0 to an unprivileged host UID (e.g., UID 100000).

* **Judge0 & Isolate Compatibility:** **FATAL COMPATIBILITY BLOCKER.**
  1. **Legacy Cgroups v1 Driver:** IOI Isolate explicitly expects cgroups v1 mounted at `/sys/fs/cgroup/{memory,cpu,pids}`. Rootless Docker and cgroup delegation rely fundamentally on cgroups v2. Cgroups v1 does not support nested delegation to non-root users.
  2. **Device Nodes & Chroot:** Isolate calls `mknod()` to populate `/dev/null` inside the chroot, which is strictly prohibited in unprivileged user namespaces.
  3. **Upstream Incompatibility:** Judge0 CE v1.13.1 has no native support for rootless mode.
* **Security Limitation:** Shares the host Linux kernel. Any kernel zero-day vulnerability can be triggered from an unprivileged user namespace to compromise the host.

---

## 4. Workstream 3: Verification of Recent CodeRabbit Fixes

In the preceding turnaround, CodeRabbit AI code review (`coderabbit review --uncommitted --agent`) flagged three specific issues across the repository:

### 4.1 `deploy/judge0/docker/Dockerfile.compilers-arm64` (Isolate Syntax Fix)
* **CodeRabbit Finding:** Line 68 appended `echo "dir /usr/local" >> /usr/local/etc/isolate`. Isolate v1.10.1 strictly requires configuration entries in `key=value` format. Directives like `dir /usr/local` cause sandbox initialization to abort with `Syntax error, expecting key=value`.
* **Verification of Diff:**
  ```diff
  --- a/deploy/judge0/docker/Dockerfile.compilers-arm64
  +++ b/deploy/judge0/docker/Dockerfile.compilers-arm64
  @@ -65,7 +65,6 @@ RUN git clone --depth 1 --branch v1.10.1 https://github.com/ioi/isolate.git . &&
       make install && \
       chmod 4755 /usr/local/bin/isolate && \
  -    echo "dir /usr/local" >> /usr/local/etc/isolate && \
       test -x /usr/local/bin/isolate && \
       test -f /usr/local/etc/isolate && \
       cd / && rm -rf /tmp/isolate-build
  ```
* **Status:** Confirmed. The invalid directive was removed from the source Dockerfile.
* **Image Deployment Analysis:**
  * The local source file is clean.
  * The cached Docker image on the Azure staging VM (`testforge/compilers:v1.4.0-arm64`) was built in Milestone C before this fix was committed.
  * During Milestone E live testing, this syntax error was remediated directly inside running containers.
  * For future clean builds, the image must be rebuilt from the updated Dockerfile. Under strict Milestone G boundaries, **no rebuild or Azure deployment was executed**.

### 4.2 `server/src/services/mutation.service.js` (Infrastructure Error Handling)
* **CodeRabbit Finding:** In `evaluateMutants`, if the execution runner returned `internal_error` with `output: null`, output comparison evaluated `compareOutputs(null, expectedOutput)` as false, misclassifying an infrastructure outage as a "killed mutant."
* **Verification of Diff:**
  ```javascript
  // In evaluateMutants:
  if (res.status === 'internal_error') {
    throw new Error(`[MutationService] Runner infrastructure error during mutant execution: ${res.error || 'Internal error'}`);
  }

  // In synthesizeCandidateTests:
  if (mutRes.status === 'internal_error') {
    continue;
  }
  ```
* **Status:** Confirmed. Infrastructure errors immediately abort or skip candidate synthesis, preventing false-positive mutant kill metrics.

### 4.3 `server/tests/mutationTesting.test.js` (Automated Regression Proof)
* Added missing `import mongoose from 'mongoose';` to resolve reference errors during offline test runs.
* Implemented two new automated regression tests:
  1. `Test 8`: Verifies that a failing runner returning `internal_error` causes `evaluateMutants` to throw an error rather than marking mutants as killed.
  2. `Test 9`: Verifies that `synthesizeCandidateTests` rejects candidate test cases when mutant execution returns `internal_error`.
* **Automated Test Evidence:**
  ```
  PASS tests/mutationTesting.test.js
    √ 8. Infrastructure internal_error rejects mutant evaluation and does not classify as killed mutant (5 ms)
    √ 9. Candidate test generation ignores mutants that fail due to internal_error infrastructure faults (23 ms)
  Tests: 24 passed, 24 total (100% Green)
  ```

---

## 5. Workstream 4: Architecture Decision Matrix & Final Recommendation

### 5.1 Architecture Decision Matrix

| Evaluation Criteria | Option A: Kata Containers (MicroVM) | Option B: Firecracker (Direct MicroVM) | Option C: Rootless Docker (Cgroups v2) |
| :--- | :---: | :---: | :---: |
| **Security Boundary** | **Hardware Virtualization (KVM)** | **Hardware Virtualization (KVM)** | Linux User Namespaces (Kernel Shared) |
| **Device Node Exposure (`/dev`)** | **Zero Host Devices Exposed** | **Zero Host Devices Exposed** | Masked Host Devices |
| **Host Kernel Blast Radius** | **Contained to Guest Kernel** | **Contained to Guest Kernel** | Full Host Kernel Surface |
| **Judge0 CE Compatibility** | **100% Native Compatibility** | Incompatible (Requires Rewrite) | Incompatible (Requires Isolate v2) |
| **ARM64 Native Support** | **Verified (Neoverse-N1)** | Verified (Neoverse-N1) | Verified |
| **Azure VM SKU Requirement** | `Standard_D2ps_v5` (Nested Virt) | `Standard_D2ps_v5` (Nested Virt) | Any SKU (`Standard_B2ps_v2`) |
| **Per-Submission Latency** | **0 ms** (Persistent Daemon) | ~5 - 10 ms (Per-run boot) | 0 ms |
| **Integration Effort** | **Low-Medium** (Compose Runtime) | Extremely High (Full Platform) | High (Cgroups v2 migration) |
| **Operational Maintenance** | Low (Standard OCI tooling) | High (Custom rootfs/kernels) | Medium |
| **Recommendation Verdict** | **RECOMMENDED (WINNER)** | ARCHITECTURAL REJECT | ARCHITECTURAL REJECT |

### 5.2 The Primary Recommendation
**Adopt Option A: Kata Containers with QEMU/Cloud-Hypervisor on an Azure ARM64 Nested Virtualization VM (`Standard_D2ps_v5`).**

#### Justification:
1. **True Hardware Virtualization:** The Judge0 worker container runs inside an independent guest kernel. Even though `judge0-workers` retains `privileged: true` to satisfy Isolate's namespace and cgroup creation, it has access **only to virtualized guest devices**. An escape from container root reaches only the guest VM, leaving the Azure host completely untouched.
2. **Preserves 100% of Upstream Judge0 & TestForge Logic:** Zero modifications are required to `isolate_job.rb`, Rails controllers, the Resque queue, compiler toolchains, or the Isolate wrapper.
3. **Zero Latency Penalty for Submissions:** Because `judge0-workers` is a long-running Sidekiq daemon, the microVM boot overhead (~300ms) is paid once at container startup. Student code runs within the pre-booted guest VM at native bare-metal execution speed.

### 5.3 The Strongest Counterargument to Option A
> **The Azure SKU & Cost Tradeoff Counterargument:**  
> Kata Containers strictly requires hardware-assisted nested virtualization (`/dev/kvm`). Azure does **not** support nested virtualization on burstable B-series VMs (`Standard_B2ps_v2`).  
> 
> Implementing Kata Containers necessitates resizing the VM from `Standard_B2ps_v2` (~₹1,500/month or ₹0 on Student credits) to a general-purpose D-series ARM64 SKU (`Standard_D2ps_v5`, ~₹4,500/month). For educational institutions or student tiers with fixed credit allowances, this increases monthly compute expenditure by approximately 3x and requires explicit quota allocation in the Azure region (`centralindia`).

---

## 6. Workstream 5: Staged Migration & Verification Plan (Milestone G Implementation)

The transition from privileged Docker containers to Kata Containers must follow an 8-stage gated migration. **No execution of these steps is authorized at this milestone.**

```
┌────────────────────────────────────────────────────────────────────────┐
│ STAGED MIGRATION ROADMAP FOR SEC-001 REMEDIATION                       │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 1: Local Development & Nested Virtualization Prototyping         │
│   ├─ Install containerd and kata-runtime on an ARM64 KVM test machine  │
│   └─ Configure /etc/docker/daemon.json with kata runtime definition    │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 2: Judge0 Container Integration on Kata Runtime                  │
│   ├─ Deploy testforge-judge0-workers with 'runtime: kata' in Compose   │
│   └─ Verify Sidekiq worker registers to Redis and consumes jobs        │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 3: Guest Cgroup v1 Hierarchy & Lifecycle Verification            │
│   ├─ Verify guest kernel mounts cgroups v1 (/sys/fs/cgroup/memory)     │
│   └─ Validate Isolate --init, --run, and --cleanup inside microVM      │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 4: Security Boundary & Device Isolation Verification             │
│   ├─ Confirm host /dev/sda1 is physically inaccessible from worker     │
│   └─ Verify network egress filtering between guest VM and host         │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 5: Non-Hostile Benign Validation Suite Execution                 │
│   ├─ Run Python 3, C++ GCC 9.2.0, Java OpenJDK, and timeout tests      │
│   └─ Confirm telemetry, execution timing, and resource accounting      │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 6: Staging VM SKU Transition Gate (Standard_D2ps_v5)             │
│   ├─ Human authorization to provision nested virtualization VM         │
│   └─ Deploy Kata runtime on Azure ARM64 staging VM                     │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 7: Hostile Containment Testing Gate (Milestone F Approval)       │
│   ├─ Human authorization to execute verify-containment.sh on microVM   │
│   └─ Verify fork bombs and memory bombs are contained inside guest VM  │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 8: Production Promotion & Formal Closure of SEC-001             │
│   ├─ Promote Kata Compose stack to production runner                   │
│   └─ Formally mark SEC-001 as RESOLVED in Security Risk Register       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Required Skill Orchestration Ledger

In strict accordance with autonomous development governance, all skills used in Milestone G are documented below:

| Skill | Discovered | Instructions Read | Actually Invoked | Workflow Followed | Blocked | Not Applicable | Evidence & Notes |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **1. GSD / Planning** | **YES** | **YES** | **YES** | **YES** | NO | NO | Structured Milestone G into 5 workstreams, defined decision matrices and 8-stage migration roadmap. |
| **2. Security Audit** | **YES** | **YES** | **YES** | **YES** | NO | NO | Audited Linux capability boundaries, `/dev` device exposure, and kernel privilege escalation under `privileged: true`. |
| **3. Docker Containerization**| **YES** | **YES** | **YES** | **YES** | NO | NO | Inspected `docker-compose.yml`, evaluated Kata OCI runtime integration, and verified Dockerfile layer hygiene. |
| **4. Backend Architect** | **YES** | **YES** | **YES** | **YES** | NO | NO | Evaluated Judge0 Sidekiq worker lifecycle, Redis queuing, and asynchronous submission handling under microVM sandboxing. |
| **5. Security SAST** | **YES** | **YES** | **YES** | **YES** | NO | NO | Audited source code diffs in `mutation.service.js` and `Dockerfile.compilers-arm64` to prevent false-positive mutation scoring. |
| **6. Testing / QA** | **YES** | **YES** | **YES** | **YES** | NO | NO | Authored and executed automated regression tests for `internal_error` and candidate test handling (24/24 passed). |
| **7. Documentation** | **YES** | **YES** | **YES** | **YES** | NO | NO | Created [`MILESTONE_G_ISOLATION_ARCHITECTURE.md`](file:///D:/TestForge/docs/engineering/reports/MILESTONE_G_ISOLATION_ARCHITECTURE.md) and updated all project registers. |
| **8. CodeRabbit Review** | **YES** | **YES** | **YES** | **YES** | NO | NO | Inspected CodeRabbit review findings and verified full remediation in source code and unit test suites. |
| **9. Ralph Loop** | **YES** | **YES** | NO | NO | NO | **YES** | Not applicable (no iterative code-repair loop required for architecture design). |

---

## 8. Final Stopping Gate & Required Next Human Approval

1. **Milestone G Architectural Assessment is COMPLETE.**
2. **Finding SEC-001 (`privileged: true` on workers) remains CRITICAL and UNRESOLVED.**
3. **Recommended Production Architecture:** Kata Containers (`runtime: kata`) backed by hardware-assisted KVM on an Azure ARM64 nested virtualization VM (`Standard_D2ps_v5`).
4. **Primary Blocker for Immediate Staging Deployment:** The existing staging VM (`Standard_B2ps_v2`) does not support hardware nested virtualization.
5. **Exact Next Human Approvals Required:**
   * **Decision 1:** Human review and approval of the Kata Containers architectural direction (Option A).
   * **Decision 2:** Human authorization to either:
     * (A) Transition the staging VM to an Azure nested virtualization SKU (`Standard_D2ps_v5`), **OR**
     * (B) Retain the current `Standard_B2ps_v2` VM for controlled Milestone F containment testing with container-level safeguards (`pids_limit`, `mem_limit`, VM snapshot), while scheduling Kata for production provisioning.

The engineering agent is **STOPPED**. Zero hostile code was executed. Zero cloud changes were made.
