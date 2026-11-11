# TestForge Runner Connectivity & Private Networking Architecture

## 1. Overview
This document defines the production and staging connectivity architecture between the **TestForge Render Services** (Express API & BullMQ Background Worker) and the **Dedicated ARM64 Execution Runner** (Oracle Cloud Infrastructure Ampere A1 VM running Judge0 CE v1.13.1).

---

## 2. High-Level Network Topology Diagram

```
+-----------------------------------------------------------------------------------+
| RENDER CLOUD ENVIRONMENT (Ephemeral Linux Containers)                             |
|                                                                                   |
|  +---------------------------+             +----------------------------------+   |
|  |   TestForge Express API   |             |  TestForge Background Worker     |   |
|  |   (Web Service - Port 5000)             |  (Node.js BullMQ Worker Service) |   |
|  +-------------+-------------+             +----------------+-----------------+   |
|                |                                            |                     |
|                | Reads / Writes Status                      | Executes Jobs       |
|                v                                            v                     |
|  +---------------------------+             +----------------------------------+   |
|  |     MongoDB Atlas         |             |      Redis / Valkey              |   |
|  |     (Authoritative DB)    |             |      (BullMQ Submission Queue)   |   |
|  +---------------------------+             +----------------------------------+   |
+-------------------------------------------------------------|---------------------+
                                                              |
                 =============================================|=====================
                 SECURE NETWORK BOUNDARY (HTTPS / TLS 1.3 or Tailscale WireGuard)
                 =============================================|=====================
                                                              |
                                                              v
+-----------------------------------------------------------------------------------+
| OCI ALWAYS FREE AMPERE A1 RUNNER VM (Ubuntu 22.04 LTS ARM64)                      |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | Caddy Inbound Gateway (Listening on :443)                                   |  |
|  | - Automated TLS Termination (Let's Encrypt / Tailscale Certs)               |  |
|  | - Request Size Limit: 512KB                                                 |  |
|  | - Path Allowlist: /submissions*, /languages*, /statuses*, /about, /health    |  |
|  | - Block Administrative Endpoints (/config, /admin, /workers -> 403)         |  |
|  | - Authenticates X-Auth-Token against JUDGE0_AUTH_TOKEN (Non-matching -> 401)|  |
|  +-------------------------------------+---------------------------------------+  |
|                                        | Loopback proxy (127.0.0.1:2358)          |
|                                        v                                          |
|  +-----------------------------------------------------------------------------+  |
|  | Docker Compose Sandbox Execution Stack                                      |  |
|  |                                                                             |  |
|  |  +-----------------------------+           +-----------------------------+  |  |
|  |  | judge0-server (Puma API)    |           | judge0-workers (Resque)     |  |  |
|  |  | - Bound to: 127.0.0.1:2358  |           | - privileged: true (isolate)|  |  |
|  |  | - privileged: false         |           | - COUNT=1 (Staging policy)  |  |  |
|  |  | - mem_limit: 1024MB         |           | - mem_limit: 3072MB         |  |  |
|  |  +--------------+--------------+           +--------------+--------------+  |  |
|  |                 |                                         |                 |  |
|  |                 +--------------------+--------------------+                 |  |
|  |                                      |                                      |  |
|  |                                      v                                      |  |
|  |                       +-----------------------------+                       |  |
|  |                       | IOI Isolate Sandbox Engine  |                       |  |
|  |                       | - Non-root sandbox UID      |                       |  |
|  |                       | - Legacy cgroup v1 limits   |                       |  |
|  |                       | - Zero network egress       |                       |  |
|  |                       | - Ephemeral tmpfs box       |                       |  |
|  |                       +-----------------------------+                       |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 3. Render Hosting Constraints & Network Pattern Selection

### 3.1 Render Background Worker Capabilities
- On Render, native Background Workers execute in unprivileged container environments.
- `CAP_NET_ADMIN` and `/dev/net/tun` are **not available** in native Render containers.
- Standard kernel-level WireGuard / Tailscale interfaces (`tailscale0`) cannot be mounted.

### 3.2 Supported Connectivity Patterns

#### Pattern A: Direct HTTPS with Caddy Gateway (Recommended for Render)
1. **How it works:**
   - The OCI ARM64 VM exposes port 443 to the public internet (or restricted IP range).
   - Port 2358 is **strictly bound to 127.0.0.1** and blocked from public ingress.
   - Caddy reverse proxy terminates TLS with automated certificates (Let's Encrypt).
   - Caddy validates `X-Auth-Token` on every execution request before proxying to Judge0.
   - Administrative paths (`/config`, `/admin`, `/workers`) are rejected with `403 Forbidden`.
   - Render Background Worker connects via standard HTTPS (`https://runner.yourdomain.com`).
2. **Advantages:**
   - Universal compatibility with Render native Node.js runtime (zero sidecars required).
   - Strict TLS certificate verification with zero self-signed cert risks.
   - Clean, standardized path and body-size gating at the edge.

#### Pattern B: Tailscale Userspace Networking (Alternative)
1. **How it works:**
   - If a custom Docker container runtime is used on Render, a Tailscale userspace daemon (`tailscaled --tun=userspace-networking --socks5-server=localhost:1056`) runs alongside the worker.
   - TestForge connects via `TAILSCALE_PROXY=http://127.0.0.1:1056` and `RENDER_SANDBOX_ENDPOINT=http://100.x.y.z:2358`.
2. **Fail-Closed Protection:**
   - When `REQUIRE_PROXY=true` is set, `RenderSandboxProvider` immediately aborts and fails closed if the SOCKS5 proxy is offline, preventing accidental unencrypted public routing.

---

## 4. Render Background Worker Environment Variables

Configure these variables in your Render Dashboard under **Background Worker > Environment**:

| Variable | Recommended Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enforces production security guarantees (blocks local execution). |
| `EXECUTION_PROVIDER` | `render_sandbox` | Routes submissions to the remote isolated runner. |
| `RENDER_SANDBOX_ENDPOINT` | `https://runner-staging.yourdomain.com` | Base URL of the Caddy HTTPS gateway on the VM. |
| `RENDER_SANDBOX_API_KEY` | *(High entropy token)* | `X-Auth-Token` matching `JUDGE0_AUTH_TOKEN` in runner `.env`. |
| `RUNNER_CONNECTION_TIMEOUT_MS` | `5000` | Connection timeout ceiling (5s). |
| `RUNNER_RESPONSE_TIMEOUT_MS` | `10000` | Response timeout ceiling (10s; must exceed isolate wall-time limit). |
| `WORKER_CONCURRENCY` | `2` | Conservative concurrency matching VM capacity. |
| `MONGODB_URI` | *(Atlas connection string)* | Shared authoritative MongoDB database. |
| `REDIS_URL` | *(Upstash or managed Redis)* | Redis / Valkey URL for BullMQ queues. |
| `ALLOW_LOCAL_EXECUTION` | `false` | Security guard: always false in production. |

---

## 5. Security & Isolation Controls

1. **Zero Secret Leakage:**
   - All logging in `RenderSandboxProvider` passes through `_sanitize(msg)`, redacting API keys and authorization tokens.
   - Student-facing APIs and grading results never receive or expose runner credentials.
2. **Strict TLS Certificate Verification:**
   - Undici `Agent` strictly enforces `rejectUnauthorized: true`.
   - Untrusted, expired, or self-signed certificates fail closed with `internal_error`.
3. **Fail-Closed Execution Guarantees:**
   - If the runner is offline, unreachable, or returns a 5xx error, the submission transitions to `EXECUTION_UNAVAILABLE`.
   - Submissions in `EXECUTION_UNAVAILABLE` receive **zero marks** (`scoreAwarded: null`).
   - The job is re-queued with exponential backoff for operator recovery.
4. **Readiness Probe Separation:**
   - `/api/v1/health/readiness` separates application health (Express + MongoDB + Redis) from execution runner availability.
   - If the runner is offline, the endpoint returns `status: "degraded"` with `executionRunner.reachable: false`.
   - The backend never claims the runner is healthy merely because Express is running.

---

## 6. Staging Connection Verification Checklist

Execute this checklist after provisioning the ARM64 VM and deploying Caddy:

- [ ] **1. Public Port 2358 Ingress Check:**
  - Verify `curl -m 3 http://<VM_IP>:2358` times out or is rejected (must NOT be open to the internet).
- [ ] **2. Caddy HTTPS Health Check:**
  - `curl -fsSL -v https://<RUNNER_DOMAIN>/about` returns HTTP 200 with Judge0 version metadata.
- [ ] **3. Caddy Admin Block Check:**
  - `curl -fsSL -X GET https://<RUNNER_DOMAIN>/config` returns HTTP 403 Forbidden.
- [ ] **4. Unauthenticated Execution Rejection:**
  - `curl -X POST https://<RUNNER_DOMAIN>/submissions` (without `X-Auth-Token`) returns HTTP 401 Unauthorized.
- [ ] **5. Authenticated Smoke Test:**
  - `curl -H "X-Auth-Token: <SECRET>" -H "Content-Type: application/json" -X POST https://<RUNNER_DOMAIN>/submissions?wait=true -d '{"source_code":"print(42)","language_id":71}'` returns status ID 3 (`Accepted`) with stdout `"42\n"`.
- [ ] **6. Backend Readiness Verification:**
  - Query `GET /api/v1/health/readiness` on the TestForge API; verify `executionRunner.reachable` is `true`.
- [ ] **7. Hostile Containment Suite:**
  - Run `bash deploy/judge0/verify-containment.sh` on the VM (25/25 containment tests passing).
