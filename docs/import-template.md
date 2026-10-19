# Bulk MCQ Import Template Specification

This document details the CSV/XLSX template format required by TestForge for bulk multiple-choice question import (Section 12 of the Architecture Blueprint).

---

## Required Columns

| Column | Type | Required | Description | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `question` | String | **Yes** | The question stem / prompt | Minimum 10 characters |
| `optionA` | String | **Yes** | Choice option A | Non-empty |
| `optionB` | String | **Yes** | Choice option B | Non-empty |
| `optionC` | String | **Yes** | Choice option C | Non-empty |
| `optionD` | String | **Yes** | Choice option D | Non-empty |
| `correctAnswer` | String | **Yes** | The correct option letter | Must be exactly `A`, `B`, `C`, or `D` (case-insensitive) |
| `marks` | Number | **Yes** | Points allocated | Integer >= 1 |
| `topic` | String | No | Subject or domain tag | Max 50 characters |
| `explanation` | String | No | Solution rationale | Optional teacher note |

---

## Validation & Error Rules
1. **Missing Options**: Any row lacking options A through D is flagged with a row-level error.
2. **Invalid Answer Key**: Answer values outside `A`, `B`, `C`, `D` are rejected with descriptive messages.
3. **Invalid Marks**: Non-positive numbers or non-numeric entries are flagged.
4. **Duplicate Detection**: Questions with identical or near-identical text within the same batch or existing bank are flagged for review.
5. **Partial Import**: The teacher can preview flagged rows, correct entries directly in the UI, or exclude invalid rows before committing to the question bank.
