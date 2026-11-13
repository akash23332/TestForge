# TestForge Phase 5.1C-5: Final Build and Isolate Verification Corrections Report

**Document ID:** TF-REP-5.1C-5  
**Status:** READY FOR NATIVE ARM64 BUILD (PRE-DEPLOYMENT VERIFICATION GATE)  
**Target Architecture:** ARM64 (`aarch64` / `arm64`)  
**Target Environment:** Azure Dedicated VM (Ubuntu 22.04.5 LTS ARM64, 2 vCPU, 8 GB RAM, 30 GB Disk, Hybrid Cgroups v1)  
**Date:** November 12, 2026  

---

## 1. Executive Summary & Verification Decision

Phase 5.1C-5 completes the repository-level corrections and security hardening for the TestForge custom ARM64 Judge0 build pipeline. All 8 critical audit items have been addressed:
1. **Isolate Compilation Targets:** Switched to explicit program targets (`make isolate isolate-check-environment`) to avoid missing documentation tool dependencies (`asciidoc`/`a2x`).
2. **Isolate Verification Protocol:** Eliminated error suppression from cleanup traps and lifecycle commands; replaced the unsupported `isolate --version` command with verified SUID root (`04755`) and environment diagnostics; and added strict directory and cgroup creation assertions.
3. **Security Test Classification:** Added direct Isolate sandbox tests (filesystem boundaries, network denial, cgroup memory limits, CPU timeout, process limits, cleanup) and explicitly differentiated direct Docker container sanity tests from Isolate kernel sandbox containment tests.
4. **Hardened Architecture Selection:** Added fail-closed image architecture verification in `deploy-runner.sh` and configured Docker Compose to require `JUDGE0_IMAGE`, preventing silent upstream AMD64 pull attempts.
5. **Cron Configuration Hardening:** Eliminated dangerous piping of `/etc/cron.d` system crontabs into user crontab; enforced `0644` `root:root` permissions and POSIX trailing newlines.
6. **Scoped Sudo Permissions:** Created a dedicated, root-owned `/usr/local/bin/start-cron-daemon` script (`0755 root:root`) and restricted `/etc/sudoers.d/judge0` to exact binary calls without arbitrary argument execution.
7. **Host-Level Resource Accounting:** Mathematically and architecturally established that Isolate cgroups run as **root siblings** on the host, meaning Docker container memory limits do not account for student processes; verified that staging concurrency (`COUNT=1`) safeguards the ~2,100 MB host memory buffer.
8. **Reproducibility & Integrity:** Preserved cryptographic checksums (OpenSSL 1.1.1w and Ruby 2.7.8) and documented immutable tag/commit pinning.

### **Decision: `READY FOR NATIVE ARM64 BUILD`**
*Important Boundary Notice:* This decision authorizes the execution of native compilation and binary verification on the physical Azure ARM64 host (`sudo bash build-arm64.sh`). It does **not** claim production readiness or authorize production deployment. Authoritative readiness can only be established after physical execution of the test suite on the live ARM64 VM.

---

## 2. Updated Scripts, Dockerfiles & Configurations

| File | Critical Task Addressed | Summary of Corrections |
| :--- | :--- | :--- |
| `deploy/judge0/docker/Dockerfile.compilers-arm64` | **Task 1**, **Task 8** | • Compiles explicit targets `make -j$(nproc) isolate isolate-check-environment` to bypass missing `asciidoc` dependencies.<br>• Validates installation of `/usr/local/bin/isolate` (mode `4755`) and `/usr/local/etc/isolate`.<br>• Preserves SHA-256 verification for OpenSSL 1.1.1w and Ruby 2.7.8. |
| `deploy/judge0/docker/Dockerfile.judge0-arm64` | **Task 5**, **Task 6** | • Fixes system cron installation: removed `cat /etc/cron.d/* \| crontab -`; enforces `0644 root:root` and POSIX trailing newlines.<br>• Creates root-owned wrapper `/usr/local/bin/start-cron-daemon` (`0755`).<br>• Scopes `/etc/sudoers.d/judge0` to exact binaries (`/usr/local/bin/start-cron-daemon`, `/usr/local/bin/isolate`, `/usr/sbin/service cron start`, `/etc/init.d/cron start`). |
| `deploy/judge0/verify-cgroups-isolate.sh` | **Task 2**, **Task 3** | • Removed all cleanup error suppression (`\|\| true`).<br>• Replaced unsupported `isolate --version` with SUID root checks and `/usr/local/bin/isolate-check-environment`.<br>• Added verification of physical box directory (`/var/local/lib/isolate/$BOX_ID/box`) and cgroup directory.<br>• Added direct Isolate security tests (filesystem boundary, network denial, cgroup memory OOM, CPU timeout, cleanup). |
| `deploy/judge0/verify-arm64-binaries.sh` | **Task 3** | • Explicitly labeled Section 5 as **Direct Docker Container Compiler Sanity Tests (NOT Isolate Sandbox Tests)** to prevent conflating container toolchain checks with kernel sandbox boundaries. |
| `deploy/judge0/deploy-runner.sh` | **Task 4** | • Added post-inspection image architecture verification (`RESOLVED_IMG_ARCH`), failing closed if a non-ARM64 image is supplied on an ARM64 host.<br>• Validates architecture even if an explicit `JUDGE0_IMAGE` override is provided. |
| `deploy/judge0/docker-compose.yml` | **Task 4** | • Configured `image: ${JUDGE0_IMAGE:?FATAL: JUDGE0_IMAGE must be set in .env ...}` for both `judge0-server` and `judge0-workers` to eliminate silent fallback to AMD64 upstream images. |
| `deploy/judge0/build-arm64.sh` | **Task 4** | • Updated Buildx and binfmt verification output to accurately describe platform inspection and emulation checks. |
| `deploy/judge0/verify-resource-accounting.sh` | **Task 7** | • Enhanced reporting to explicitly prove whether child cgroups are nested under Docker or root siblings, documenting host RAM exposure and staging `COUNT=1` protections. |

---

## 3. Deep-Dive Technical Findings

### 3.1 Isolate Compilation Target Architecture
The upstream `ioi/isolate` Makefile defines its default target as:
```makefile
all: $(PROGRAMS) $(MANPAGES) $(addsuffix .html, $(MANPAGES)) $(CONFIGS)
```
Building `$(MANPAGES)` requires the `asciidoc` toolchain (`a2x`), which is not required for running sandboxes and adds substantial bloat and failure modes to base container images. In contrast, `install` depends strictly on:
```makefile
install: $(PROGRAMS) $(CONFIGS)
```
By explicitly compiling `make -j$(nproc) isolate isolate-check-environment` followed by `make install`, the build compiles only the C binaries and configuration files, avoiding documentation generation failures while installing `/usr/local/bin/isolate` with SUID root (`04755`) and `/usr/local/etc/isolate`.

### 3.2 Isolate Verification & Lack of `--version` Flag
Source analysis of `isolate.c` confirms that IOI Isolate does **not** implement a `--version` or `--help` command-line flag. Calling `isolate --version` invokes `die("Invalid option")` and exits with an error status.
The verification suite was corrected to validate Isolate via:
1. File permission assertion: `test -u /usr/local/bin/isolate` (SUID root) and `test -x /usr/local/bin/isolate`.
2. Binary helper check: `/usr/local/bin/isolate-check-environment` (validates kernel namespaces and cgroup controller availability).
3. Configuration presence: `test -f /usr/local/etc/isolate`.
4. Sandbox initialization check: Verifying physical creation of `/var/local/lib/isolate/$BOX_ID/box` and `/sys/fs/cgroup/memory/isolate/box-$BOX_ID`.

### 3.3 Root Sibling vs. Nested Cgroup Accounting
Inspection of Docker privileged execution on Ubuntu 22.04 with cgroups v1 reveals how child processes are charged:
* `judge0-workers` runs with `privileged: true`, mounting host `/sys/fs/cgroup` read-write.
* When Isolate initializes Box 98 with `--cg`, it creates:
  ```
  /sys/fs/cgroup/memory/isolate/box-98/
  ```
* Because `/sys/fs/cgroup/memory/isolate` is a direct child of `/sys/fs/cgroup/memory`, it is a **sibling** to the Docker daemon slice `/sys/fs/cgroup/memory/docker/<container-id>`.
* **Consequence:** Docker's `mem_limit: 3072m` on `judge0-workers` applies exclusively to the Ruby/Resque worker process. It does **not** account for student processes executed inside Isolate boxes.
* **Host Protection:** Student processes are constrained solely by Isolate's `--cg-mem` parameter (default `256000 KB` = ~250 MB). In staging, concurrency is strictly locked to `COUNT=1`, ensuring that total sibling consumption cannot exceed 250 MB. This fits easily within the ~2,100 MB unallocated host headroom buffer ($8192\text{ MB RAM} - 1100\text{ MB OS} - 4992\text{ MB stack limits} = 2100\text{ MB}$).

---

## 4. Test Suite Execution & Evidence

Automated validation was executed across 5 test suites (94 total tests):

```bash
npm --prefix server run test -- \
  tests/phase51C5FinalVerification.test.js \
  tests/phase51C4BuildHardening.test.js \
  tests/phase51C3Remediation.test.js \
  tests/backendToRunnerIntegration.test.js \
  tests/healthReadiness.test.js
```

### Result:
```
PASS tests/phase51C5FinalVerification.test.js (24 tests)
PASS tests/phase51C4BuildHardening.test.js (29 tests)
PASS tests/phase51C3Remediation.test.js (19 tests)
PASS tests/backendToRunnerIntegration.test.js (18 tests)
PASS tests/healthReadiness.test.js (4 tests)

Test Suites: 5 passed, 5 total
Tests:       94 passed, 94 total
Snapshots:   0 total
Time:        4.018 s
```

---

## 5. Unresolved Risks & Operational Caveats

While all repository-level code and configuration issues are resolved, the following technical and operational risks remain and must be managed on the live VM:

1. **Host-Level Kernel Reliance:**
   Isolate relies on the host Linux kernel's cgroups v1 implementation. If the Azure host VM kernel is updated or boots without `systemd.unified_cgroup_hierarchy=0`, Isolate initialization will immediately fail. Gate G1 and G2 in `verify-cgroups-isolate.sh` enforce this before activation.
2. **Container Privileged Mode:**
   `judge0-workers` operates with `privileged: true` to manage mount namespaces and host cgroups. Although untrusted code runs as an unprivileged UID (`60000+`) inside Isolate, an unpatched Linux kernel vulnerability could theoretically permit container breakout. Single-tenancy on the runner VM is the critical compensating control.
3. **APT Package Version Drift:**
   While OpenSSL and Ruby source downloads are cryptographically pinned via SHA-256, OS packages (`gcc`, `openjdk-17-jdk-headless`, `nodejs`) are installed via `apt-get` from Ubuntu and NodeSource mirrors. Minor revision updates to these distribution packages could occur over time.
4. **Staging Concurrency Bound:**
   Because Isolate child processes are sibling-accounted, increasing concurrency (`COUNT > 1`) in the future will require re-evaluating the physical memory budget to prevent host-level OOM events.

---

## 6. Next Authorized Action on ARM64 Host

The repository changes are verified. When authorized by the infrastructure team, the operator may proceed on the dedicated Azure ARM64 VM with the following command sequence:

```bash
# 1. Pull latest repository changes
cd /opt/testforge
git pull origin main

# 2. Build native ARM64 container images (Bypass emulation)
cd /opt/testforge/deploy/judge0
sudo bash build-arm64.sh

# 3. Verify ELF binary architectures and toolchains
sudo bash verify-arm64-binaries.sh

# 4. Deploy container stack with verified ARM64 images
sudo bash deploy-runner.sh

# 5. Run operational cgroup and Isolate engine verification
sudo bash verify-cgroups-isolate.sh

# 6. Run resource accounting & headroom probe
sudo bash verify-resource-accounting.sh

# 7. Run full hostile-code containment suite
sudo bash verify-containment.sh
```
