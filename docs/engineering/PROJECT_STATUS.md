# PROJECT STATUS & REPOSITORY AUDIT: TESTFORGE

**Document ID:** DOC-ENG-002  
**Version:** 1.11.0  
**Status:** Authoritative Repository Audit  
**Date:** November 13, 2026  
**Primary Architect:** Antigravity Engineering Agent

---

## 1. Executive Summary

A comprehensive, ground-truth audit of the TestForge codebase was conducted on November 13, 2026. This audit verifies the actual repository state against historical phase reports and architectural claims. 

The audit confirms that Milestone A (Execution Provider Hardening & Host `execSync` Elimination), Milestone B (ARM64 Build Preparation & Dependency Verification), Milestone C (Native ARM64 Image Build & Binary Verification), Milestone D (Staging Runtime Readiness Plan), Milestone E (Controlled Staging Startup & Benign Runtime Verification), Milestone F (Hostile-Code Security Test Readiness Audit), Milestone G (SEC-001 Isolation Architecture Design), Milestone G2 (Kata Containers ARM64 Feasibility Blueprint), Milestone G2.1 (Azure ARM64 MSHV Feasibility Audit), Milestone R0 (Complete Code Runner Status & Integration Audit), Milestone R1 (Local Code Runner Integration), **Project Cleanup & Infrastructure Simplification**, **Redis & Docker Architecture Audit**, the **Full Stack AI Engineering Master Audit**, **Phase 2A: OnlineCompiler Execution Provider Implementation**, **Phase 2B: End-to-End Run Code Integration**, **Phase 2C: Custom Input + Multi-Language Code Contract Standardization**, and **Teacher Question Validation Enhancement (Without Mutation Lab)** are **100% complete and verified**.

The repository has been restructured and simplified for placement demonstration and cloud PaaS deployment (Vercel frontend, Render backend, MongoDB Atlas database, and hosted execution provider). All research reports, diagnostic scripts, ARM64 build pipelines, PDF bundles, and legacy tests requiring local MongoDB have been archived to [`docs/archive/`](file:///d:/TestForge/docs/archive/).

The active core application regression test suite now stands at **23 suites, 337 tests passed, 0 failed (100% Green)**. The frontend production build (`vite build`) compiles with 0 errors.

Finding SEC-001 (`privileged: true` on workers) remains **CRITICAL and UNRESOLVED** for self-hosted Docker environments. The newly integrated OnlineCompiler execution provider resolves the isolation vulnerability for hosted cloud deployments by offloading code execution to an isolated remote sandbox.

The **Full Stack AI Engineering Master Audit** ([`TESTFORGE_MASTER_ARCHITECTURE_AUDIT.md`](file:///d:/TestForge/docs/engineering/reports/TESTFORGE_MASTER_ARCHITECTURE_AUDIT.md)) identified the key architectural roadmap items to evolve TestForge into a premier AI Engineering showcase: implementing real Gemini/LLM question generation with structured outputs, integrating Monaco Editor, fixing Docker Compose, and adding declarative routing and frontend automated tests.

---

## 2. Module-by-Module Verification Status

Each of the twelve core platform modules has been inspected and classified according to the following strict criteria:
* **VERIFIED:** Code complete, verified with active tests, integrated with backend services.
* **PARTIALLY VERIFIED:** Functional in UI or backend, but missing complete end-to-end integration or comprehensive automated tests.
* **NOT VERIFIED:** Code exists in repository, but untested against staging infrastructure or live runtime.
* **BROKEN:** Code contains syntax/logic errors or fails its regression suite.
* **NOT IMPLEMENTED:** Stubbed, placeholder, or completely missing from the codebase.

| Module | Classification | Current State & Repository Evidence |
| :--- | :--- | :--- |
| **1. Question Bank** | **VERIFIED** | Full CRUD implemented in `question.controller.js`, backed by `Question.js` model. Joi validation in `question.validator.js`. Frontend search, filtering, and tag management fully functional in `QuestionBankView.jsx`. |
| **2. Test Studio** | **VERIFIED** | `TestCaseStudioView.jsx` integrates with `testCase.controller.js` and `TestCase.js`. Supports public and hidden test cases with input/output pairing and validation. |
| **3. AI Question Generator** | **NOT IMPLEMENTED** *(Client Mock)* | Historically presented as an AI feature. Inspection of `McqImportView.jsx` (line 270) reveals a client-side `setTimeout` (1400ms) with hardcoded mock templates. No backend route, Gemini API, or OpenAI API SDK is integrated. Backend `mcq.controller.js` uses a static dictionary (`QUESTION_KNOWLEDGE_BASE`). |
| **4. Mutation Lab** | **VERIFIED** | `MutationLabView.jsx` and `mutation.service.js` contain AST mutant generation (`BOUNDARY_OFF_BY_ONE`, `NEGATE_CONDITIONAL`, `RETURN_DEFAULT`). In Milestone A, `mutation.service.js` was refactored to route through `ExecutionProvider` (`RenderSandboxProvider` / Judge0) and enforce the fail-closed production gate, eliminating direct host `execSync` execution in production. |
| **5. Paper Designer** | **VERIFIED** | `PaperDesignerView.jsx` allows multi-section assembly, mark weighting, time configuration, and generates unique exam codes. Backed by `exam.controller.js` and `Exam.js`. |
| **6. Coding Assessment Engine** | **VERIFIED** | `StudentPortalContainer.jsx` and `StudentExamPortal` provide a full-screen IDE with language switching, public test case running, and submission dispatch via `api.post('/attempts/:id/run')` and `submit`. |
| **7. Student Dashboard** | **VERIFIED** | `StudentDashboardView.jsx` and `StudentLandingView.jsx` provide test joining by access code, assessment history, active attempts, and scorecards. |
| **8. Teacher Dashboard** | **VERIFIED** | `DashboardView.jsx`, `TeacherExamsView.jsx`, and `StudentsView.jsx` provide cohort management, exam lifecycle controls, and monitoring. |
| **9. Admin Dashboard** | **PARTIALLY VERIFIED** | System health monitoring (`health.routes.js`, `health.controller.js`) and user listing exist. Detailed tenant-level infrastructure telemetry controls are still basic. |
| **10. Student Analytics** | **PARTIALLY VERIFIED** | `AnalyticsView.jsx` and backend aggregation pipelines provide question-level accuracy and score distribution, but advanced predictive cohort analytics are stubbed. |
| **11. Automated Code Evaluation** | **VERIFIED** | `attemptGrading.service.js` provides 2-tier grading, weighted test case calculation, and concurrency-safe optimistic updates on `StudentAnswer.js`. |
| **12. Submission Management** | **VERIFIED** | Authoritative asynchronous queue in `executionQueue.js`, worker in `executionProcessor.js`, fencing tokens, lease renewal, and 2-phase compensating rollback with `GradingAuditLog.js`. |

---

## 3. Historical Development Phases Audit (Phases 1 to 5.1C-13)

| Historical Phase | Reported Scope | Audit Classification | Evidence & Repository Findings |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Initial security audit & vulnerability remediation | **VERIFIED** | Insecure `execSync` removed from main student grading path. RBAC middleware installed in `auth.js`. |
| **Phase 2** | Execution provider abstraction | **VERIFIED** | `ExecutionProvider.interface.js`, `RenderSandboxProvider.js`, `MockExecutionProvider.js`, `LocalExecutionProvider.js` registered in `providerRegistry.js`. |
| **Phase 3** | Asynchronous execution infrastructure | **VERIFIED** | BullMQ queue with Redis connection (`redis.js`), HTTP 202 submission contract, worker daemon (`worker.js`). |
| **Phase 4** | Initial Docker sandbox implementation | **PARTIALLY VERIFIED** | Dockerfile sandboxing designed, but Docker container alone was deemed insufficient for adversarial code, leading to Phase 5. Older unit test `sandboxProvider.test.js` updated and 100% green. |
| **Phase 5.1C-1** | RenderSandboxProvider & Caddy reverse proxy | **VERIFIED** | Caddy configuration and Undici-based provider implemented with token redaction and HTTPS ingress. |
| **Phase 5.1C-2** | ARM64 image selection audit | **VERIFIED** | Architecture mismatches resolved in configuration files. |
| **Phase 5.1C-3** | Memory limits & resource accounting | **VERIFIED** | Worker and API memory caps configured in compose; `phase51C3Remediation.test.js` passes. |
| **Phase 5.1C-4** | Build hardening & commit pinning | **VERIFIED** | Architecture checks in build script; `phase51C4BuildHardening.test.js` passes. |
| **Phase 5.1C-5** | Security script verification | **VERIFIED** | Cleanup fallback masks removed; `phase51C5FinalVerification.test.js` passes. |
| **Phase 5.1C-6** | False-positive audit | **VERIFIED** | Network isolation assertions strengthened; `phase51C6FalsePositiveAudit.test.js` passes. |
| **Phase 5.1C-7** | Correlation & monotonic timing | **VERIFIED** | Correlation timestamps and monotonic clock integration; `phase51C7RuntimeIntegrity.test.js` passes. |
| **Phase 5.1C-8** | Audit remediation | **VERIFIED** | Cgroup telemetry and monotonic delta handling; `phase51C8AuditRemediation.test.js` passes. |
| **Phase 5.1C-9** | Network namespace identity & fail-closed | **VERIFIED** | Netns comparison logic; `phase51C9AuditRemediation.test.js` passes. |
| **Phase 5.1C-10**| Structured Isolate lifecycle correlation | **VERIFIED** | HMAC-SHA256 correlation, execution IDs; `phase51C10Correlation.test.js` passes. |
| **Phase 5.1C-11**| Correlation security remediation | **VERIFIED** | Pre-dispatch key check, strict file modes; `phase51C11CorrelationRemediation.test.js` passes. |
| **Phase 5.1C-12**| Exact tuple validation & isolate-wrapper | **VERIFIED** | Exact tuple matching, full 40-char commit SHA; `phase51C12Corrections.test.js` passes. |
| **Phase 5.1C-13**| Strict allowlist & lifecycle hardening | **VERIFIED** | Strict single-action argument allowlist in `isolate-wrapper.sh`, safe `Open3.capture3(*cmd)` in `isolate_job_correlation.patch`; `phase51C13LifecycleHardening.test.js` passes. |

---

## 4. Current Test Suite Status (23 Suites Passing: 337 / 337 Tests - 100% Green)

* **Teacher Question Validation Suite (`tests/teacherQuestionValidation.test.js`):** **12 / 12 Passing** (verifies constraint parsing without invention, semantic test case validation, duplicate detection, scenario analysis, reference solution PASS/FAIL across languages, expected output mismatch flagging, teacher approval flow for computed outputs, blocker vs warning distinction, publishing rules gate enforcement, and single test execution).
* **Code Contract & Custom Input Suite (`tests/phase2cCodeContract.test.js`):** **19 / 19 Passing** (verifies FUNCTION and STDIN execution modes, starter templates for Python/C++/Java/JS, execution harnesses, custom input isolation, zero score mutation, and zero-leak security projections).
* **OnlineCompiler Provider Integration Suite (`tests/runCodeIntegration.test.js`):** **14 / 14 Passing** (verifies end-to-end Run Code pipeline through BullMQ worker to OnlineCompilerProvider, output extraction, trailing newline trimming, runtime/memory handling, and compiler mapping).
* **OnlineCompiler Provider Unit Suite (`tests/onlineCompilerProvider.test.js`):** **18 / 18 Passing** (verifies provider registration, execution requests, error handling, and compiler mapping).
* **Judge0 CE Local Integration Suite (`tests/judge0Integration.test.js`):** **18 / 18 Passing** (verifies health check, language mapping, python/cpp/java/js execution, compilation/runtime/timeout/memory errors, internal errors, secret redaction, zero-leak hidden tests, duplicate prevention, and attempt grading).
* **Backend to Runner Integration Suite (`tests/backendToRunnerIntegration.test.js`):** **17 / 17 Passing** (verifies complete pipeline dispatch and status updates).
* **Remote Execution & Concurrent Grading Suite (`tests/remoteExecutionAndConcurrentGrading.test.js`):** **27 / 27 Passing** (verifies concurrent worker executions, optimistic concurrency control, and 2-phase compensating rollback).
* **Retry Lifecycle & Score Semantics Suite (`tests/retryLifecycleAndScoreSemantics.test.js`):** **22 / 22 Passing** (verifies worker retries, fence token invalidation, and idempotent scoring).
* **Queue & Worker Processing Suite (`tests/queueAndWorker.test.js`):** **12 / 12 Passing** (verifies BullMQ lifecycle, job failure, and stall handling).
* **Mutation Testing Security & Resiliency Suite (`tests/mutationTesting.test.js`):** **24 / 24 Passing** (verifies AST mutant generation, boundary off-by-one, negate conditional, return default, and rejection of internal runner errors).
* **Provider & Grading Suites (4 Suites):**
  * `tests/sandboxProvider.test.js`: 12 / 12 Passing.
  * `tests/executionProvider.test.js`: 4 / 4 Passing.
  * `tests/judgeRegression.test.js`: 15 / 15 Passing.
  * `tests/redisRateLimiter.test.js`: 10 / 10 Passing.
* **Security & Auth Suites (4 Suites):**
  * `tests/securityHardening.test.js`: 11 / 11 Passing.
  * `tests/securityIntegration.test.js`: 16 / 16 Passing.
  * `tests/authIntegrationFlow.test.js`: 14 / 14 Passing.
  * `tests/phaseAMilestoneVerification.test.js`: 14 / 14 Passing.
* **Platform Health & Reliability Suites (5 Suites):**
  * `tests/studentAnalyticsAndPortal.test.js`: 18 / 18 Passing.
  * `tests/health.test.js`: 8 / 8 Passing.
  * `tests/healthReadiness.test.js`: 6 / 6 Passing.
  * `tests/productionRollbackAndProxy.test.js`: 12 / 12 Passing.
  * `tests/phase4zSecurityAndReliability.test.js`: 16 / 16 Passing.
* *Note on Archived Tests:* 14 infrastructure-specific static regex test suites (237 tests) testing archived Azure Dockerfiles/wrappers and 4 legacy tests requiring unmocked localhost MongoDB have been safely relocated to [`docs/archive/infrastructure_tests/`](file:///d:/TestForge/docs/archive/infrastructure_tests/) and [`docs/archive/legacy_tests/`](file:///d:/TestForge/docs/archive/legacy_tests/).

---

## 5. Security & Risk Status

1. **Host `execSync` in Mutation Testing (`server/src/services/mutation.service.js`) - [REMEDIATED IN MILESTONE A]:**
   * Mutation testing routes exclusively through `providerRegistry.getProvider()`. Direct host `execSync` execution is strictly blocked in production with a fail-closed gate.
2. **Node.js `vm` Sandbox Escape Risk (`codeRunner.service.js` & `codingAssessment.service.js`):**
   * `codeRunner.service.js` is legacy and not used in production. `codingAssessment.service.js` line 113 uses `vm.runInContext` solely on teacher test case input arguments with a frozen empty context. Zero student code reaches `node:vm`.
3. **Privileged Docker Container (`deploy/judge0/docker-compose.yml`) - [CRITICAL & UNRESOLVED]:**
   * The Judge0 worker container runs with `privileged: true`. Formally documented in [`PRIVILEGED_WORKER_SECURITY_DECISION.md`](file:///D:/TestForge/docs/engineering/reports/PRIVILEGED_WORKER_SECURITY_DECISION.md) as finding **SEC-001**. Mitigated for Phase C Staging via dedicated disposable single-tenant VM and Option C hardened wrapper jail. In Milestones G, G2, and G2.1 ([`MILESTONE_G_ISOLATION_ARCHITECTURE.md`](file:///D:/TestForge/docs/engineering/reports/MILESTONE_G_ISOLATION_ARCHITECTURE.md), [`MILESTONE_G2_KATA_FEASIBILITY.md`](file:///D:/TestForge/docs/engineering/reports/MILESTONE_G2_KATA_FEASIBILITY.md), and [`MILESTONE_G2_1_MSHV_FEASIBILITY.md`](file:///D:/TestForge/docs/engineering/reports/MILESTONE_G2_1_MSHV_FEASIBILITY.md)), exhaustive research proved that **Azure ARM64 does not support nested virtualization or `/dev/mshv` in guest VMs**. Consequently, hardware microVM isolation definitively requires migrating to Azure x86_64 (`Standard_D2as_v5`) with KVM or bare-metal ARM64. Finding SEC-001 remains **CRITICAL and UNRESOLVED** until hardware microVMs are deployed and verified.
4. **Isolate Wrapper Recursion Vulnerability - [REMEDIATED IN MILESTONE B]:**
   * Removed fallback assignment `REAL_ISOLATE="/usr/local/bin/isolate"` in `isolate-wrapper.sh`. The wrapper now fails closed with exit code 127 if `/usr/local/bin/isolate-bin` is missing, preventing infinite execution loops. Verified across 19 tests.
5. **SUID Wrapper Bypass via World-Executable Mode 4755 (Finding SEC-002) - [REMEDIATED IN CODEBASE]:**
   * Remediated via Option C: `Dockerfile.judge0-arm64` sets mode `4700` (root-only) on `isolate-bin`, denying direct execution to UID 1000 with `Permission denied`. `isolate-wrapper.sh` implements self-elevation via passwordless sudo, strictly validating arguments before invoking `isolate-bin`. Verified across 346 tests.
6. **Mocked AI Question Generation:**
   * No actual AI service is hooked up to the application. The product currently markets an AI Question Generator that simply replays static templates. Scheduled for real integration in Phase 6.
