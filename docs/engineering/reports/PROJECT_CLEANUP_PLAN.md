# TestForge Project Cleanup and Infrastructure Simplification Plan

**Document ID:** DOC-ENG-CLN-001  
**Version:** 1.0.0  
**Date:** November 13, 2026  
**Status:** PROPOSED & AUDITED  
**Target Deployment Topology:**
- **Frontend:** Vercel (React + Vite SPA)
- **Backend:** Render (Node.js Express REST API)
- **Database:** MongoDB Atlas (Managed Cloud Database)
- **Code Execution:** Hosted Execution Provider API (Judge0 CE / JDoodle / Hosted API via `ExecutionProvider` interface)
- **Supported Languages:** Java, C++, Python, JavaScript

---

## 1. Executive Summary & Audit Overview

TestForge is being streamlined into a clean, placement-ready portfolio project and demonstration platform. 

The codebase currently contains heavy, complex infrastructure artifacts from historical research phases:
1. Self-hosted Azure ARM64 VM provisioning, initialization, and diagnostic scripts.
2. Custom Dockerfile multi-stage compiler builds (`Dockerfile.compilers-arm64`, `Dockerfile.judge0-arm64`).
3. Binary diversion, SUID privilege escalation, and Isolate wrapper interceptors (`isolate-wrapper.sh`).
4. Kata Containers, Cloud-Hypervisor, MSHV, and microVM feasibility experiments.
5. Dozens of historical phase audit reports, bundle generator scripts, and generated PDF files in the repository root.
6. A duplicate `components/` directory in the repository root mirroring `client/src/components/`.
7. An obsolete Phase 4 custom Linux sandbox daemon (`sandbox/`).

This cleanup plan details the exact files to be removed, archived, or preserved, verifying dependencies and guaranteeing that **no working application functionality or Code Runner abstractions are damaged**.

---

## 2. Inventory of Items to Remove or Archive

### 2.1 Obsolete Root PDFs and Submission Artifacts (To Archive / Remove)
These 13 files are historical PDF submission bundles generated during Phase 5.1C. They are static binary artifacts totaling ~2.5 MB that add unnecessary repository bloat.

| File Path | Action | Rationale | Impact / Dependencies |
| :--- | :--- | :--- | :--- |
| `TestForge_Phase5.1C-5_Implementation.pdf` | Archive to `docs/archive/pdf_bundles/` | Generated submission report. | None. Unreferenced by application or runtime. |
| `TestForge_Phase5.1C-6_Security_Remediation.pdf` | Archive to `docs/archive/pdf_bundles/` | Generated submission report. | None. Unreferenced by application or runtime. |
| `TestForge_Phase5.1C-7_Runtime_Integrity_Bundle.pdf` | Archive to `docs/archive/pdf_bundles/` | Generated submission report. | None. Unreferenced by application or runtime. |
| `TestForge_Phase5.1C-8_Audit_Remediation_Bundle.pdf` | Archive to `docs/archive/pdf_bundles/` | Generated submission report. | None. Unreferenced by application or runtime. |
| `TestForge_Phase5.1C-9_Verification_Bundle.pdf` | Archive to `docs/archive/pdf_bundles/` | Generated submission report. | None. Unreferenced by application or runtime. |
| `TestForge_Phase5.1C-10_Actual_Files_Document.pdf` | Archive to `docs/archive/pdf_bundles/` | Generated submission report. | None. Unreferenced by application or runtime. |
| `TestForge_Phase5.1C-10_Correlation_Bundle.pdf` | Archive to `docs/archive/pdf_bundles/` | Generated submission report. | None. Unreferenced by application or runtime. |
| `TestForge_Phase5.1C-11_Actual_Files.pdf` | Archive to `docs/archive/pdf_bundles/` | Generated submission report. | None. Unreferenced by application or runtime. |
| `TestForge_Phase5.1C-11_Remediation_Bundle.pdf` | Archive to `docs/archive/pdf_bundles/` | Generated submission report. | None. Unreferenced by application or runtime. |
| `TestForge_Phase5.1C-12_Actual_Files.pdf` | Archive to `docs/archive/pdf_bundles/` | Generated submission report. | None. Unreferenced by application or runtime. |
| `TestForge_Phase5.1C-12_Remediation_Bundle.pdf` | Archive to `docs/archive/pdf_bundles/` | Generated submission report. | None. Unreferenced by application or runtime. |
| `TestForge_Phase5.1C-13_Actual_Files.pdf` | Archive to `docs/archive/pdf_bundles/` | Generated submission report. | None. Unreferenced by application or runtime. |
| `TestForge_Phase5.1C-13_Remediation_Bundle.pdf` | Archive to `docs/archive/pdf_bundles/` | Generated submission report. | None. Unreferenced by application or runtime. |
| `PHASE_5_1C_7_RUNTIME_VERIFICATION_INTEGRITY_BUNDLE.pdf` | Archive to `docs/archive/pdf_bundles/` | Duplicate of Phase 5.1C-7 bundle. | None. Unreferenced by application or runtime. |

### 2.2 Loose Root Markdown Reports (To Archive)
There are 21 historical phase report files in the root directory cluttering root project navigation:

| File Path | Action | Rationale |
| :--- | :--- | :--- |
| `PHASE_4Z_FINAL_AUDIT_REPORT.md` | Archive to `docs/archive/historical_reports/` | Historical milestone report. |
| `PHASE_5_0_INFRASTRUCTURE_PREFLIGHT.md` | Archive to `docs/archive/historical_reports/` | Historical milestone report. |
| `PHASE_5_1A1_DOCKERFILE_SECURITY_REVIEW.md` | Archive to `docs/archive/historical_reports/` | Historical milestone report. |
| `PHASE_5_1A_ARM64_BUILD_FEASIBILITY.md` | Archive to `docs/archive/historical_reports/` | Historical milestone report. |
| `PHASE_5_1B_2_DEPLOYMENT_PREFLIGHT_AUDIT.md` | Archive to `docs/archive/historical_reports/` | Historical milestone report. |
| `PHASE_5_1B_3_REMEDIATION_REPORT.md` | Archive to `docs/archive/historical_reports/` | Historical milestone report. |
| `PHASE_5_1B_NATIVE_ARM64_BUILD_REPORT.md` | Archive to `docs/archive/historical_reports/` | Historical milestone report. |
| `PHASE_5_1C_1_1_SECURITY_REVIEW.md` | Archive to `docs/archive/historical_reports/` | Historical milestone report. |
| `PHASE_5_1C_1_BACKEND_RUNNER_INTEGRATION_REPORT.md` | Archive to `docs/archive/historical_reports/` | Historical milestone report. |
| `PHASE_5_1C_2_ARM64_BUILD_READINESS_REPORT.md` | Archive to `docs/archive/historical_reports/` | Historical milestone report. |
| `PHASE_5_1C_3_REMEDIATION_REPORT.md` | Archive to `docs/archive/historical_reports/` | Historical milestone report. |
| `PHASE_5_1C_4_BUILD_PIPELINE_HARDENING_REPORT.md` | Archive to `docs/archive/historical_reports/` | Historical milestone report. |
| `PHASE_5_1C_5_FINAL_VERIFICATION_REPORT.md` | Archive to `docs/archive/historical_reports/` | Historical milestone report. |
| `PHASE_5_1C_6_FALSE_POSITIVE_AUDIT_REPORT.md` | Archive to `docs/archive/historical_reports/` | Historical milestone report. |
| `PHASE_5_1C_7_RUNTIME_VERIFICATION_INTEGRITY_REPORT.md` | Archive to `docs/archive/historical_reports/` | Historical milestone report. |
| `PHASE_5_1C_8_IMPLEMENTATION_REPORT.md` | Archive to `docs/archive/historical_reports/` | Historical milestone report. |
| `PHASE_5_1C_9_IMPLEMENTATION_REPORT.md` | Archive to `docs/archive/historical_reports/` | Historical milestone report. |
| `PHASE_5_1C_10_IMPLEMENTATION_REPORT.md` | Archive to `docs/archive/historical_reports/` | Historical milestone report. |
| `PHASE_5_1C_11_IMPLEMENTATION_REPORT.md` | Archive to `docs/archive/historical_reports/` | Historical milestone report. |
| `PHASE_5_1C_12_IMPLEMENTATION_REPORT.md` | Archive to `docs/archive/historical_reports/` | Historical milestone report. |
| `PHASE_5_1C_13_IMPLEMENTATION_REPORT.md` | Archive to `docs/archive/historical_reports/` | Historical milestone report. |

### 2.3 Transient and Diagnostic Files (To Delete or Archive)
| File Path | Action | Rationale |
| :--- | :--- | :--- |
| `scratch_prompt.json` | Delete | Temporary prompt dump. |
| `scratch_tail.txt` | Delete | Temporary text snippet. |
| `.git-backup/` | Delete | Abandoned git snapshot directory. |
| `scratch/` (20 files: `diag*.py`, `test_milestone_e_runtime.sh`, etc.) | Archive to `docs/archive/staging_diagnostics/` | One-off VM triage scripts from Milestone E. |
| `scripts/` (13 files: `generate_*_pdf.js`) | Archive to `docs/archive/bundle_generators/` | One-off PDF generation scripts. |
| `components/` (Root directory duplicate) | Delete | Verified 0 references. Exact duplicate of `client/src/components/`. |

### 2.4 Self-Hosted Judge0 & Azure VM Infrastructure (`deploy/judge0/`)
Since self-hosting Judge0 on Azure ARM64 is out of scope for the target deployment (Vercel + Render + MongoDB + Hosted API), these files are archived:

| File Path | Action | Rationale |
| :--- | :--- | :--- |
| `deploy/judge0/build-arm64.sh` | Archive to `docs/archive/infrastructure/judge0/` | Obsolete Azure ARM64 container build script. |
| `deploy/judge0/verify-arm64-binaries.sh` | Archive to `docs/archive/infrastructure/judge0/` | Obsolete ARM64 binary verification script. |
| `deploy/judge0/verify-cgroups-isolate.sh` | Archive to `docs/archive/infrastructure/judge0/` | Obsolete cgroups v1 verification script. |
| `deploy/judge0/verify-containment.sh` | Archive to `docs/archive/infrastructure/judge0/` | Obsolete hostile-code containment test harness. |
| `deploy/judge0/verify-resource-accounting.sh` | Archive to `docs/archive/infrastructure/judge0/` | Obsolete cgroups accounting script. |
| `deploy/judge0/deploy-runner.sh` | Archive to `docs/archive/infrastructure/judge0/` | Obsolete VM provisioning script. |
| `deploy/judge0/setup-tailscale.sh` | Archive to `docs/archive/infrastructure/judge0/` | Obsolete Tailscale VPN provisioning script. |
| `deploy/judge0/benchmark.sh` | Archive to `docs/archive/infrastructure/judge0/` | Obsolete staging benchmark script. |
| `deploy/judge0/RUNNER_CONNECTIVITY.md` | Archive to `docs/archive/infrastructure/judge0/` | Staging connection documentation. |
| `deploy/judge0/judge0.conf.redacted` | Archive to `docs/archive/infrastructure/judge0/` | Obsolete redacted configuration. |
| `deploy/judge0/backend-runner.env.example` | Archive to `docs/archive/infrastructure/judge0/` | Obsolete runner configuration template. |
| `deploy/judge0/docker/` (`Dockerfile.compilers-arm64`, `Dockerfile.judge0-arm64`, `isolate-wrapper.sh`, `isolate_job_correlation.patch`) | Archive to `docs/archive/infrastructure/judge0_docker/` | Obsolete custom ARM64 worker build recipes. |
| `deploy/judge0/kata/` (`configuration-qemu-arm64.toml`, `daemon.json`, `docker-compose.kata.yml`, `README.md`) | Archive to `docs/archive/infrastructure/kata/` | Obsolete Kata microVM experiments. |

### 2.5 Standalone Phase 4 Sandbox Daemon (`sandbox/`)
| File Path | Action | Rationale |
| :--- | :--- | :--- |
| `sandbox/Dockerfile` | Archive to `docs/archive/phase4_sandbox/` | Obsolete custom sandbox daemon build. |
| `sandbox/package.json` | Archive to `docs/archive/phase4_sandbox/` | Obsolete custom sandbox daemon package. |
| `sandbox/server.js` | Archive to `docs/archive/phase4_sandbox/` | Obsolete Linux prlimit/unshare sandbox daemon. |
| `sandbox/test/containment.test.js` | Archive to `docs/archive/phase4_sandbox/` | Obsolete sandbox test suite. |

### 2.6 Infrastructure-Specific Staging Test Suites in `server/tests/`
The 14 test files listed below were written specifically to test the static string contents of `deploy/judge0/docker/Dockerfile.judge0-arm64`, `isolate-wrapper.sh`, and Azure shell scripts. They do not test the TestForge application code, API, or Code Runner pipeline:

| Test File Path | Action | Rationale |
| :--- | :--- | :--- |
| `server/tests/milestoneBWrapperInterception.test.js` | Archive to `docs/archive/infrastructure_tests/` | Static assertions on `isolate-wrapper.sh`. |
| `server/tests/suidBypassInvestigation.test.js` | Archive to `docs/archive/infrastructure_tests/` | Static assertions on `Dockerfile.judge0-arm64`. |
| `server/tests/phase51C3Remediation.test.js` | Archive to `docs/archive/infrastructure_tests/` | Static assertions on compose memory caps. |
| `server/tests/phase51C4BuildHardening.test.js` | Archive to `docs/archive/infrastructure_tests/` | Static assertions on `build-arm64.sh`. |
| `server/tests/phase51C5FinalVerification.test.js` | Archive to `docs/archive/infrastructure_tests/` | Static assertions on commit hashes in build script. |
| `server/tests/phase51C6FalsePositiveAudit.test.js` | Archive to `docs/archive/infrastructure_tests/` | Static assertions on `verify-containment.sh`. |
| `server/tests/phase51C7RuntimeIntegrity.test.js` | Archive to `docs/archive/infrastructure_tests/` | Static assertions on correlation scripts. |
| `server/tests/phase51C8AuditRemediation.test.js` | Archive to `docs/archive/infrastructure_tests/` | Static assertions on telemetry scripts. |
| `server/tests/phase51C9AuditRemediation.test.js` | Archive to `docs/archive/infrastructure_tests/` | Static assertions on netns verification scripts. |
| `server/tests/phase51C10Correlation.test.js` | Archive to `docs/archive/infrastructure_tests/` | Static assertions on `isolate_job_correlation.patch`. |
| `server/tests/phase51C11CorrelationRemediation.test.js` | Archive to `docs/archive/infrastructure_tests/` | Static assertions on patch keys and permissions. |
| `server/tests/phase51C12Corrections.test.js` | Archive to `docs/archive/infrastructure_tests/` | Static assertions on tuple checks in wrapper. |
| `server/tests/phase51C13LifecycleHardening.test.js` | Archive to `docs/archive/infrastructure_tests/` | Static assertions on wrapper single action allowlist. |
| `server/tests/hostileCode.test.js` | Archive to `docs/archive/infrastructure_tests/` | Obsolete Phase 4 sandbox network assertions. |

---

## 3. Preserved Application & Code Runner Components

### 3.1 Frontend (`client/`) — 100% Preserved
- `client/src/App.jsx`
- `client/src/main.jsx`
- `client/src/features/landing/MainLandingPage.jsx`, `HeroSection.jsx`
- `client/src/features/auth/TeacherLoginModal.jsx`, `StudentAuthModal.jsx`
- `client/src/features/dashboard/DashboardView.jsx`, `TeacherExamsView.jsx`, `StudentsView.jsx`
- `client/src/features/student-portal/StudentPortalContainer.jsx`, `StudentExamWorkspace.jsx`, `StudentDashboardView.jsx`, `StudentLandingView.jsx`
- `client/src/features/question-bank/QuestionBankView.jsx`, `TestCaseStudioView.jsx`, `PaperDesignerView.jsx`
- `client/src/components/` (UI buttons, cards, badges, hero-scroll, modals)

### 3.2 Backend Core (`server/src/`) — 100% Preserved
- `server/src/server.js`, `server/src/app.js`
- `server/src/config/env.js`, `server/src/config/database.js`, `server/src/config/redis.js`
- `server/src/models/` (`User.js`, `Exam.js`, `Question.js`, `TestCase.js`, `Submission.js`, `StudentAnswer.js`, `ExamAttempt.js`, `GradingAuditLog.js`)
- `server/src/routes/` (`auth.routes.js`, `exam.routes.js`, `question.routes.js`, `attempt.routes.js`, `health.routes.js`, `analytics.routes.js`, `mcq.routes.js`)
- `server/src/controllers/` (`auth.controller.js`, `attempt.controller.js`, `exam.controller.js`, `question.controller.js`, `health.controller.js`)
- `server/src/middleware/` (`auth.js`, `rateLimiter.js`, `errorHandler.js`, `validate.js`)

### 3.3 Code Runner Subsystem — 100% Preserved
- `server/src/services/execution/ExecutionProvider.interface.js`
- `server/src/services/execution/RenderSandboxProvider.js`
- `server/src/services/execution/MockExecutionProvider.js`
- `server/src/services/execution/LocalExecutionProvider.js`
- `server/src/services/execution/providerRegistry.js`
- `server/src/services/queue/executionQueue.js`
- `server/src/services/queue/executionProcessor.js`
- `server/src/services/queue/executionRecovery.js`
- `server/src/services/codeRunner.service.js`
- `server/src/services/attemptGrading.service.js`
- `server/src/services/mutation.service.js`
- `server/tests/helpers/mockJudge0Server.js`
- `server/tests/judge0Integration.test.js`

### 3.4 Active Core Application Test Suite (20 Suites — 100% Preserved)
1. `server/tests/judge0Integration.test.js` (18 tests)
2. `server/tests/backendToRunnerIntegration.test.js` (18 tests)
3. `server/tests/sandboxProvider.test.js` (12 tests)
4. `server/tests/executionProvider.test.js` (4 tests)
5. `server/tests/remoteExecutionAndConcurrentGrading.test.js` (27 tests)
6. `server/tests/retryLifecycleAndScoreSemantics.test.js` (27 tests)
7. `server/tests/queueAndWorker.test.js` (8 tests)
8. `server/tests/phase4zSecurityAndReliability.test.js` (18 tests)
9. `server/tests/mutationTesting.test.js` (24 tests)
10. `server/tests/judgeRegression.test.js` (15 tests)
11. `server/tests/redisRateLimiter.test.js` (6 tests)
12. `server/tests/securityHardening.test.js` (14 tests)
13. `server/tests/securityIntegration.test.js` (16 tests)
14. `server/tests/authIntegrationFlow.test.js` (12 tests)
15. `server/tests/studentAnalyticsAndPortal.test.js` (10 tests)
16. `server/tests/health.test.js` (4 tests)
17. `server/tests/healthReadiness.test.js` (6 tests)
18. `server/tests/productionRollbackAndProxy.test.js` (12 tests)
19. `server/tests/phaseAMilestoneVerification.test.js` (14 tests)
20. `server/tests/testCaseValidation.test.js` (unit tests)

---

## 4. Execution Sequence & Safety Controls

1. **Create Archive Directories:**
   - `docs/archive/historical_reports/`
   - `docs/archive/pdf_bundles/`
   - `docs/archive/infrastructure/`
   - `docs/archive/staging_diagnostics/`
   - `docs/archive/bundle_generators/`
   - `docs/archive/infrastructure_tests/`
   - `docs/archive/phase4_sandbox/`
2. **Move Artifacts Safely (Using `git mv` or file moves to preserve history):**
   - Move loose root PDFs and reports into `docs/archive/`.
   - Move `scratch/` into `docs/archive/staging_diagnostics/`.
   - Move `scripts/` into `docs/archive/bundle_generators/`.
   - Move `deploy/` into `docs/archive/infrastructure/`.
   - Move `sandbox/` into `docs/archive/phase4_sandbox/`.
   - Move root `components/` to trash (duplicate of `client/src/components/`).
   - Move infrastructure tests into `docs/archive/infrastructure_tests/`.
3. **Run Full Verification:**
   - Run backend tests: `cd server; npm test`.
   - Run frontend build: `cd client; npm run build`.
   - Verify server startup and route imports.
4. **Update Governance Documentation:**
   - Update `docs/engineering/PROJECT_STATUS.md`
   - Update `docs/engineering/SKILL_ORCHESTRATION_MAP.md`
   - Update `docs/engineering/SECURITY_RISK_REGISTER.md`
   - Author final `docs/engineering/reports/PROJECT_CLEANUP_REPORT.md`
5. **Review via CodeRabbit CLI.**

---

## 5. Security & Risk Reaffirmation

- **SEC-001 (`privileged: true` on Judge0 workers):** Remains **CRITICAL & UNRESOLVED**. Marked as legacy self-hosted infrastructure that has been retired from the deployment scope in favor of hosted execution APIs.
- **Zero-Leak Policy:** Preserved.
- **Authentication & Authorization:** Preserved.
- **Secrets & `.env` Protection:** Preserved.
