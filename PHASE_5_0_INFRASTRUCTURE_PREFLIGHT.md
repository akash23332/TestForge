# TestForge Phase 5.0: Infrastructure Preflight and ARM64 Compatibility Audit

**Date:** November 12, 2026  
**Auditor:** Senior Distributed Systems, Security & DevSecOps Architecture Team  
**Target Environment:** Oracle Cloud Infrastructure (OCI) Always Free / Dedicated Linux Staging Runner  
**Pinned Execution Stack:** Judge0 CE v1.13.1 (`judge0/judge0:v1.13.1`), Redis 7 Alpine, PostgreSQL 16 Alpine, Isolate Sandbox  
**Backend Host:** Render Web Service / Background Worker (Node.js 20 LTS, BullMQ, MongoDB Atlas)  

---

## 1. Executive Summary: Ready vs. Blocked

### Overall Assessment: **BLOCKED ON NATIVE ARM64 (OCI Ampere A1)**

Before provisioning cloud resources or creating instances, a rigorous architecture audit of the TestForge code execution infrastructure was conducted. 

| Evaluation Dimension | Status | Key Finding |
| :--- | :--- | :--- |
| **Upstream Judge0 CE v1.13.1 Image** | 🔴 **BLOCKED** | Built **exclusively for `linux/amd64` (x86_64)**. No official `linux/arm64` manifest exists on Docker Hub. |
| **QEMU Emulation Fallback** | 🔴 **PROHIBITED** | Running `linux/amd64` via QEMU user emulation breaks `isolate` namespaces, cgroup accounting, seccomp filters, and clone syscalls. |
| **PostgreSQL 16 Alpine** | 🟢 **COMPATIBLE** | Multi-arch official image supporting `linux/arm64/v8` natively. |
| **Redis 7 Alpine** | 🟢 **COMPATIBLE** | Multi-arch official image supporting `linux/arm64/v8` natively. |
| **Linux Kernel & Cgroups v1** | 🟡 **REQUIRES GRUB REBOOT** | Ubuntu 22.04 LTS defaults to cgroups v2. Requires `systemd.unified_cgroup_hierarchy=0` in GRUB. Supported on ARM64 kernel. |
| **Backend Integration (`RenderSandboxProvider`)** | 🟢 **READY** | Full support for Judge0 REST API, polling/wait, token lifecycle, cancellation, `undici` HTTP/SOCKS5 proxy, and fail-closed guards. |
| **Production Execution Safeguards** | 🟢 **ENFORCED** | `EXECUTION_PROVIDER=mock` is fail-closed (awards zero marks in production). Local execution fallback is strictly blocked. |

### Core Blocker Detail:
The proposed staging runner is an **Oracle Cloud Infrastructure (OCI) Ampere A1 Compute Instance (`VM.Standard.A1.Flex`)**, which uses **ARM64 (`aarch64`)** CPU architecture. However, official Judge0 CE images (`judge0/judge0:v1.13.1`) and their foundational compiler base image (`judge0/compilers:1.4.0`) are compiled **strictly for x86_64 (`linux/amd64`)**. 

Attempting to run `docker compose pull` on an OCI Ampere A1 VM fails immediately with:
```
no matching manifest for linux/arm64/v8 in the manifest list entries
```
Attempting to force execution via `platform: linux/amd64` through Docker's QEMU emulation layer causes fatal runtime failures inside the `isolate` sandboxing utility (e.g. `No such file or directory @ rb_sysopen - /box/script.xx`, broken timer signals, and non-functional cgroups memory limits).

### Recommended Action:
To proceed to **Phase 5.1 (Staging Provisioning)**, TestForge must adopt one of two verified paths:
1. **Option A (Recommended for immediate stability):** Provision an **x86_64 Linux VM** (e.g., Hetzner Cloud CPX21/CPX31 ~€6–11/mo, DigitalOcean Droplet 8GB, or AWS EC2 `c6i.xlarge`). Pinned `judge0/judge0:v1.13.1` runs 100% natively without image modifications.
2. **Option B (OCI Ampere A1 Multi-Arch Build):** Build and maintain a custom native `linux/arm64` Docker image for Judge0 compilers and runner (`testforge/judge0:v1.13.1-arm64`) using Ubuntu 22.04 aarch64 native compiler toolchains and a native ARM64 `isolate` binary.

---

## 2. Image and Architecture Compatibility Matrix

| Component | Pinned Version / Tag | Upstream Arch Support | ARM64 (OCI Ampere A1) Native Compatibility | Impact & Failure Mode on ARM64 |
| :--- | :--- | :--- | :--- | :--- |
| **Judge0 API & Worker** | `judge0/judge0:v1.13.1` | `linux/amd64` | ❌ **No** | Docker pull fails; if forced with QEMU, entrypoint fails with `exec format error` or Puma/isolate crashes. |
| **Judge0 Base Compilers** | `judge0/compilers:1.4.0` | `linux/amd64` | ❌ **No** | Embedded GCC, Clang, OpenJDK, Python, and Node.js binaries are all x86_64 ELF binaries. |
| **Isolate Sandbox** | Bundled in Judge0 v1.13.1 (Martin Mareš `isolate`) | `linux/amd64` binary | ❌ **No** (Binary is x86_64) | Source code supports ARM64, but binary inside container is x86_64. Syscalls (`clone`, `unshare`, `cgroups`) fail under emulation. |
| **PostgreSQL Database** | `postgres:16-alpine` | `linux/amd64`, `linux/arm64/v8`, `arm/v7`, `ppc64le`, `s390x` | 🟢 **Yes** | Runs natively with full ARM64 performance and zero compatibility issues. |
| **Redis Cache** | `redis:7-alpine` | `linux/amd64`, `linux/arm64/v8`, `arm/v7`, `ppc64le`, `s390x` | 🟢 **Yes** | Runs natively with full ARM64 performance and LRU memory eviction. |
| **C / C++ Compiler** | GCC 9.2.0 / 13.x | Bundled in base | ❌ **x86_64 ELF** | Cannot compile on ARM64 without QEMU or native ARM64 toolchain. |
| **Java Runtime** | OpenJDK 17 | Bundled in base | ❌ **x86_64 ELF** | JVM JIT and memory limits fail under QEMU emulation. |
| **Python Runtime** | Python 3.11.2 | Bundled in base | ❌ **x86_64 ELF** | Bytecode execution unstable under QEMU with isolate cgroups. |
| **Node.js Runtime** | Node.js 18.15.0 / 20.x | Bundled in base | ❌ **x86_64 ELF** | V8 engine memory page alignment issues under QEMU emulation. |

---

## 3. Kernel, Cgroup, and OS Requirements

### 3.1 Operating System & Distribution
- **Target OS:** Ubuntu 22.04 LTS (Jammy Jellyfish) or Ubuntu 24.04 LTS.
- **Kernel:** Linux 5.15+ (standard `linux-image-generic` or `linux-image-oracle`).
- **Architecture Check:** Verified in `deploy-runner.sh` via `uname -m`.

### 3.2 Cgroups Hierarchy: v1 Legacy vs. v2 Unified
- **Requirement:** Judge0 CE v1.13.1 relies on the **legacy cgroups v1 hierarchy** (`/sys/fs/cgroup/memory`, `/sys/fs/cgroup/cpuacct`, `/sys/fs/cgroup/cpuset`).
- **Modern Linux Default:** Ubuntu 22.04+ boots with unified cgroups v2 (`/sys/fs/cgroup` unified mount).
- **Mandatory GRUB Parameter:**
  ```ini
  systemd.unified_cgroup_hierarchy=0
  ```
- **ARM64 Kernel Compatibility:**
  The Linux kernel for ARM64 (`aarch64`) **does** support legacy cgroups v1 when booted with `systemd.unified_cgroup_hierarchy=0`.
- **Configuration & Reboot Workflow:**
  1. Add parameter to `/etc/default/grub`:
     ```bash
     sed -i 's/GRUB_CMDLINE_LINUX="/GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=0 /' /etc/default/grub
     ```
  2. Update GRUB:
     ```bash
     sudo update-grub
     ```
  3. **Mandatory Reboot:** A complete VM reboot (`sudo reboot`) is required to switch the systemd init hierarchy from v2 to v1.
  4. Verification probe: `verify-cgroups-isolate.sh` checks `/proc/cmdline` and asserts writeability on `/sys/fs/cgroup/memory`, `/sys/fs/cgroup/cpuacct`, and `/sys/fs/cgroup/cpuset`.

### 3.3 OCI Ampere A1 Platform Nuances
- OCI Ampere A1 instances boot via UEFI. GRUB updates write to `/boot/efi/EFI/ubuntu/grub.cfg`.
- System memory per instance: Up to 24 GB RAM and 4 OCPUs on OCI Always Free.
- Page size: Standard Ubuntu ARM64 uses 4KB memory pages (some enterprise distributions use 64KB pages; ensure 4KB pages for isolate compatibility).

---

## 4. Tailscale & Networking Preflight

TestForge's API and background worker run on **Render** (or PaaS), while the code execution runner runs on an isolated Linux VM.

```
┌─────────────────────────────────┐                 ┌─────────────────────────────────┐
│       Render Web Service        │                 │    Dedicated Runner Host        │
│    (TestForge API & Worker)     │                 │   (OCI Ampere / x86_64 VM)      │
│                                 │                 │                                 │
│  [RenderSandboxProvider]        │                 │  [UFW Firewall: Deny Incoming]  │
│             │                   │                 │                 │               │
│             ▼                   │                 │                 ▼               │
│   (Undici ProxyAgent)           │                 │   [Caddy Reverse Proxy: 443]    │
│             │                   │                 │    - TLS 1.3 Termination        │
│             │                   │                 │    - Route Whitelist            │
│             │                   │                 │    - HTTP Method Filter         │
│             ▼                   │                 │                 │               │
│  ┌───────────────────────────┐  │  Encrypted TLS  │                 ▼               │
│  │ Tailscale SOCKS5 / Direct │──┼────────────────┼─► [Judge0 API: 127.0.0.1:2358]   │
│  └───────────────────────────┘  │   or Tailnet    │                 │               │
│                                 │                 │                 ▼               │
│                                 │                 │      [Postgres & Redis]         │
└─────────────────────────────────┘                 └─────────────────────────────────┘
```

### 4.1 Ingress Connectivity Architectural Options

| Strategy | Architecture | Latency Overhead | Setup Complexity | Render Feasibility |
| :--- | :--- | :--- | :--- | :--- |
| **Strategy 1: Direct HTTPS via Caddy (Recommended)** | Public IPv4 on Runner VM; Caddy reverse proxy on port 443 with Let's Encrypt TLS; Judge0 bound to `127.0.0.1:2358`; protected by `X-Auth-Token` + `X-Auth-User` + strict route whitelist. | Lowest (<10ms cloud transit) | Low (Automated via Caddyfile) | 🟢 **100% Native.** Works out-of-the-box on Render without extra background daemons. |
| **Strategy 2: Tailscale Userspace SOCKS5 Proxy** | Tailscale node running on Runner VM; Render worker runs Tailscale with `--tun=userspace-networking --socks5-server=localhost:1055 --outbound-http-proxy-listen=localhost:1056`; `TAILSCALE_PROXY=http://127.0.0.1:1056`. | Low (+5-15ms wireguard tunnel) | Moderate | 🟡 Requires running Tailscale sidecar/script in Render startup command. |
| **Strategy 3: Tailscale Subnet Router** | Persistent gateway VM in cloud VPC routing traffic into the private subnet. | Moderate (+15-30ms extra hop) | High | 🔴 Overkill for single staging runner. |

### 4.2 Security Rules & Firewall Configuration
- **Public Interface (`eth0` / `ens3`):**
  - Port 22 (SSH): Permitted (key-based authentication only).
  - Port 80 (HTTP): Permitted (ACME Let's Encrypt challenge for Caddy).
  - Port 443 (HTTPS): Permitted for incoming API traffic from TestForge Background Worker.
  - Port 2358 (Judge0): **DENIED / CLOSED.** Bound exclusively to `127.0.0.1` or `tailscale0`.
- **Tailscale Interface (`tailscale0`):**
  - If Tailscale is enabled via `setup-tailscale.sh`: Port 2358 is permitted exclusively on `tailscale0`.

---

## 5. Security and Containment Verification

### 5.1 Docker Privileged Mode Analysis
In `deploy/judge0/docker-compose.yml`:
```yaml
services:
  judge0-server:
    privileged: true
  judge0-workers:
    privileged: true
```
- **Why `judge0-workers` requires `privileged: true`:**
  The `isolate` sandboxing tool must invoke `unshare(CLONE_NEWPID | CLONE_NEWNET | CLONE_NEWNS | CLONE_NEWIPC)`, create chroot jail directories, and mount memory/cpuacct cgroup hierarchies under `/sys/fs/cgroup/memory/box-N/`. Without privileged mode, the Docker daemon denies namespace creation and cgroup write operations.
- **Why `privileged: true` is high risk:**
  Privileged containers disable Docker's AppArmor profile and grant access to host `/dev` nodes. If hostile code escapes `isolate` (e.g. via an unpatched Linux kernel vulnerability), the attacker has root privileges on the container and can manipulate the host.
- **Architectural Boundary Mitigation:**
  1. **Strict Single-Tenant Isolation:** The Runner VM must NEVER host application code, user databases, MongoDB credentials, or JWT signing keys.
  2. **No Docker Socket Mount:** The host `/var/run/docker.sock` is **NEVER** mounted into any container.
  3. **Zero Network Egress in Isolate:** Judge0 is configured with `ENABLE_NETWORK=false` and locked down with `ALLOW_ENABLE_NETWORK=false`. Student code cannot initiate TCP/UDP outbound connections.
  4. **Unprivileged Server Option:** In Phase 5.1, `judge0-server` (Puma API) will be tested with `privileged: false`, reserving privileged mode strictly for `judge0-workers`.

### 5.2 Verification Test Suites
The deployment repository provides two automated validation scripts:
1. `verify-cgroups-isolate.sh`:
   - Validates `/proc/cmdline` contains `systemd.unified_cgroup_hierarchy=0`.
   - Validates writeability of cgroup v1 controllers (`memory`, `cpuacct`, `cpuset`).
   - Executes container isolate sandbox lifecycle: `isolate --init --cg --box-id=98` followed by memory-limited execution and `isolate --cleanup`.
2. `verify-containment.sh`:
   - Executes 16 adversarial attack vectors against the running Judge0 API:
     - Missing / invalid authentication tokens (HTTP 401).
     - Unauthorized administrative route inspection (`/system_info` HTTP 403).
     - Fork bomb execution (constrained by process limit).
     - Memory exhaustion / allocation attacks (constrained by cgroup memory limit).
     - Outbound network egress / reverse shell connection attempts (blocked by network unshare).
     - Host filesystem write / overwrite attempts (blocked by chroot readonly mount).

---

## 6. Gap Analysis and Blockers

### Blocker 1: Upstream Judge0 CE v1.13.1 is x86_64 Only
- **Symptom:** Upstream image `judge0/judge0:v1.13.1` has no `linux/arm64` manifest.
- **Consequence:** Docker pull fails on OCI Ampere A1 (ARM64).
- **Severity:** **CRITICAL / BLOCKING.**

### Blocker 2: Isolate Fails Under QEMU Emulation
- **Symptom:** Running x86_64 containers on ARM64 using QEMU emulation fails inside `isolate`.
- **Consequence:** `isolate` system calls (`clone`, `unshare`, `cgroups` writes) cannot be emulated accurately by QEMU user space. Submissions crash or hang.
- **Severity:** **CRITICAL / BLOCKING.**

### Blocker 3: OCI Always Free Ampere A1 Capacity Availability
- **Symptom:** In several OCI regions (e.g. `us-ashburn-1`, `eu-frankfurt-1`), provisioning `VM.Standard.A1.Flex` frequently returns `Out of capacity for shape VM.Standard.A1.Flex`.
- **Consequence:** Provisioning may stall or require automated CLI retry loops or paid PAYG account upgrade.
- **Severity:** **HIGH (Operational Availability).**

### Blocker 4: Render Dynamic Outbound IP Addressing
- **Symptom:** Render standard web services do not have static public outbound IP addresses.
- **Consequence:** The Runner VM firewall cannot restrict incoming port 443 strictly by IP unless a SOCKS5/Tailscale proxy or Caddy reverse proxy with cryptographic header authentication is used.
- **Severity:** **MEDIUM (Resolved by Caddy TLS + Token Header Whitelist).**

---

## 7. Remediation Options

```
                        ┌──────────────────────────────────────────────────┐
                        │      ARM64 Compatibility Decision Tree           │
                        └────────────────────────┬─────────────────────────┘
                                                 │
                   ┌─────────────────────────────┴─────────────────────────────┐
                   ▼                                                           ▼
       [Path A: Recommended]                                       [Path B: Native ARM64]
     Use x86_64 Cloud VM Instance                                Build Custom Multi-Arch Image
   (Hetzner / DO / AWS / OCI x86)                              (testforge/judge0:v1.13.1-arm64)
                   │                                                           │
   • 100% native compatibility with                            • Compile isolate from source for ARM64
     official judge0/judge0:v1.13.1                            • Package GCC, JDK, Python, Node ARM64
   • Zero Dockerfile build overhead                            • Publish to container registry
   • Proven isolate cgroup stability                           • Run on OCI Ampere A1 4 OCPU / 24GB
```

### Path A: Use an x86_64 Cloud VM (Recommended for Staging Simplicity)
- **Infrastructure:** Hetzner Cloud CPX21 (3 vCPU AMD, 4 GB RAM, ~€6/month) or CPX31 (4 vCPU AMD, 8 GB RAM, ~€11/month), DigitalOcean Droplet x86 (8 GB RAM), or AWS EC2 `c6i.xlarge`.
- **Advantages:**
  - Uses the exact pinned `judge0/judge0:v1.13.1` image verified in previous phases.
  - Zero maintenance of custom compiler/runtime base images.
  - Zero QEMU emulation performance overhead.
  - `deploy-runner.sh` and `docker-compose.yml` execute cleanly without modifications.

### Path B: Build Custom Native ARM64 Judge0 Docker Image
- **Infrastructure:** OCI Ampere A1 (`VM.Standard.A1.Flex`, 4 OCPU, 24 GB RAM, Ubuntu 22.04 LTS).
- **Required Build Steps:**
  1. Fork `judge0/compilers` repository and create an ARM64 `Dockerfile`:
     - Base: `ubuntu:22.04` (ARM64).
     - Install native `gcc`, `g++`, `openjdk-17-jdk-headless`, `python3`, `nodejs`.
     - Compile `isolate` natively from Martin Mareš' source (`git clone https://github.com/ioi/isolate && make install`).
  2. Fork `judge0/judge0` repository and build the Rails application on top of the native ARM64 base.
  3. Push image to registry as `testforge/judge0:v1.13.1-arm64`.
  4. In `deploy/judge0/.env`, configure:
     ```ini
     JUDGE0_IMAGE=testforge/judge0:v1.13.1-arm64
     ```
- **Advantages:** Fully leverages OCI Always Free tier resources without recurring cloud hosting fees.

### Path C: Lightweight Native TestForge Sandbox Daemon
- **Infrastructure:** OCI Ampere A1 (ARM64).
- **Concept:** Instead of deploying Judge0 CE (Ruby on Rails + Puma + Postgres + Redis), run a lightweight Node.js/Go daemon using native Linux namespaces (`nsjail` or `isolate` compiled natively).
- **Backend Compatibility:** `RenderSandboxProvider.js` in TestForge already implements this pathway via `_executeViaTestForgeSandbox` (lines 337–423).
- **Advantages:** Extremely low memory footprint (<100MB vs Judge0's 2GB stack).

---

## 8. Staging Checklist (Ready for Phase 5.1)

### Phase 5.1 Staging Deployment Execution Plan

- [ ] **Step 1: VM Provisioning**
  - [ ] Select VM Architecture (x86_64 per Path A, or ARM64 with custom image per Path B).
  - [ ] Provision Ubuntu 22.04 LTS instance with minimum 4 vCPU, 8 GB RAM, 40 GB NVMe SSD.
  - [ ] Configure SSH key pair and disable password authentication.

- [ ] **Step 2: Linux Kernel & Cgroups Configuration**
  - [ ] Check current cmdline: `cat /proc/cmdline`.
  - [ ] If cgroups v2 active, add `systemd.unified_cgroup_hierarchy=0` to `/etc/default/grub`.
  - [ ] Execute `sudo update-grub`.
  - [ ] Execute `sudo reboot`.
  - [ ] Verify active controllers after reboot: `mount | grep cgroup`.

- [ ] **Step 3: Docker Engine & Compose Installation**
  - [ ] Install Docker CE and Compose plugin via official Docker repository.
  - [ ] Add deploy user to `docker` group: `sudo usermod -aG docker $USER`.

- [ ] **Step 4: Staging Runner Deployment**
  - [ ] Copy `deploy/judge0/` directory to `/opt/testforge-judge0/` on the runner VM.
  - [ ] Run `sudo bash deploy-runner.sh`.
  - [ ] Confirm generation of strong random secrets for `AUTHN_TOKEN`, `AUTHZ_TOKEN`, `POSTGRES_PASSWORD`, and `REDIS_PASSWORD`.
  - [ ] Confirm Docker containers are running healthy: `docker compose ps`.

- [ ] **Step 5: Operational & Sandbox Verification**
  - [ ] Run `bash verify-cgroups-isolate.sh`. Confirm all cgroup mounts and Box 98 lifecycle pass.
  - [ ] Run `bash verify-containment.sh`. Confirm all 16 hostile-code containment tests pass.
  - [ ] Run `bash benchmark.sh`. Record baseline RPS and latency profile.

- [ ] **Step 6: Ingress & TLS Reverse Proxy (Caddy)**
  - [ ] Assign DNS domain/subdomain pointing to the runner VM public IP (e.g. `runner.testforge.edu` or DuckDNS).
  - [ ] Install Caddy: `sudo apt install -y caddy`.
  - [ ] Apply Caddyfile from `deploy/judge0/README.md` (TLS 1.3, route whitelist, method filtering).
  - [ ] Verify public HTTPS access via `curl -k -H "X-Auth-Token: ..." https://runner.testforge.edu/about`.

- [ ] **Step 7: TestForge Backend Worker Configuration**
  - [ ] In Render Background Worker environment variables:
    ```ini
    EXECUTION_PROVIDER=render_sandbox
    RENDER_SANDBOX_ENDPOINT=https://runner.testforge.edu
    RENDER_SANDBOX_API_KEY=<GENERATED_AUTHN_TOKEN>
    RENDER_SANDBOX_AUTHZ_TOKEN=<GENERATED_AUTHZ_TOKEN>
    ```
  - [ ] Deploy worker and verify sandbox connectivity.
  - [ ] Submit test problem from candidate dashboard and verify end-to-end isolated grading.

---

## 9. TestForge Backend Configuration Audit

The TestForge codebase was audited to verify compatibility with the remote runner:

### 9.1 `RenderSandboxProvider.js` Verification
- **Endpoint Configuration:** Properly reads `RENDER_SANDBOX_ENDPOINT` and `RENDER_SANDBOX_API_KEY`.
- **Header Authentication:** Automatically injects `X-Auth-Token` for execution endpoints and `X-Auth-User` for administrative verification.
- **Proxy Support:** Utilizes `undici.ProxyAgent` supporting both `http://` and `socks5://` protocols (via `TAILSCALE_PROXY`).
- **Fail-Closed Private Guard:** Enforces `REQUIRE_PROXY=true` when targeting private tailnets (`.ts.net`), rejecting insecure public fallback.
- **Remote Cancellation Reconciliation:** Sends `DELETE /submissions/:token` on worker preemption and marks database records as `CANCELLATION_REQUESTED`.
- **Verdict Mapping:** Correctly parses Judge0 status IDs:
  - Status 3: `ACCEPTED` (or passes to TestForge internal judge for custom verification).
  - Status 4: `WRONG_ANSWER`.
  - Status 5: `TIMEOUT` (`Time limit exceeded`).
  - Status 6: `COMPILATION_ERROR` (captures `compile_output`).
  - Status 7–12: `RUNTIME_ERROR`.
  - Status 13: `INTERNAL_ERROR` / `EXECUTION_UNAVAILABLE`.
  - Memory limit exceeded: Recognized via memory metadata, description, and stderr exception signatures.

### 9.2 Fail-Closed Production Behavior
- `config.execution.provider`: Defaults to `mock` in local development and test environments.
- `MockExecutionProvider.js` (lines 31–40): Contains a strict production gate:
  ```javascript
  if (config.env === 'production' || process.env.NODE_ENV === 'production') {
    return {
      status: 'internal_error',
      output: null,
      error: '[MockExecutionProvider FAIL-CLOSED] Mock execution is strictly prohibited from awarding marks in production. Execution unavailable.',
      runtimeMs: 0
    };
  }
  ```
- `providerRegistry.js` (lines 44–46): Explicitly throws an error if any attempt is made to initialize `LocalExecutionProvider` in a production environment.

---

## 10. Final Recommendation: Proceed to 5.1 or Hold

### **RECOMMENDATION: HOLD ON OCI AMPERE A1 ARM64 PROVISIONING**

Proceeding with `judge0/judge0:v1.13.1` on an OCI Ampere A1 (ARM64) VM will result in immediate deployment failure due to missing multi-arch container manifests and incompatible QEMU isolate sandboxing.

### Next Steps for Human Approver:
1. **Decision on Runner Architecture:**
   - **Approve Path A (x86_64 VM):** Recommended. Authorize deployment to an x86_64 staging VM (Hetzner, DigitalOcean, or AWS). Proceed immediately to Phase 5.1 staging deployment.
   - **Approve Path B (OCI Ampere A1 with Custom Build):** Authorize creation of custom ARM64 multi-arch build scripts for Judge0 CE v1.13.1 before provisioning the VM.
2. **Safety Compliance Check:**
   - No cloud infrastructure was provisioned during this audit.
   - Production execution remains fail-closed.
   - All regression test suites remain passing.
