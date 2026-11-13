# TESTFORGE PHASE 2A: ONLINECOMPILER EXECUTION PROVIDER IMPLEMENTATION REPORT

**Document ID:** DOC-ENG-015  
**Version:** 1.0.0  
**Date:** November 13, 2026  
**Status:** Authoritative & Verified  
**Roles:** Senior Backend Engineer, API Integration Specialist, DevSecOps Engineer & Security Auditor  
**Scope:** Phase 2A Backend Provider Implementation (`OnlineCompilerProvider.js`)  

---

## 1. Executive Summary

In accordance with the TestForge Code Runner roadmap, **Phase 2A: Implement OnlineCompiler Execution Provider** has been completed successfully. 

A dedicated backend provider adapter, [`OnlineCompilerProvider.js`](file:///d:/TestForge/server/src/services/execution/OnlineCompilerProvider.js), has been designed, implemented, and verified against the established `ExecutionProvider` interface. The implementation connects the TestForge backend execution pipeline to the hosted `https://api.onlinecompiler.io/api/run-code-sync/` synchronous execution endpoint without modifying the existing Judge0 `RenderSandboxProvider.js`, without altering the BullMQ asynchronous worker architecture, and without hardcoding credentials or modifying frontend code.

### Core Objectives Delivered:
1. **ExecutionProvider Interface Compliance:** Implemented `executeCode()`, `getCapabilities()`, `supportsLanguage()`, and `checkHealth()` matching the abstract contract in [`ExecutionProvider.interface.js`](file:///d:/TestForge/server/src/services/execution/ExecutionProvider.interface.js).
2. **Verified Compiler Identifier Mappings:** Mapped all four supported runtime languages to their verified Postman identifiers:
   - **Python:** `python-3.14`
   - **C++:** `g++-15`
   - **Java:** `openjdk-25`
   - **JavaScript:** `nodejs-24`
3. **Exact Authorization Header Contract:** Verified that OnlineCompiler.io requires the raw API key directly in the `Authorization` header (`Authorization: <API_KEY>`) rather than `Bearer <API_KEY>` (which returns HTTP 404). Built automatic prefix stripping to safely handle any accidental `Bearer ` prefixes configured in environment variables.
4. **Zero-Leak Credential Redaction:** Implemented recursive `_sanitize()` string sanitization ensuring API keys and authorization tokens are redacted (`[REDACTED_API_KEY]`) from all logs, HTTP error responses, and exceptions.
5. **Configurable Request Timeouts:** Added configurable timeouts via `ONLINE_COMPILER_TIMEOUT_MS` (default: 10,000ms) with per-call overrides and `AbortSignal` timeout racing.
6. **Provider Registry Integration:** Registered `onlinecompiler` as a first-class provider in [`providerRegistry.js`](file:///d:/TestForge/server/src/services/execution/providerRegistry.js), while preserving `mock`, `render_sandbox`, and `local`.
7. **Joi Environment Validation:** Extended `server/src/config/env.js` to validate `EXECUTION_PROVIDER`, `ONLINE_COMPILER_ENDPOINT`, `ONLINE_COMPILER_API_KEY`, and `ONLINE_COMPILER_TIMEOUT_MS`.
8. **100% Mocked Test Coverage:** Created [`server/tests/onlineCompilerProvider.test.js`](file:///d:/TestForge/server/tests/onlineCompilerProvider.test.js) featuring 22 comprehensive unit tests covering all required failure modes (401, 403, 429, 5xx, timeouts, truncation, missing key, compilation/runtime errors). All 22 tests pass (100% Green).

---

## 2. Changed Files & Architecture Summary

| File Path | Action | Description |
| :--- | :---: | :--- |
| [`server/src/services/execution/OnlineCompilerProvider.js`](file:///d:/TestForge/server/src/services/execution/OnlineCompilerProvider.js) | **CREATED** | Core execution provider adapter implementing synchronous HTTP POST dispatch to `api.onlinecompiler.io/api/run-code-sync/`. Handles response normalization, error classification, credential redaction, and capability reporting. |
| [`server/src/services/execution/providerRegistry.js`](file:///d:/TestForge/server/src/services/execution/providerRegistry.js) | **MODIFIED** | Registered `onlinecompiler` in the provider registry map. Maintained fail-closed security policy ensuring production environments permit either `render_sandbox` or `onlinecompiler` and reject unsafe host execution. |
| [`server/src/config/env.js`](file:///d:/TestForge/server/src/config/env.js) | **MODIFIED** | Extended Joi schema: added `onlinecompiler` to `EXECUTION_PROVIDER` valid enum; added validation for `ONLINE_COMPILER_ENDPOINT`, `ONLINE_COMPILER_API_KEY`, and `ONLINE_COMPILER_TIMEOUT_MS`. |
| [`server/package.json`](file:///d:/TestForge/server/package.json) | **MODIFIED** | Added `"testMatch": ["<rootDir>/tests/**/*.test.js"]` to Jest configuration to cleanly isolate active backend tests from archived historical materials. |
| [`server/tests/onlineCompilerProvider.test.js`](file:///d:/TestForge/server/tests/onlineCompilerProvider.test.js) | **CREATED** | Comprehensive mocked integration test suite verifying language mappings, auth headers, status normalizations, error verdicts, timeouts, and credential redactions. |
| [`docs/engineering/SKILL_ORCHESTRATION_MAP.md`](file:///d:/TestForge/docs/engineering/SKILL_ORCHESTRATION_MAP.md) | **MODIFIED** | Updated version to 1.10.0 documenting skill invocations and verification evidence. |

---

## 3. Verified Compiler Mappings & API Contract

### 3.1 Compiler Identifiers
Per successful integration testing, the following exact compiler identifiers are mapped and verified:

```javascript
export const DEFAULT_ONLINE_COMPILER_IDENTIFIERS = Object.freeze({
  python: 'python-3.14',
  py: 'python-3.14',
  cpp: 'g++-15',
  'c++': 'g++-15',
  java: 'openjdk-25',
  javascript: 'nodejs-24',
  js: 'nodejs-24'
});
```

### 3.2 Request & Authorization Contract
- **HTTP Method:** `POST`
- **Target URL:** `https://api.onlinecompiler.io/api/run-code-sync/`
- **Headers:**
  ```http
  Content-Type: application/json
  Authorization: <API_KEY>
  ```
- **Payload Schema:**
  ```json
  {
    "compiler": "python-3.14",
    "code": "print('Hello TestForge')",
    "input": ""
  }
  ```

> [!IMPORTANT]
> **Authorization Header Finding:** OnlineCompiler API rejects `Authorization: Bearer <API_KEY>` with HTTP 404 (`{"error": "Invalid or inactive API key"}`) because it parses the entire header value literally. Sending the raw key directly (`Authorization: <API_KEY>`) succeeds with HTTP 200. The provider implementation automatically sanitizes incoming configuration to strip accidental `Bearer ` prefixes before dispatching.

### 3.3 Response Normalization Schema
The provider normalizes the API's synchronous JSON output into TestForge's standard `ExecutionProvider` contract:

| OnlineCompiler Field | Type | TestForge Normalized Property | Mapping Logic |
| :--- | :---: | :--- | :--- |
| `output` / `stdout` | string | `output` | Normalized to string; preserves standard stdout. |
| `error` / `stderr` | string | `error` | Redacted via `_sanitize()`; null if empty string. |
| `status` | string | `status` | Normalized to `'success'`, `'compilation_error'`, `'runtime_error'`, `'timeout'`, `'memory_limit_exceeded'`, or `'internal_error'`. |
| `time` | string/num | `runtimeMs` | Converted to milliseconds (e.g. `"0.0305"` sec -> `31` ms). |
| `memory` | string/num | `memoryKb` | Integer memory consumption in kilobytes. |
| `truncated` | boolean | `truncated` | Explicit boolean indicating output limit truncation. |

---

## 4. Error Verdict Classification Matrix

The provider classifies errors according to strict competitive programming standards:

| Condition / Diagnostics | Normalized Verdict | Evidence / Trigger |
| :--- | :---: | :--- |
| `status === 'success'` and `exit_code === 0` | `'success'` | Clean execution, stdout returned. |
| `syntaxerror`, `g++: error`, `javac: error`, `cannot find symbol` | `'compilation_error'` | Source fails to compile or parse. |
| `exit_code === 124`, `signal === 'SIGKILL'`, `timeout` | `'timeout'` | Execution exceeded wall-clock or CPU timeout. |
| `out of memory`, `SIGSEGV_OOM`, `memory_limit_exceeded` | `'memory_limit_exceeded'` | Process exceeded configured memory envelope. |
| `exit_code !== 0`, `ZeroDivisionError`, `Traceback`, `Exception` | `'runtime_error'` | Runtime exception or non-zero process exit. |
| HTTP 401 / 403 from API gateway | `'internal_error'` | `[OnlineCompilerProvider FAIL-CLOSED] Authentication / Authorization Failure` |
| HTTP 429 from API gateway | `'internal_error'` | `[OnlineCompilerProvider FAIL-CLOSED] Rate Limit Exceeded` |
| HTTP 5xx from API gateway | `'internal_error'` | `[OnlineCompilerProvider FAIL-CLOSED] Upstream Service Error` |
| Missing API key in production | `'internal_error'` | `[OnlineCompilerProvider FAIL-CLOSED] OnlineCompiler endpoint or API key is not configured in production.` |

---

## 5. Security & Zero-Leak Controls

1. **Backend-Only Secrets:** `ONLINE_COMPILER_API_KEY` is loaded strictly on the backend (`server/.env`). It is never exposed to the frontend, never placed in BullMQ queue job payloads, and never logged.
2. **Credential Redaction (`_sanitize`):** All output and error strings returned by OnlineCompiler or Node.js network layers are passed through `_sanitize()`, which replaces exact matches of `apiKey` or its raw token with `[REDACTED_API_KEY]`.
3. **Fail-Closed Production Policy:** If `NODE_ENV === 'production'` and the API key is unconfigured, the provider refuses execution with `internal_error` and does not attempt network calls or fallback to insecure local execution.
4. **Isolation Boundary:** Student code executed via `OnlineCompilerProvider` runs in OnlineCompiler's remote sandbox, eliminating the SEC-001 vulnerability (privileged Docker container sharing host kernel).

---

## 6. Verification & Test Results

### 6.1 Dedicated Unit & Mock Integration Tests
Executed [`server/tests/onlineCompilerProvider.test.js`](file:///d:/TestForge/server/tests/onlineCompilerProvider.test.js) with 22 mock tests:

```text
PASS server/tests/onlineCompilerProvider.test.js
  Phase 2A: OnlineCompilerProvider Mocked Integration & Contract Suite
    Provider Registry & Capabilities
      √ is registered in providerRegistry under "onlinecompiler" (5 ms)
      √ reports hardened sandbox capabilities and supported languages (3 ms)
    Verified Language & Compiler Identifier Mappings
      √ maps all four languages using verified compiler identifiers (1 ms)
      √ sends correct payload for language python with compiler python-3.14 (3 ms)
      √ sends correct payload for language cpp with compiler g++-15 (1 ms)
      √ sends correct payload for language java with compiler openjdk-25
      √ sends correct payload for language javascript with compiler nodejs-24
    Authorization Header & Credential Security
      √ sends raw API key directly in Authorization header without Bearer prefix (1 ms)
      √ strips redundant Bearer prefix if configured in env or options
      √ redacts credentials from error messages and logs (Zero-Leak) (1 ms)
      √ fails closed when API key is missing in production environment (1 ms)
    Response Normalization & Status Verdicts
      √ normalizes successful execution with time and memory metrics (1 ms)
      √ correctly maps compilation errors (syntax error / compiler diagnostics) (1 ms)
      √ correctly maps runtime errors (ZeroDivisionError / exit_code != 0) (2 ms)
      √ correctly maps timeout via status, signal or exit code 124 (1 ms)
      √ correctly captures and flags output truncation (1 ms)
      √ handles malformed JSON response safely as internal_error
    HTTP Status Code Error Handling
      √ handles HTTP 401 Unauthorized as fail-closed internal_error (1 ms)
      √ handles HTTP 403 Forbidden as fail-closed internal_error
      √ handles HTTP 429 Rate Limit Exceeded as fail-closed internal_error (1 ms)
      √ handles HTTP 5xx Upstream Server Errors as fail-closed internal_error (1 ms)
      √ handles network connection timeout gracefully (1 ms)

Test Suites: 1 passed, 1 total
Tests:       22 passed, 22 total
```

### 6.2 Provider & Runner Regression Suite
Executed full provider and runner verification suites:
- `server/tests/sandboxProvider.test.js`
- `server/tests/executionProvider.test.js`
- `server/tests/backendToRunnerIntegration.test.js`
- `server/tests/judge0Integration.test.js`
- `server/tests/judgeRegression.test.js`
- `server/tests/phaseAMilestoneVerification.test.js`
- `server/tests/onlineCompilerProvider.test.js`

**Result:** **7 test suites passed, 115 tests passed, 0 failed (100% Green)**.

### 6.3 CodeRabbit Review
Executed `coderabbit review --uncommitted --dir server/src/services/execution`:
```text
Review complete: No findings ✔
```

---

## 7. Remaining Scope & Next Steps (Phase 2B)

In strict adherence to the prompt constraints, the following items remain intentionally unexecuted until authorized:
- **Frontend Code Editor:** Monaco Editor integration in `StudentExamWorkspace.jsx`.
- **Custom Input UI:** Standard input (`stdin`) input panel and execution controls.
- **Backend Custom Input Pipeline:** Ephemeral test case evaluation without expected-output assertion.
- **Docker/Redis Deployment:** No modifications to Docker Compose, Redis configuration, or staging environments.
