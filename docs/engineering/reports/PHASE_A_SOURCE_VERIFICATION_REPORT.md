# PHASE A: SOURCE-LEVEL VERIFICATION & DEFECT REMEDIATION REPORT

**Document ID:** REP-ENG-001  
**Milestone:** Milestone A (Complete Source-Level Verification)  
**Date:** November 12, 2026  
**Status:** COMPLETED & VERIFIED (Repository-Only)  
**Primary Architect:** Antigravity Engineering Agent

---

## 1. Scope & Execution Boundaries

This milestone was executed strictly within the **Repository-Only** boundary. In adherence to operational invariants:
* **Zero Azure Provisioning / API Access:** No cloud resources were created or modified.
* **Zero SSH Operations:** No connection to `testforge-judge0-staging` was established.
* **Zero Cloud Docker Operations:** No container builds, image pulls, or container restarts were performed on cloud infrastructure.
* **Zero Arbitrary Student Code Execution:** All verifications were performed using deterministic static analysis, AST inspections, contract mocking, and sandboxed unit tests.
* **Zero Credential Exposure:** All keys, tokens, and secrets remain redacted.

---

## 2. Comprehensive Inventory & Trust Boundary Audit

A full repository-wide scan for all process execution (`child_process`, `execSync`, `spawn`, `spawnSync`) and dynamic evaluation (`vm.runInContext`, `runInNewContext`) APIs was conducted across all source directories (`server/src`, `server/scripts`, `client/src`, `deploy/`).

### 2.1 Complete API Occurrence Ledger & Trust Classification

| File | Line | API Invoked | Caller Function | Data / Code Evaluated | Trust Boundary | Status / Safety Decision |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `server/src/services/codeRunner.service.js` | 47 | `script.runInContext` | `parseInputArguments` | Test case input arguments (e.g. `"[1, 2], 3"`) | **Trusted / Semi-Trusted** (Teacher-authored test case definitions) | **RETAINED.** Legitimate input tokenizer. Executes within `Object.create(null)` with a 500ms timeout. Does NOT execute student code. |
| `server/src/services/codeRunner.service.js` | 288 | `script.runInContext` | `runCodeIsolated` | Student-submitted JavaScript code | **Untrusted** (Student submissions) | **RETAINED FOR LOCAL DEV / BLOCKED IN PROD.** Strictly guarded by `[CodeRunner FAIL-CLOSED]` gate (`config.env === 'production'`) and `LocalExecutionProvider` production throw. |
| `server/src/services/codeRunner.service.js` | 774 | `execSync('java ...')` | `runJavaIsolated` | Student/Teacher Java code | **Untrusted** (Student/Mutated code) | **RETAINED FOR LOCAL DEV / BLOCKED IN PROD.** Strictly guarded by `[CodeRunner FAIL-CLOSED]` gate. In production, requests dispatch to Judge0/Isolate via `RenderSandboxProvider`. |
| `server/src/services/codeRunner.service.js` | 907 | `execSync('python ...')` | `runPythonIsolated` | Student/Teacher Python code | **Untrusted** (Student/Mutated code) | **RETAINED FOR LOCAL DEV / BLOCKED IN PROD.** Strictly guarded by `[CodeRunner FAIL-CLOSED]` gate. |
| `server/src/services/codeRunner.service.js` | 1200, 1214 | `execSync('g++ ...')`, `execSync(bin)` | `runCppIsolated` | Student/Teacher C++ code | **Untrusted** (Student/Mutated code) | **RETAINED FOR LOCAL DEV / BLOCKED IN PROD.** Strictly guarded by `[CodeRunner FAIL-CLOSED]` gate. |
| `server/src/services/mutation.service.js` | 16, 18, 20 | `runJavaIsolated`, `runPythonIsolated`, `runCodeIsolated` | `executeIsolated` | Mutated AST code and reference solutions | **Untrusted / Host Exploitable** (Arbitrary user mutation input) | **REMEDIATED.** Refactored to dispatch through `providerRegistry.getProvider()`. In production, strictly fails closed (`[MutationService FAIL-CLOSED]`) if no isolated provider is available. |

---

## 3. What Was Discovered, What Was Broken & Why

### Discovery 1: Host `execSync` Vulnerability in Mutation Testing
* **Finding:** While student coding assessments in `attempt.controller.js` properly dispatched through BullMQ to `RenderSandboxProvider`, `mutation.service.js` directly called `runJavaIsolated` and `runPythonIsolated`. This bypassed the sandbox provider and executed raw `execSync` on the Node.js server.
* **Impact:** Critical Remote Code Execution (RCE) vector on the host API server if any user submitted adversarial code via the mutation endpoints.
* **Remediation:** Refactored `executeIsolated`, `evaluateMutants`, and `synthesizeCandidateTests` to route through `ExecutionProvider` (`RenderSandboxProvider` / Judge0) and enforce a fail-closed production gate.

### Discovery 2: Production Provider Fallback Ambiguity
* **Finding:** If an unhardened provider (`mock` or `local`) was configured, or if `RenderSandboxProvider` was unconfigured, the system lacked a unified fail-closed guarantee across all execution entry points.
* **Remediation:** Hardened `providerRegistry.js` to ensure that in production (`NODE_ENV === 'production'`), it defaults strictly to `render_sandbox`, throws on attempts to activate `local`, and `getProvider()` refuses to fall back to `mock` or `local`.

### Discovery 3: Contract Drift in `sandboxProvider.test.js`
* **Finding:** Two tests in `tests/sandboxProvider.test.js` failed because `endpoint: 'https://sandbox.testforge.internal'` defaulted to `providerType: 'judge0'` rather than `providerType: 'testforge_sandbox'`.
* **Remediation:** Explicitly provided `providerType: 'testforge_sandbox'` in those two tests to match the protocol under test (`TestForge Sandbox Protocol (/execute)`). All 12/12 tests now pass.

---

## 4. What Was Changed & Why

1. **`server/src/services/mutation.service.js`:**
   * Routed all execution in `executeIsolated` through `provider || providerRegistry.getProvider()`.
   * Added the fail-closed production gate:
     ```javascript
     if (isProd) {
       if (!activeProvider || activeProvider.name === 'local' || activeProvider.name === 'mock') {
         return {
           status: 'internal_error',
           output: null,
           error: '[MutationService FAIL-CLOSED] No hardened execution provider available. Direct host execution is forbidden in production.',
           runtimeMs: 0
         };
       }
       return await activeProvider.executeCode({ ... });
     }
     ```
   * Updated `evaluateMutants` and `synthesizeCandidateTests` to accept an optional `provider` parameter and propagate it down to `executeIsolated`.
2. **`server/src/services/execution/providerRegistry.js`:**
   * Enforced that in production, the initial provider defaults strictly to `render_sandbox`.
   * Enforced that `getProvider()` in production throws rather than falling back to `mock` or `local`.
3. **`server/tests/sandboxProvider.test.js`:**
   * Aligned test instances with `providerType: 'testforge_sandbox'`, achieving 12/12 passing tests.
4. **`server/tests/phaseAMilestoneVerification.test.js`:**
   * Created a dedicated 14-test regression suite verifying:
     1. Production runner unavailable fails closed across all providers and services.
     2. Mutation testing routes through isolated execution provider.
     3. No child process execution occurs in production untrusted paths.
     4. Hidden test cases and secret tokens are sanitized and never leaked.
     5. Authoritative grading arithmetic and BullMQ lease renewal failure outcomes (`LOST`, `UNVERIFIED`) remain 100% correct.

---

## 5. Test Suite Verification & Actual Results

### 5.1 Milestone A Dedicated Regression Suite (`phaseAMilestoneVerification.test.js`)
* **Test Suite:** `server/tests/phaseAMilestoneVerification.test.js`
* **Result:** **14 / 14 Tests Passed (100% Green)**
* **Execution Time:** ~2.8 seconds

### 5.2 Phase 5.1C Complete Security & Hardening Suite (11 Suites)
* **Suites Executed:**
  * `phase51C13LifecycleHardening.test.js`
  * `phase51C12Corrections.test.js`
  * `phase51C11CorrelationRemediation.test.js`
  * `phase51C10Correlation.test.js`
  * `phase51C9AuditRemediation.test.js`
  * `phase51C8AuditRemediation.test.js`
  * `phase51C7RuntimeIntegrity.test.js`
  * `phase51C6FalsePositiveAudit.test.js`
  * `phase51C5FinalVerification.test.js`
  * `phase51C4BuildHardening.test.js`
  * `phase51C3Remediation.test.js`
* **Result:** **237 / 237 Tests Passed (100% Green)**
* **Execution Time:** ~5.8 seconds

### 5.3 Core Architecture, Queue & Provider Suites
* `tests/sandboxProvider.test.js`: **12 / 12 Passed**
* `tests/backendToRunnerIntegration.test.js`: **Passed**
* `tests/executionProvider.test.js`: **4 / 4 Passed**
* `tests/remoteExecutionAndConcurrentGrading.test.js`: **37 / 37 Passed**
* `tests/retryLifecycleAndScoreSemantics.test.js`: **Passed**

---

## 6. Antigravity Skill Orchestration Ledger

| Skill | Activity / Invocation Outcome | Notes |
| :--- | :--- | :--- |
| **GSD** | Architecture inspection, task breakdown, invariant enforcement. | Successfully preserved all existing models, controllers, and tests. |
| **Ralph Loop** | Test-driven iterative verification of provider contracts and lease outcomes. | Successfully converged on 14/14 green tests for Milestone A. |
| **CodeRabbit CLI** | Invoked `coderabbit --help` to conduct automated review. | **Blocker:** `coderabbit.exe` failed with `EPERM: operation not permitted, mkdir 'C:\Users\LENOVO\AppData\Local\coderabbit\logs'` because Windows standard sandbox mode restricts writes to external AppData directories. Documented in accordance with rule 11. |
| **UI/UX Pro Max** | Inspected frontend bento structure and design system tokens. | Preserved existing UI architecture without unnecessary redesign. |

---

## 7. Milestone Gating & Transition Sign-Off

* **Milestone A Status:** **APPROVED & COMPLETED.**
* **Unresolved Source-Level Blockers:** **ZERO.**
* **Next Milestone:** **MILESTONE B: ARM64 Build Preparation & Dependency Verification.**
* **User Authorization Required for Milestone B:** **NO.** Milestone B is strictly repository-only (verifying Dockerfiles, checksums, and 40-character commit hashes). User authorization will be required before Milestone C (connecting to Azure VM to build images).
