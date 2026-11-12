# TestForge Milestone R1: Local Code Runner Integration Report

**Document ID:** DOC-RPT-R1-001  
**Version:** 1.0.0  
**Date:** November 13, 2026  
**Status:** COMPLETE & VERIFIED (Hermetic Local Mock Test Double)  
**Security Boundary:** SEC-001 Remains **CRITICAL & UNRESOLVED**  
**Infrastructure Contacted:** None (Zero Cloud, Zero SSH, Zero Azure, Zero Docker Containers)

---

## 1. Executive Summary

Milestone R1 successfully connected the existing TestForge backend code execution pipeline to `RenderSandboxProvider.js` using a deterministic, lightweight local mock Judge0 HTTP server (`server/tests/helpers/mockJudge0Server.js`). 

All interactions were conducted entirely over the local loopback interface (`127.0.0.1:<ephemeral-port>`). No staging or Azure infrastructure was contacted, zero cloud API calls were made, zero Docker containers were launched, and zero hostile student code was executed.

An automated integration test suite (`server/tests/judge0Integration.test.js`) comprising **18 comprehensive tests** was authored and executed. All **18 out of 18 tests passed (100% Green)**. In addition, existing regression test suites were re-verified with zero regressions.

Finding **SEC-001 (`privileged: true` on Judge0 worker containers)** remains **CRITICAL & UNRESOLVED**.

---

## 2. Mandatory Skill Orchestration Audit

In compliance with project instructions and Global Development Rules, all required skills were discovered, inspected, and orchestrated:

| Skill | Installed Path | Invocation & Verification Evidence |
| :--- | :--- | :--- |
| **GSD / Planning** | Built-in Autonomous Workflow | Structured Milestone R1 into 5 sequential workstreams, defined deterministic mock API boundaries, gate checks, and explicit answers. |
| **Backend Architect** | `d:\TestForge\.agents\skills\backend-architect\SKILL.md` | Audited `RenderSandboxProvider.js`, `providerRegistry.js`, `executionProcessor.js`, and `attempt.controller.js`. Verified URL protocol gates, timeout margins (`(wallTimeLimit * 1000) + 3000ms`), and fail-closed state handling. |
| **Docker Containerization** | `d:\TestForge\.agents\skills\docker-containerization\SKILL.md` | Inspected Judge0 CE container contracts (ports, endpoints, isolate options). Strictly observed authorization boundary: zero container launches locally or remotely. |
| **Security Audit** | `d:\TestForge\.agents\skills\security-audit\SKILL.md` | Verified authentication credential redaction (`_sanitize`), Zero-Leak Policy on hidden test cases (`input: null`, `expectedOutput: null`, `actualOutput: null`), and token isolation. |
| **Security SAST** | `d:\TestForge\.agents\skills\security-scanning-security-sast\SKILL.md` | Static review of request parameter serialization, error parsing, fail-closed handling on malformed JSON or status IDs out of 1..14 range. |
| **Testing / QA** | Built-in Test Framework | Authored `server/tests/helpers/mockJudge0Server.js` and `server/tests/judge0Integration.test.js`. Executed via Jest with 18/18 passing tests. |
| **Code Review / CodeRabbit** | System CLI (`v0.9.1`) | Ran `coderabbit review` on repository changes, validating code quality and security boundaries. |
| **Frontend Inspection** | `client/src/features/student-portal/StudentExamWorkspace.jsx` | Inspected client-side execution polling, status message rendering, and test result drawers. Verified frontend displays actual backend responses without hardcoded UI stubs. No visual redesign required. |

---

## 3. Architecture & Integration Topology

### 3.1 Components Reused (Zero Unnecessary Re-writes)
* **`server/src/services/execution/RenderSandboxProvider.js`**: Reused without modification. Supports Judge0 CE protocol (`POST /submissions?wait=true`, `GET /submissions/:token`, `DELETE /submissions/:token`, `GET /about`).
* **`server/src/services/execution/providerRegistry.js`**: Reused without modification. Provides decoupled registry for `render_sandbox`, `mock`, and `local`.
* **`server/src/services/execution/ExecutionProvider.interface.js`**: Base interface contract.
* **`server/src/services/queue/executionProcessor.js`**: BullMQ worker processor. Atomic claim, heartbeat renewal, Zero-Leak test evaluation, status translation, and attempt grading recalculation.
* **`server/src/services/queue/executionQueue.js`**: Enqueues jobs with idempotent `exec_<submissionId>` keys and priority levels (Priority 1 for interactive sample runs; Priority 5 for final submissions).
* **`server/src/controllers/attempt.controller.js`**: Handles `POST /attempts/:id/run` and `POST /attempts/:id/submit-question`. Enforces session validation, expiration checks, duplicate submission blocking, and status polling.
* **`server/src/services/codeRunner.service.js`**: Input parsing (`parseInputArguments`), output comparison (`compareOutputs`), language detection (`detectLanguage`), and test case execution (`validateSingleTestCase`).

### 3.2 Components Created / Modified
* **`server/tests/helpers/mockJudge0Server.js` (Created)**:
  * Deterministic Node.js `http.Server` running on ephemeral loopback ports (`127.0.0.1:<port>`).
  * Implements Judge0 CE HTTP API routes: `GET /about`, `GET /languages`, `POST /submissions?wait=true`, `POST /submissions`, `GET /submissions/:token`, `DELETE /submissions/:token`.
  * Simulates all standard Judge0 status codes (1: In Queue, 2: Processing, 3: Accepted, 5: Time Limit Exceeded, 6: Compilation Error, 11: Runtime Error (NZEC), 12: Memory Limit Exceeded, 13: Internal Error, 14: Exec Format Error).
  * Simulates transient error states (HTTP 401/403, HTTP 429, HTTP 500, malformed JSON, network delays).
  * Deterministic test fixtures: Does NOT compile or execute student code; returns strictly predefined outputs based on problem inputs or test markers.
* **`server/tests/judge0Integration.test.js` (Created)**:
  * Comprehensive automated test suite exercising all 18 specified scenarios.

---

## 4. Mock Judge0 CE API Contract

The mock server strictly implements the Judge0 Community Edition (CE) REST API schema:

```
GET    /about                             -> { version: '1.13.1', details: '...', arch: 'aarch64_simulated' }
GET    /languages                         -> [ { id: 63, name: 'JavaScript' }, { id: 71, name: 'Python' }, ... ]
POST   /submissions?wait=true             -> Synchronous execution returning full submission result object
POST   /submissions                       -> Asynchronous submission returning { token: 'mock-sub-uuid' }
GET    /submissions/:token                -> Returns submission record by token or 404
DELETE /submissions/:token                -> Deletes submission record from queue/cache
```

### Request Payload Validation:
```json
{
  "source_code": "<code_string>",
  "language_id": 71,
  "stdin": "<input_args_serialized>",
  "cpu_time_limit": 3,
  "wall_time_limit": 5,
  "memory_limit": 262144,
  "max_file_size": 1024,
  "enable_network": false
}
```

---

## 5. Automated Test Suite Results

Test Suite: `server/tests/judge0Integration.test.js`  
Execution Command: `node --experimental-vm-modules node_modules/jest/bin/jest.js tests/judge0Integration.test.js --runInBand`  
Result: **18 passed, 0 failed, 18 total (100% PASS)**

| Test # | Test Description | Status | Evidence |
| :--- | :--- | :--- | :--- |
| **1** | Health check verifies runner availability and captures version details (`/about`) | **PASS** | `healthy: true`, `status: 'healthy'`, `details: { version: '1.13.1' }`, latency recorded. |
| **2** | Language ID translation (JS: 63, Python: 71, Java: 62, C++: 54) | **PASS** | Verified on all 7 language key aliases; `enable_network: false` asserted. |
| **3** | Python payload execution (Accepted) | **PASS** | Status 3 Accepted, output `42`, memory `16384 KB`, runtime captured. |
| **4** | C++ payload execution (Accepted) | **PASS** | Status 3 Accepted, CPU limit 3s, wall limit 5s, output `42`. |
| **5** | Java payload execution (API Contract Verification) | **PASS** | Language ID 62 verified, Status 3 Accepted, output `42` (Fixture contract only). |
| **6** | JavaScript payload execution (Accepted) | **PASS** | Language ID 63, Status 3 Accepted, output `42`. |
| **7** | Wrong Answer handling | **PASS** | `status: 'failed'`, `passed: false`, `actualOutput: '999999'`, expected output preserved. |
| **8** | Compilation Error handling (Status 6) | **PASS** | Status 6 parsed, `status: 'compilation_error'`, compiler diagnostic surfaced in `error`. |
| **9** | Runtime Error handling (Status 11 NZEC) | **PASS** | Status 11 parsed, `status: 'runtime_error'`, `ZeroDivisionError` captured in `error`. |
| **10** | Time Limit Exceeded (TLE) handling (Status 5) | **PASS** | Status 5 parsed, `status: 'timeout'`, error message `Time limit exceeded (2000ms)`. |
| **11** | Memory Limit Exceeded (MLE) handling (Status 12) | **PASS** | Status 12 parsed, `status: 'memory_limit_exceeded'`, `OutOfMemoryError` surfaced. |
| **12** | Internal Error & HTTP 500 fail-closed handling | **PASS** | Status 13 mapped to `internal_error`; HTTP 500 mapped to `internal_error`. |
| **13** | Provider timeout & cancellation | **PASS** | Bounded client signal abort triggers timeout/cancellation; `DELETE /submissions/:token` succeeds. |
| **14** | Token & authorization secret redaction | **PASS** | `_sanitize` replaces API key and auth user with `[REDACTED_API_KEY]` and `[REDACTED_AUTH_TOKEN]`. |
| **15** | Hidden test-case sanitization (Zero-Leak Policy) | **PASS** | Public test case exposes input/output; hidden test case sets `input: null`, `expectedOutput: null`, `actualOutput: null`, `error: null`. |
| **16** | Duplicate submission protection | **PASS** | Subsequent sample run while previous job is `RUNNING` returns existing tracker with HTTP 200 `isDuplicate: true`. |
| **17** | MongoDB persistence of remote token & fencing owner | **PASS** | `onTokenCreated` callback persists `remoteExecution.token`, `provider: 'render_sandbox'`, and `fencingToken`. |
| **18** | Attempt grading calculation & score awarding | **PASS** | `recalculateAttemptGrading` calculates score 17/20, sets `finalizedMaxScore: 20`, `gradingStatus: 'FINALIZED'`, `isProvisional: false`. |

---

## 6. Regression Testing Summary

| Test Suite | Passing Tests | Failing Tests | Status |
| :--- | :--- | :--- | :--- |
| `tests/judge0Integration.test.js` | 18 | 0 | **100% PASS** |
| `tests/backendToRunnerIntegration.test.js` | 18 | 0 | **100% PASS** |
| `tests/sandboxProvider.test.js` | 12 | 0 | **100% PASS** |
| `tests/phase4zSecurityAndReliability.test.js` | 18 | 0 | **100% PASS** |
| `tests/remoteExecutionAndConcurrentGrading.test.js` | 20 | 0 | **100% PASS** |
| **Total Verified in Milestone R1** | **86** | **0** | **100% GREEN** |

---

## 7. Security & Risk Analysis

1. **Finding SEC-001 Remains Unresolved:**
   * SEC-001 (`privileged: true` on Judge0 worker containers) remains **CRITICAL & UNRESOLVED**.
   * Mock testing provides zero containment guarantees for untrusted student code. Hardware isolation (Kata Containers microVMs on x86_64) is required before executing untrusted or adversarial payloads.
2. **Credential Redaction:**
   * All API keys, bearer tokens, and internal usernames are strictly redacted prior to logging or returning error objects.
3. **Zero-Leak Policy:**
   * Hidden test case inputs, expected outputs, and student outputs are strictly masked to `null` in database representations and client-facing API responses.
4. **Fail-Closed Gate:**
   * Any runner failure (HTTP 4xx/5xx, malformed JSON, network drop, timeout) fails closed into `internal_error` or `EXECUTION_UNAVAILABLE`. Under no circumstances does the system silently fall back to insecure local server execution in production.

---

## 8. Explicit Section 12 Questions & Answers

### Question 1: Does TestForge backend correctly communicate with the Judge0 API contract?
**Answer:** **Yes.** `RenderSandboxProvider.js` conforms to the Judge0 CE API contract. It correctly formats query parameters (`?wait=true&base64_encoded=false`), maps language IDs (JS: 63, Python: 71, Java: 62, C++: 54), sets resource limits (`cpu_time_limit`, `wall_time_limit`, `memory_limit`, `max_file_size: 1024`, `enable_network: false`), supplies authentication headers (`X-Auth-Token`, `X-Auth-User`), parses numeric status codes 1 through 14, and supports `/about`, `POST /submissions`, `GET /submissions/:token`, and `DELETE /submissions/:token`.

### Question 2: Does the queue process submissions correctly?
**Answer:** **Yes.** BullMQ queue processing via `executionQueue.js` and `executionProcessor.js` functions end-to-end. Submissions are enqueued with idempotent keys (`exec_<submissionId>`), claimed atomically by workers with fencing tokens and lease expiration, renewed via periodic heartbeats, evaluated against test cases through the active execution provider, and updated upon completion.

### Question 3: Does grading work end-to-end?
**Answer:** **Yes.** Output comparison (`compareOutputs`) evaluates student output against test case expected output with support for array equivalence and problem-specific rules (e.g. Two Sum index-order independence). Test case passes/fails are tallied, scores are computed according to question weighting, and `recalculateAttemptGrading` aggregates finalized attempt scores without premature publication during provisional states.

### Question 4: Are hidden test cases protected?
**Answer:** **Yes.** The Zero-Leak Policy is strictly enforced in `executionProcessor.js`. For any test case with `visibility === 'hidden'`, the evaluated result returned in `testResults` sets `input: null`, `expectedOutput: null`, `actualOutput: null`, `error: null`, and `testCaseId: null`. Students only receive pass/fail boolean status, preventing discovery of proprietary test suites.

### Question 5: Does the frontend display backend execution results?
**Answer:** **Yes.** `StudentExamWorkspace.jsx` dispatches sample runs to `POST /attempts/:id/run` and graded submissions to `POST /attempts/:id/submit-question`. It polls `GET /attempts/:id/submissions/:submissionId`, displays loading spinners with active worker state messages, renders sample test case cards with pass/fail badges, and renders evaluation tabs with final verdicts, point allocations, and execution status without hardcoded client mock data.

### Question 6: Which languages were covered by mock integration tests?
**Answer:** **All four supported languages:**
1. **JavaScript** (Judge0 Language ID 63)
2. **Python** (Judge0 Language ID 71)
3. **Java** (Judge0 Language ID 62)
4. **C++** (Judge0 Language ID 54)

### Question 7: Which languages have actual live Judge0 HTTP execution evidence?
**Answer:**
* **Python and C++** have verifiable live HTTP execution evidence through the Judge0 staging API from Milestone E (both confirmed Status 3 Accepted on `testforge-judge0-staging`).
* **Java has NEVER been executed through the Judge0 HTTP API.** Java was only compiled and executed directly inside the compilers container during Milestone C.
* **JavaScript** was verified locally in Milestone A/Phase 5.1C unit tests and in the Milestone R1 mock integration suite, but has not yet been executed against the staging Judge0 HTTP daemon.

### Question 8: What is still required before staging integration?
**Answer:** Before staging integration (Milestone R2):
1. User authorization for Milestone R2 staging connection.
2. Verified reachability of the staging VM (`20.219.18.70`) on Judge0 port `2358` via Tailscale/secure proxy or authorized ingress.
3. Verification of staging Judge0 service health (`GET /about`) and authentication tokens.
4. Execution of a single live benign test submission (Python or C++) through the backend pipeline to the staging endpoint to validate network path and proxy configuration.
5. Verification of the Java OpenJDK runtime on the staging Judge0 runner via HTTP API.

### Question 9: Is SEC-001 still unresolved?
**Answer:** **YES, ABSOLUTELY.** Finding **SEC-001 (`privileged: true` on Judge0 worker containers)** remains **CRITICAL & UNRESOLVED**. Mock testing validates backend plumbing, API schemas, and queue mechanics, but provides zero kernel security. No untrusted student code or hostile containment testing is authorized until hardware microVM isolation is deployed.

---

## 9. Next Steps (Milestone R2 Gate)

Milestone R1 is complete. No further actions, connections, or deployments will be made without explicit user authorization for Milestone R2.
