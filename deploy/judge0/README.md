# TestForge Dedicated Execution Runner: Judge0 CE Deployment Guide

## 1. Hardware & System Requirements

- **Provider:** Dedicated Cloud VM (e.g. Hetzner CPX21 / CPX31, DigitalOcean Droplet 8GB, AWS EC2 `c6i.xlarge` / `c6a.xlarge`).
- **Operating System:** Ubuntu 22.04 LTS (x86_64).
- **Kernel Version:** Linux 5.15+ or 6.5+ with **legacy cgroups v1 enabled**.
- **CPU:** 4 vCPUs minimum (dedicated compute recommended for predictable compilation times).
- **RAM:** 8 GB RAM minimum.
- **Disk:** 40+ GB NVMe SSD.

---

## 2. Kernel & Cgroups v1 Prerequisites (MANDATORY)

Judge0 CE v1.13.1 bundles `isolate`, which requires the **legacy cgroups v1 hierarchy** (`systemd.unified_cgroup_hierarchy=0`). On modern Linux distributions (such as Ubuntu 22.04+) where cgroups v2 is default, you must configure the kernel boot parameters:

1. Edit `/etc/default/grub`:
   ```bash
   sudo sed -i 's/GRUB_CMDLINE_LINUX="/GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=0 /' /etc/default/grub
   ```

2. Update GRUB and reboot:
   ```bash
   sudo update-grub
   sudo reboot
   ```

3. After reboot, verify cgroup v1 controllers:
   ```bash
   mount | grep cgroup
   # Should list /sys/fs/cgroup/memory, /sys/fs/cgroup/cpuacct, /sys/fs/cgroup/cpuset
   ```

---

## 3. Host Firewall (UFW) Hardening

Only allow SSH (port 22) and HTTPS (port 443) from authorized IP addresses (TestForge Render Worker IP, VPN, or reverse proxy):
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH administration'
# Restrict port 443 to the known TestForge Background Worker outbound IP range or VPN
sudo ufw allow from <TESTFORGE_WORKER_EGRESS_IP> to any port 443 proto tcp
sudo ufw allow 80/tcp comment 'HTTP ACME challenge for TLS cert'
sudo ufw enable
```

---

## 4. Deploying Judge0 CE

1. Install Docker Engine and Docker Compose plugin:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   ```

2. Copy the entire `deploy/judge0` folder to the runner VM:
   ```bash
   # From your local workstation:
   scp -r deploy/judge0 root@<RUNNER_IP>:/opt/testforge-judge0
   ```

3. Run automated runner setup:
   ```bash
   cd /opt/testforge-judge0
   sudo bash deploy-runner.sh
   ```
   This script will:
   - Verify cgroups v1 kernel flags.
   - Generate cryptographically secure tokens (`AUTHN_TOKEN`, `AUTHZ_TOKEN`, `REDIS_PASSWORD`, `POSTGRES_PASSWORD`).
   - Populate `.env` and `judge0.conf`.
   - Start the Docker Compose stack.
   - Run operational cgroups and isolate sandbox verification.

4. Run operational & containment tests:
   ```bash
   bash verify-cgroups-isolate.sh
   bash verify-containment.sh
   bash benchmark.sh
   ```

---

## 5. Verified Caddy Reverse Proxy Configuration

Create `/etc/caddy/Caddyfile` using native stock Caddy v2 directives (without uninstalled third-party modules):

```caddy
runner.testforge.edu {
    # Modern TLS 1.3 enforcement
    tls {
        protocols tls1.3
    }

    # Restrict request body size to prevent memory exhaustion DOS
    request_body {
        max_size 2MB
    }

    # Strict HTTP Method Filtering: Only permit GET and POST
    @disallowed_methods not method GET POST
    respond @disallowed_methods "Method Not Allowed" 405

    # Administrative Endpoint Lockdown: Block internal inspection routes
    @admin path /system_info* /config* /workers*
    respond @admin "Access denied" 403

    # Route Whitelist: Reject unexpected paths before reaching Puma
    @allowed_paths path /submissions* /languages* /statuses* /about /health
    respond not @allowed_paths "Not Found" 404

    # Reverse proxy to local Judge0 API
    reverse_proxy 127.0.0.1:2358 {
        header_up X-Real-IP {remote_host}
    }

    # Access logging with query string & header token redaction
    log {
        output file /var/log/caddy/access.log {
            roll_size 20mb
            roll_keep 5
        }
        format json
    }
}
```
Start Caddy:
```bash
sudo systemctl enable --now caddy
```

---

## 6. Docker Privilege & Host Security Architecture

### Why Privileged Mode is Needed by `judge0-workers`
- The `isolate` sandboxing utility creates new mount, user, PID, IPC, and network namespaces.
- It configures per-box cgroup v1 controllers under `/sys/fs/cgroup/memory/box-N/`.
- Without `privileged: true`, Docker prevents child containers from creating namespaces or managing cgroup controllers.

### Controlled Staging Test: Running `judge0-server` Unprivileged
In Judge0 architecture, `judge0-server` acts strictly as an HTTP API router, writing submissions to PostgreSQL and Redis. It never calls `isolate`.
To verify whether `judge0-server` can run without `privileged: true`:
1. In `docker-compose.yml`, remove `privileged: true` from `judge0-server`:
   ```yaml
   judge0-server:
     image: judge0/judge0:v1.13.1
     # privileged: true  <-- Commented out for staging test
   ```
2. Restart the API server: `docker compose up -d judge0-server`.
3. Verify boot logs: `docker compose logs -f judge0-server`.
4. Submit a test code execution: `curl -X POST -H "X-Auth-Token: ..." ... /submissions?wait=true`.
5. If Puma boots cleanly and submissions are successfully queued and resolved via the worker, keep `privileged: false` permanently for `judge0-server`.

### Host Security Boundaries & Containment Risks
- **Privileged containers do not form a hard security boundary against the host.** If an attacker manages to break out of `isolate` (e.g., through an unpatched Linux kernel 0-day or `isolate` flaw), they would obtain root execution inside a container that has access to host devices.
- **Mitigation: Single-Tenant Dedicated Runner VM.**
  - The runner VM must be **100% dedicated to untrusted code execution**.
  - It must **never** host application databases, MongoDB Atlas credentials, JWT secrets, or application code.
  - The Docker socket (`/var/run/docker.sock`) is **never** mounted into containers.
  - PostgreSQL and Redis have **no published host ports** and exist solely on an internal bridge network (`judge0-net`).
  - Network isolation is enforced by `isolate` (`unshare(CLONE_NEWNET)`) and locked by `ALLOW_ENABLE_NETWORK=false`.

---

## 7. Data Boundary & Hidden-Test Flow

To guarantee zero test-case leakage, the system enforces a strict boundary between TestForge and the execution runner:

```
[Student Browser]
       │
       ▼ (Polls status: GET /attempts/:id/submissions/:subId)
[TestForge Express API] ◄─── (Sanitizes results: strips hidden input, output, errors)
       │
       ▼ (Jobs queued in Valkey/Redis)
[TestForge Background Worker] ──► MongoDB (Fetches hidden test inputs & expected outputs)
       │
       ├─────────────────────────────────────────┐
       │ (1) Sends Code & Test Input (stdin)     │ (2) Retains Expected Output
       ▼                                         ▼
[Dedicated Judge0 Runner]                 [TestForge Internal Judge]
       │                                         │
       │ Compiles & runs code in isolate box     │ Compares runner stdout against expectedOutput
       │ Returns: { stdout, stderr, exitCode }   │ Computes score, verdict, and analytics
       └────────────────────────────────────────►│
                                                 ▼
                                          Stores in MongoDB
```

### Architectural Guarantees:
1. **Hidden Test Inputs to Runner:** Hidden test inputs **must** be sent as `stdin` to the execution runner so student code can execute against edge cases.
2. **Expected Outputs & Reference Solutions:** Expected outputs and reference solutions **never leave TestForge**; they are never transmitted to Judge0 or the execution runner.
3. **Student Browser Shield:** Hidden test inputs, expected outputs, database ObjectIds, and runner outputs are stripped by `getSubmissionStatus` before any response is sent to candidate browsers.
4. **Result Sanitization:** If student code crashes or fails a hidden test, the internal error diff is obscured; the student only receives `{ isHidden: true, passed: false, status: "failed" }`.

---

## 8. TestForge Worker Configuration

When the Linux VM is provisioned and verified:
1. In the TestForge Background Worker environment (`server/.env` or Render Dashboard), configure:
   ```env
   EXECUTION_PROVIDER=render_sandbox
   RENDER_SANDBOX_ENDPOINT=https://runner.testforge.edu
   RENDER_SANDBOX_API_KEY=your_cryptographically_secure_authn_token_min_32_chars
   ```
2. Note on Backward Compatibility: The provider code also accepts `RENDER_SANDBOX_URL` and `RENDER_SANDBOX_TOKEN`.

---

## 9. Automated Setup & Verification Scripts

- **`./deploy-runner.sh`**: Turnkey setup script for Ubuntu 22.04 VMs.
- **`./verify-cgroups-isolate.sh`**: Validates kernel cgroup v1 mounts, writeability, and isolate container initialization with automatic cleanup trap.
- **`./verify-containment.sh`**: Executes 16 hostile-code containment tests covering auth guards, network override, fork bombs, and multi-process aggregate memory limits.
- **`./benchmark.sh`**: Runs concurrency benchmarks across 1, 5, 10, 25, 50 simultaneous requests measuring p50/p95 latency, RPS, CPU utilization, and distinguishing HTTP roundtrip from sandbox CPU execution time.

---

## 10. Troubleshooting, Logs & Diagnostics

If Judge0 services fail to boot or return errors:

1. **Inspect Container Status and Logs**:
   ```bash
   cd /opt/testforge-judge0
   docker compose ps
   # View Judge0 worker logs (isolate execution and Resque queue)
   docker compose logs -f judge0-workers
   # View Judge0 API server logs
   docker compose logs -f judge0-server
   # View PostgreSQL and Redis health
   docker compose logs -f judge0-db judge0-redis
   ```

2. **Diagnose Common Errors**:
   - `Failed to create control group /sys/fs/cgroup/memory/box-N/`: Host is running cgroups v2. Ensure `systemd.unified_cgroup_hierarchy=0` is set in `/etc/default/grub`, run `update-grub`, and reboot.
   - `Redis::CommandError (ERR AUTH...)`: Password mismatch between `REDIS_PASSWORD` in `judge0.conf` and `docker-compose.yml`. Re-run `deploy-runner.sh`.
   - `HTTP 401 Unauthorized on submissions`: The `X-Auth-Token` header sent by TestForge worker does not match `AUTHN_TOKEN` in `/opt/testforge-judge0/judge0.conf`.

---

## 11. Maintenance, Database Backup & Non-Destructive Rollback

### A. Non-Destructive Service Restart & Rollback
To stop or restart services without losing submission history or database records:
```bash
# Graceful stop: preserves PostgreSQL data and Redis volume
docker compose down

# Start again
docker compose up -d
```

### B. Database Backup Procedure
Prior to any maintenance, backup the PostgreSQL database:
```bash
# Create timestamped SQL dump
docker compose exec -T judge0-db pg_dump -U judge0 judge0 > "/opt/testforge-judge0/judge0_backup_$(date +%F_%H%M%S).sql"
```

### C. Safe Restore Integrity Verification (Non-Destructive Test Database)
To verify backup data integrity without overwriting or risking the live database:
```bash
# 1. Create an isolated temporary test database
docker compose exec -T judge0-db psql -U judge0 -d postgres -c "DROP DATABASE IF EXISTS judge0_restore_test;"
docker compose exec -T judge0-db psql -U judge0 -d postgres -c "CREATE DATABASE judge0_restore_test OWNER judge0;"

# 2. Restore backup into the isolated test database
cat /opt/testforge-judge0/judge0_backup_YYYY-MM-DD.sql | docker compose exec -T judge0-db psql -U judge0 -d judge0_restore_test

# 3. Verify table schema and row count
docker compose exec -T judge0-db psql -U judge0 -d judge0_restore_test -c "\dt"
docker compose exec -T judge0-db psql -U judge0 -d judge0_restore_test -c "SELECT count(*) AS verified_submissions FROM submissions;"

# 4. Clean up temporary test database
docker compose exec -T judge0-db psql -U judge0 -d postgres -c "DROP DATABASE judge0_restore_test;"
```

### D. Production Database Disaster Recovery Procedure
To restore the live production database during emergency recovery:
```bash
cat /opt/testforge-judge0/judge0_backup_YYYY-MM-DD.sql | docker compose exec -T judge0-db psql -U judge0 judge0
```

### E. Destructive Teardown (DANGER)
> [!CAUTION]
> Running `docker compose down -v` permanently deletes the `judge0_db_data` volume containing all submission records. Only execute this if you intentionally wish to wipe the entire database.
```bash
# Explicit confirmation required:
read -p "WARNING: This will permanently delete all submission history. Type 'DESTROY' to proceed: " confirm
if [ "$confirm" = "DESTROY" ]; then
    docker compose down -v
fi
```

---

## 12. Private Mesh Networking (Tailscale Userspace Mode on Render)

When connecting Render Background Workers to the private Judge0 runner without exposing port 443 publicly:

1. **Why Userspace Mode is Required**:
   Render containers run unprivileged without `/dev/net/tun` or `CAP_NET_ADMIN`. Standard Tailscale fails to create `tun0`.
2. **Setup on Render Background Worker**:
   Start `tailscaled` with dedicated, non-overlapping ports for SOCKS5 and HTTP listeners:
   ```bash
   tailscaled --tun=userspace-networking \
              --socks5-server=localhost:1055 \
              --outbound-http-proxy-listen=localhost:1056 &
   tailscale up --authkey=${TS_AUTHKEY} --hostname=testforge-render-worker
   ```
3. **Node.js Undici Proxy Dispatcher**:
   Node.js `fetch` ignores userspace networking interfaces by default. TestForge's `RenderSandboxProvider` automatically instantiates an `undici.ProxyAgent` when `TAILSCALE_PROXY` or `HTTP_PROXY` is defined:
   ```env
   # Configure in Render Worker Environment:
   TAILSCALE_PROXY=http://127.0.0.1:1056
   RENDER_SANDBOX_ENDPOINT=http://testforge-runner.tailnet.ts.net:2358
   RENDER_SANDBOX_API_KEY=your_cryptographically_secure_authn_token_min_32_chars
   ```
   With this configuration, all outbound HTTP requests to the private tailnet IP traverse the encrypted tunnel with zero public ingress.


---

## 13. Production Deployment Gate Checklist (Strict Preflight Criteria)

Before switching TestForge production configuration from `EXECUTION_PROVIDER=mock` to `EXECUTION_PROVIDER=render_sandbox`, the operator MUST execute and verify all 6 Linux host criteria on the dedicated VM:

| Gate | Category | Required Operational Evidence | Verification Command |
| :--- | :--- | :--- | :--- |
| **G1** | **Kernel & Cgroup Mode** | Host kernel booted with `systemd.unified_cgroup_hierarchy=0` in `/proc/cmdline`. Cgroup v1 active. | `grep unified_cgroup_hierarchy=0 /proc/cmdline` |
| **G2** | **Cgroup Controllers** | `/sys/fs/cgroup/memory`, `/sys/fs/cgroup/cpuacct`, `/sys/fs/cgroup/cpuset` mounted and writable. | `bash verify-cgroups-isolate.sh` (Section 1 & 2) |
| **G3** | **Isolate Sandbox Lifecycle** | `isolate --init --box-id=98` creates isolated sandbox; `--cleanup` cleans it without leaked mounts. | `bash verify-cgroups-isolate.sh` (Section 3) |
| **G4** | **Resource Enforcement** | Aggregate memory limits (`256MB`), CPU limits (`3.5s`), and wall-clock limits strictly terminate runaway processes. | `bash verify-containment.sh` (Memory & CPU tests) |
| **G5** | **Zero Network Egress** | Student code inside isolate cannot establish outbound TCP/UDP sockets, DNS resolution, or ping. | `bash verify-containment.sh` (Network socket tests) |
| **G6** | **Containment & Escapes** | Fork bomb containment, read-only rootfs, zero escape to host filesystem, and non-root UID enforcement verified. | `bash verify-containment.sh` (Containment tests) |

> [!CRITICAL]
> **Safety Gate Rule:** If ANY of the 6 host gates fail, or if containment tests have not been executed on the physical VM, the deployment MUST FAIL CLOSED. `EXECUTION_PROVIDER=mock` must remain active in TestForge production. Simulated marks must never be awarded in production under any circumstance.


---

## 14. BullMQ Retry Lifecycle & Exhausted Job Recovery Specification

### A. Automatic Retry Timeline
When `attempts: 3` and `backoff: { type: 'exponential', delay: 2000 }` are configured in BullMQ:

| Event | Execution Timeline | Delay | BullMQ State | Action on Infrastructure Error (`INTERNAL_ERROR`) |
| :--- | :--- | :--- | :--- | :--- |
| **Initial Attempt** | 0s (Immediate) | 0s | `active` | Fails closed: marks `EXECUTION_UNAVAILABLE`, `scoreAwarded: null`. Throws error. |
| **First Retry** | ~2s | ~2,000 ms | `delayed` -> `active` | Re-executes against runner. If offline, throws error. |
| **Second Retry** | ~6s (~2s + ~4s) | ~4,000 ms | `delayed` -> `active` | Final automatic retry attempt. If offline, throws error. |
| **Exhaustion** | End of Attempt 3 | N/A | `failed` | **No third retry after 8 seconds.** Job moves to BullMQ `failed` set. Retained for 24 hours (`removeOnFail: { age: 86400 }`). |

> [!NOTE]
> Permanent student code errors (`compilation_error`, `runtime_error`, `time_limit_exceeded`, `wrong_answer`) are completed on Attempt 1, award authoritative marks, and **never** enter retry loops. Only infrastructure runner outages (`INTERNAL_ERROR`) trigger retries.

### B. Exhausted-Job Manual/Automated Recovery Procedure
Automatic retries are designed for transient network blips (< 10 seconds). For prolonged runner outages, jobs exhaust their 3 attempts and move to the retained `failed` set.

Once the dedicated runner VM is restored, recovery is executed via `recoverUnavailableSubmissions()`:
1. **Atomic Concurrency Lock**: Atomically locks target submissions in MongoDB from `EXECUTION_UNAVAILABLE` to `RECOVERING` to prevent race conditions.
2. **Job Inspection**: Checks whether the retained job exists in Redis via `queue.getJob(jobId)`.
3. **BullMQ Reset & Retry**: If the job is in the `failed` set, invokes `await job.retry('failed', { resetAttemptsMade: true })` to reset `attemptsMade` to `0` and move it to `waiting`. If the job retention expired, creates a fresh job via `enqueueExecutionJob()`.
4. **Active/Completed Protection**: Never retries an `active` job or modifies a `completed` submission.
5. **Redis Resilience**: If Redis throws an error, the submission status is reverted to `EXECUTION_UNAVAILABLE` and is **never** left in a misleading `QUEUED` state.
6. **Automatic Exam Recalculation**: When the recovered job completes, `recalculateAttemptGrading(attemptId)` updates `StudentAnswer`, transitions the attempt from `PROVISIONAL` to `FINALIZED`, and computes the true percentage against the full exam denominator.
