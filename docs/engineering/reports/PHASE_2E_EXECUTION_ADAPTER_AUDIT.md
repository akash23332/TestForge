# TestForge Phase 2E: Data Structure-Aware Code Execution Adapters
## Comprehensive Read-Only Architectural Audit & Design Specification

**Document Version:** 1.0.0  
**Date:** November 13, 2026  
**Status:** Audit Complete — Awaiting Approval Before Implementation  
**Auditors:** DeepMind Autonomous Development Agent (GSD / Ralph Loop / CodeRabbit)

---

## 1. Executive Summary

During Test Case Studio reference solution execution and student code submission for LeetCode-style Linked List problems (such as `reverseList(ListNode* head)`), the execution pipeline produced the following critical compiler errors in C++:

```text
code.cc:6:5: error: 'ListNode' does not name a type
   6 |     ListNode* reverseList(ListNode* head) {
     |     ^~~~~~~~
code.cc: In function 'int main()':
code.cc:33:24: error: 'class Solution' has no member named 'solution'; did you mean 'Solution'?
  33 |     auto res = sol.solution(a, b);
     |                    ^~~~~~~~
     |                    Solution
```

This audit thoroughly investigates the root causes across:
- **Question Schema & Domain Models** (`server/src/models/Question.js`)
- **Execution Pipeline & Providers** (`codeRunner.service.js`, `OnlineCompilerProvider.js`, `LocalExecutionProvider.js`)
- **Harness & Wrapper Generation** (`codeContract.service.js`)
- **Queue & Worker Execution** (`executionProcessor.js`, `executionQueue.js`)
- **Teacher Validation Suite** (`testValidation.service.js`, `testCase.controller.js`)
- **Client Teacher Question Creator** (`QuestionCreatorView.jsx`, `TestCaseStudioView.jsx`)
- **Output Comparison & Normalization** (`codeRunner.service.js`)

---

## 2. Deep Root Cause Analysis

### Question 1: What is the exact source of the missing `ListNode` definition?
* **Source:** `server/src/services/codeContract.service.js` (and historically in `OnlineCompilerProvider.js`).
* **Mechanism:** When `activeProvider` (Judge0 via `OnlineCompilerProvider`) compiles and runs `FUNCTION` mode questions, it calls `wrapCodeForExecution({ code, language, executionMode, ... })`. In the original C++, Java, and Python wrapper templates, the user code `${code}` was placed into the compiler file without standard competitive programming definitions (`struct ListNode`, `struct TreeNode`). Consequently, `g++` encountered `ListNode* head` before any declaration of `ListNode` existed, throwing `'ListNode' does not name a type`.

### Question 2: What is the exact source of the incorrect `solution()` invocation?
* **Source:** In `codeContract.service.js`, the C++ harness previously had hardcoded invocation logic:
  ```cpp
  int a = tokens.size() > 0 ? stoi(tokens[0]) : 0;
  int b = tokens.size() > 1 ? stoi(tokens[1]) : 0;
  auto res = sol.${fn}(a, b);
  ```
  Here `${fn}` defaulted to `'solution'`. When teachers or students authored standard solutions with methods such as `reverseList`, `hasCycle`, or `invertTree`, but the question's `functionName` field in the database defaulted to `'solution'` (or when the harness assumed 2 integer arguments), the compiler emitted `'class Solution' has no member named 'solution'` and argument signature mismatches.

### Question 3: Is `functionName` stored correctly in the database?
* **Answer:** **Partially.**
  - In `Question.js`, `functionName` is defined as `{ type: String, default: 'solution', trim: true }`.
  - In `QuestionCreatorView.jsx`, when `executionMode === 'FUNCTION'`, an input field is rendered allowing the teacher to specify `functionName`.
  - **The Gap:** When teachers create questions from scratch or paste reference solutions from LeetCode, they frequently leave `functionName` as `'solution'` or fail to sync it if they rename the method in the code editor. Additionally, if the question context fails to supply `functionName` to `validateSingleTestCase`, the default `'solution'` is used.

### Question 4: Are parameter count and types stored and available?
* **Answer:** **Schema exists, but runtime pipeline omits or ignores them.**
  - In `Question.js`, `functionSignature` defines:
    ```js
    functionSignature: {
      parameters: [{ name: { type: String }, type: { type: String } }],
      returnType: { type: String, default: 'void' }
    }
    ```
  - **The Gap:**
    1. Neither `testValidation.service.js` nor `executionProcessor.js` reliably inspects or populates `functionSignature.parameters` when executing test cases.
    2. The Teacher Question Creator (`QuestionCreatorView.jsx`) does **not** provide a UI for defining parameter types, leaving `parameters: []` in almost all stored documents.
    3. The execution wrapper had no AST or regex fallback to discover parameter types when `parameters` is empty.

### Question 5: Do linked-list and tree questions have a data-structure configuration?
* **Answer:** **No.**
  - `questionSchema` has `executionMode: { type: String, enum: ['FUNCTION', 'STDIN'] }`, but has **no** `dataStructure` enum field (e.g., `ARRAY`, `STRING`, `LINKED_LIST`, `BINARY_TREE`).
  - As a result, the backend treated all `FUNCTION` mode questions as generic primitives or arrays, forcing ad-hoc heuristics instead of structured contract guarantees.

### Question 6: Do the reference solution and student solution use the same harness?
* **Answer:** **Yes, architecturally, but with provider branch discrepancies.**
  - Both `testValidation.service.js` (for reference solution verification) and `executionProcessor.js` (for student submissions) invoke `validateSingleTestCase()`.
  - However, inside `validateSingleTestCase()` in `codeRunner.service.js`:
    - If `activeProvider` is present (`OnlineCompilerProvider`), it invokes `wrapCodeForExecution()` from `codeContract.service.js`.
    - If `activeProvider` is null (local host execution), it branched into `runCppIsolated()`, `runPythonIsolated()`, etc., which contained **independent, duplicate, divergent wrapper strings**.
  - **Requirement:** Both paths must use a single unified adapter/wrapper architecture.

### Question 7: Does the wrapper support different output formats?
* **Answer:** **Historically No; only JSON or raw stdout.**
  - For arrays, `[1, 2, 3]` was serialized as JSON.
  - For linked lists, returning `ListNode*` in C++ caused compilation errors because `cout << res` has no stream insertion operator `<<` for pointer types.
  - For trees, returning `TreeNode*` also had no serialization.
  - Serialization must convert data structures into standardized JSON representations:
    - `ListNode` $\rightarrow$ `[1,2,3,4,5]`
    - `TreeNode` $\rightarrow$ `[1,2,3,null,4,5,6]` (level-order traversal with trailing nulls stripped).

---

## 3. Files Responsible

| File Path | Responsibility | Current Limitation |
|---|---|---|
| `server/src/models/Question.js` | Question schema definition | Lacks `dataStructure` enum and validation |
| `server/src/services/codeContract.service.js` | Generates wrapper harness code | Monolithic conditional block; lacks structured modular adapters |
| `server/src/services/codeRunner.service.js` | Orchestrates single test case execution & output comparison | Duplicates harness logic in local runners; needs adapter dispatch |
| `server/src/services/queue/executionProcessor.js` | Worker processor for student test runs & submissions | Does not forward `dataStructure` or `returnType` in `questionContext` |
| `server/src/services/testValidation.service.js` | Teacher question suite & reference solution validation | Does not forward `dataStructure` or `returnType` in `questionContext` |
| `client/src/features/questions/QuestionCreatorView.jsx` | Teacher UI for authoring coding questions | Lacks Data Structure selector (`ARRAY`, `STRING`, `LINKED_LIST`, `BINARY_TREE`) |

---

## 4. Current Supported Question Types vs. Missing Capabilities

| Feature / Question Type | Current Status | Missing Capabilities |
|---|---|---|
| **Arrays & Numbers** | Supported | Multi-dimensional array adapters need formalization |
| **Strings** | Supported | Escaping and quotes handling in multi-parameter harnesses |
| **Singly Linked Lists (`ListNode`)** | Partially Functional (Heuristic) | Formal schema field `dataStructure: 'LINKED_LIST'`, cycle-safe traversal limits, cycle detection, memory deallocation, multi-arg list signatures |
| **Binary Trees (`TreeNode`)** | Partially Functional (Heuristic) | Formal schema field `dataStructure: 'BINARY_TREE'`, level-order parsing (`[1,2,3,null,4]`), serialization with null placeholders, memory safety |
| **Modular Adapters** | Missing | Logic lives in large procedural string builders instead of clean, dedicated adapter classes |
| **Teacher Question Creator** | Basic | Lacks Data Structure selection chip and auto-populating starter templates for lists/trees |

---

## 5. Proposed Minimal Architecture (Phase 2E)

### 5.1 Architecture Diagram

```
                 +-------------------------------------------------+
                 |                Question Model                   |
                 | executionMode: 'FUNCTION' | 'STDIN'             |
                 | dataStructure: 'ARRAY'|'STRING'|'LINKED_LIST'|  |
                 |                'BINARY_TREE'                    |
                 +------------------------+------------------------+
                                          |
                                          v
+----------------------------------------------------------------------------------+
|                        Adapter Registry (adapterRegistry.js)                     |
|                                                                                  |
|   +-------------------+  +-------------------+  +-----------------------------+  |
|   |   ArrayAdapter    |  |   StringAdapter   |  |     LinkedListAdapter       |  |
|   +-------------------+  +-------------------+  +-----------------------------+  |
|                                                 |                             |  |
|                          +-------------------+  | - Input: JSON Array         |  |
|                          | BinaryTreeAdapter |  | - C++: struct ListNode      |  |
|                          +-------------------+  | - Java: class ListNode      |  |
|                                                 | - Py: class ListNode        |  |
|                                                 | - JS: function ListNode     |  |
|                                                 | - Cycle-safe serialization  |  |
|                                                 +-----------------------------+  |
+-----------------------------------------+----------------------------------------+
                                          |
                                          v
+----------------------------------------------------------------------------------+
|                       Language Wrappers (wrappers/)                              |
|                                                                                  |
|   +-------------------+  +-------------------+  +-----------------------------+  |
|   |    cppWrapper     |  |    javaWrapper    |  |        pythonWrapper        |  |
|   +-------------------+  +-------------------+  +-----------------------------+  |
|   | javascriptWrapper |                                                          |
|   +-------------------+                                                          |
+-----------------------------------------+----------------------------------------+
                                          |
                                          v
                    OnlineCompilerProvider / LocalExecutionProvider
```

### 5.2 Directory Structure
```text
server/src/services/execution/
  adapters/
    BaseAdapter.js
    ArrayAdapter.js
    StringAdapter.js
    LinkedListAdapter.js
    BinaryTreeAdapter.js
    adapterRegistry.js
  wrappers/
    cppWrapper.js
    javaWrapper.js
    pythonWrapper.js
    javascriptWrapper.js
```

### 5.3 Adapter Interface Contract (`BaseAdapter.js`)
Each data structure adapter defines:
1. `name`: Unique identifier (`ARRAY`, `STRING`, `LINKED_LIST`, `BINARY_TREE`).
2. `getTypeDeclarations(language)`: Injects data structure definitions (`struct ListNode`, `struct TreeNode`).
3. `getInputParsers(language)`: Code that parses standard input lines/tokens into the typed structure.
4. `getResultPrinters(language)`: Code that traverses and prints the structure to stdout as JSON.
5. `normalizeOutput(rawOutput)`: Normalizes stdout before test comparison.
6. `getStarterTemplate(language, functionName)`: Generates clean, idiomatic boilerplate for teachers/students.

---

## 6. Risks to Existing Functionality & Mitigation Strategy

1. **Risk:** Breaking existing Array or String questions in FUNCTION mode.
   * **Mitigation:** Default `dataStructure` to `ARRAY` (or `AUTO`) when unspecified. All existing unit tests in `phase2cCodeContract.test.js` must run and pass continuously.
2. **Risk:** Breaking STDIN mode questions.
   * **Mitigation:** In `STDIN` mode, code is returned 100% untouched.
3. **Risk:** Infinite loops during list or tree traversal (e.g. cyclic linked list).
   * **Mitigation:** Cap list traversal at $10^5$ nodes with a cycle safeguard; cap tree depth at $10^4$ nodes.
4. **Risk:** Divergence between Reference Solution validation and Student grading.
   * **Mitigation:** Both execute through `validateSingleTestCase()` which delegates strictly to the exact same wrapper registry.
5. **Risk:** Leaking reference solutions or test cases.
   * **Mitigation:** Zero changes to serialization projection filters; reference solutions remain strictly excluded from all student-facing endpoints.

---

## 7. Implementation Plan

* **Step 1:** Add optional `dataStructure` field to `Question.js` (`['NONE', 'ARRAY', 'STRING', 'LINKED_LIST', 'BINARY_TREE']`, default `'ARRAY'`).
* **Step 2:** Implement modular adapter architecture in `server/src/services/execution/adapters/` and `server/src/services/execution/wrappers/`.
* **Step 3:** Implement Singly Linked List Adapter (`LinkedListAdapter.js`) across C++, Java, Python, and JavaScript with cycle safety.
* **Step 4:** Implement Binary Tree Adapter (`BinaryTreeAdapter.js`) across C++, Java, Python, and JavaScript with level-order parsing and serialization.
* **Step 5:** Wire adapters into `codeContract.service.js` and `codeRunner.service.js`. Ensure `executionProcessor.js` and `testValidation.service.js` pass `dataStructure` through `questionContext`.
* **Step 6:** Add lightweight Data Structure selector chips in `QuestionCreatorView.jsx` for FUNCTION mode questions.
* **Step 7:** Run comprehensive test suite including real compiler executions for C++, Python, Java, and JavaScript across all data structure cases.
