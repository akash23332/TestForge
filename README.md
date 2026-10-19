# TestForge

> **AI-assisted Coding Assessment Preparation & Validation Platform**  
> *Full-Stack Architecture & Build Blueprint • Lab Evaluation 1 (ST1)*

TestForge is a teacher-facing assessment engineering web application. It empowers faculty to author high-quality coding problems, manage verified test suites, execute deterministic code mutations to catch weak tests, bulk-import MCQs with row-level validation, preview student-facing assessments with zero secret leaks, and assemble customized examination papers.

---

## 🎯 Executive Summary & Problem Solved

| Faculty Problem | TestForge Solution |
| :--- | :--- |
| **Manual Question Authoring** | Centralized Question Bank with language, difficulty, constraints, starter code, and verified reference solutions. |
| **Weak Test Suites & Blind Spots** | **Mutation Testing Lab**: Injects synthetic arithmetic, logical, and boundary mutants to measure the exact percentage of defects your test suite catches. |
| **Accidental Secret Leaks** | **Visibility Auditor**: Strict server-side field separation ensuring private reference code and hidden tests never reach student bundles. |
| **Repetitive Bulk MCQ Entry** | **Bulk MCQ Import Studio**: CSV/XLSX file upload with instant row-by-row error validation, live editing, and batch creation. |
| **Time-Consuming Exam Assembly** | **Smart Paper Designer**: Selects questions matching syllabus topics, marks distribution, and target difficulty mix. |

---

## 🏗️ Architecture Stack

| Layer | Technology | Purpose & Implementation |
| :--- | :--- | :--- |
| **Frontend** | React 18 + Vite + TypeScript | Modern component architecture, type safety, and fast HMR |
| **Styling & Theme** | Tailwind CSS + Lucide Icons | Responsive wide-screen layout, accessible contrast, and Dark Theme active |
| **State & Data** | React Hooks + Custom API Client | Deterministic data fetching, loading/empty states, and session persistence |
| **Backend** | Node.js (v22) + Express REST API | Modular controllers, owner-scoped services, centralized error handling |
| **Database** | MongoDB + Mongoose ODM | Strictly validated schemas, compound indexes, and relational references |
| **Authentication** | JWT + Bcrypt | Secure password hashing, owner authorization, and 30-day session retention |
| **Code Execution** | Isolated Process Runner | Java & JavaScript compilation and execution with strict time and memory limits |
| **Testing** | Jest + Supertest | Automated unit & integration testing suite (44/44 tests passing) |

---

## 🚀 Key Modules & Workflows

### 1. Dashboard & Question Catalog
- Full-screen edge-to-edge glowing energy hero banner with high-contrast typography.
- Symmetrical 2x2 grid of featured assessment questions paired with Faculty Quick Workflow tools.
- Central Question Action Modal offering single-click navigation to Test Studio, Mutation Lab, Question Editor, and Visibility Auditor.
- Reusable Searchable Question Combobox (`SearchableQuestionSelect`) across all views.

### 2. Test Case Studio
- Categorize tests as **Normal**, **Edge**, or **Performance**.
- Toggle visibility between **Public (Student Sample)** and **Hidden (Grading Test)**.
- **Reference Solution Proof Engine**: Executes reference code against all test inputs to verify expected outputs before saving.

### 3. Mutation Testing Lab
- Generates bounded, deterministic AST & code transformations:
  - Arithmetic operator swaps (`+` ↔ `-`, `*` ↔ `/`)
  - Relational & equality swaps (`<` ↔ `<=`, `==` ↔ `!=`)
  - Logical connector swaps (`&&` ↔ `||`)
  - Boundary modifications (`prefixSum - k` ↔ `prefixSum - k + 1`, loop boundaries)
  - Boolean return flips (`false` ↔ `true`)
- **Strict Classification**:
  - 🟢 **Killed**: Mutant produced an observable output difference or failure.
  - 🔴 **Survived**: Mutant passed all tests unnoticed (reveals blind spots in test suite).
  - 🟡 **Invalid / Compilation Error**: Syntax or compilation failure, isolated and strictly excluded from the score denominator.
- **Accurate Score Formula**:
  $$\text{Mutation Score} = \frac{\text{Killed Mutants}}{\text{Total Valid Mutants (Killed + Survived)}} \times 100\%$$

### 4. Visibility Auditor (Zero-Leak Guarantee)
- Enforces strict server-side boundary separation:
  - **Student View**: Statement, constraints, starter code, and public sample tests only.
  - **Teacher View**: Reference solution, hidden test cases, expected outputs, and grading notes.
- The student endpoint completely omits private fields at the serialization layer (not hidden with CSS).

### 5. Bulk MCQ Import
- Drag-and-drop CSV upload for objective questions.
- Automated row-level validation: flags missing options, incorrect answer keys, invalid marks, and duplicates.
- In-place row correction before permanent persistence.

### 6. Smart Paper Designer
- Interactive paper assembly based on total marks, duration, and question allocation.
- Computes real-time difficulty distributions (Easy / Medium / Hard) and marks verification.

---

## 📡 REST API Specifications (`/api/v1`)

### Authentication & Faculty Profile
- `POST /api/v1/auth/register` — Register a faculty account (returns JWT token & user data)
- `POST /api/v1/auth/login` — Authenticate faculty credentials (returns JWT token)
- `GET /api/v1/auth/me` — Retrieve current authenticated session profile

### Questions Management
- `GET /api/v1/questions` — List questions with pagination (`?page=1&limit=10`), search (`?search=`), and filters
- `POST /api/v1/questions` — Create a new problem statement with reference solution
- `GET /api/v1/questions/:id` — Retrieve question details (owner scoped)
- `PATCH /api/v1/questions/:id` — Update statement, starter code, or reference solution
- `DELETE /api/v1/questions/:id` — Delete question and cascade delete associated tests

### Test Cases & Verification
- `GET /api/v1/questions/:id/tests` — Fetch test suite for a question
- `POST /api/v1/questions/:id/tests` — Add a test case (input, expectedOutput, category, visibility)
- `PATCH /api/v1/questions/:id/tests/:testId` — Update test case parameters
- `DELETE /api/v1/questions/:id/tests/:testId` — Remove a test case
- `POST /api/v1/questions/:id/validate` — Execute reference solution to verify test outputs

### Mutation Testing & Security Audit
- `POST /api/v1/questions/:id/mutation-runs` — Execute deterministic mutant suite and calculate score
- `GET /api/v1/questions/:id/student-view` — Sanitized endpoint returning student-safe bundle
- `POST /api/v1/mcq-imports/preview` — Parse, validate, and preview CSV MCQ uploads
- `GET /api/v1/health` — Real-time health check (MongoDB Atlas, Node environment, memory)

---

## 🗄️ Database Schemas (MongoDB + Mongoose)

- **User**: `name`, `email` (unique index), `passwordHash`, `role` (`Faculty`), `createdAt`
- **Question**: `ownerId`, `title`, `statement`, `constraints`, `language` (`java`/`python`/`javascript`), `difficulty` (`Easy`/`Medium`/`Hard`), `starterCode`, `referenceSolution`, `tags`
- **TestCase**: `questionId`, `input`, `expectedOutput`, `category` (`normal`/`edge`/`performance`), `visibility` (`public`/`hidden`), `verificationStatus`
- **MutationRun**: `questionId`, `operator`, `diff`, `status` (`killed`/`survived`/`invalid`/`timeout`), `perTestResults`, `runtimeMs`
- **ExamPaper**: `ownerId`, `title`, `durationMinutes`, `totalMarks`, `questionRefs`

---

## 🧪 Automated Testing & Verification

The project includes automated regression tests using Jest and Supertest.

```powershell
# Run the complete test suite
cd server
npm test
```

### Test Results
```text
PASS tests/mutationTesting.test.js
PASS tests/testCaseValidation.test.js
PASS tests/authAndQuestions.test.js
PASS tests/health.test.js

Test Suites: 4 passed, 4 total
Tests:       44 passed, 44 total
Snapshots:   0 total
Time:        27.68s
```

Verified test coverage includes:
- **Killed Mutants**: Detected and killed by test failures (`prefixSum - k + 1`).
- **Survived Mutants**: Pass all tests and correctly reported as Survived.
- **Invalid Mutants**: Deliberate Java syntax errors correctly classified as `Invalid`/`Compilation Error` and excluded from the score denominator.
- **Reference Solution**: Passing 100% of valid test cases.
- **Score Calculation**: 2 killed + 1 survived = 66.67%, all killed = 100%, zero mutants = N/A.
- **Security Audit**: Student-view endpoint never leaks `referenceSolution` or `hidden` tests.

---

## 💻 Quick Start Guide

### Prerequisites
- **Node.js**: v18+ (tested on v22.17.1)
- **MongoDB**: Local MongoDB or MongoDB Atlas URI

### 1. Backend Setup
```powershell
cd server
cp .env.example .env
npm install
npm run dev
```
Backend runs on **`http://localhost:5000`**.

### 2. Frontend Setup
```powershell
cd client
npm install
npm run dev
```
Frontend runs on **`http://localhost:5173`**.

---

## 📋 Evaluation Milestone Checklist

- [x] **Milestone 1: Foundations** — Repo setup, Vite, Express, MongoDB Atlas connection, health check `/api/v1/health`.
- [x] **Milestone 2: Auth & Question CRUD** — JWT auth, bcrypt, owner-scoped Question CRUD APIs, automated tests.
- [x] **Milestone 3: Frontend Core** — Dashboard with full-bleed hero banner, Question Bank, Creator, Search, Filter.
- [x] **Milestone 4: Teacher Workflows** — Bulk MCQ CSV upload with preview/correction, Zero-Leak Student Visibility Auditor.
- [x] **Milestone 5: Mutation Testing Engine** — Test Studio, isolated Java/JS runner, deterministic mutation injection, killed/survived/invalid classification.
- [x] **Milestone 7 (Advance Preview): Smart Paper Designer** — Assembly of exam papers based on marks, time, and topic mix.
- [ ] **Milestone 6 (Evaluation 2 / P1 Scope): AI & Advanced Caching** — Real LLM API adapter for question prompt generation, PDF quality report downloads.