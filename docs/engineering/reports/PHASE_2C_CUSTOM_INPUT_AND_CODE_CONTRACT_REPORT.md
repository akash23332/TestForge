# TestForge Phase 2C: Custom Input + Multi-Language Code Contract Standardization Report

**Date:** 2026-11-13  
**Status:** COMPLETE (All Acceptance Criteria Verified; 22 Test Suites, 325/325 Tests Passing)  
**Author:** Backend Architecture & Security Infrastructure Specialist  
**Deliverable:** `docs/engineering/reports/PHASE_2C_CUSTOM_INPUT_AND_CODE_CONTRACT_REPORT.md`

---

## Executive Summary

Phase 2C establishes an end-to-end multi-language code execution contract across TestForge. It reconciles the historical mismatch between Function-oriented and Standard I/O (STDIN) coding paradigms, equips students with interactive Custom Input execution on STDIN problems, standardizes student starter code and teacher reference solutions across all four supported languages (Python 3.14, C++ 15, Java 25, JavaScript 24), and enforces strict Zero-Leak security boundaries so proprietary test suites and faculty solutions never leak to student clients.

All 22 backend test suites (325 tests total) pass with 100% success rate, and the Vite client application builds with zero errors.

---

## 1. Architectural Audit & Problem Statement

Prior to Phase 2C, coding question evaluation suffered from six architectural gaps:

| Component / Layer | Historical State | Limitation Identified | Phase 2C Solution |
| :--- | :--- | :--- | :--- |
| **Question Model** | Single language enum, single starter code string, single reference solution string. | No execution mode recorded (`FUNCTION` vs `STDIN`). No function signature metadata. | Added `executionMode` (`FUNCTION` vs `STDIN`), `functionName`, `functionSignature`, `starterCodes` (Map), `referenceSolutions` (Map). |
| **Execution Provider** (`OnlineCompilerProvider`) | Dispatches `{ compiler, code, input }` to OnlineCompiler API. | OnlineCompiler runs scripts via CLI stdin/stdout. Submitting `def solution(a, b): return a + b` returned exit code 0 with empty stdout. | Created `codeContract.service.js` with language-specific harnesses (`wrapCodeForExecution`) that invoke the declared function with stdin arguments and print JSON-serialized return values. |
| **Java Class Model** | Student template declared `public class Solution` with main method. | OnlineCompiler (`openjdk-25`) expects `public class Main`. | In STDIN mode: `public class Main` with `Scanner`. In FUNCTION mode: student writes `class Solution` (public modifier stripped in harness) wrapped in `public class Main`. |
| **Submission Model** | `runType` enum was `['SAMPLE', 'SUBMISSION']`. | No mechanism for candidate custom stdin testing. | Added `CUSTOM_INPUT` to `runType` enum and added `customInput: { type: String, default: null }` field. |
| **Custom Input Execution** | Missing. | Students could only run against public sample cases or submit for grading. | Implemented `POST /api/v1/attempts/:attemptId/custom-run`, enqueued in BullMQ, executed via `executionProcessor.js` without mutating exam scores. |
| **Zero-Leak Security** | Potential exposure if reference solutions returned in question endpoints. | Projections could leak faculty solutions if not explicitly filtered. | `sanitizeQuestionAllowlist` in question controller and `sanitizeQuestionForStudent` in attempt controller strictly exclude `referenceSolution` and `referenceSolutions`. |

---

## 2. Standardized Multi-Language Code Contract

TestForge now explicitly defines two execution modes for coding questions:

### Mode A: FUNCTION Mode
- **Semantics:** Student implements a specified function or class method (e.g., `solution(a, b)`).
- **Languages Supported:** Python, JavaScript, Java, C++.
- **Judge Harness:** Because hosted execution APIs run programs as CLI binaries, `wrapCodeForExecution` appends or wraps a runtime harness:
  - **Python:** Imports `json` and `sys`, parses stdin tokens as typed arguments, calls `solution(*args)`, and prints `json.dumps(result)`.
  - **JavaScript:** Uses `fs.readFileSync(0, 'utf-8')`, parses arguments, calls `solution(...args)`, and outputs `JSON.stringify(result)`.
  - **Java:** Declares student `class Solution` and wraps in runnable `public class Main` using reflection to dynamically locate and invoke the method, printing array/object results.
  - **C++:** Wraps student `class Solution` with `int main()` harness that reads typed inputs and prints return values.
- **Custom Input Policy:** Custom standard input is disabled with a clear user prompt, directing students to test function implementations using "Run" against sample argument fixtures.

### Mode B: STDIN Mode
- **Semantics:** Student writes a complete CLI program that reads from standard input (`stdin`) and writes to standard output (`stdout`).
- **Templates:**
  - **Python:** `import sys ... def main(): ... if __name__ == '__main__': main()`
  - **JavaScript:** `const fs = require('fs'); function main() { const input = fs.readFileSync(0, 'utf-8').trim(); ... } main();`
  - **Java:** `import java.util.Scanner; public class Main { public static void main(String[] args) { ... } }`
  - **C++:** `#include <iostream> using namespace std; int main() { ... return 0; }`
- **Custom Input Policy:** Fully enabled. Candidates can pass arbitrary stdin payloads up to 64KB.

---

## 3. Implementation Details

### 3.1 Backend Schema & Validation Layer
- **`server/src/models/Question.js`:**
  - Added `executionMode: { type: String, enum: ['FUNCTION', 'STDIN'], default: 'STDIN' }`.
  - Added `functionName: { type: String, default: 'solution' }`.
  - Added `functionSignature: { functionName, returnType, parameters: [{ name, type, description }] }`.
  - Added `supportedLanguages: { type: [String], default: ['javascript', 'python', 'java', 'cpp'] }`.
  - Added `starterCodes: { type: Map, of: String }`.
  - Added `referenceSolutions: { type: Map, of: String }`.
- **`server/src/models/Submission.js`:**
  - Updated `runType` enum to include `'CUSTOM_INPUT'` (`['SAMPLE', 'SUBMISSION', 'CUSTOM_INPUT']`).
  - Added `customInput: { type: String, default: null }`.
- **`server/src/validators/question.validator.js`:**
  - Added Joi schema validation for `executionMode`, `functionName`, `functionSignature`, `starterCodes`, and `referenceSolutions`.

### 3.2 Code Contract Engine (`server/src/services/codeContract.service.js`)
- Standardized templates for all four languages across both execution modes.
- `getStarterCode({ executionMode, language, functionName, parameters, question })` returns tailored starter code.
- `wrapCodeForExecution({ code, language, executionMode, functionName, parameters })` wraps student code with target harnesses for FUNCTION mode and passes STDIN code unmodified.

### 3.3 Custom Input Pipeline & Worker Processing
- **`server/src/controllers/attempt.controller.js` (`runCustomInput`):**
  - Mounted at `POST /api/v1/attempts/:attemptId/custom-run`.
  - Guarded by active attempt verification, expiration checking, and 64KB input bound checks.
  - Rejects custom input requests for `FUNCTION`-mode questions with `400 Bad Request` and `FUNCTION_MODE_NO_CUSTOM_STDIN`.
  - Enqueues BullMQ background execution job with `runType: 'CUSTOM_INPUT'`.
  - Returns `202 Accepted` with `submissionId` and polling URL.
- **`server/src/services/queue/executionProcessor.js`:**
  - Added dedicated branch for `runType === 'CUSTOM_INPUT'`.
  - Builds a virtual single-case test execution payload (`category: 'custom'`, `input: submission.customInput`).
  - Skips database test case queries.
  - Executes code through the active provider (`OnlineCompilerProvider` or configured fallback).
  - Persists verdict as `COMPLETED`, `COMPILE_ERROR`, or `RUNTIME_ERROR`.
  - **Zero Score Mutation:** Explicitly bypasses `StudentAnswer` update, guaranteeing that custom input runs never mutate student exam marks or answer state.
- **`server/src/services/codeRunner.service.js`:**
  - Added `testCase.category === 'custom'` support (allows empty input, bypasses expected output checks).
  - Integrated `wrapCodeForExecution` to wrap candidate code transparently before execution provider dispatch.

### 3.4 Teacher Experience & Question Authoring
- **`client/src/features/questions/QuestionCreatorView.jsx`:**
  - Added Execution Mode selector card (`Function` vs `STDIN`).
  - Added `functionName` input field dynamically visible in Function mode.
  - Replaced hardcoded templates with `STANDARDIZED_TEMPLATES` for all 4 languages.
  - Synchronized starter code and reference solution updates when toggling execution mode or language.
  - Updated reset template buttons to restore mode-specific templates.
  - Payload explicitly sends `executionMode` and `functionName`.
- **`server/src/controllers/testCase.controller.js` (`validateReferenceSolution`):**
  - Accepts `language` parameter in request body.
  - Resolves language-specific reference solutions from `question.referenceSolutions` map or primary `referenceSolution`.
  - Strictly rejects validation if no reference solution exists for the requested language (never falls back to starter code).
  - Passes `executionMode` and `functionName` in `questionContext` to `validateSingleTestCase`.
  - Mounted both `/api/v1/questions/:id/validate` and `/api/v1/questions/:id/validate-suite` in `question.routes.js`.

### 3.5 Student Exam Workspace Experience
- **`client/src/features/student-portal/StudentExamWorkspace.jsx`:**
  - Synchronized starter code resolution via `STANDARDIZED_TEMPLATES`.
  - Added visual Execution Mode badge in editor header (`FUNCTION` vs `STDIN`).
  - Added "Custom Input" tab in test results drawer.
  - When in STDIN mode: renders custom stdin `<textarea>`, "Run Custom Input" execution trigger, loading spinner, and formatted stdout / runtime output display.
  - When in FUNCTION mode: renders helpful notification banner explaining that custom stdin is disabled for function questions and directing candidates to use the "Run" button for sample inputs.

---

## 4. Verification and Regression Results

### 4.1 Phase 2C Integration Test Suite (`tests/phase2cCodeContract.test.js`)
All 19 test cases passed:
1. `Question` schema defaults `executionMode` to `STDIN`.
2. `Question` schema accepts explicit `FUNCTION` mode and `functionName`.
3. `Question` schema validates `executionMode` enum.
4. `Submission` schema accepts `CUSTOM_INPUT` runType and `customInput` field.
5. Standardized starter templates provided for all 4 languages in FUNCTION mode.
6. Standardized starter templates provided for all 4 languages in STDIN mode.
7. STDIN mode `wrapCodeForExecution` returns candidate code untouched.
8. Python FUNCTION mode `wrapCodeForExecution` generates JSON serializer harness.
9. JavaScript FUNCTION mode `wrapCodeForExecution` generates JSON serializer harness.
10. Java FUNCTION mode `wrapCodeForExecution` embeds Solution class inside runnable Main harness.
11. C++ FUNCTION mode `wrapCodeForExecution` wraps Solution inside `int main()` harness.
12. `sanitizeQuestionAllowlist` preserves contract metadata but strictly strips `referenceSolution` and `referenceSolutions`.
13. `sanitizeQuestionForStudent` in attempt controller strictly strips reference solutions.
14. Rejects custom input run when question is in FUNCTION mode (400 Bad Request).
15. Rejects custom input exceeding 64KB size limit.
16. Enqueues `CUSTOM_INPUT` submission for STDIN question and processes via worker without mutating scores.
17. Custom Input execution handles compiler/runtime errors cleanly.
18. Validates reference solution across sample test cases and reports passes.
19. Rejects validation when reference solution does not exist for question.

### 4.2 Full Server Regression Suite
```
Test Suites: 22 passed, 22 total
Tests:       325 passed, 325 total
Snapshots:   0 total
Time:        60.111 s
Ran all test suites.
```

### 4.3 Client Production Build
```
✓ 2122 modules transformed.
dist/index.html                        1.54 kB │ gzip:   0.70 kB
dist/assets/index-CSE75Jgt.css       147.21 kB │ gzip:  25.07 kB
dist/assets/reactVendor-C8w-UNLI.js  141.74 kB │ gzip:  45.48 kB
dist/assets/index-B3P6tvN_.js        963.24 kB │ gzip: 240.95 kB
✓ built in 8.93s
```

---

## 5. Security & Zero-Leak Audit Summary

1. **Information Leak Prevention:**
   - Faculty reference solutions are omitted from all student-facing projections.
   - Hidden test case inputs and expected outputs are never returned during `CUSTOM_INPUT` or `SAMPLE` runs.
   - Test case suite management (`GET /testcases`, `POST /questions/:id/validate`) strictly verifies teacher ownership or admin authorization via `checkQuestionOwner`.
2. **Resource & Input Bounds:**
   - Candidate custom input is capped at 64 KB per run.
   - Candidate code is capped at 64 KB per run.
   - Rate limiting via `executionRateLimiter` applies to both `/run` and `/custom-run` endpoints.
3. **Grading Integrity:**
   - `runType: 'CUSTOM_INPUT'` runs never write to `StudentAnswer` or mutate student marks.

---

## 6. Deliverable Sign-off

| Milestone Item | Status | Verification Evidence |
| :--- | :--- | :--- |
| FUNCTION vs STDIN execution mode support | COMPLETE | `server/src/models/Question.js`, `codeContract.service.js` |
| Custom stdin execution pipeline | COMPLETE | `attempt.controller.js`, `executionProcessor.js`, UI drawer tab |
| Multi-language contracts (Py, C++, Java, JS) | COMPLETE | `STANDARDIZED_TEMPLATES` in backend and frontend |
| Java `public class Main` entry alignment | COMPLETE | STDIN starter templates and FUNCTION reflection harness |
| Reference solution validation route alignment | COMPLETE | Mounted `/:id/validate` and `/:id/validate-suite` |
| Zero-Leak security enforcement | COMPLETE | Verified by `phase2cCodeContract.test.js` (Tests 3.1 & 3.2) |
| Automated integration tests | COMPLETE | 19/19 Phase 2C tests, 325/325 full regression tests passing |
| Frontend production build | COMPLETE | Vite build succeeds with 0 errors |
