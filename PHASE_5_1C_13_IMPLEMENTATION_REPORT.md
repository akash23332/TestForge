# TestForge Phase 5.1C-13: Final Wrapper and Lifecycle Security Corrections Report

**Document ID:** TF-PHASE-5.1C-13-LIFECYCLE-WRAPPER-HARDENING  
**Date:** 2026-11-12  
**Status:** COMPLETE / FULLY REMEDIATED (Repository-Only Verification)  
**Security Classification:** Highly Confidential / DevSecOps Security Audit  
**Target Runner:** TestForge Native ARM64 Linux VM (Judge0 CE v1.13.1 + Isolate)  

---

## 1. Executive Summary & Strict Operational Boundaries

Phase 5.1C-13 implements critical source-level security hardening for the Isolate execution wrapper and the ActiveJob sandbox lifecycle in Judge0. This phase is conducted under **strict repository-only boundaries**:
- Zero cloud provisioning, Azure portal, or cloud API interactions.
- Zero SSH connections or remote command executions.
- Zero live Docker container builds, pulls, or deployments.
- Zero kernel, GRUB, cgroup, or network firewall changes on host machines.
- Zero student code execution.
- Zero credentials, secrets, or raw submission tokens logged or persisted.
- No false claims of live production readiness or hardware-isolated kernel enforcement.

---

## 2. Itemized Audit Remediation Analysis

### 2.1 Finding C13-01: Isolate-Wrapper Strict Allowlist & Argument Whitelisting
- **Defect Identified:** Previously, `isolate-wrapper.sh` relied partially on pattern blacklists and argument pass-through, creating potential risks of argument injection, unexpected flag combination, or path traversal.
- **Remediation Implemented:**
  1. **Strict Allowlist Architecture:** Replaced all loose blacklist checks with a deterministic schema allowlist.
  2. **Single Operation Enforcement:** Validates that exactly one operation (`--init`, `--cleanup`, or `--run`) is present per invocation. Combining multiple operations or omitting an operation halts execution immediately.
  3. **Strict Box ID Validation:** Enforces exactly one box ID decimal integer (`^[0-9]+$`) within the authorized range `[0, 2147483647]`. Rejects negative numbers, hex prefixes, overflow values, and duplicate box IDs (`-b 5 -b 10`).
  4. **Strict Cgroups Options:** Allows only documented, required cgroups options (`--cg`, `--cg-mem=<int>`, `--cg-timing`). Rejects duplicate `--cg` flags.
  5. **Explicit Mount Whitelisting:** Permitted directory mounts are strictly restricted to approved internal sandbox paths:
     `^--dir=(/(box|tmp)(=rw|:rw|:noexec|:maybe)?|/(usr/local|lib|usr/lib|etc):noexec)$`
     All arbitrary mounts (e.g. `--dir=/etc`, `--dir=/root`, `--dir=/sys`, `--dir=/proc`, `--dir=/dev`) and paths containing `..` path traversal are rejected.
  6. **Zero Egress Enforcement:** Explicitly rejects `--share-net` and all networking options.
  7. **Command Separator & Shell Metacharacter Filtering:** Trailing commands after `--` are checked to reject path traversal `..` and shell injection characters (`;`, `&`, `|`, `` ` ``, `$`, `<`, `>`).
  8. **Constructs New Validated Argument Array:** Does **not** forward raw `$@` arguments. Builds a brand-new `VALIDATED_ARGS=()` array containing only schema-validated flags, and executes:
     `exec "$REAL_ISOLATE" "${VALIDATED_ARGS[@]}"`
  9. **Honest Host-Risk Classification:** Explicitly discloses in the script and documentation that while the wrapper restricts CLI argument injection by the unprivileged worker user, container `privileged: true` remains an **unresolved architectural host-security risk** until cgroups v2 rootless container execution or unprivileged user namespaces are deployed.

### 2.2 Finding C13-02: Correlation Key Pre-Validation & Error Preservation
- **Defect Identified:** In `isolate_job_correlation.patch`, `CORRELATION_KEY` validation occurred after `isolate --init` had already allocated a sandbox. Additionally, exceptions during initialization or execution could leave uncleaned sandboxes, and if cleanup failed, secondary cleanup exceptions could overwrite the primary execution error.
- **Remediation Implemented:**
  1. **Pre-Validation Before Invocation:** `CORRELATION_KEY` presence and minimum length (32 bytes) are validated at the very entry of `initialize_workdir`, **before** invoking Isolate and before allocating `@box_id`. Missing or invalid keys fail immediately without creating any sandbox or cgroup.
  2. **Safe Process Execution (`Open3.capture3`):** Replaced backticks (which invoke `/bin/sh -c`) with `Open3.capture3(*cmd)` using explicit argument arrays (`cmd = ["isolate", "--cg", "-b", box_id.to_s, "--init"]`).
  3. **Exit Status Verification:** Captures `status.exitstatus` directly, validates directory presence, logs `[CORRELATION_INIT_FAILED]`, and suppresses `[CORRELATION]` on any failure.
  4. **Post-Init Exception Cleanup:** Any exception occurring after sandbox creation triggers `cleanup(false)` to prevent sandbox directory or cgroup leaks.
  5. **Original Execution Error Preservation:** If an exception occurs during execution and cleanup also fails, both errors are recorded in logs (`[CORRELATION_CLEANUP] status=FAILED` and `[CORRELATION_CLEANUP_FAILED]`), and the original execution error is preserved and re-raised (`raise e`).

---

## 3. Comprehensive Verification & Behavioral Test Results

### 3.1 New Phase 5.1C-13 Behavioral Test Suite
File: `server/tests/phase51C13LifecycleHardening.test.js`  
Result: **24 / 24 Passed (100%)**

| Test Category | Description | Result |
| :--- | :--- | :---: |
| **Allowlist Wrapper** | Constructs new validated argument array and invokes `$REAL_ISOLATE` | PASS |
| **Allowlist Wrapper** | Explicitly rejects networking flags (`--share-net`) and path traversal | PASS |
| **Allowlist Wrapper** | Enforces single operation and single box ID constraints | PASS |
| **Allowlist Wrapper** | Strictly validates box ID integer range `[0, 2147483647]` | PASS |
| **Allowlist Wrapper** | Documents that privileged Docker container risk remains unresolved | PASS |
| **Allowlist Wrapper** | Behavioral: Accepts valid `--init` with canonical argument array | PASS |
| **Allowlist Wrapper** | Behavioral: Accepts valid `--cleanup` with canonical argument array | PASS |
| **Allowlist Wrapper** | Behavioral: Accepts valid `--run` with approved cgroup options and command | PASS |
| **Allowlist Wrapper** | Behavioral: Rejects duplicate operations (`--init` and `--cleanup` together) | PASS |
| **Allowlist Wrapper** | Behavioral: Rejects duplicate box IDs (`-b 5` and `-b 10`) | PASS |
| **Allowlist Wrapper** | Behavioral: Rejects duplicate `--cg` flags | PASS |
| **Allowlist Wrapper** | Behavioral: Rejects malformed box IDs (hex, negative, overflow, characters) | PASS |
| **Allowlist Wrapper** | Behavioral: Rejects unknown options and flags | PASS |
| **Allowlist Wrapper** | Behavioral: Rejects networking options (`--share-net`, `--net`) | PASS |
| **Allowlist Wrapper** | Behavioral: Rejects path traversal in directory mounts and arguments | PASS |
| **Allowlist Wrapper** | Behavioral: Rejects shell metacharacters in command arguments after `--` | PASS |
| **Lifecycle Patch** | Patch validates `CORRELATION_KEY` before invoking Isolate or allocating box | PASS |
| **Lifecycle Patch** | Patch uses `Open3.capture3` for safe process execution with argument arrays | PASS |
| **Lifecycle Patch** | Patch catches exceptions after sandbox initialization and triggers cleanup | PASS |
| **Lifecycle Patch** | Behavioral: Missing correlation key fails BEFORE sandbox creation | PASS |
| **Lifecycle Patch** | Behavioral: Short correlation key (<32 bytes) fails BEFORE sandbox creation | PASS |
| **Lifecycle Patch** | Behavioral: Initialization failure logs `INIT_FAILED` and suppresses `CORRELATION` | PASS |
| **Lifecycle Patch** | Behavioral: Exceptions after initialization trigger cleanup and preserve original error | PASS |
| **Lifecycle Patch** | Behavioral: Preserves original execution error even when cleanup ALSO fails | PASS |

---

### 3.2 Full Regression Verification Across All 11 Phase 5.1C Test Suites

Command Executed: `npm test -- tests/phase51C`  
Result: **11 / 11 Suites Passed (237 / 237 Tests Passing - 100%)**

1. `tests/phase51C13LifecycleHardening.test.js`: **24 passed**
2. `tests/phase51C12Corrections.test.js`: **30 passed**
3. `tests/phase51C11CorrelationRemediation.test.js`: **21 passed**
4. `tests/phase51C10Correlation.test.js`: **12 passed**
5. `tests/phase51C9AuditRemediation.test.js`: **37 passed**
6. `tests/phase51C8AuditRemediation.test.js`: **26 passed**
7. `tests/phase51C7RuntimeIntegrity.test.js`: **23 passed**
8. `tests/phase51C6FalsePositiveAudit.test.js`: **22 passed**
9. `tests/phase51C5FinalVerification.test.js`: **18 passed**
10. `tests/phase51C4BuildHardening.test.js`: **17 passed**
11. `tests/phase51C3Remediation.test.js`: **7 passed**

**Total Test Count:** 237 Passed, 0 Failed, 0 Skipped.

---

## 4. Residual Host Architectural Risk Register

| Risk ID | Description | Current Status | Unresolved Factor & Recommended Long-Term Strategy |
| :--- | :--- | :--- | :--- |
| **R-01** | Docker Container `privileged: true` | Mitigated at App Layer via `isolate-wrapper` (0755 root:root) | **Unresolved at Host Layer:** Privileged containers permit potential root escape to host. Requires migration to cgroups v2 unprivileged user namespaces. |
| **R-02** | Root Sibling Cgroup Memory Siphon | Bounded by Staging Concurrency `COUNT=1` (250 MB cap) | **Unresolved at Kernel Layer:** Under cgroups v1, sibling cgroups draw from host RAM outside Docker container slice. Host OOM killer is possible under multi-concurrency without cgroups v2 unified tree. |

---

## 5. Artifact & Source File Deliverables

1. `deploy/judge0/docker/isolate-wrapper.sh` (Strict allowlist argument validator, canonical array execution, Zero Egress enforcement).
2. `deploy/judge0/docker/patches/isolate_job_correlation.patch` (Pre-initialization key validation, `Open3.capture3` array execution, error preservation).
3. `server/tests/phase51C13LifecycleHardening.test.js` (24 behavioral test cases exercising allowlist validation and lifecycle error preservation).
4. `PHASE_5_1C_13_IMPLEMENTATION_REPORT.md` (Complete implementation and security audit report).
5. `TestForge_Phase5.1C-13_Remediation_Bundle.pdf` (Combined standalone document bundle).
