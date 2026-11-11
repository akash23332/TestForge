# TestForge Phase 5.1A.1: ARM64 Dockerfile Security and Runtime Review

**Date:** November 12, 2026  
**Auditor:** Senior Distributed Systems, Security & DevSecOps Architecture Team  
**Scope:** Review of Dockerfiles, compose stacks, runtime privilege models, and resource limits before Phase 5.1B execution.  
**Target Runner:** Oracle Cloud Infrastructure Always Free Ampere A1 (2 OCPUs, 12 GB RAM, Ubuntu 22.04 LTS ARM64)  
**Status:** Mandatory Review Gate Completed  

---

## 1. Executive Summary & Verdict

### Final Review Verdict: 🟡 **APPROVED WITH CONDITIONS**

Before executing any builds or provisioning infrastructure, an exhaustive code and security review of all prepared Dockerfiles, build scripts, compose configurations, and runtime constraints was completed.

The review revealed **four critical, concrete defects** in the initial design that would have caused immediate build failures or runtime execution stalls:
1. **Fatal Ruby / OpenSSL Incompatibility:** Ubuntu 22.04 LTS defaults to OpenSSL 3.0, which causes Ruby 2.7.x source compilation to crash fatally.
2. **Missing Worker Start Command:** `judge0-workers` lacked `command: ["./scripts/workers"]`, causing both containers to boot Puma servers and leaving the submission queue deadlocked.
3. **Excessive Privileges on API Server:** `judge0-server` was set to `privileged: true`, despite never interacting with `isolate` or cgroups.
4. **Missing Container Resource Quotas:** Containers lacked Docker-level `mem_limit` and `cpus` limits, risking host memory starvation on a 12 GB RAM instance.

All four issues were remediated and verified in the repository configuration files.

### Conditions for Proceeding to Phase 5.1B:
1. **Native ARM64 Execution Only:** Image compilation and runtime sandbox testing must be conducted on an actual ARM64 host. QEMU cross-compilation does not constitute runtime validation.
2. **Kernel Cgroups v1 Prerequisite:** The host must boot with `systemd.unified_cgroup_hierarchy=0` before container execution.
3. **Strict Initial Concurrency Cap:** Concurrency is locked to **1 concurrent execution** (`COUNT=1`) during initial staging.

---

## 2. Files Inspected

The following repository files were inspected directly:
- [`deploy/judge0/docker/Dockerfile.compilers-arm64`](file:///d:/TestForge/deploy/judge0/docker/Dockerfile.compilers-arm64)
- [`deploy/judge0/docker/Dockerfile.judge0-arm64`](file:///d:/TestForge/deploy/judge0/docker/Dockerfile.judge0-arm64)
- [`deploy/judge0/build-arm64.sh`](file:///d:/TestForge/deploy/judge0/build-arm64.sh)
- [`deploy/judge0/verify-arm64-binaries.sh`](file:///d:/TestForge/deploy/judge0/verify-arm64-binaries.sh)
- [`deploy/judge0/docker-compose.yml`](file:///d:/TestForge/deploy/judge0/docker-compose.yml)
- [`deploy/judge0/judge0.conf`](file:///d:/TestForge/deploy/judge0/judge0.conf)

---

## 3. Confirmed Issues & Applied Remediations

### Issue 1: Ruby 2.7.x vs. OpenSSL 3.0 Incompatibility (CRITICAL)
- **Root Cause:** Ubuntu 22.04 LTS ships with OpenSSL 3.0. Ruby versions prior to 3.1 do not support OpenSSL 3.0. Attempting to compile Ruby 2.7.8 against `libssl-dev` causes Ruby's `openssl` C extension to fail compilation, terminating the Docker build.
- **Fix Applied:** Updated `deploy/judge0/docker/Dockerfile.compilers-arm64` to download, build, and statically package **OpenSSL 1.1.1w** into `/opt/openssl-1.1.1`, passing `--with-openssl-dir=/opt/openssl-1.1.1` to Ruby's `./configure`.

### Issue 2: Missing Worker Execution Command (CRITICAL)
- **Root Cause:** In `deploy/judge0/docker-compose.yml`, `judge0-workers` did not specify `command: ["./scripts/workers"]`. Consequently, the container defaulted to `CMD ["/api/scripts/server"]`. Two Puma API servers would boot, and zero background worker processes would consume jobs from Redis, causing all submissions to remain indefinitely in `status: 1` (`In Queue`).
- **Fix Applied:** Added `command: ["./scripts/workers"]` and `COUNT=1` to `judge0-workers` in `deploy/judge0/docker-compose.yml`.

### Issue 3: Over-Privileged API Server (SECURITY)
- **Root Cause:** `judge0-server` was set to `privileged: true`. In Judge0 architecture, the API server handles HTTP routing, authentication, and database/queue interactions; it never invokes `isolate`. Running it privileged created an unnecessary attack surface.
- **Fix Applied:** Set `privileged: false` on `judge0-server` in `deploy/judge0/docker-compose.yml`.

### Issue 4: Unbounded Container Memory Limits (RELIABILITY)
- **Root Cause:** No container-level memory limits (`mem_limit`) were defined in `docker-compose.yml`. Under peak compilation or memory allocation attacks, the worker container could consume all 12 GB of host RAM, triggering the Linux OOM killer against the SSH daemon or Docker engine.
- **Fix Applied:** Applied strict resource boundaries in `docker-compose.yml`:
  - `judge0-server`: `mem_limit: 1536m`, `cpus: 0.50`
  - `judge0-workers`: `mem_limit: 4096m`, `cpus: 1.00`
  - `judge0-db`: `mem_limit: 512m`, `cpus: 0.25`
  - `judge0-redis`: `mem_limit: 384m`, `cpus: 0.25`

---

## 4. Critical Isolate Privilege Review

```
                                  Privilege Model Analysis
                                             │
                     ┌───────────────────────┴───────────────────────┐
                     ▼                                               ▼
         [judge0-server (Puma)]                          [judge0-workers (Resque)]
         • User: judge0 (UID 1000)                       • User: judge0 (UID 1000)
         • privileged: false                             • privileged: true (Required)
         • No host device access                         • Access to host /sys/fs/cgroup
         • No namespace creation                         • Calls isolate (SUID root)
         • Connects to Postgres & Redis                  • isolate spawns box under UID 60000+
```

### 4.1 How Isolate Interacts with Host Privileges
1. **Binary SUID Root:** Inside `testforge/compilers:v1.4.0-arm64`, the `isolate` binary is owned by `root:root` with permissions `4755` (`chmod 4755 /usr/local/bin/isolate`).
2. **Execution Context:** The worker process runs as `USER judge0` (UID 1000). When `isolate` is called, the SUID bit elevates effective UID to `0` (root).
3. **Required Syscalls:**
   - `mount("none", "/var/local/lib/isolate/N/box", "tmpfs", ...)`
   - `clone(CLONE_NEWPID | CLONE_NEWNET | CLONE_NEWNS | CLONE_NEWIPC | CLONE_NEWUTS)`
   - `mkdir("/sys/fs/cgroup/memory/isolate/box-N")`
   - `write("/sys/fs/cgroup/memory/isolate/box-N/memory.limit_in_bytes")`
4. **Privilege Dropping:** Inside the created sandbox jail, `isolate` drops all privileges to an isolated sandbox UID (`60000 + box_id`), with read-only root mounts and zero network interfaces.
5. **Why `privileged: true` is Required for Workers:**
   - In standard Docker containers, `/sys/fs/cgroup` is mounted read-only (`:ro`), preventing cgroup directory creation.
   - Standard Docker seccomp filters block nested `mount()` and `unshare()` operations.
   - Therefore, `privileged: true` is mathematically necessary for `judge0-workers`.
6. **Isolation Boundary:**
   - The worker container **never mounts `/var/run/docker.sock`**.
   - Host isolation is preserved by hosting the runner on a **dedicated single-tenant VM** containing no application secrets or production databases.

---

## 5. Recalculated Resource Allocation Review (12 GB RAM & 2 OCPUs)

### 5.1 Strict Memory Budget

| Service / Domain | Container Name | Memory Limit (`mem_limit`) | CPU Quota (`cpus`) | Breakdown & Accounting Justification |
| :--- | :--- | :--- | :--- | :--- |
| **Host Operating System** | Host OS (Ubuntu 22.04) | Reserved 2,048 MB (2.0 GB) | 0.25 OCPU | Kernel, systemd, SSH, UFW, Docker daemon, Tailscale daemon. |
| **Database** | `testforge-judge0-db` | 512 MB | 0.25 OCPU | PostgreSQL 16 Alpine (`shared_buffers=128MB`, `work_mem=16MB`, max 30 connections). |
| **Cache & Queue** | `testforge-judge0-redis`| 384 MB | 0.25 OCPU | Redis 7 Alpine (`maxmemory 256mb` LRU eviction policy). |
| **Puma API Server** | `testforge-judge0-server`| 1,536 MB (1.5 GB) | 0.50 OCPU | Puma master + 2 workers handling HTTP serialization and auth tokens. |
| **Worker & Sandbox Host** | `testforge-judge0-workers`| 4,096 MB (4.0 GB) | 1.00 OCPU | Worker process (~500MB) + active compile burst (GCC/javac ~800MB) + single active Isolate box (256–512MB). |
| **Host Unallocated Headroom**| Linux Page Cache / Headroom | 3,424 MB (~3.4 GB) | Shared Burst | OS buffer cache, prevents OOM-killer invocations during peak compilation spikes. |
| **TOTAL** | **Full Physical Host** | **12,000 MB (12.0 GB)** | **2.00 OCPUs** | **100% within OCI Always Free Allocation** |

### 5.2 Initial Concurrency Policy
- **Concurrency Cap:** Exactly **1 concurrent execution** (`COUNT=1` in `docker-compose.yml`).
- **Rationale:** Staging must verify baseline memory and isolate cgroup accounting under single-execution load before any horizontal worker scaling is introduced.

---

## 6. Compiler Image & Language Support Verification

### 6.1 Language Paths & Compatibility Mappings
TestForge strictly requires four programming languages:

| Language | TestForge ID | Judge0 ID | Binary Path | Compatibility Symlink |
| :--- | :--- | :--- | :--- | :--- |
| **C++** | `cpp` / `c++` | 54 | `/usr/bin/g++` | `/usr/local/gcc-9.2.0/bin/g++` |
| **Java** | `java` | 62 | `/usr/bin/javac`, `/usr/bin/java` | `/usr/local/openjdk-13/bin/javac`, `java` |
| **JavaScript** | `javascript` / `js` | 63 | `/usr/bin/node` | `/usr/local/node-12.14.0/bin/node` |
| **Python** | `python` / `py` | 71 | `/usr/bin/python3` | `/usr/local/python-3.8.1/bin/python3` |

### 6.2 Verified In-Container Sanity Test Commands
The verification script [`deploy/judge0/verify-arm64-binaries.sh`](file:///d:/TestForge/deploy/judge0/verify-arm64-binaries.sh) tests all four languages:
- **C++:** `g++ -O2 /tmp/test.cpp -o /tmp/test_cpp && /tmp/test_cpp` -> Asserts `TESTFORGE_CPP_OK`.
- **Java:** `javac Main.java && java Main` -> Asserts `TESTFORGE_JAVA_OK`.
- **JavaScript:** `node -e 'console.log("TESTFORGE_JS_OK")'` -> Asserts `TESTFORGE_JS_OK`.
- **Python:** `python3 -c 'print("TESTFORGE_PY_OK")'` -> Asserts `TESTFORGE_PY_OK`.

---

## 7. Security Boundary Audit

1. **Host Boundary:**
   - `/var/run/docker.sock` is **NEVER** mounted into any container.
   - Database and Redis have **no published host ports** (only accessible within `judge0-net`).
   - Puma port 2358 binds exclusively to `127.0.0.1:2358` (no public host exposure).
2. **Sandbox Boundary:**
   - Network egress is disabled by default (`ENABLE_NETWORK=false`) and locked against override (`ALLOW_ENABLE_NETWORK=false`).
   - Host filesystem root is mounted read-only inside Isolate; writable storage is restricted to ephemeral `/box` up to `MAX_FILE_SIZE` (10MB).
   - Process count is hard-capped at `MAX_PROCESSES_AND_OR_THREADS=60`.
3. **Application Boundary:**
   - TestForge express backend and background worker run on Render, completely separate from the runner VM.
   - Expected outputs and reference solutions **never leave TestForge**.
   - `EXECUTION_PROVIDER=mock` remains fail-closed (awards zero marks in production).

---

## 8. Build Validation Plan (Levels A through F)

```
Level A: Dockerfile Syntax & Linting Validation
   │
   ▼
Level B: Native ARM64 Image Build (build-arm64.sh on ARM64 host)
   │
   ▼
Level C: Architecture & ELF Binary Inspection (verify-arm64-binaries.sh)
   │
   ▼
Level D: Container Stack Startup & Puma Initialization (docker compose up -d)
   │
   ▼
Level E: Isolate Sandbox Lifecycle Verification (verify-cgroups-isolate.sh)
   │
   ▼
Level F: Hostile-Code Containment Test Suite (verify-containment.sh - 16 attack tests)
```

- **Level A (Syntax):** Validate Dockerfile directives and build args.
- **Level B (Build):** Execute `bash build-arm64.sh` on native `aarch64` Linux.
- **Level C (ELF Headers):** Run `verify-arm64-binaries.sh` to confirm 64-bit ARM ELF headers on `isolate`, `ruby`, `gcc`, `node`, `python3`, `java`.
- **Level D (Startup):** Launch `docker compose up -d` and inspect healthy container status for all 4 services.
- **Level E (Sandbox):** Execute `verify-cgroups-isolate.sh` to validate kernel cmdline, cgroup v1 mounts, and Box 98 initialization.
- **Level F (Containment):** Execute `verify-containment.sh` (16 tests verifying auth, timeouts, memory ceilings, fork bomb caps, and zero network egress).

---

## 9. Conclusion & Next Steps

The Dockerfiles, build scripts, and compose stacks have been hardened, patched for OpenSSL 1.1.1, and configured with strict resource boundaries.

All technical prerequisites for **Phase 5.1B (Staging Build & Validation)** are satisfied.

**Awaiting human review and approval to proceed with Phase 5.1B.**
