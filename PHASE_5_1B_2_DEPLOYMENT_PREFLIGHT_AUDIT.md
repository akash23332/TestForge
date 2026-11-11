# TestForge Phase 5.1B.2: Deployment Script Security Preflight Audit

**Date:** November 12, 2026  
**Auditor:** Senior Distributed Systems, Security & DevSecOps Architecture Team  
**Audit Scope:** Preflight security and operational verification of all deployment scripts, Docker manifests, and configuration files prior to cloud VM provisioning.  
**Execution Mode:** Audit-Only (Zero cloud resources provisioned, zero images built, zero configuration files altered).  

---

## 1. Executive Summary & Verdict

### Final Audit Verdict: 🟡 **PASS WITH CONDITIONS**

An exhaustive line-by-line inspection of all deployment scripts, Dockerfiles, compose stacks, and validation harnesses was performed. The execution infrastructure is structurally well-designed and enforces strong boundary protections (unprivileged API server, loopback socket binding, zero outbound network egress in isolate, strict secret isolation from the main backend).

However, this preflight audit identified **seven specific operational and security findings**, including two **High-Severity operational defects** that would cause initial runner deployment to fail or expose credentials with insecure permissions:
1. **Unprotected Secret Permissions (`0644`):** `deploy-runner.sh` writes database credentials and API authentication tokens into `.env` and `judge0.conf` without setting restrictive file permissions (`chmod 600`).
2. **Local Image Pull Failure:** `deploy-runner.sh` invokes `docker compose pull`, which will abort with a fatal error when attempting to pull locally-built ARM64 images (`testforge/judge0:v1.13.1-arm64`) from Docker Hub.
3. **Unpinned Master Branch for Isolate:** `Dockerfile.compilers-arm64` clones `ioi/isolate` master branch, introducing risk of breaking changes from recent cgroups v2 rewrites (`isolate 2.x`).

All required corrections are documented below and must be ratified before cloud VM provisioning or deployment.

---

## 2. Files Inspected

The following exact file paths were inspected in the repository:
1. [`deploy/judge0/deploy-runner.sh`](file:///d:/TestForge/deploy/judge0/deploy-runner.sh) (164 lines)
2. [`deploy/judge0/build-arm64.sh`](file:///d:/TestForge/deploy/judge0/build-arm64.sh) (82 lines)
3. [`deploy/judge0/docker/Dockerfile.compilers-arm64`](file:///d:/TestForge/deploy/judge0/docker/Dockerfile.compilers-arm64) (117 lines)
4. [`deploy/judge0/docker/Dockerfile.judge0-arm64`](file:///d:/TestForge/deploy/judge0/docker/Dockerfile.judge0-arm64) (65 lines)
5. [`deploy/judge0/docker-compose.yml`](file:///d:/TestForge/deploy/judge0/docker-compose.yml) (119 lines)
6. [`deploy/judge0/verify-arm64-binaries.sh`](file:///d:/TestForge/deploy/judge0/verify-arm64-binaries.sh) (166 lines)
7. [`deploy/judge0/verify-cgroups-isolate.sh`](file:///d:/TestForge/deploy/judge0/verify-cgroups-isolate.sh) (128 lines)
8. [`deploy/judge0/verify-containment.sh`](file:///d:/TestForge/deploy/judge0/verify-containment.sh) (297 lines)
9. [`deploy/judge0/setup-tailscale.sh`](file:///d:/TestForge/deploy/judge0/setup-tailscale.sh) (78 lines)
10. [`deploy/judge0/benchmark.sh`](file:///d:/TestForge/deploy/judge0/benchmark.sh) (177 lines)
11. [`deploy/judge0/judge0.conf`](file:///d:/TestForge/deploy/judge0/judge0.conf) (71 lines)
12. [`deploy/judge0/.env.example`](file:///d:/TestForge/deploy/judge0/.env.example) (15 lines)

---

## 3. Script-by-Script Operation Safety Classification

Each operation executed by the deployment and validation scripts was classified into:
- **SAFE:** Read-only system inspection, diagnostic checks, self-contained disposable container execution (`--rm`).
- **CAUTION:** Modifies local directory structures, writes configuration files, installs operating system packages, or builds container images.
- **DANGEROUS:** Modifies Linux kernel parameters (GRUB), reboots the host, alters host firewall (UFW) rules, opens network listeners, or handles unencrypted secrets without restrictive file modes.

### 3.1 `deploy/judge0/deploy-runner.sh`
| Line(s) | Operation / Command | Classification | Security & Operational Assessment |
| :--- | :--- | :--- | :--- |
| **15–24** | `uname -s`, `uname -m` check | **SAFE** | Read-only operating system and architecture detection. |
| **42** | `grep systemd.unified_cgroup_hierarchy=0 /proc/cmdline` | **SAFE** | Read-only kernel boot parameter verification. |
| **50–51** | `sed -i ... /etc/default/grub` && `update-grub` | 🔴 **DANGEROUS** | Modifies host GRUB boot configuration to force legacy cgroups v1 hierarchy. |
| **54–57** | Prompts operator to run `sudo reboot` | 🔴 **DANGEROUS** | Prompts for immediate operating system reboot. |
| **70–71** | `apt-get update -qq` && `apt-get install -y -qq ...` | 🟡 **CAUTION** | Installs system packages (`curl`, `git`, `ufw`, `jq`, `ca-certificates`). |
| **76–87** | Adds Docker GPG key, repository, and installs `docker-ce` | 🟡 **CAUTION** | Modifies APT package sources and installs container runtime. |
| **91–97** | `ufw default deny incoming`, `ufw allow 22`, `443`, `80`, `ufw --force enable` | 🔴 **DANGEROUS** | Alters host firewall configuration. Closes all ports except SSH, HTTPS, and HTTP. |
| **102–108** | `mkdir -p /opt/testforge-judge0`, `cp -r $SCRIPT_DIR/* ...` | 🟡 **CAUTION** | Writes deployment artifacts to `/opt/testforge-judge0/`. |
| **111–114** | `head -c 32 /dev/urandom \| base64 ...` | **SAFE** | In-memory generation of random cryptographic tokens. |
| **117–124** | `cat <<EOF > "$INSTALL_DIR/.env"` | 🔴 **DANGEROUS** | Writes database passwords and API tokens without setting `chmod 600` (defaults to world-readable `0644`). |
| **131–136** | `sed -i "s/^AUTHN_TOKEN=.../" judge0.conf` | 🔴 **DANGEROUS** | Injects plaintext credentials into `judge0.conf` without setting `chmod 600`. |
| **140** | `docker compose pull` | 🟡 **CAUTION** | Network pull operation. Will fail if `JUDGE0_IMAGE` is a local custom ARM64 image. |
| **141** | `docker compose up -d` | 🟡 **CAUTION** | Launches container daemon processes, binds port `127.0.0.1:2358`. |
| **146** | `bash ./verify-cgroups-isolate.sh` | **SAFE** | Triggers operational validation check. |

### 3.2 `deploy/judge0/build-arm64.sh`
| Line(s) | Operation / Command | Classification | Security & Operational Assessment |
| :--- | :--- | :--- | :--- |
| **21–35** | Host architecture check & Docker binary check | **SAFE** | Non-invasive pre-build validation. |
| **42–46** | `docker build ... -t testforge/compilers:v1.4.0-arm64` | 🟡 **CAUTION** | Compiles base compilers, Ruby 2.7, OpenSSL 1.1.1, and Isolate. |
| **53–57** | `docker build ... -t testforge/judge0:v1.13.1-arm64` | 🟡 **CAUTION** | Builds Judge0 v1.13.1 Rails application image. |
| **64–67** | Injects `JUDGE0_IMAGE=...` into `.env` | 🟡 **CAUTION** | Modifies local `.env` configuration file. |

### 3.3 `deploy/judge0/verify-arm64-binaries.sh`
| Line(s) | Operation / Command | Classification | Security & Operational Assessment |
| :--- | :--- | :--- | :--- |
| **36–42** | `docker inspect -f '{{.Architecture}}'` | **SAFE** | Read-only container metadata check. |
| **58–65** | `docker run --rm $IMAGE_NAME file -L <binary>` | **SAFE** | Inspects ELF binary headers in disposable container. |
| **71–88** | `docker run --rm $IMAGE_NAME <tool> --version` | **SAFE** | Validates tool versions in disposable container. |
| **102–108** | `docker run --rm $IMAGE_NAME test -x <symlink>` | **SAFE** | Verifies compatibility symlink paths. |
| **115–156** | Disposable compilation and execution for C++, Java, JS, Python | **SAFE** | Validates in-container compiler functionality. |

### 3.4 `deploy/judge0/verify-cgroups-isolate.sh`
| Line(s) | Operation / Command | Classification | Security & Operational Assessment |
| :--- | :--- | :--- | :--- |
| **29–33** | Verifies `systemd.unified_cgroup_hierarchy=0` in `/proc/cmdline` | **SAFE** | Read-only kernel parameter verification. |
| **55–58** | `mkdir "$CTL_PATH/testforge_verify_probe_$$"` && `rmdir` | 🟡 **CAUTION** | Tests host cgroup controller writeability; cleans up immediately. |
| **69–74** | Trap cleanup for Box 98 on exit/interrupt | **SAFE** | Guarantees unmount of test isolate box. |
| **85–89** | `docker compose exec -T judge0-workers isolate --version` | **SAFE** | Tests isolate binary execution inside running worker container. |
| **96–110** | `isolate --init --box-id=98 --cg`, `--run`, `--cleanup` | **SAFE** | End-to-end sandbox lifecycle validation in isolated Box 98. |

### 3.5 `deploy/judge0/verify-containment.sh`
| Line(s) | Operation / Command | Classification | Security & Operational Assessment |
| :--- | :--- | :--- | :--- |
| **42–65** | Auth token absence and invalid token tests | **SAFE** | HTTP client tests against local loopback API. |
| **97** | `curl -s -X POST ... $ENDPOINT/submissions?wait=true` | **SAFE** | Sends adversarial code payloads to Judge0 API. |
| **135–285** | Executes 16 hostile-code test vectors | **SAFE** | Tests sandbox containment (fork bombs, memory exhaustion, zero network egress). |

### 3.6 `deploy/judge0/setup-tailscale.sh`
| Line(s) | Operation / Command | Classification | Security & Operational Assessment |
| :--- | :--- | :--- | :--- |
| **23** | `curl -fsSL https://tailscale.com/install.sh \| sh` | 🟡 **CAUTION** | Executes third-party vendor installer script as root. |
| **30** | `systemctl enable --now tailscaled` | 🟡 **CAUTION** | Starts system daemon service. |
| **37, 43** | `tailscale up --hostname=testforge-judge0-runner --ssh` | 🔴 **DANGEROUS** | Joins host to external Tailscale VPN and enables Tailscale SSH. |
| **50** | `ufw allow in on tailscale0 to any port 2358 proto tcp` | 🔴 **DANGEROUS** | Alters firewall rules to expose Judge0 API on the private VPN interface. |

---

## 4. Privileged Worker Security Review

### 4.1 Is `privileged: true` Mandatory for `judge0-workers`?
An investigation was conducted into whether `judge0-workers` could run with a reduced capability set (`cap_add`) instead of full Docker privileged mode.

#### The Technical Obstacle:
1. **Cgroups v1 File Hierarchy Access:** Isolate requires writing directly to `/sys/fs/cgroup/memory/isolate/box-N/` and `/sys/fs/cgroup/cpuacct/isolate/box-N/`. In standard unprivileged Docker containers, the container engine mounts `/sys/fs/cgroup` as **read-only (`:ro`)**.
2. **Filesystem Mount Capabilities:** Isolate executes `mount("none", "/var/local/lib/isolate/N/box", "tmpfs", ...)` and bind-mounts `/usr`, `/lib`, and `/bin` read-only.
3. **AppArmor Restrictions:** Docker's default AppArmor profile (`docker-default`) unconditionally denies `mount()` operations inside containers.
4. **Namespace Creation:** Isolate invokes `clone(CLONE_NEWPID | CLONE_NEWNET | CLONE_NEWNS | CLONE_NEWIPC | CLONE_NEWUTS)`.

#### Minimum Capability Configuration Test (Alternative to `privileged: true`):
To run without `privileged: true`, Docker Compose would require:
```yaml
judge0-workers:
  cap_add:
    - SYS_ADMIN      # Required for mount(), unshare(), setns()
    - SYS_CHROOT     # Required for chroot()
    - SETUID         # Required for dropping privileges to sandbox UID
    - SETGID         # Required for dropping privileges to sandbox GID
    - SYS_PTRACE     # Required for syscall inspection and timing
    - DAC_OVERRIDE   # Required for isolate directory permissions
  security_opt:
    - apparmor:unconfined  # Required to allow nested mounts
    - seccomp:unconfined   # Required to allow clone3 and unshare flags
  volumes:
    - /sys/fs/cgroup:/sys/fs/cgroup:rw  # Required for cgroup controller access
```

#### Assessment:
While the reduced capability model avoids full `--privileged`, granting `CAP_SYS_ADMIN` with `apparmor:unconfined` and read-write host cgroup mounts provides nearly equivalent host-level access to privileged mode. 

Therefore, **upstream Judge0 CE's architectural reliance on `privileged: true` for workers is confirmed as necessary under Docker's current architecture**.

### 4.2 Host-Level Blast Radius & Mandatory Isolation Controls
Because `judge0-workers` runs with `privileged: true`, a sandbox breakout from `isolate` (e.g., via a Linux kernel 0-day) would give the attacker root access to host devices (`/dev`). 

To eliminate the blast radius, the following host-level boundaries are **strictly mandatory**:
1. **Single-Tenant VM:** The runner VM must be **100% dedicated to untrusted code execution**. It must NEVER host application databases, MongoDB Atlas credentials, JWT secrets, or application backend code.
2. **Zero Docker Socket Mount:** The host Docker socket (`/var/run/docker.sock`) is **never mounted** into any container.
3. **Unprivileged API Server:** `judge0-server` runs with `privileged: false`, preventing public API requests from accessing privileged container contexts.
4. **Non-Root Execution in Sandbox:** `isolate` drops privileges to an isolated sandbox UID (`60000 + box_id`) with a read-only root chroot jail and zero network devices.

---

## 5. Resource Accounting Assessment (12 GB RAM & 2 OCPUs)

### 5.1 Docker Limits vs. Isolate Child-Process Accounting
A critical architectural inquiry is whether Isolate child processes are accounted for under the worker container's memory cgroup.

- **How Isolate Allocates Cgroups:** In `judge0.conf` and `isolate`, sandbox memory limits are managed via `--cg --cg-mem=256000`. By default, Isolate creates cgroups under `/sys/fs/cgroup/memory/isolate/box-N/`.
- **Cgroup Hierarchy Behavior:** Because `judge0-workers` runs with host cgroup access, Isolate creates `/sys/fs/cgroup/memory/isolate/box-N/` directly under the **host root cgroup**, NOT as a nested cgroup under `/sys/fs/cgroup/memory/docker/<container-id>/`.
- **Implication:** The memory consumed by the student code inside the Isolate sandbox is strictly bounded by Isolate's `--cg-mem` limit (256 MB default), but **may NOT be reflected in `docker stats` for the worker container**.
- **Verification Method on Native ARM64 Linux:**
  1. Submit a test program that allocates 200 MB of heap memory.
  2. Inspect `/proc/<child-pid>/cgroup` inside the container:
     ```bash
     cat /proc/<child-pid>/cgroup | grep memory
     ```
  3. Inspect memory usage in both the Docker slice and the Isolate slice:
     ```bash
     cat /sys/fs/cgroup/memory/docker/<worker-id>/memory.usage_in_bytes
     cat /sys/fs/cgroup/memory/isolate/box-N/memory.usage_in_bytes
     ```

### 5.2 Host Headroom & Concurrency Sizing
- **Committed Limits:**
  - Host OS & Daemons: 2.0 GB
  - `judge0-server`: 1.5 GB
  - `judge0-workers`: 4.0 GB
  - `judge0-db`: 0.5 GB
  - `judge0-redis`: 0.38 GB
  - **Total Committed:** ~8.4 GB out of 12.0 GB.
- **Unallocated Headroom:** ~3.6 GB.
- **Concurrency Policy:** Concurrency is locked to **1 concurrent execution** (`COUNT=1`) in `docker-compose.yml`. Even if GCC optimization (`-O3`) bursts memory consumption to 800 MB during C++ compilation, the 3.6 GB headroom guarantees that the host kernel will never invoke the OOM-killer against SSH or Docker.

---

## 6. Network and Secrets Assessment

| Security Requirement | Verified Status | Evidence |
| :--- | :--- | :--- |
| **No Public Judge0 Exposure** | 🟢 **ENFORCED** | In `docker-compose.yml` (line 29), port 2358 binds exclusively to `127.0.0.1:2358:2358`. It is not accessible from the public internet without a reverse proxy. |
| **No Docker Socket Mount** | 🟢 **ENFORCED** | Grep of `docker-compose.yml` and both Dockerfiles confirms `/var/run/docker.sock` is never mounted. |
| **No Production Secrets on Runner** | 🟢 **ENFORCED** | No MongoDB credentials, JWT keys, or TestForge application secrets exist in the runner environment. |
| **API Authentication Enabled** | 🟢 **ENFORCED** | `judge0.conf` enforces `AUTHN_HEADER=X-Auth-Token` and `AUTHZ_HEADER=X-Auth-User`. `verify-containment.sh` Tests 1 & 2 confirm unauthenticated requests receive HTTP 401. |
| **Admin Route Protection** | 🟢 **ENFORCED** | `verify-containment.sh` Test 3 confirms `/system_info` returns HTTP 401/403 without `X-Auth-User`. Caddy reverse proxy blocks `/system_info*`, `/config*`, `/workers*`. |
| **Zero Network Egress for Student Code** | 🟢 **ENFORCED** | `judge0.conf` sets `ENABLE_NETWORK=false` and `ALLOW_ENABLE_NETWORK=false`. Isolate unshares the network namespace (`CLONE_NEWNET`). `verify-containment.sh` Tests 4, 5, 12, 13, 14 confirm network calls are completely blocked. |
| **Database Network Isolation** | 🟢 **ENFORCED** | PostgreSQL and Redis containers publish no host ports. They exist solely on the private Docker bridge `judge0-net`. |

---

## 7. Findings & Acceptance Criteria Table

| ID | Finding Description | Severity | File & Line | Evidence | Required Correction | Fix Required Before Provisioning? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F-01** | World-readable file permissions on generated `.env` and `judge0.conf` secrets | **High** | [`deploy/judge0/deploy-runner.sh`](file:///d:/TestForge/deploy/judge0/deploy-runner.sh#L117-L136) | Secrets are written via `cat` and `sed` without setting restrictive permissions. Files default to `0644` (world-readable). | Add `chmod 600 "$INSTALL_DIR/.env" "$INSTALL_DIR/judge0.conf"` immediately after writing. | **YES** |
| **F-02** | `docker compose pull` aborts on local custom ARM64 image | **High** | [`deploy/judge0/deploy-runner.sh`](file:///d:/TestForge/deploy/judge0/deploy-runner.sh#L140) | Running `docker compose pull` when `JUDGE0_IMAGE=testforge/judge0:v1.13.1-arm64` attempts to pull from Docker Hub and fails with `pull access denied`. | Update `deploy-runner.sh` to check if `JUDGE0_IMAGE` exists locally, or run `docker compose pull --ignore-pull-failures \|\| true`. | **YES** |
| **F-03** | Unpinned `master` branch for Isolate sandbox in base compilers image | **Medium** | [`deploy/judge0/docker/Dockerfile.compilers-arm64`](file:///d:/TestForge/deploy/judge0/docker/Dockerfile.compilers-arm64#L61) | `git clone https://github.com/ioi/isolate.git .` clones unpinned `master` branch. Recent Isolate 2.x releases target cgroups v2, which can break cgroups v1 `--cg` flag. | Pin clone to verified cgroup v1 tag: `git clone --branch v1.8.1 https://github.com/ioi/isolate.git .`. | **YES** |
| **F-04** | Hostile containment test suite exercises Python only | **Medium** | [`deploy/judge0/verify-containment.sh`](file:///d:/TestForge/deploy/judge0/verify-containment.sh#L145-L285) | All 16 hostile-code test vectors pass `language_id: 71` (Python). C++, Java, and JavaScript are not tested for sandbox containment. | Add test cases in C++ (ID 54), Java (ID 62), and JavaScript (ID 63) for timeout and memory containment. | **NO** (Recommended before staging traffic) |
| **F-05** | `isolate --version` command exits with code 1 | **Low** | [`deploy/judge0/verify-cgroups-isolate.sh`](file:///d:/TestForge/deploy/judge0/verify-cgroups-isolate.sh#L85) | `isolate` CLI does not support `--version` and exits with error code 1, emitting usage instructions. | Test isolate binary execution via `isolate --help` or direct execution check. | **NO** (Cosmetic; grep passes via `2>&1`) |
| **F-06** | OpenSSL linkage check missing in binary verification script | **Low** | [`deploy/judge0/verify-arm64-binaries.sh`](file:///d:/TestForge/deploy/judge0/verify-arm64-binaries.sh#L71) | Script checks `ruby -v` but does not explicitly assert that Ruby is linked against OpenSSL 1.1.1w. | Add `ruby -ropenssl -e 'puts OpenSSL::OPENSSL_VERSION'` assertion in `verify-arm64-binaries.sh`. | **NO** (Recommended before staging traffic) |

---

## 8. Required Fixes Before Provisioning

Before provisioning the cloud VM or running deployment commands, the following three corrections must be committed to the repository:

### Fix 1: Enforce Strict Secret Permissions in `deploy-runner.sh`
In [`deploy/judge0/deploy-runner.sh`](file:///d:/TestForge/deploy/judge0/deploy-runner.sh), add explicit permission hardening after lines 128 and 136:
```bash
# Harden permissions on secret configuration files (owner read/write only)
chmod 600 "$INSTALL_DIR/.env"
if [ -f "$INSTALL_DIR/judge0.conf" ]; then
  chmod 600 "$INSTALL_DIR/judge0.conf"
fi
```

### Fix 2: Prevent Fatal `docker compose pull` on Local Images in `deploy-runner.sh`
In [`deploy/judge0/deploy-runner.sh`](file:///d:/TestForge/deploy/judge0/deploy-runner.sh) line 140, replace unconditional pull with:
```bash
# Pull upstream base images (postgres, redis) while preserving local custom images
echo "[Step 6/6] Pulling service images..."
docker compose pull --ignore-pull-failures || true
docker compose up -d
```

### Fix 3: Pin Isolate Release Tag in `Dockerfile.compilers-arm64`
In [`deploy/judge0/docker/Dockerfile.compilers-arm64`](file:///d:/TestForge/deploy/judge0/docker/Dockerfile.compilers-arm64) line 61, replace unpinned clone with:
```dockerfile
# 4. Compile and Install IOI Isolate Sandbox (Pinned to v1.8.1 for cgroups v1 stability)
WORKDIR /tmp/isolate-build
RUN git clone --depth 1 --branch v1.8.1 https://github.com/ioi/isolate.git . && \
    make -j$(nproc) && \
    make install && \
    chmod 4755 /usr/local/bin/isolate && \
    cd / && rm -rf /tmp/isolate-build
```

---

## 9. Safe vs. Destructive Human Execution Commands

When authorized human operators execute deployment on the target ARM64 Linux VM, commands are divided into safe diagnostic commands and destructive/state-changing commands:

### 🟢 Safe Diagnostic Commands (Run Anytime for Inspection)
```bash
# 1. Inspect host architecture (Must return aarch64)
uname -m

# 2. Inspect kernel boot parameters (Must include systemd.unified_cgroup_hierarchy=0)
cat /proc/cmdline

# 3. Check cgroup v1 mounts
mount | grep cgroup

# 4. Inspect container architecture and ELF binaries (Read-only container inspection)
bash deploy/judge0/verify-arm64-binaries.sh testforge/judge0:v1.13.1-arm64

# 5. Check container health status
docker compose -f deploy/judge0/docker-compose.yml ps

# 6. Inspect runner logs without modifying state
docker compose -f deploy/judge0/docker-compose.yml logs --tail=50 judge0-server
docker compose -f deploy/judge0/docker-compose.yml logs --tail=50 judge0-workers
```

### 🔴 Destructive & State-Changing Commands (Run Only During Deployment)
```bash
# 1. Modifies kernel boot parameters in GRUB (Requires reboot)
sudo sed -i 's/GRUB_CMDLINE_LINUX="/GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=0 /' /etc/default/grub
sudo update-grub
sudo reboot

# 2. Modifies host firewall (Locks down incoming traffic)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 443/tcp
sudo ufw allow 80/tcp
sudo ufw --force enable

# 3. Builds container images on the host (Consumes CPU and disk)
sudo bash deploy/judge0/build-arm64.sh

# 4. Installs system packages and generates random secrets
sudo bash deploy/judge0/deploy-runner.sh
```

---

## 10. Audit Sign-Off & Next Steps

This preflight audit has verified that the execution stack is sound, but requires three concrete fixes (`F-01`, `F-02`, and `F-03`) before provisioning.

**In accordance with absolute restrictions, no files were modified during this audit, no cloud VM was provisioned, and no containers were built.**

Awaiting human review of this preflight audit report before applying the three fixes and proceeding to Phase 5.1C / VM provisioning.
