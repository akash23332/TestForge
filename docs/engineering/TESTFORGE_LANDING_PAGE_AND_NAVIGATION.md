# TestForge Universal Landing Page & Complete User Flow Architecture

**Project**: TestForge Assessment Platform  
**Implementation Date**: November 2026  
**Status**: Production-Ready & Verified

---

## 1. Overview & Architectural Intent

TestForge serves three primary user personas:
1. **Educators / Faculty**: Need an institutional workstation to create questions (manual and AI-generated), configure test suites with AST mutation testing, design examination papers, schedule proctored exams, and review psychometric analytics.
2. **Students / Candidates**: Need two distinct pathways:
   - **Path A (Direct Guest Exam Join)**: Enter a 6-digit test code (e.g., `TF-DSA01`) to immediately take an assessment without creating an account (when permitted by the exam policy).
   - **Path B (Authenticated Student Portal)**: Sign in with credentials to access their personal student dashboard, examine historical submissions, track percentile trends, and view personalized feedback.
3. **Institutional Administrators**: Oversee institution-wide academic integrity, audit logs, and faculty account provisioning. Public signup for administrators is strictly disabled.

---

## 2. Navigation & User Flow State Machine

```
                                [ 1. MAIN LANDING PAGE ] (Route: `/` or activeTab: 'landing')
                                "The Smarter Way to Create, Conduct & Evaluate Assessments."
                                                               │
                 ┌─────────────────────────────────────────────┼─────────────────────────────────────────────┐
                 ▼                                             ▼                                             ▼
        [ A. JOIN A TEST ]                           [ B. STUDENT PORTAL ]                         [ C. TEACHER LOGIN ]
     (Hero / Nav / Modal / CTA)                     (Nav / Students Section)                      (Nav / Hero / CTA)
                 │                                             │                                             │
                 ▼                                             ▼                                             ▼
       [ Enter Test Code ]                         [ Student Landing Gateway ]                     [ Dedicated AuthPage ]
      (e.g., `TF-DSA01`)                          (`StudentLandingView.jsx`)                      (Segmented: Teacher/Student)
                 │                                 • 3D Scene & ASMR Canvas                                  │
                 ▼                                 • "Take tests. Track growth."                             ▼
    POST `/api/v1/attempts/join`                               │                                 POST `/api/v1/auth/login`
                 │                                             ▼                                             │
       ┌─────────┴─────────┐                       [ Student Sign In / Auth ]                      ┌─────────┴─────────┐
       ▼                   ▼                                   │                                   ▼                   ▼
[ Valid Code ]      [ Invalid / Expired ]                      ▼                           [ Teacher Role ]    [ Student Role ]
       │            (Error message display)          [ Student Dashboard ]                         │                   │
       ▼                                           (`StudentDashboardView.jsx`)                    ▼                   ▼
[ Instructions ]                                   • Upcoming Tests / Stats               [ Teacher Workspace ] [ Student Dashboard ]
(`StudentInstructionsView`)                        • Historical Submissions               (`DashboardView.jsx`)
       │                                                                                  • 10 Bento Modules
       ▼
[ Live Exam Workspace ]
(`StudentExamWorkspace.jsx`)
       │ (Live code execution)
       ▼
POST `/api/v1/attempts/:id/submit`
       │
       ▼
[ Student Results View ]
(`StudentResultsView.jsx`)
```

---

## 3. Detailed Component Hierarchy

### A. Newly Implemented Landing Page Suite (`client/src/features/landing/`)

| Component | File Path | Purpose & Responsibilities |
| :--- | :--- | :--- |
| **Navbar** | [`client/src/features/landing/Navbar.jsx`](file:///d:/TestForge/client/src/features/landing/Navbar.jsx) | Sticky navigation with scroll-reactive blur (`#nv`), brand logo with `#top` anchor, smooth anchor links (`#about`, `#features`, `#educators`, `#students`, `#how`, `#faq`), and 3 targeted CTAs (`Join a Test`, `Student Portal`, `Teacher Login`). Full responsive mobile drawer. |
| **HeroSection** | [`client/src/features/landing/HeroSection.jsx`](file:///d:/TestForge/client/src/features/landing/HeroSection.jsx) | High-contrast dark `#0B0C0E` hero with custom interactive shard particle canvas (`#hc`), pointer swirl physics, lime glow, 3D CSS isometric card stack (`AI Question Generator`, `Coding Test Studio`, `solution.js` monospace snippet), and rotating 6-face CSS Cube. |
| **AboutSection** | [`client/src/features/landing/AboutSection.jsx`](file:///d:/TestForge/client/src/features/landing/AboutSection.jsx) | Section `#about`: "One Platform. Every Assessment Need." with animated lime highlight badge, dual modality cards, and a 3-layer 3D perspective stack (`Question Paper`, `Coding Assessment`, `Student Performance`). |
| **FeaturesSection** | [`client/src/features/landing/FeaturesSection.jsx`](file:///d:/TestForge/client/src/features/landing/FeaturesSection.jsx) | Section `#features`: "Six Tools. One Workspace." 6 interactive Bento cards with 3D pointer tilt, radial lime spotlight, and verified feature tags (`AI Question Generator`, `Smart Question Bank`, `Coding Test Studio`, `Mutation Lab`, `Paper Designer`, `Performance Analytics`). |
| **EducatorsSection** | [`client/src/features/landing/EducatorsSection.jsx`](file:///d:/TestForge/client/src/features/landing/EducatorsSection.jsx) | Section `#educators`: "Everything You Need to Create Better Assessments." Feature checklist with lime checkmarks, `Enter Teacher Workspace →` CTA, and a 3D tilted preview panel of the Teacher Assessment console. |
| **StudentsSection** | [`client/src/features/landing/StudentsSection.jsx`](file:///d:/TestForge/client/src/features/landing/StudentsSection.jsx) | Section `#students`: "Your Skills. Your Progress. Your Journey." Features **TWO mandatory separated CTA cards**: **Card A (Have a Test Code? -> Join a Test)** and **Card B (Want to Track Your Progress? -> Student Portal)**. 3D tilted dark code runner preview panel. |
| **HowItWorksSection** | [`client/src/features/landing/HowItWorksSection.jsx`](file:///d:/TestForge/client/src/features/landing/HowItWorksSection.jsx) | Section `#how`: "From Test Creation to Results in Four Steps." Timeline cards: `01 Create` → `02 Share` → `03 Attempt` → `04 Evaluate`. |
| **WhyTestForgeSection**| [`client/src/features/landing/WhyTestForgeSection.jsx`](file:///d:/TestForge/client/src/features/landing/WhyTestForgeSection.jsx) | High-depth dark `#191A1D` card with radial lime glow drift and 6 key institutional value propositions. |
| **FAQSection** | [`client/src/features/landing/FAQSection.jsx`](file:///d:/TestForge/client/src/features/landing/FAQSection.jsx) | Section `#faq`: 6 expandable semantic accordions addressing platform capabilities, coding assessments, guest access rules, and AI generation. |
| **FinalCTASection** | [`client/src/features/landing/FinalCTASection.jsx`](file:///d:/TestForge/client/src/features/landing/FinalCTASection.jsx) | Section `#cta`: High-conversion footer banner with dual primary CTAs (`Join a Test` & `Enter Teacher Workspace`) and Student Portal link. |
| **Footer** | [`client/src/features/landing/Footer.jsx`](file:///d:/TestForge/client/src/features/landing/Footer.jsx) | Semantic footer with brand metadata, anchor navigation, direct portal links, and copyright statement. |
| **MainLandingPage** | [`client/src/features/landing/MainLandingPage.jsx`](file:///d:/TestForge/client/src/features/landing/MainLandingPage.jsx) | Master coordinator component. Integrates top scroll progress indicator, sections, and an accessible **Quick Join Test Modal Dialog** that verifies assessment codes directly. |

---

### B. Preserved & Reused Components

| Existing Component | File Path | Integration Role |
| :--- | :--- | :--- |
| **StudentLandingView** | [`client/src/features/student-portal/StudentLandingView.jsx`](file:///d:/TestForge/client/src/features/student-portal/StudentLandingView.jsx) | **100% PRESERVED**. Functions as the dedicated Student Portal Gateway (`activeTab: 'student-landing'`) with its full 3D interactive hero, floating cards, and ASMR particle canvas. Added `onNavigateHome` for seamless return to the Main Landing Page. |
| **AuthPage** | [`client/src/features/auth/AuthPage.jsx`](file:///d:/TestForge/client/src/features/auth/AuthPage.jsx) | **PRESERVED & ENHANCED**. Added support for `initialRole` (`'teacher'` or `'student'`) so clicking Teacher Login or Student Portal preselects the correct tab, while maintaining real backend JWT authentication and 403 role-guard verification. |
| **StudentPortalContainer** | [`client/src/features/student-portal/StudentPortalContainer.jsx`](file:///d:/TestForge/client/src/features/student-portal/StudentPortalContainer.jsx) | **REUSED DIRECTLY**. Handles the entire guest and authenticated exam pipeline (`join` → `instructions` → `workspace` → `results`). |
| **StudentDashboardView** | [`client/src/features/student-portal/StudentDashboardView.jsx`](file:///d:/TestForge/client/src/features/student-portal/StudentDashboardView.jsx) | **PRESERVED**. Displays post-login student analytics, test history, and upcoming assigned examinations. |
| **DashboardView & BentoSuite** | [`client/src/features/dashboard/DashboardView.jsx`](file:///d:/TestForge/client/src/features/dashboard/DashboardView.jsx) | **PRESERVED**. All 10 faculty modules (Overview, Students, Question Bank, Create Question, Test Studio, Mutation Lab, Bulk MCQ, Paper Designer, Examinations, Analytics) remain untouched and secure. |

---

## 4. API Endpoints & Security Guardrails

1. **Authentication API**:
   - `POST /api/v1/auth/login`: Validates credentials (`email`, `password`, optional `role`). Rejects role mismatches with `403 Forbidden`.
   - `POST /api/v1/auth/logout`: Clears backend session cookies.
2. **Assessment Attempt Engine**:
   - `POST /api/v1/attempts/join`: Validates `examCode` (active, not expired, guest policy). Returns signed attempt token and exam metadata.
   - `POST /api/v1/attempts/:id/submit`: Submits candidate code for automated unit test execution and AST grading.
   - **Zero-Leak Security**: Private test cases and reference solutions remain strictly isolated on the server; never delivered to candidate clients.

---

## 5. Verification & Test Suite Results

1. **Client Build Verification**:
   - Command: `npm --prefix client run build`
   - Output: `✓ 2129 modules transformed. ✓ built in 30.75s (0 errors)`.
2. **Backend Automated Tests**:
   - Command: `npm --prefix server test tests/authIntegrationFlow.test.js tests/studentAnalyticsAndPortal.test.js`
   - Result: `Test Suites: 2 passed, 2 total. Tests: 19 passed, 19 total`.
