# TestForge Phase 5.1C-1: Backend-to-Runner Integration Report

**Date:** November 12, 2026  
**Auditor / Engineer:** Senior Distributed Systems, Security & DevSecOps Architecture Team  
**Scope:** Secure backend integration preparation for the future ARM64 Judge0 staging runner.  
**Execution Context:** Integration preparation and test validation only (Zero cloud resources provisioned, zero VM instances created, zero external network connections).

---

## 1. Executive Summary & Review

In Phase 5.1C-1, the TestForge backend has been fully prepared for hardened, authenticated, and fail-closed communication with the future Oracle Cloud Infrastructure (OCI) Ampere A1 ARM64 Judge0 runner.

### Key Milestones Completed:
1. **Production-Hardened Runner Connector:** Enhanced [`RenderSandboxProvider`](file:///d:/TestForge/server/src/services/execution/RenderSandboxProvider.js) to support environment-driven runner endpoints, separate connection/response/execution timeouts, payload and schema validation against malformed responses, automatic token sanitization, and explicit health/readiness probing.
2. **Reverse Proxy & Network Security Design:** Crafted [`deploy/judge0/Caddyfile`](file:///d:/TestForge/deploy/judge0/Caddyfile) providing automated TLS termination, strict method and path allowlisting, token authentication at the reverse proxy boundary, and complete blocking of Judge0 administrative routes.
3. **Decoupled Application vs. Runner Readiness:** Enhanced [`health.routes.js`](file:///d:/TestForge/server/src/routes/health.routes.js) with `/readiness` and `/runner` probes, ensuring the backend never reports execution infrastructure as healthy merely because the Node.js API process is running.
4. **Comprehensive Test Suite:** Authored [`backendToRunnerIntegration.test.js`](file:///d:/TestForge/server/tests/backendToRunnerIntegration.test.js) (14/14 tests passing) and [`healthReadiness.test.js`](file:///d:/TestForge/server/tests/healthReadiness.test.js) (4/4 tests passing) covering authenticated execution, timeouts, certificate validation, runner outage classification, malformed payloads, rate-limiting, and zero-score fail-closed guarantees.

---

## 2. Architecture Reviewed

The existing architecture was reviewed across the codebase:
- **ExecutionProvider Interface:** ([`ExecutionProvider.interface.js`](file:///d:/TestForge/server/src/services/execution/ExecutionProvider.interface.js)) Contract preserved without breaking changes.
- **Provider Selection & Environment:** ([`providerRegistry.js`](file:///d:/TestForge/server/src/services/execution/providerRegistry.js), [`env.js`](file:///d:/TestForge/server/src/config/env.js)) Enforces fail-closed provider selection (`render_sandbox` in staging/production, `mock` for local smoke tests). Refuses `local` execution fallback in production.
- **Submission Worker & BullMQ Lifecycle:** ([`executionProcessor.js`](file:///d:/TestForge/server/src/services/queue/executionProcessor.js), [`worker.js`](file:///d:/TestForge/server/src/worker.js)) Bounded concurrency, lease-based exclusivity fencing, heartbeat lease renewals, and transactional scoring rollback preserved.
- **Retry, Timeout & Cancellation:** ([`executionRecovery.js`](file:///d:/TestForge/server/src/services/queue/executionRecovery.js)) Validated quarantine window (`quarantineUntil = now + wall_time_limit + margin`) to compensate for Judge0 CE's architectural limitation where in-flight Isolate processes continue executing on the runner until wall-time expiry even if deleted from the queue.

---

## 3. Files Changed and Created

| File | Change Type | Purpose |
| :--- | :--- | :--- |
| [`server/src/services/execution/RenderSandboxProvider.js`](file:///d:/TestForge/server/src/services/execution/RenderSandboxProvider.js) | **Modified** | Added separate timeouts (`connectionTimeoutMs`, `responseTimeoutMs`), payload schema validation, token sanitization (`_sanitize`), rate-limit & 5xx error classification, and `checkHealth()` probe. |
| [`server/src/routes/health.routes.js`](file:///d:/TestForge/server/src/routes/health.routes.js) | **Modified** | Added `/readiness` and `/runner` endpoints distinguishing application process health from execution runner availability. |
| [`server/src/worker.js`](file:///d:/TestForge/server/src/worker.js) | **Modified** | Added boot-time runner connectivity probe and fail-closed state warning. |
| [`deploy/judge0/Caddyfile`](file:///d:/TestForge/deploy/judge0/Caddyfile) | **Created** | Secure TLS reverse-proxy template with path allowlisting, token auth, and admin blocking. |
| [`deploy/judge0/backend-runner.env.example`](file:///d:/TestForge/deploy/judge0/backend-runner.env.example) | **Created** | Configuration template for Render Background Worker and Web Service. |
| [`deploy/judge0/RUNNER_CONNECTIVITY.md`](file:///d:/TestForge/deploy/judge0/RUNNER_CONNECTIVITY.md) | **Created** | Complete network topology, Render constraints analysis, and staging verification checklist. |
| [`server/tests/backendToRunnerIntegration.test.js`](file:///d:/TestForge/server/tests/backendToRunnerIntegration.test.js) | **Created** | 14 integration test cases covering timeouts, TLS verification, malformed data, and fail-closed scoring. |
| [`server/tests/healthReadiness.test.js`](file:///d:/TestForge/server/tests/healthReadiness.test.js) | **Created** | 4 tests verifying readiness and runner probe behavior under healthy and degraded conditions. |

---

## 4. Connector Design

### 4.1 URL & Authentication Configuration
The connector reads configuration with backward-compatible fallback aliases:
- Endpoint: `options.endpoint` || `config.execution.sandboxEndpoint` || `JUDGE0_URL` || `JUDGE0_API_URL` || `RENDER_SANDBOX_ENDPOINT`
- API Key: `options.apiKey` || `config.execution.sandboxApiKey` || `JUDGE0_API_KEY` || `RENDER_SANDBOX_API_KEY`
- Authz Token: `options.authzToken` || `JUDGE0_AUTHZ_TOKEN` || `RENDER_SANDBOX_AUTHZ_TOKEN`

### 4.2 Multi-Tier Timeout Architecture
Timeouts are separated into distinct boundaries:
1. **Connection Timeout (`connectionTimeoutMs`, default 5000ms):** Governs TCP connection and TLS handshake to the runner gateway. Configured on the undici `Agent` connection pool.
2. **Response Timeout (`responseTimeoutMs`, default 10000ms):** Governs the HTTP wait time for response headers and body. Must accommodate user code wall-time plus network margins:
   $$\text{effectiveResponseTimeout} = \max(\text{responseTimeoutMs}, (\text{wallTimeLimitSec} \times 1000) + 3000)$$
3. **Execution Limits (passed to Judge0):**
   - `cpu_time_limit`: $\max(1, \lceil\text{timeoutMs} / 1000\rceil)$
   - `wall_time_limit`: $\max(2, \lceil(\text{timeoutMs} + 2000) / 1000\rceil)$

### 4.3 Malformed Response & Schema Validation
The response parser (`_parseJudge0Response`) enforces strict type and boundary checks:
- Rejects non-objects and arrays with `status: 'internal_error'`.
- Validates `data.status.id` is a number in range $[1, 14]$. If missing or outside bounds, flags as malformed response.
- Sanitizes stderr and compile_output, truncating to 16KB to prevent memory exhaustion.
- Validates that `time` and `memory` are non-negative numbers before assignment.

### 4.4 Secret Sanitization
All error messages emitted by the provider pass through `_sanitize(msg)`:
- Scans and replaces all instances of `this.apiKey` with `[REDACTED_API_KEY]`.
- Scans and replaces all instances of `this.authzToken` with `[REDACTED_AUTH_TOKEN]`.
- Student-facing APIs and grading results are guaranteed to never leak tokens.

---

## 5. Authentication, TLS & Private Networking Design

### 5.1 Render Environment Constraints
- Render Background Workers run in unprivileged Linux containers without root access.
- Kernel-level WireGuard devices (`/dev/net/tun`) are **unavailable** on Render native workers.
- Therefore, **Pattern A (Direct HTTPS via Caddy reverse proxy)** is the primary, production-ready design. Pattern B (Tailscale Userspace SOCKS5) is retained as a configurable alternative.

### 5.2 Caddy Reverse Proxy Boundary
The Caddy configuration template ([`deploy/judge0/Caddyfile`](file:///d:/TestForge/deploy/judge0/Caddyfile)) enforces:
1. **Automated TLS:** Obtains certificates via Let's Encrypt / ZeroSSL or Tailscale MagicDNS. Never disables certificate verification.
2. **Port 2358 Isolation:** Judge0 binds strictly to `127.0.0.1:2358` inside Docker Compose. Direct public access is physically impossible.
3. **Path Allowlisting:** Strictly permits only `/submissions*`, `/languages*`, `/statuses*`, `/about`, and `/health`.
4. **Administrative Blocking:** Completely blocks `/config*`, `/admin*`, `/workers*`, `/sidekiq*` with `403 Forbidden`.
5. **Token Authentication at Gateway:** Rejects unauthenticated requests lacking `X-Auth-Token` with `401 Unauthorized` before the request reaches the Judge0 application.
6. **Payload Size Capping:** Restricts `request_body` to 512KB.

---

## 6. Render Worker Configuration & Health Strategy

### 6.1 Worker Lifecycle & Concurrency
- `WORKER_CONCURRENCY=2`: Bounded to 2 concurrent jobs to align with OCI Ampere A1 sizing (2 OCPUs, 12 GB RAM) and isolate `COUNT=1`.
- Graceful shutdown handles `SIGTERM` / `SIGINT` by stopping job consumption, waiting for running jobs to finish or preempt, and closing database and Redis connections.

### 6.2 Health & Readiness Separation
In [`health.routes.js`](file:///d:/TestForge/server/src/routes/health.routes.js):
- **`/api/v1/health` (Liveness):** Confirms Express API and MongoDB connectivity.
- **`/api/v1/health/readiness` (Readiness):** Evaluates MongoDB, Redis, and queries `RenderSandboxProvider.checkHealth()`.
  - If the runner is offline, status is `degraded`, `application.ready: true`, and `executionRunner.reachable: false`.
  - The API does not falsely report execution availability.
- **`/api/v1/health/runner` (Runner Probe):** Returns HTTP 200 with latency if runner is operational; HTTP 503 if unreachable, unauthenticated, or returning errors.

---

## 7. Test Results

### 7.1 Integration Test Suite ([`backendToRunnerIntegration.test.js`](file:///d:/TestForge/server/tests/backendToRunnerIntegration.test.js))
All 14 integration test cases passed cleanly with mocked HTTP responses:

```
PASS tests/backendToRunnerIntegration.test.js
  Phase 5.1C-1: Backend-to-Runner Integration & Reliability Tests
    √ 1. Valid authenticated remote execution sends correct headers, limits, and parses output (43 ms)
    √ 2. Missing authentication configuration returns internal_error when runner rejects request (4 ms)
    √ 3. Invalid TLS certificate fails closed and prevents untrusted connection (6 ms)
    √ 4. Connection timeout aborts and returns internal_error with timeout details (3 ms)
    √ 5. Response timeout during long execution returns timeout status without crashing (3 ms)
    √ 6. Runner unavailable returns internal_error and does not award marks (5 ms)
    √ 7. Malformed Judge0 response (missing status ID or invalid JSON) fails closed (6 ms)
    √ 8. Unauthorized response is detected and tokens are sanitized (4 ms)
    √ 9. Rate-limit response (HTTP 429) is classified as internal_error for backoff retry (4 ms)
    √ 10. Duplicate submission already COMPLETED is ignored idempotently (5 ms)
    √ 11. Stalled submission with expired lease can be claimed on worker restart (17 ms)
    √ 12. Cancellation deletes submission from queue while documenting isolate wall-time limit (4 ms)
    √ 13. Production environment strictly refuses to fallback to LocalExecutionProvider (12 ms)
    √ 14. Infrastructure failure transitions submission to EXECUTION_UNAVAILABLE with zero score (17 ms)

Test Suites: 1 passed, 1 total
Tests:       14 passed, 14 total
```

### 7.2 Health & Readiness Suite ([`healthReadiness.test.js`](file:///d:/TestForge/server/tests/healthReadiness.test.js))
```
PASS tests/healthReadiness.test.js
  Health and Readiness Route Tests
    √ GET /health returns basic liveness with MongoDB state (24 ms)
    √ GET /health/readiness distinguishes application health from runner availability (6 ms)
    √ GET /health/runner returns 200 when runner is healthy (9 ms)
    √ GET /health/runner returns 503 when runner is unreachable (6 ms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```

### 7.3 Core Regression Suites
- `remoteExecutionAndConcurrentGrading.test.js`: **25/25 passed**
- `retryLifecycleAndScoreSemantics.test.js`: **All passed**
- `executionProvider.test.js`: **All passed**

---

## 8. Remaining Security Risks & Technical Debt

1. **Judge0 CE Cancellation Asynchrony:**
   - As documented, calling `DELETE /submissions/:token` removes the record from Postgres/Redis, but does not terminate an active Isolate process on Linux.
   - *Mitigation:* The backend's quarantine buffer (`quarantineUntil = now + wall_time_limit + margin`) successfully prevents duplicate concurrent execution on the same submission.
2. **Reverse Proxy TLS Certificate Provisioning:**
   - Caddy requires a public domain with valid DNS A/AAAA records to negotiate Let's Encrypt certificates.
   - *Mitigation:* Documented staging checklist requires DNS propagation verification before configuring Render workers.
3. **Single Runner VM Bottleneck:**
   - Staging configuration uses a single OCI A1 VM with `COUNT=1` (single concurrent execution). Sudden submission spikes will cause queue backlog in Redis.
   - *Mitigation:* BullMQ backoff retry and recovery lease mechanisms handle delayed executions cleanly without dropping student code.

---

## 9. Exact Steps Required When the ARM64 VM Becomes Available

Once human operator provisions the OCI Ampere A1 (Ubuntu 22.04 LTS ARM64) VM:

1. **Host Kernel Setup:**
   ```bash
   sudo sed -i 's/GRUB_CMDLINE_LINUX=""/GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=0"/' /etc/default/grub
   sudo update-grub
   sudo reboot
   ```
2. **Transfer Deployment Directory:**
   ```bash
   scp -r deploy/judge0/ ubuntu@<VM_IP>:/opt/testforge-judge0/
   ```
3. **Build Native ARM64 Images:**
   ```bash
   cd /opt/testforge-judge0
   sudo bash build-arm64.sh
   bash verify-arm64-binaries.sh testforge/judge0:v1.13.1-arm64
   ```
4. **Deploy Runner Stack:**
   ```bash
   sudo bash deploy-runner.sh
   bash verify-cgroups-isolate.sh
   bash verify-containment.sh
   ```
5. **Configure Caddy TLS Reverse Proxy:**
   ```bash
   sudo apt install -y caddy
   sudo cp Caddyfile /etc/caddy/Caddyfile
   # Configure RUNNER_DOMAIN and JUDGE0_AUTH_TOKEN in /etc/caddy/Caddyfile or environment
   sudo systemctl restart caddy
   ```
6. **Execute Staging Verification Checklist:**
   - Execute all 7 items from [`deploy/judge0/RUNNER_CONNECTIVITY.md`](file:///d:/TestForge/deploy/judge0/RUNNER_CONNECTIVITY.md).
7. **Configure Render Background Worker:**
   - Apply environment variables from [`deploy/judge0/backend-runner.env.example`](file:///d:/TestForge/deploy/judge0/backend-runner.env.example) to Render Dashboard.
   - Verify `/api/v1/health/readiness` reports `executionRunner.reachable: true`.
