# TestForge

> **AI-assisted Coding Assessment Preparation & Validation Platform**  
> *Full-Stack Architecture & Build Blueprint • Lab Evaluation 1 (ST1)*

TestForge is a teacher-facing assessment engineering web application. It empowers faculty to author high-quality coding problems, manage verified test suites, execute deterministic code mutations to catch weak tests, bulk-import MCQs with row-level validation, preview student-facing assessments with zero secret leaks, and assemble customized examination papers.

---

## ⚡ Terminal Quickstart (Run Project)

> 📘 **Full documentation:** See [REQUIREMENTS.md](file:///d:/TestForge/REQUIREMENTS.md) for detailed prerequisites, runtime options, and troubleshooting.

### Option A: One-Click Runner (Recommended)
- **Windows (Double-click or PowerShell):**
  ```powershell
  .\run-dev.ps1
  # or double-click run-dev.bat
  ```
- **macOS / Linux:**
  ```bash
  chmod +x run-dev.sh
  ./run-dev.sh
  ```

---

### Option B: Manual Terminal Execution

#### 1. Install All Dependencies
From the project root:
```bash
npm run install:all
```

#### 2. Seed Database with Questions (Optional)
```bash
npm run seed
```

#### 3. Run Backend & Frontend

| Service | Terminal Command | Local URL |
| :--- | :--- | :--- |
| **Backend API** | `npm run dev:server` (or `cd server && npm run dev`) | [http://localhost:5000](http://localhost:5000) |
| **Frontend UI** | `npm run dev:client` (or `cd client && npm run dev`) | [http://localhost:5173](http://localhost:5173) |

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
| **Frontend** | React 18 + Vite | Modern component architecture, type safety, and fast HMR |
| **Styling & Theme** | Tailwind CSS + Lucide Icons | Responsive wide-screen layout, accessible contrast, and Dark Theme active |
| **State & Data** | React Hooks + Custom API Client | Deterministic data fetching, loading/empty states, and session persistence |
| **Backend** | Node.js + Express REST API | Modular controllers, owner-scoped services, centralized error handling |
| **Database** | MongoDB + Mongoose ODM | Strictly validated schemas, compound indexes, and relational references |
| **Authentication** | JWT + Bcrypt | Secure password hashing, owner authorization, and 30-day session retention |
| **Code Execution** | Isolated Process Runner | Java, JS, Python, and C++ compilation/execution with strict timeout guardrails |
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

### 4. Bulk MCQ Studio
- Multi-format file ingestion supporting both `.csv` and `.xlsx` templates.
- Client-side error parsing with instant row-level feedback for missing options, incorrect answer keys, or malformed choices.

### 5. Student Visibility Auditor
- Previews the stripped assessment bundle sent to students.
- Mathematically guarantees that `referenceSolution`, `gradingNotes`, and `hidden` test suites are excluded at the serializer layer.

### 6. Smart Paper Designer
- Automated exam paper assembly configured by total marks, duration, and difficulty percentage.
- Section-wise allocation for MCQs, debugging questions, and coding problems.

---

## 🧪 Verification & Automated Tests

```bash
# Run automated Jest test suite
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

---

## 📋 Evaluation Milestone Checklist

- [x] **Milestone 1: Foundations** — Repo setup, Vite, Express, MongoDB Atlas connection, health check `/api/v1/health`.
- [x] **Milestone 2: Auth & Question CRUD** — JWT auth, bcrypt, owner-scoped Question CRUD APIs, automated tests.
- [x] **Milestone 3: Frontend Core** — Dashboard with full-bleed hero banner, Question Bank, Creator, Search, Filter.
- [x] **Milestone 4: Teacher Workflows** — Bulk MCQ CSV upload with preview/correction, Zero-Leak Student Visibility Auditor.
- [x] **Milestone 5: Mutation Testing Engine** — Test Studio, isolated Java/JS runner, deterministic mutation injection, killed/survived/invalid classification.
- [x] **Milestone 7 (Advance Preview): Smart Paper Designer** — Assembly of exam papers based on marks, time, and topic mix.
- [ ] **Milestone 6 (Evaluation 2 / P1 Scope): AI & Advanced Caching** — Real LLM API adapter for question prompt generation, PDF quality report downloads.
