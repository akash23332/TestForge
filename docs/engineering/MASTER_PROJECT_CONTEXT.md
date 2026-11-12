# MASTER PROJECT CONTEXT: TESTFORGE

**Document ID:** DOC-ENG-001  
**Version:** 1.0.0  
**Status:** Authoritative Working Document  
**Date:** November 12, 2026  
**Primary Architect:** Antigravity Engineering Agent

---

## 1. Executive Summary & Purpose

**TestForge** is an enterprise-grade, AI-assisted coding assessment and academic examination ecosystem designed for educational institutions, technical instructors, and students. TestForge provides end-to-end tooling to author questions, design complex multi-section examination papers, manage question banks, conduct proctored assessments, and execute student code across multiple programming languages (C++, Java, Python, JavaScript) inside a cryptographically correlated, resource-governed sandbox infrastructure.

TestForge is not a simple quiz application. It is a distributed assessment engine that combines strict pedagogical workflows with cloud execution security, asynchronous queuing, and algorithmic evaluation.

---

## 2. Core User Roles & Capabilities

The platform enforces strict role-based access control (RBAC) across three primary personas:

### 2.1 Admin
* **User Lifecycle:** Provision, activate, audit, and deactivate teacher and student accounts.
* **System Operations:** Monitor real-time platform health, system logs, worker queues, and runner capacity.
* **Audit & Compliance:** Review platform-wide grading audit logs, security events, and execution anomalies.
* **Infrastructure Governance:** Monitor the Azure ARM64 Judge0 execution runner, resource consumption, and queue backpressure.

### 2.2 Teacher
* **Question Bank Management:** Curate, categorize, and tag coding and multiple-choice questions (MCQs) across difficulty levels and Bloom's taxonomy.
* **Test Case Studio:** Create public (sample) and private (hidden) test cases with strict input/output specifications.
* **Mutation Lab:** Run mutation testing against reference solutions to verify test case quality and identify test suite blind spots.
* **Examination Designer (Paper Studio):** Assemble exams with customized duration, negative marking, section splits, access codes, and IP/browser policies.
* **Proctoring & Monitoring:** View live candidate attempts, active sessions, and track submission progress.
* **Evaluation & Analytics:** Inspect automated grading results, override scores with audit justification, and export cohort analytics.

### 2.3 Student / Candidate
* **Authentication & Dashboard:** Authenticate via JWT or enter direct guest candidate access codes (e.g., `TF-DSA01`).
* **Assessment Workspace:** Solve multi-language algorithmic and multiple-choice problems within a Monaco/CodeMirror code editor.
* **Instant Verification (Run Code):** Execute candidate code against public test cases to receive real-time stdout, stderr, compile errors, and timing diagnostics.
* **Formal Submission (Submit Code):** Submit code for asynchronous, authoritative evaluation against both public and hidden test cases.
* **Results & Post-Exam Review:** View scorecards, test-case pass percentages (with hidden test data redacted), and historical performance metrics.

---

## 3. Major Functional Modules

TestForge is structured into twelve major architectural modules:

1. **Question Bank:** Centralized repository of coding challenges and MCQs with full-text search, topic filtering, and versioning.
2. **Test Studio:** Interactive interface for authoring and validating input/output test suites.
3. **AI Question Generator:** AI-assisted prompt-to-question synthesis (currently procedural/mocked on client, pending full backend LLM integration).
4. **Mutation Lab:** Algorithmic mutant generation (`BOUNDARY_OFF_BY_ONE`, `NEGATE_CONDITIONAL`, `RETURN_DEFAULT`) to evaluate test case rigor.
5. **Paper Designer:** Multi-section exam creator with access code generation, scheduling, and mark distribution.
6. **Coding Assessment Engine:** Candidate-facing IDE with syntax highlighting, runtime diagnostics, and real-time execution feedback.
7. **Student Dashboard & Portal:** Student examination hub for active, upcoming, and completed assessments.
8. **Teacher Dashboard:** Command center for class metrics, recent exams, student rosters, and quick-action shortcuts.
9. **Admin Dashboard:** Platform monitoring, worker pool visibility, and user management.
10. **Student Analytics:** Granular candidate performance tracking, category breakdowns, and historical score trajectories.
11. **Automated Code Evaluation:** Two-tier grading service calculating raw scores, percentages, and execution benchmarks.
12. **Submission Management:** Authoritative, idempotent submission ledger with 2-phase compensating rollbacks and audit logs.

---

## 4. Full Technology Stack & Dependency Inventory

### 4.1 Frontend (`client/`)
* **Core Framework:** React 18.3.1
* **Build System:** Vite 6.0.7
* **Routing:** Custom stateful workspace routing (`App.jsx`) with multi-mode navigation pills and responsive bento layouts.
* **Styling:** Tailwind CSS 3.4.17 with PostCSS and custom bento design tokens (`bento-theme.css`).
* **State & Data Fetching:** TanStack React Query 5.66.0, Axios-based unified API client (`client/src/lib/api.js`).
* **Icons & Animation:** Lucide React 0.468.0, Framer Motion 14.12.0, Three.js 0.174.0.
* **Design System:** Custom bento grid, light-mode palette (`#191A1D`, `#EDFF72`, `#F2F3F0`, `#DDE1DA`), accessible contrast ratios.

### 4.2 Backend (`server/`)
* **Runtime & Framework:** Node.js 22.x LTS (ES Modules), Express.js 4.21.2.
* **Database & ODM:** MongoDB 6.x / 7.x, Mongoose 8.12.0.
* **Asynchronous Queue:** BullMQ 6.7.4 powered by ioredis 6.0.0.
* **Security & Auth:** JSON Web Tokens (`jsonwebtoken` 9.0.2), `bcryptjs` 3.0.3, `helmet` 8.0.0, CORS 2.8.5.
* **Validation:** Joi 17.13.3 schema validators for authentication, questions, and attempt submissions.
* **HTTP Client:** Undici 7.30.2 for high-throughput, low-latency communication with the Judge0 execution runner.
* **Testing:** Jest 29.7.0 with `--experimental-vm-modules` and `--runInBand`, Supertest 7.0.0.

### 4.3 Execution Infrastructure (`deploy/judge0/`)
* **Runner Platform:** Judge0 Community Edition v1.13.1 (ARM64 native build).
* **Sandbox Technology:** Isolate v1.10.1 (Linux namespace and cgroup sandboxing).
* **Host Operating System:** Ubuntu 22.04.5 LTS (ARM64 / aarch64).
* **Containerization:** Docker Engine + Docker Compose v2.
* **Kernel & Resource Accounting:** Hybrid Linux cgroup arrangement (v1 controllers mounted: memory, cpu, cpuacct, pids, devices, freezer).
* **Security Ingress:** Caddy 2 HTTPS reverse proxy with strict Bearer / X-Auth-Token header gating.
* **Custom Security Patches:**
  * `deploy/judge0/docker/isolate-wrapper.sh` (Strict argument allowlist, exact single-action enforcement, decimal box ID validation, zero egress `--share-net` blocker).
  * `deploy/judge0/docker/patches/isolate_job_correlation.patch` (Pre-execution `CORRELATION_KEY` validation, HMAC-SHA256 correlation, safe `Open3.capture3(*cmd)` argument array dispatch, fail-closed exception cleanup).

---

## 5. Authoritative Data Models

All state persistence is managed through Mongoose models located in `server/src/models/`:

1. **`User.js`:**
   * Fields: `name`, `email` (unique, lowercase), `password` (bcrypt salted hash), `role` (`'student' | 'teacher' | 'admin'`), `createdAt`, `updatedAt`.
2. **`Question.js`:**
   * Fields: `title`, `statement`, `language` (`'javascript' | 'python' | 'java' | 'cpp'`), `difficulty` (`'easy' | 'medium' | 'hard'`), `starterCode`, `referenceSolution`, `inputFormat`, `outputFormat`, `constraints`, `examples` (array of `{input, output, explanation}`), `author` (ref: User), `status` (`'draft' | 'published'`).
3. **`TestCase.js`:**
   * Fields: `questionId` (ref: Question), `input`, `expectedOutput`, `visibility` (`'sample' | 'hidden'`), `category` (`'edge' | 'performance' | 'stress' | 'correctness'`), `weight` (numeric marks).
4. **`Exam.js`:**
   * Fields: `title`, `description`, `examCode` (unique, indexed uppercase e.g., `TF-DSA01`), `teacherId` (ref: User), `durationMinutes`, `startTime`, `endTime`, `questions` (array of Question refs with section markers), `status` (`'draft' | 'scheduled' | 'active' | 'completed'`).
5. **`ExamAttempt.js`:**
   * Fields: `examId` (ref: Exam), `studentId` (ref: User), `status` (`'in_progress' | 'submitted' | 'timed_out'`), `startedAt`, `submittedAt`, `totalScore`, `maxScore`, `answers` (subdocuments or references to StudentAnswer).
6. **`StudentAnswer.js`:**
   * Fields: `attemptId` (ref: ExamAttempt), `questionId` (ref: Question), `code`, `language`, `score`, `maxScore`, `status` (`'unattempted' | 'evaluating' | 'evaluated' | 'failed'`), `gradingVersion` (optimistic concurrency version counter).
7. **`Submission.js`:**
   * Fields: `attemptId`, `questionId`, `studentId`, `code`, `language`, `status` (`'queued' | 'running' | 'completed' | 'failed'`), `remoteExecution` (object tracking `provider`, `token`, `fencingToken`, `state`, `lastCheckedAt`), `results` (array of test case execution outcomes).
8. **`GradingAuditLog.js`:**
   * Fields: `submissionId`, `attemptId`, `studentId`, `previousScore`, `newScore`, `reason`, `initiator` (`'system_worker' | 'teacher_override'`), `timestamp`.
9. **`McqQuestion.js`:**
   * Fields: `question`, `optionA`, `optionB`, `optionC`, `optionD`, `correctAnswer` (`'A'|'B'|'C'|'D'`), `marks`, `topic`, `explanation`, `ownerId` (ref: User).
10. **`ActivityLog.js`:**
    * Fields: `userId`, `action`, `resourceType`, `resourceId`, `metadata`, `ipAddress`, `userAgent`, `timestamp`.

---

## 6. Non-Negotiable Architectural Invariants

The TestForge architecture is built on six strict security and operational boundaries:

1. **Separation of Assessment vs. Execution Authority:**
   * Judge0 is solely an untrusted execution runner: it compiles source code, executes it inside Isolate, and reports stdout, stderr, execution time, and memory usage.
   * The TestForge Backend is the sole grading authority: it stores hidden test cases, computes test-case equality, calculates marks, records audit logs, and persists final scores.
2. **Hidden Test Case Protection:**
   * Hidden test case inputs, expected outputs, and reference solutions must NEVER be transmitted to the frontend, exposed in student API payloads, or leaked into public logs.
3. **Zero Host Execution in Production:**
   * Under NO circumstances may arbitrary student-submitted code or teacher-submitted mutations be executed via `child_process.execSync`, `exec`, or direct Node.js `vm` on the production server. If the hardened sandbox runner is unavailable, the system MUST fail closed (`internal_error`) rather than falling back to host execution.
4. **Idempotent Asynchronous Processing:**
   * Student submissions are accepted asynchronously (HTTP 202 Accepted) and processed via BullMQ. Every job is protected by a fencing token and lease renewal mechanism to prevent duplicate evaluation, race conditions, or split-brain scoring.
5. **Strict Repository-First Governance:**
   * No infrastructure changes, VM SSH connections, Docker builds on cloud VMs, or cloud deployments may occur without prior local repository verification and explicit user authorization.
6. **Financial Constraint:**
   * The project operates strictly within the user's Azure for Students subscription. Personal cash budget is **₹0**. No cloud operations that trigger unexpected credit burn or necessitate Pay-As-You-Go conversion are permitted.
