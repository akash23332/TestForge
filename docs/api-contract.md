# TestForge REST API Contract

Base Prefix: `/api/v1`

---

## 1. Response & Error Schema Conventions

### Success Response
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... },
  "meta": { ... } // optional pagination/timing metadata
}
```

### Error Response
Consistent format across all endpoints (Section 9):
```json
{
  "error": {
    "code": "ERROR_CODE_IDENTIFIER",
    "message": "Human readable summary of the error",
    "details": null,
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

---

## 2. API Endpoints Overview

| Method | Endpoint | Description | Status Code | Auth Required |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Service health & dependency status | `200` / `503` | No |
| `POST` | `/api/v1/auth/register` | Register teacher account | `201` | No |
| `POST` | `/api/v1/auth/login` | Login and receive signed JWT | `200` | No |
| `GET` | `/api/v1/auth/me` | Fetch authenticated teacher profile | `200` | **Yes** |
| `GET` | `/api/v1/questions` | List questions with pagination/filter/sort | `200` | **Yes** |
| `POST` | `/api/v1/questions` | Create new question | `201` | **Yes** |
| `GET` | `/api/v1/questions/:id` | Read owned question | `200` / `404` | **Yes** |
| `PATCH`| `/api/v1/questions/:id` | Partial update question | `200` | **Yes** |
| `DELETE`| `/api/v1/questions/:id`| Delete / archive question | `204` | **Yes** |
| `GET` | `/api/v1/questions/:id/student-view` | Student visibility preview (never leaks private data) | `200` | **Yes** |
| `GET` | `/api/v1/questions/:id/tests` | List test cases for question | `200` | **Yes** |
| `POST` | `/api/v1/questions/:id/tests` | Create test case | `201` | **Yes** |
| `POST` | `/api/v1/questions/:id/validate` | Execute reference solution against tests | `200` / `202` | **Yes** |
| `POST` | `/api/v1/questions/:id/mutation-runs`| Run deterministic mutations | `200` / `202` | **Yes** |
| `GET` | `/api/v1/reports/:id` | Fetch quality and mutation report | `200` | **Yes** |
| `POST` | `/api/v1/mcq-imports/preview` | Upload and preview CSV/XLSX rows | `200` / `400` | **Yes** |
| `POST` | `/api/v1/exam-papers` | Create exam paper draft | `201` | **Yes** |
| `POST` | `/api/v1/exports` | Export approved questions/papers | `200` / `202` | **Yes** |
