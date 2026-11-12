# PROJECT ROADMAP & AUTONOMOUS ENGINEERING MILESTONES: TESTFORGE

**Document ID:** DOC-ENG-003  
**Version:** 1.0.0  
**Status:** Approved Master Roadmap  
**Date:** November 12, 2026  
**Primary Architect:** Antigravity Engineering Agent

---

## 1. Roadmap Architecture & Execution Principles

This roadmap outlines the systematic path to transition TestForge from a hardened repository prototype into a production-grade, fully integrated assessment platform. 

The progression is divided into seven sequential milestones (A through G). No milestone may begin until all gating criteria of the prior milestone are fulfilled. Cloud and infrastructure operations are strictly gated behind explicit user authorization and financial constraints (Personal cash budget: ₹0).

```
[Milestone A: Source Verification] ──> [Milestone B: Build Prep] ──[USER APPROVAL]──> [Milestone C: ARM64 Build]
                                                                                               │
[Milestone G: Prod Readiness] <── [Milestone F: E2E Integration] <── [Milestone E: Sec Val] <── [Milestone D: Staging Exec]
```

---

## 2. Milestone Breakdown & Specification

### MILESTONE A: Complete Source-Level Verification & Defect Remediation
* **Status:** **COMPLETED & ACCEPTED**
* **Execution Boundary:** Strict Repository-Only. No Azure, no SSH, no cloud Docker, no student code execution.
* **Core Objectives Achieved:**
  1. Inspected all Phase 5.1C-13 remediation files (`isolate-wrapper.sh`, `isolate_job_correlation.patch`, `verify-resource-accounting.sh`).
  2. Verified full Judge0 invocation path from Express backend to provider interface.
  3. Remediated test assertion drift in `tests/sandboxProvider.test.js` (12/12 passing).
  4. Fixed host `execSync` vulnerability in `mutation.service.js` to route through `ExecutionProvider` with fail-closed production protection.
  5. Audited and sanitized all configuration templates and scripts to ensure zero credential leaks.
  6. Created dedicated regression test suite `tests/phaseAMilestoneVerification.test.js` (14/14 passing).
* **Deliverable:** `docs/engineering/reports/PHASE_A_SOURCE_VERIFICATION_REPORT.md`

---

### MILESTONE B: ARM64 Build Preparation & Dependency Verification
* **Status:** **COMPLETED & VERIFIED [BUILD READY]**
* **Execution Boundary:** Repository-Only. Strict ₹0 budget, zero cloud access, zero container builds.
* **Core Objectives Achieved:**
  1. Inspected `Dockerfile.compilers-arm64` and `Dockerfile.judge0-arm64`.
  2. Verified full 40-character commit SHA pinning (`ffd7a48cc6da86d6ac155ef10dbd67d02736070b`).
  3. Verified Isolate source tag `v1.10.1`, dependencies (`libcap-dev`), and noted tag reproducibility risk.
  4. Verified SHA-256 checksums for OpenSSL 1.1.1w and Ruby 2.7.8.
  5. Verified compiler toolchains (GCC 11.4, OpenJDK 17, Node 20 LTS, Python 3.10) and legacy Judge0 symlinks.
  6. Verified Judge0 CE v1.13.1 compatibility (Ruby 2.7 + custom OpenSSL 1.1.1 prefix).
  7. Verified ARM64 architecture assumptions and verified `build-arm64.sh` actively prohibits QEMU emulation.
  8. Verified Docker Compose stack and resource limits: worker (3072m / 1 CPU, `COUNT=1`), API (1024m / 0.5 CPU), database (512m / 0.25 CPU), Redis (384m / 0.25 CPU, maxmemory 256mb) totaling 4.9 GB against 8.0 GB VM capacity.
  9. Verified network isolation: port 2358 internal only (127.0.0.1 binding), Caddy HTTPS 443 reverse proxy with UFW firewall.
  10. Verified secrets and environment configurations (0600 permissions, 32-byte `CORRELATION_KEY`, HMAC-SHA256).
  11. Audited and resolved Objective 14 wrapper diversion: implemented `/usr/local/bin/isolate` -> `isolate-wrapper` and `/usr/local/bin/isolate-bin` -> real SUID binary; created 14-test suite `server/tests/milestoneBWrapperInterception.test.js`.
  12. Evaluated `privileged: true` worker container risk and documented defense-in-depth mitigations.
  13. Verified additional audits: local execution cannot be enabled in production; remaining `node:vm` usage is strictly confined to teacher test case parsing with frozen context.
* **Deliverables:**
  - `docs/engineering/SKILL_ORCHESTRATION_MAP.md`
  - `docs/engineering/reports/MILESTONE_B_INDEPENDENT_AUDIT.md`
  - `docs/engineering/reports/PRE_MILESTONE_C_SECURITY_CLOSURE_REPORT.md`
  - `docs/engineering/reports/MILESTONE_B_TEST_VERIFICATION.md`
* **Gating Criteria:** Completed. Ready for review.

---

### MILESTONE C: Native ARM64 Image Build on Azure Staging VM
* **Status:** **GATED / NOT STARTED (Requires User Authorization)**
* **Execution Boundary:** Staging Azure VM (`testforge-judge0-staging`, Ubuntu 22.04 ARM64).
* **Prerequisites:** Explicit user authorization, confirmation of VM snapshot (`testforge-before-cgroup-change`).
* **Core Objectives:**
  1. Establish secure SSH connection to staging VM without storing private keys in repo.
  2. Verify available disk space (>15 GB required) and free RAM (>4 GB required).
  3. Sequentially build compiler base image and custom Judge0 ARM64 image (zero parallel heavy builds to avoid OOM).
  4. Verify build output against pinned 40-character commit hashes.
  5. Verify compiled Isolate binary architecture (`aarch64`) and file permissions (`4755` root setuid).
  6. Archive and document build logs.
* **Deliverable:** `docs/engineering/reports/PHASE_C_ARM64_BUILD_REPORT.md`
* **Gating Criteria:** Successfully compiled images tagged and verified on staging VM with zero build warnings.

---

### MILESTONE D: Controlled Judge0 Staging Execution & Protocol Validation
* **Status:** Gated (Requires User Authorization)
* **Execution Boundary:** Staging VM runtime.
* **Core Objectives:**
  1. Start minimal Judge0 staging service stack (`db`, `redis`, `api`, `worker`, `caddy`).
  2. Verify Caddy HTTPS reverse proxy TLS handshake and token authentication header gating (`X-Auth-Token`).
  3. Execute benign benchmark programs across all 4 supported languages:
     * C++ (Standard I/O, vector manipulation).
     * Java (Public class harness, heap allocation).
     * Python (Standard input parsing, dictionary lookups).
     * JavaScript (V8 runtime execution).
  4. Verify compilation error reporting, runtime exception reporting, and timeout handling.
  5. Verify that `[CORRELATION]` structured logs and Isolate box cleanup records are emitted cleanly.
* **Deliverable:** `docs/engineering/reports/PHASE_D_STAGING_EXECUTION_REPORT.md`
* **Gating Criteria:** Verified execution and accurate telemetry across all 4 languages with verified cleanup.

---

### MILESTONE E: Security, Sandbox Containment & Adversarial Validation
* **Status:** Gated (Requires User Authorization)
* **Execution Boundary:** Hardened staging sandbox environment.
* **Core Objectives:**
  1. **Zero Egress Validation:** Execute probe attempting socket connections to external IPs, Azure metadata endpoint (`169.254.169.254`), and local loopback; verify immediate failure.
  2. **Namespace Isolation:** Confirm PID, mount, UTS, and IPC namespace isolation from inside Isolate.
  3. **Adversarial Stress Testing:**
     * Fork bomb / process exhaustion (verify cgroup `pids.max` enforcement).
     * Memory bomb / allocation spike (verify cgroup `memory.limit_in_bytes` kill without host OOM).
     * Infinite loop (verify monotonic CPU time limit kill).
     * Large file creation / disk fill (verify disk quota enforcement).
  4. **Wrapper Defense:** Attempt argument injection, path traversal via mounts, and invalid box IDs; verify fail-closed.
* **Deliverable:** `docs/engineering/reports/PHASE_E_SECURITY_VALIDATION_REPORT.md`
* **Gating Criteria:** Zero container or host escapes; complete fail-closed defense against all adversarial probes.

---

### MILESTONE F: TestForge End-to-End Application Integration
* **Status:** Scheduled (Post-Security Validation)
* **Execution Boundary:** Full-stack integration (Client + Server + Redis/BullMQ + Staging Judge0).
* **Core Objectives:**
  1. Connect backend `RenderSandboxProvider.js` to staging Caddy endpoint with valid auth token.
  2. Execute complete real-world teacher and student assessment lifecycle:
     * Teacher logs in, creates coding question with 2 sample and 3 hidden test cases.
     * Teacher generates exam paper with access code `TF-E2E01`.
     * Student accesses portal, enters exam code, writes algorithmic solutions.
     * Student executes "Run Code" -> Real-time sample test case feedback received.
     * Student executes "Submit Code" -> BullMQ job enqueued, worker processes against hidden test cases.
     * Scores calculated via `attemptGrading.service.js`, persisted in MongoDB with `GradingAuditLog`.
     * Student scorecard rendered with hidden test case inputs/outputs completely redacted.
  3. Integrate real LLM API (Google Gemini API) into backend for AI Question Generator to replace client mock.
* **Deliverable:** `docs/engineering/reports/PHASE_F_END_TO_END_REPORT.md`
* **Gating Criteria:** Flawless end-to-end user journey verified with automated integration tests.

---

### MILESTONE G: Performance, Scalability & Production Readiness
* **Status:** Final Project Milestone
* **Execution Boundary:** Production readiness benchmarking.
* **Core Objectives:**
  1. Conduct gradual load testing (1 -> 5 -> 10 -> 25 concurrent submissions) to establish true worker throughput.
  2. Measure queue latency, Redis memory saturation, and CPU utilization under sustained load.
  3. Evaluate container security alternatives to `privileged: true` (e.g., User Namespaces, Rootless Docker, Sysbox).
  4. Implement automated backup policies for MongoDB and Redis persistence.
  5. Establish automated health probes and alert thresholds within Azure budget limits.
  6. Finalize production operations and deployment runbooks.
* **Deliverable:** `docs/engineering/reports/PHASE_G_PRODUCTION_READINESS_REPORT.md`
* **Gating Criteria:** Production sign-off with documented capacity limits, verified recovery procedures, and zero unmitigated high-severity risks.
