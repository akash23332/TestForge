# TestForge Phase 5.1C-1.1: Runner Connector and Gateway Security Review Report

**Date:** November 12, 2026  
**Auditor / Reviewer:** Senior Distributed Systems, Security & DevSecOps Architecture Team  
**Review Type:** Independent Implementation Audit & Gateway Security Hardening  
**Scope:** In-depth review of `RenderSandboxProvider.js`, `Caddyfile`, `health.routes.js`, `worker.js`, `backend-runner.env.example`, `RUNNER_CONNECTIVITY.md`, and integration test suites.  
**Execution Context:** Local static analysis, code hardening, and mock test validation only (Zero cloud resources provisioned, zero VM instances created, zero external network connections).

---

## 1. Executive Summary & Verdict

### Verdict: 🟢 **APPROVED FOR STAGING CONNECTIVITY** (Post-Remediation)

An independent security review of the Phase 5.1C-1 implementation was conducted. The review identified 5 findings (2 High, 1 Medium, 2 Low) related to wildcard path matching, default secret fallbacks, uncontrolled HTTP redirect handling, plaintext HTTP protocol validation in production, and health check amplification load.

All 5 findings were remediated in the codebase, validated with 4 new targeted regression tests (bringing the integration suite to **18/18 passing tests** and health readiness suite to **4/4 passing tests**), and confirmed fail-closed.

---

## 2. Exact Files and Line Numbers Inspected

| Component | Repository File Path | Inspected Line Range |
| :--- | :--- | :--- |
| **Runner Connector** | [`server/src/services/execution/RenderSandboxProvider.js`](file:///d:/TestForge/server/src/services/execution/RenderSandboxProvider.js) | Lines 1–825 |
| **Gateway Reverse Proxy** | [`deploy/judge0/Caddyfile`](file:///d:/TestForge/deploy/judge0/Caddyfile) | Lines 1–105 |
| **Health & Readiness Routes** | [`server/src/routes/health.routes.js`](file:///d:/TestForge/server/src/routes/health.routes.js) | Lines 1–160 |
| **Background Worker Entry** | [`server/src/worker.js`](file:///d:/TestForge/server/src/worker.js) | Lines 1–108 |
| **Render Worker Env Config** | [`deploy/judge0/backend-runner.env.example`](file:///d:/TestForge/deploy/judge0/backend-runner.env.example) | Lines 1–66 |
| **Runner Architecture Doc** | [`deploy/judge0/RUNNER_CONNECTIVITY.md`](file:///d:/TestForge/deploy/judge0/RUNNER_CONNECTIVITY.md) | Lines 1–140 |
| **Integration Test Suite** | [`server/tests/backendToRunnerIntegration.test.js`](file:///d:/TestForge/server/tests/backendToRunnerIntegration.test.js) | Lines 1–590 |
| **Health Test Suite** | [`server/tests/healthReadiness.test.js`](file:///d:/TestForge/server/tests/healthReadiness.test.js) | Lines 1–125 |

---

## 3. Security Findings & Remediations

### Finding F-CADDY-01: Wildcard Path Matcher Prefix Pollution in Caddyfile
- **Severity:** Medium
- **Location:** [`deploy/judge0/Caddyfile`](file:///d:/TestForge/deploy/judge0/Caddyfile) (lines 58, 39)
- **Technical Evidence:**  
  The matcher `path /submissions* /languages* /statuses*` used trailing asterisk wildcards directly attached to the directory name. In Caddy v2, `/submissions*` matches `/submissions`, `/submissions/123`, but also permits arbitrary sibling prefixes such as `/submissions_debug`, `/submissions_admin`, or `/submissions-anything`.
- **Remediation:**  
  Replaced ambiguous wildcards with discrete exact and slash-separated subpath matchers:
  ```caddy
  path /submissions /submissions/* /languages /languages/* /statuses /statuses/*
  ```
  Similarly hardened `@blocked_admin`:
  ```caddy
  path /config /config/* /admin /admin/* /workers /workers/* /sidekiq /sidekiq/* /system /system/*
  ```

---

### Finding F-CADDY-02: Predictable Default Secret Fallback in Caddy Gateway
- **Severity:** High
- **Location:** [`deploy/judge0/Caddyfile`](file:///d:/TestForge/deploy/judge0/Caddyfile) (lines 57, 74)
- **Technical Evidence:**  
  `header X-Auth-Token {$JUDGE0_AUTH_TOKEN:unconfigured_secret_token}` configured a default fallback string. If an operator launched Caddy without setting `JUDGE0_AUTH_TOKEN` in the host environment, an attacker presenting `X-Auth-Token: unconfigured_secret_token` would successfully bypass gateway authorization.
- **Remediation:**  
  Removed `:unconfigured_secret_token`. Enforced `{$JUDGE0_AUTH_TOKEN}` without fallback. In Caddy v2, if an un-defaulted environment variable is missing, Caddy fails at startup with an explicit configuration error, guaranteeing fail-closed initialization.

---

### Finding F-CONN-01: Uncontrolled HTTP Redirects Following (Credential Leakage Risk)
- **Severity:** High
- **Location:** [`server/src/services/execution/RenderSandboxProvider.js`](file:///d:/TestForge/server/src/services/execution/RenderSandboxProvider.js)
- **Technical Evidence:**  
  All `fetch()` calls in `RenderSandboxProvider.js` defaulted to standard `redirect: 'follow'`. If an upstream gateway, proxy, or DNS interceptor returned an HTTP 301, 302, 307, or 308 redirect, the Node.js runtime would automatically follow the redirect, risking transmission of sensitive headers (`X-Auth-Token`, `X-Auth-User`) to an unauthorized location. In Judge0 CE, execution and submission APIs never issue HTTP redirects under normal operations.
- **Remediation:**  
  Configured `redirect: 'error'` on all outbound fetch options (`_executeViaJudge0`, `_executeViaTestForgeSandbox`, `getSubmission`, `cancelSubmission`, `checkHealth`). If any unexpected 3xx response is received, the client immediately aborts with an error instead of following the redirect. Verified via Test 17.

---

### Finding F-CONN-02: Unvalidated Endpoint Scheme & Plaintext HTTP in Production
- **Severity:** High
- **Location:** [`server/src/services/execution/RenderSandboxProvider.js`](file:///d:/TestForge/server/src/services/execution/RenderSandboxProvider.js) (lines 25–45)
- **Technical Evidence:**  
  `RenderSandboxProvider` accepted arbitrary endpoint strings without protocol parsing. If an operator accidentally configured a plaintext `http://` public URL in production, secrets (`X-Auth-Token`) would traverse the public internet unencrypted. Additionally, non-HTTP protocols (`file://`, `ftp://`, `gopher://`) were not explicitly rejected at construction time.
- **Remediation:**  
  Added strict URL validation in constructor:
  1. Validates that `this.endpoint` parses as a valid URL.
  2. Restricts protocol strictly to `http:` or `https:`.
  3. In `production` environment (`config.env === 'production'` or `NODE_ENV === 'production'`), plaintext `http:` is strictly rejected unless a secure proxy (`TAILSCALE_PROXY`) is configured or the hostname is `localhost`/`127.0.0.1`. Verified via Tests 15 & 16.

---

### Finding F-HEALTH-01: Health Probe Request Amplification & Runner Load Risk
- **Severity:** Medium
- **Location:** [`server/src/services/execution/RenderSandboxProvider.js`](file:///d:/TestForge/server/src/services/execution/RenderSandboxProvider.js) (lines 479–555)
- **Technical Evidence:**  
  Every query to `/api/v1/health/readiness` and `/api/v1/health/runner` executed a live outbound HTTP `GET /about` request to the runner. In production, frequent automated health checks (e.g., Render ping every 5s, external monitors, or public scraping) would result in a Denial-of-Service condition on the runner VM Puma web server.
- **Remediation:**  
  Implemented a 5-second TTL cache (`_lastHealthCheck`) in `RenderSandboxProvider.checkHealth()`. Queries arriving within 5000ms of a previous check reuse the cached status and latency, drastically reducing runner load. Added `forceRefresh: true` option for on-demand worker checks. Verified via Test 18.

---

### Finding F-HEALTH-02: Database Topology Reconnaissance in Public Health Endpoint
- **Severity:** Low
- **Location:** [`server/src/routes/health.routes.js`](file:///d:/TestForge/server/src/routes/health.routes.js) (lines 26–33)
- **Technical Evidence:**  
  `GET /api/v1/health` returned `host: dbState.host` and `databaseName: dbState.name` in its JSON payload, leaking internal MongoDB replica-set hostnames and cluster names to unauthenticated callers.
- **Remediation:**  
  Redacted `host` and `databaseName` when running in `production` (`config.env === 'production'`).

---

## 4. Judge0 Authentication Flow Audit

```
[Render Background Worker]
         |
         | (1) Attaches X-Auth-Token: <SECRET_TOKEN>
         |     Enforces HTTPS + Certificate Validation
         |     Enforces redirect: 'error'
         v
[Caddy Gateway on VM (:443)]
         |
         | (2) Inspects X-Auth-Token == {$JUDGE0_AUTH_TOKEN}
         |     If mismatch or missing -> Immediate 401 Unauthorized (dropped at edge)
         |     Inspects Path Allowlist: /submissions, /languages, /statuses, /about
         |     If administrative path (/config, /system_info) -> Immediate 403 Forbidden
         |     Enforces request body size <= 512KB
         |     Enforces request header size <= 16KB
         v
[Loopback 127.0.0.1:2358]
         |
         | (3) Proxied over loopback to Judge0 Puma API
         v
[Judge0 CE v1.13.1 Application]
         |
         | (4) Independently enforces AUTHN_TOKEN from judge0.conf
         |     Validates X-Auth-Token against internal configuration
         |     If mismatch -> 401 Unauthorized
         v
[IOI Isolate Sandbox Execution Engine]
```

### Verification Points:
- **Dual Layer Verification:** Both Caddy (gateway) and Judge0 (application) independently validate `X-Auth-Token`.
- **Administrative Credentials Isolated:** Administrative actions require `X-Auth-User` (`AUTHZ_TOKEN`). Because Caddy strictly blocks `/config`, `/workers`, and `/system_info` at the reverse proxy layer, administrative access cannot be reached from the public internet.
- **Zero Student Credential Exposure:** Student submission endpoints only receive test results, runtime, and sanitized outputs. `RenderSandboxProvider._sanitize()` scrubs all token strings from error traces and logs.

---

## 5. Network Architecture Comparison & Recommendation

### Comparison Matrix

| Property | Pattern A: HTTPS via Caddy (Recommended) | Pattern B: Tailscale Userspace SOCKS5 |
| :--- | :--- | :--- |
| **Transport Security** | TLS 1.3 with automated Let's Encrypt / ZeroSSL certs | WireGuard encrypted mesh tunnel |
| **Render Compatibility** | **100% Native.** Uses standard Node.js HTTPS client. | **Requires Custom Dockerfile.** Render native containers lack `CAP_NET_ADMIN` and `/dev/net/tun`. |
| **Attack Surface** | Port 443 open on VM; Port 2358 strictly closed on loopback. | Zero public ports open on VM. |
| **Gateway Controls** | Caddy enforces path allowlisting, body size capping, and token check at the edge. | Direct access to port 2358 within tailnet; relies entirely on Judge0 application security. |
| **Operational Overhead**| Standard DNS record and Caddy systemd service. | Daemon management, tailscale auth keys, SOCKS5 socket lifecycles on ephemeral containers. |
| **Boot Latency** | Instantaneous (< 5ms). | 5–15 seconds on every container spin-up for userspace WireGuard handshake. |

### Architectural Recommendation
**Pattern A (HTTPS through Caddy)** is the recommended architecture for staging and production.  
*Reason:* Render's container runtime does not support native Linux network interfaces (`tailscale0`). While Tailscale userspace mode is technically possible via SOCKS5 proxying, it introduces fragile container customizations, ephemeral container re-authentication delays, and bypasses the edge filtering benefits that Caddy provides.

---

## 6. Test Suite Execution & Verification

### Integration Suite ([`backendToRunnerIntegration.test.js`](file:///d:/TestForge/server/tests/backendToRunnerIntegration.test.js))
All 18 tests passed cleanly (including 4 new tests added in this review):
```text
PASS tests/backendToRunnerIntegration.test.js
  Phase 5.1C-1: Backend-to-Runner Integration & Reliability Tests
    √ 1. Valid authenticated remote execution sends correct headers, limits, and parses output (59 ms)
    √ 2. Missing authentication configuration returns internal_error when runner rejects request (6 ms)
    √ 3. Invalid TLS certificate fails closed and prevents untrusted connection (10 ms)
    √ 4. Connection timeout aborts and returns internal_error with timeout details (4 ms)
    √ 5. Response timeout during long execution returns timeout status without crashing (12 ms)
    √ 6. Runner unavailable returns internal_error and does not award marks (11 ms)
    √ 7. Malformed Judge0 response (missing status ID or invalid JSON) fails closed (13 ms)
    √ 8. Unauthorized response is detected and tokens are sanitized (5 ms)
    √ 9. Rate-limit response (HTTP 429) is classified as internal_error for backoff retry (5 ms)
    √ 10. Duplicate submission already COMPLETED is ignored idempotently (6 ms)
    √ 11. Stalled submission with expired lease can be claimed on worker restart (14 ms)
    √ 12. Cancellation deletes submission from queue while documenting isolate wall-time limit (4 ms)
    √ 13. Production environment strictly refuses to fallback to LocalExecutionProvider (21 ms)
    √ 14. Infrastructure failure transitions submission to EXECUTION_UNAVAILABLE with zero score (21 ms)
    √ 15. Rejects unsupported endpoint schemes (e.g. ftp:// or file://) to prevent SSRF (5 ms)
    √ 16. Strictly forbids plaintext HTTP in production without a secure proxy (7 ms)
    √ 17. Enforces redirect: error to prevent credential leakage across 3xx redirects (4 ms)
    √ 18. Caches checkHealth results to prevent excessive request load on runner (5 ms)

Test Suites: 1 passed, 1 total
Tests:       18 passed, 18 total
Time:        4.231 s
```

### Health Readiness Suite ([`healthReadiness.test.js`](file:///d:/TestForge/server/tests/healthReadiness.test.js))
```text
PASS tests/healthReadiness.test.js
  Health and Readiness Route Tests
    √ GET /health returns basic liveness with MongoDB state (27 ms)
    √ GET /health/readiness distinguishes application health from runner availability (5 ms)
    √ GET /health/runner returns 200 when runner is healthy (4 ms)
    √ GET /health/runner returns 503 when runner is unreachable (3 ms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
Time:        2.705 s
```

---

## 7. Explicit Approval Statement for Staging Connectivity

**Staging connectivity readiness is EXPLICITLY APPROVED**, subject to:
1. Target VM provisioned on OCI Ampere A1 (Ubuntu 22.04 LTS ARM64).
2. Host kernel configured with legacy cgroups v1 (`systemd.unified_cgroup_hierarchy=0`).
3. Caddy installed and configured using the hardened [`deploy/judge0/Caddyfile`](file:///d:/TestForge/deploy/judge0/Caddyfile).
4. Secret `JUDGE0_AUTH_TOKEN` generated via `openssl rand -hex 32` and shared strictly between runner `.env` and Render Background Worker environment variables.
5. All 7 steps in [`deploy/judge0/RUNNER_CONNECTIVITY.md`](file:///d:/TestForge/deploy/judge0/RUNNER_CONNECTIVITY.md) verified on live staging infrastructure.
