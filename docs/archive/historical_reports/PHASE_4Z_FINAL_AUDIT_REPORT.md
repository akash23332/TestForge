# TestForge Phase 4Z: Final Backend Security & Distributed Reliability Audit Report
**Date:** November 12, 2026  
**Auditor:** Senior DevSecOps & Distributed Systems Reliability Engineering  
**Scope:** TestForge REST API Backend, BullMQ Queue Worker, Execution Sandbox Providers, MongoDB Schemas, & Scoring Engines  
**Status:** **NOT PRODUCTION READY** (Code-level hardening complete; live VM/Linux sandbox & Tailscale mesh pending)

---

## 1. Executive Summary

Phase 4Z conducted an exhaustive, code-level audit of the entire TestForge backend following the completion of Phase 4Y. We inspected model definitions, route controllers, queue processors, recovery reconcilers, execution providers, and rate limiters.

Through rigorous tracing of API request lifecycles from ingress to Redis/BullMQ, MongoDB, and remote runner providers, we identified and eliminated **6 verified vulnerabilities and distributed race conditions**:
1. **Critical:** Unguarded `submission.save()` and unfenced MongoDB mutation calls in `executionProcessor.js` that allowed stale workers to overwrite active state.
2. **Critical:** False exam finalization in `attemptGrading.service.js` where coding questions in `EXECUTION_UNAVAILABLE` were prematurely published as finalized with 0 marks if the student answer held a default score.
3. **High:** Missing administrative API route and authorization guard for manual orphan clearance (`clearUnresolvedRemoteExecution`).
4. **High:** Immutability bypass vulnerability in `GradingAuditLog` where `bulkWrite` mutations and document `save()` calls evaded query middleware.
5. **Medium:** Missing client-side and server-side socket timeout parameters (`timeoutMS`) in Mongoose `renewExecutionLease`.
6. **Medium:** Incomplete fail-closed ownership check in `question.controller.js` on question updates and deletions.

All **13 decoupled test suites (192 tests total)** pass cleanly with zero failures. Strict safety constraints were maintained throughout: no cloud infrastructure was provisioned, `EXECUTION_PROVIDER=mock` fail-closed behavior remains active, and TestForge is explicitly **not** declared production-ready.

---

## 2. Files Inspected

The following source files and configurations were systematically audited:

### 2.1 Models & Schemas
- [`server/src/models/Submission.js`](file:///d:/TestForge/server/src/models/Submission.js): Lifecycle state enums, recovery leases, execution owners, remote runner metadata.
- [`server/src/models/StudentAnswer.js`](file:///d:/TestForge/server/src/models/StudentAnswer.js): Score persistence, versioning counters, manual grading status, grading history.
- [`server/src/models/GradingAuditLog.js`](file:///d:/TestForge/server/src/models/GradingAuditLog.js): Append-only immutability hooks, audit indexing, immutable timestamp configuration.
- [`server/src/models/ExamAttempt.js`](file:///d:/TestForge/server/src/models/ExamAttempt.js): Exam session statuses, score denominators, provisional flags.
- [`server/src/models/Exam.js`](file:///d:/TestForge/server/src/models/Exam.js): Author ownership, section structure, question point weightings.
- [`server/src/models/Question.js`](file:///d:/TestForge/server/src/models/Question.js) & [`TestCase.js`](file:///d:/TestForge/server/src/models/TestCase.js): Test fixtures, visibility metadata, starter code.

### 2.2 Controllers & API Routes
- [`server/src/controllers/attempt.controller.js`](file:///d:/TestForge/server/src/controllers/attempt.controller.js): Attempt lifecycle, submission submission/polling, manual grading, orphan clearance.
- [`server/src/controllers/question.controller.js`](file:///d:/TestForge/server/src/controllers/question.controller.js): Question CRUD, student zero-leak projections.
- [`server/src/controllers/exam.controller.js`](file:///d:/TestForge/server/src/controllers/exam.controller.js): Exam CRUD, tenancy and author isolation.
- [`server/src/controllers/auth.controller.js`](file:///d:/TestForge/server/src/controllers/auth.controller.js): Registration, login, role enforcement.
- [`server/src/routes/attempt.routes.js`](file:///d:/TestForge/server/src/routes/attempt.routes.js): Endpoint RBAC routing and middleware bindings.

### 2.3 Services & Distributed Worker Engine
- [`server/src/services/queue/executionProcessor.js`](file:///d:/TestForge/server/src/services/queue/executionProcessor.js): BullMQ job consumption, atomic claiming, heartbeat renewals, test case evaluation, authoritative scoring.
- [`server/src/services/queue/executionRecovery.js`](file:///d:/TestForge/server/src/services/queue/executionRecovery.js): Crash reconciliation, lease renewal, quarantine bounding, unconfirmed token orphan clearance.
- [`server/src/services/queue/executionQueue.js`](file:///d:/TestForge/server/src/services/queue/executionQueue.js): BullMQ queue definition, deterministic job IDs (`exec_<submissionId>`).
- [`server/src/services/attemptGrading.service.js`](file:///d:/TestForge/server/src/services/attemptGrading.service.js): Attempt-level grade recalculation, provisional status handling, denominator integrity.
- [`server/src/services/codeRunner.service.js`](file:///d:/TestForge/server/src/services/codeRunner.service.js): Testcase validator orchestration, zero-leak result sanitization.
- [`server/src/services/execution/providerRegistry.js`](file:///d:/TestForge/server/src/services/execution/providerRegistry.js): Provider lookup and fallback prevention.
- [`server/src/services/execution/MockExecutionProvider.js`](file:///d:/TestForge/server/src/services/execution/MockExecutionProvider.js): Fail-closed production mock protection.
- [`server/src/services/execution/RenderSandboxProvider.js`](file:///d:/TestForge/server/src/services/execution/RenderSandboxProvider.js): Undici ProxyAgent dispatcher, private route isolation, token cancellation.

### 2.4 Middleware & Infrastructure Config
- [`server/src/middleware/auth.js`](file:///d:/TestForge/server/src/middleware/auth.js): JWT verification, attempt session token verification, role enforcement.
- [`server/src/middleware/rateLimiter.js`](file:///d:/TestForge/server/src/middleware/rateLimiter.js): Redis-backed sliding window Lua rate limiter.
- [`server/src/middleware/errorHandler.js`](file:///d:/TestForge/server/src/middleware/errorHandler.js): Exception handling and response sanitization.
- [`server/src/config/env.js`](file:///d:/TestForge/server/src/config/env.js): Strict Joi environment validation, production provider gating.
- [`deploy/judge0/judge0.conf`](file:///d:/TestForge/deploy/judge0/judge0.conf): Wall/CPU time limits and Sidekiq configuration.

---

## 3. Confirmed Vulnerabilities & Defect Analysis

| ID | Severity | Location | Description |
| :--- | :--- | :--- | :--- |
| **SEC-01** | **Critical** | `executionProcessor.js` (lines 312, 329, 441, 602) | **Unfenced Database Writes:** Catch block error handler, missing question, empty testcase, and preemption cancellation calls executed unfenced `submission.save()` or `findOneAndUpdate({ _id })` without checking `executionOwner` and `executionVersion`. Allowed stale workers to overwrite newer worker state. |
| **SEC-02** | **Critical** | `attemptGrading.service.js` (line 58) | **Premature Attempt Finalization:** When a submission was `EXECUTION_UNAVAILABLE`, but `StudentAnswer` held schema default `score: 0` and status `SUBMITTED`, the check failed to mark the attempt `PROVISIONAL`. Published a finalized 0% score instead of withholding marks until recovery. |
| **SEC-03** | **High** | `attempt.routes.js` & `attempt.controller.js` | **Missing Administrative Orphan Clearance API:** Phase 4Y implemented `clearUnresolvedRemoteExecution` in the service layer, but never exposed an authenticated, authorized API endpoint for system operators to clear orphaned jobs. |
| **SEC-04** | **High** | `GradingAuditLog.js` (lines 101–108) | **Audit Immutability Middleware Bypass:** Mongoose query middleware only blocked single query mutations (`updateOne`, `deleteOne`). Mutations via `bulkWrite` and document-level `doc.save()` on existing instances were unblocked at the schema layer. |
| **SEC-05** | **Medium** | `executionProcessor.js` (line 88) | **Mongoose Query Timeout Limitation:** `renewExecutionLease` relied solely on `maxTimeMS` and client-side `Promise.race`. Did not supply driver-level `timeoutMS` (CSOT) to guarantee socket abort when query exceeded timeout. |
| **SEC-06** | **Medium** | `question.controller.js` (line 176, 198) | **Loose User Falsy Guard:** Ownership check evaluated `if (req.user && question.ownerId !== user._id)`. If `req.user` was somehow missing from request context, the condition failed to throw. |

---

## 4. Issues Fixed with File Paths

### 4.1 Fencing All Worker Database Mutations
- **File:** [`server/src/services/queue/executionProcessor.js`](file:///d:/TestForge/server/src/services/queue/executionProcessor.js)
- **Fix:** Replaced every instance of unconstrained `submission.save()` with atomic `Submission.findOneAndUpdate` conditioned on:
  $$\{ \_id: \text{submissionId}, \text{status}: \text{'RUNNING'}, \text{executionOwner}: \text{owner}, \text{executionVersion}: \text{version} \}$$
  Covered missing questions, zero testcases, remote cancellation requests, and worker error handlers.

### 4.2 Restoring Coding Question Provisional Grading Integrity
- **File:** [`server/src/services/attemptGrading.service.js`](file:///d:/TestForge/server/src/services/attemptGrading.service.js)
- **Fix:** Hardened pending coding question check in `recalculateAttemptGrading`:
  ```javascript
  } else if (ans.questionType === 'coding') {
    if (isPendingSubmission || ans.score === null || ans.score === undefined) {
      isPending = true;
    }
  }
  ```
  Guarantees that any attempt containing an uncompleted submission in `EXECUTION_UNAVAILABLE`, `QUEUED`, `RUNNING`, or `RECOVERING` is strictly held as `PROVISIONAL` with `percentage: null`.

### 4.3 Implementing Authenticated Admin Orphan Clearance
- **Files:** [`server/src/controllers/attempt.controller.js`](file:///d:/TestForge/server/src/controllers/attempt.controller.js), [`server/src/routes/attempt.routes.js`](file:///d:/TestForge/server/src/routes/attempt.routes.js)
- **Fix:** Created `clearOrphanSubmission` controller and bound `POST /api/v1/attempts/admin/submissions/:submissionId/clear-orphan`:
  - Enforced `requireAuth` and `requireRole('admin')` (students and teachers rejected with 403).
  - Validated mandatory non-empty audit `reason`.
  - Atomically updated `Submission.remoteExecution` and confirmed terminal status.

### 4.4 Closing Audit Log Immutability Bypasses
- **File:** [`server/src/models/GradingAuditLog.js`](file:///d:/TestForge/server/src/models/GradingAuditLog.js)
- **Fix:** Added schema-level pre-middleware:
  - `pre('save')`: Throws `SecurityError` if `!this.isNew`.
  - `pre('bulkWrite')`: Inspects batch operations and throws `SecurityError` if any `updateOne`, `updateMany`, `replaceOne`, `deleteOne`, or `deleteMany` action is detected.

### 4.5 Driver Socket Timeout Enforcement on Lease Heartbeats
- **File:** [`server/src/services/queue/executionProcessor.js`](file:///d:/TestForge/server/src/services/queue/executionProcessor.js)
- **Fix:** Supplied both `maxTimeMS: queryTimeoutMs` and `timeoutMS: queryTimeoutMs` to Mongoose `findOneAndUpdate`.

### 4.6 Strict Fail-Closed Ownership Verification on Questions
- **File:** [`server/src/controllers/question.controller.js`](file:///d:/TestForge/server/src/controllers/question.controller.js)
- **Fix:** Replaced loose conditional with explicit boolean check:
  ```javascript
  const isOwnerOrAdmin = req.user && (question.ownerId.toString() === req.user._id.toString() || req.user.role === 'admin');
  if (!isOwnerOrAdmin) throw ApiError.forbidden('You do not have permission to update this question.');
  ```

---

## 5. Issues Not Fixed & Why

1. **Physical Linux cgroup / nsjail Kernel Verification:**
   - **Reason:** TestForge is running in an environment without provisioned bare-metal Linux infrastructure or root `isolate` capabilities. Physical kernel namespace verification cannot be completed without a dedicated staging VM.
2. **Live Tailscale Mesh Route Latency Testing:**
   - **Reason:** Live Tailnet node provisioning requires cloud authentication and real Tailscale network configuration, which is forbidden under strict safety constraints. Mock and proxy dispatcher verification is completed in software.
3. **Database-Level Role Revocation (MongoDB Engine Level):**
   - **Reason:** Revoking MongoDB `update` and `delete` user privileges on `gradingauditlogs` requires administrative access to the live MongoDB replica set cluster (`admin` DB access). Application-level enforcement is complete; database engine RBAC instructions are documented in Section 10.

---

## 6. Before / After Behavior for Critical Fixes

### 6.1 Worker Preemption During Cancellation
- **Before:** When a worker was preempted during execution, it issued `Submission.findOneAndUpdate({ _id: submission._id }, { $set: { 'remoteExecution.state': 'CANCELLATION_REQUESTED' } })`. If a newer replacement worker had already claimed the submission and set `status: 'RUNNING'`, the stale worker overwrote the new worker's remote execution state.
- **After:** The cancellation query matches:
  $$\{ \_id: \text{submissionId}, \text{status}: \text{'RUNNING'}, \text{executionOwner}: \text{owner}, \text{executionVersion}: \text{version} \}$$
  If the worker lost its lease or another worker incremented `executionVersion`, the stale update matches 0 documents and safely no-ops.

### 6.2 Exam Finalization with Offline Runner
- **Before:** If student code was queued when the runner crashed, `Submission` became `EXECUTION_UNAVAILABLE`. If `StudentAnswer` held `score: 0` and `status: 'SUBMITTED'`, `recalculateAttemptGrading` evaluated `(ans.score === null || ans.status !== 'SUBMITTED')` to `false`, finalized the exam, and published a false 0% score.
- **After:** `isPendingSubmission || ans.score === null` evaluates to `true`. The attempt is held as `PROVISIONAL`, `percentage: null` is enforced, and score publication is withheld until runner recovery completes grading.

---

## 7. New Regression Tests

Thirteen new unit and integration tests were added in [`server/tests/phase4zSecurityAndReliability.test.js`](file:///d:/TestForge/server/tests/phase4zSecurityAndReliability.test.js):
- **Admin Orphan Clearance API Security:**
  - `Rejects unauthenticated request with 401 Unauthorized`
  - `Rejects student caller with 403 Forbidden`
  - `Rejects faculty/teacher caller with 403 Forbidden`
  - `Rejects admin request missing audit reason with 400 Bad Request`
  - `Admin successfully clears unresolved orphan with audit trail`
- **GradingAuditLog Append-Only Enforcement:**
  - `Rejects updateOne, deleteOne, and findOneAndUpdate queries`
  - `Rejects mutating an existing audit record via document save()`
  - `Rejects update and delete operations in bulkWrite middleware`
- **Score Integrity in Attempt Finalization:**
  - `Coding question with unavailable/pending submission and default score 0 marks attempt PROVISIONAL`
- **Fenced Worker Execution & Write Protection:**
  - `Fenced write when question is not found checks executionOwner and executionVersion`
  - `Fenced cancellation update on preemption checks executionOwner and executionVersion`
- **Question Ownership Authorization:**
  - `Teacher cannot update another faculty member question (403 Forbidden)`
  - `Teacher cannot delete another faculty member question (403 Forbidden)`

---

## 8. Complete Test Execution Results

All 13 test suites were executed sequentially via Jest with open handle detection:
```bash
npm --prefix server test -- queueAndWorker judgeRegression executionProvider securityIntegration securityHardening sandboxProvider hostileCode authIntegrationFlow redisRateLimiter productionRollbackAndProxy retryLifecycleAndScoreSemantics remoteExecutionAndConcurrentGrading phase4zSecurityAndReliability
```

### Verified Test Output
```
PASS tests/securityIntegration.test.js
PASS tests/phase4zSecurityAndReliability.test.js (13 tests)
PASS tests/queueAndWorker.test.js
PASS tests/retryLifecycleAndScoreSemantics.test.js (43 tests)
PASS tests/remoteExecutionAndConcurrentGrading.test.js (25 tests)
PASS tests/securityHardening.test.js
PASS tests/authIntegrationFlow.test.js
PASS tests/productionRollbackAndProxy.test.js
PASS tests/judgeRegression.test.js
PASS tests/sandboxProvider.test.js
PASS tests/hostileCode.test.js
PASS tests/redisRateLimiter.test.js
PASS tests/executionProvider.test.js

Test Suites: 13 passed, 13 total
Tests:       192 passed, 192 total
Snapshots:   0 total
Time:        17.294 s
```

---

## 9. Remaining Security & Distributed Risks

1. **Clock Skew Bounded Tolerance:**
   Worker nodes must maintain NTP synchronization within $\pm 1000\,\text{ms}$. Although `executionVersion` and `executionOwner` fencing prevent database corruption from stale worker writes, extreme clock drift ($> 15\,\text{s}$) can trigger early lease reclamation before a worker heartbeat completes.
2. **Network Partition During Multi-Document Transactions:**
   On standalone MongoDB instances (non-replica sets), the 2-phase compensating rollback is resilient to application exceptions, but a hard process crash precisely between the `StudentAnswer` update and `GradingAuditLog` insertion requires a background audit reconciler. Multi-node production MongoDB replica sets natively resolve this via distributed transactions.
3. **Judge0 Isolate Cleanup Ceiling:**
   Judge0 API lacks a native Linux `SIGKILL` endpoint for running isolates. The quarantine ceiling (`MAX_WALL_TIME_LIMIT + ISOLATE_TEARDOWN_BUFFER = 20000ms`) is safe only as long as Judge0 CE configurations are preserved in `deploy/judge0/judge0.conf`.

---

## 10. Infrastructure Requirements for Production

Before moving to live deployment, the hosting environment must satisfy:

1. **Dedicated Linux VM for Judge0 CE:**
   - Linux kernel $\ge 5.15$ with cgroup v2 enabled.
   - `isolate` binary compiled with SUID root permissions.
   - Dual-core CPU with minimum 4GB RAM.
2. **Tailscale Private Mesh Network:**
   - Isolated tailnet tailing the runner host (`runner.tailnet.ts.net`).
   - SOCKS5/HTTP forward proxy on localhost port 1056 forwarding to private subnet.
   - All public ingress ports to Judge0 (port 2358) disabled in firewall.
3. **MongoDB Production User RBAC:**
   - Dedicated database role for application user:
     ```javascript
     db.createRole({
       role: "auditAppendOnly",
       privileges: [
         { resource: { db: "testforge", collection: "gradingauditlogs" }, actions: [ "find", "insert" ] }
       ],
       roles: []
     });
     ```
4. **Redis / Valkey Cluster:**
   - Memory policy: `noeviction` for BullMQ queues.
   - Persistent volume with AOF (Append-Only File) enabled (`appendonly yes`).

---

## 11. Production-Readiness Assessment

> [!CAUTION]
> **VERDICT: NOT PRODUCTION READY**
> 
> **Software Layer (Application Code):** **PASS (100%)**  
> Distributed locking, lease renewals, fencing tokens, zero-leak sanitization, RBAC, and scoring semantics are fully verified in code with 192 automated regression tests.
> 
> **Infrastructure Layer (Hardware / Kernel / Network):** **PENDING (0%)**  
> No Linux sandboxes, Tailscale VPN nodes, or Judge0 daemons have been provisioned or verified under real load. Real student code has never been executed against live Linux cgroups.

---

## 12. Recommended Next Phase: Phase 5 (Staging Infrastructure & Hardware Sandbox Verification)

The immediate next recommended phase is **Phase 5: Staging Provisioning & Physical Sandbox Validation**:
1. Provision a single isolated Linux test virtual machine (Ubuntu 22.04 LTS).
2. Install Docker, Tailscale, and Judge0 CE via `deploy/judge0/docker-compose.yml`.
3. Verify live cgroup v2 memory limits, CPU quotas, and `isolate` process termination under hostile fork bomb and infinite loop attacks.
4. Establish live Tailscale proxy routing between the Express API server and Judge0.
5. Perform an end-to-end multi-student concurrent examination load test with 50 simultaneous coding submissions.
