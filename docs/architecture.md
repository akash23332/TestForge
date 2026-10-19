# TestForge Architecture & Design Specification

## System Overview

TestForge is designed for coding assessment authoring and validation, bridging the gap between question drafting and high-confidence exam deployment.

### System Boundaries & Security Model
1. **Teacher vs. Student Boundary**:
   - The platform strictly enforces that students never receive reference solutions, grading rubrics, or hidden test cases.
   - The `/api/v1/questions/:id/student-view` endpoint sanitizes fields at the database projection level.
2. **Safe Code Execution Boundary**:
   - Arbitrary code execution occurs in bounded child processes with strict execution limits (timeout: 3s, memory: 128MB, stdout/stderr truncation: 64KB).
   - Code is never executed via `eval` inside the Express server thread.
3. **Cache-Aside Architecture**:
   - Questions listings are cached in Redis with TTL and invalidated on mutations (`create`, `update`, `delete`).
   - If Redis is unavailable or unconfigured, the system automatically falls back to MongoDB queries without degradation of core functionality.
4. **Data Ownership**:
   - All write operations and item retrievals scope directly by `ownerId` preventing cross-tenant access.
