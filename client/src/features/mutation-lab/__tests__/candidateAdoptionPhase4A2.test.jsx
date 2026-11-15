import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { CandidateAdoptionSection } from '../CandidateAdoptionSection';
import { SurvivingMutantsCandidateTests } from '../SurvivingMutantsCandidateTests';
import { adoptCandidateTest, rejectCandidateTest } from '../mutationLabService';
import { api } from '../../../lib/api';

vi.mock('../../../lib/api', () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
    patch: vi.fn()
  }
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Phase 4A.2.3: Candidate Adoption UI & Client Integration Test Suite', () => {
  const mockMutants = [
    {
      mutantId: 'mutant-001',
      operator: 'AOR',
      originalSnippet: 'x * 3',
      mutatedSnippet: 'x + 3',
      executionStatus: 'SURVIVED',
      failureReason: 'Passed all test assertions',
      equivalent: false,
      currentClassification: 'SURVIVED'
    },
    {
      mutantId: 'mutant-002',
      operator: 'ROR',
      originalSnippet: 'x > 0',
      mutatedSnippet: 'x >= 0',
      executionStatus: 'SURVIVED',
      failureReason: 'Passed all test assertions',
      equivalent: false,
      currentClassification: 'SURVIVED'
    },
    {
      mutantId: 'mutant-eq-003',
      operator: 'AOR',
      originalSnippet: 'x + 0',
      mutatedSnippet: 'x - 0',
      executionStatus: 'SURVIVED',
      failureReason: 'Equivalent mathematical transformation',
      equivalent: true,
      currentClassification: 'EQUIVALENT'
    }
  ];

  const mockCandidates = [
    {
      candidateId: 'cand-001',
      mutantId: 'mutant-001',
      input: '4',
      expectedOutput: '12',
      category: 'edge_case',
      visibility: 'hidden',
      verified: true,
      adoptionStatus: 'PENDING'
    },
    {
      candidateId: 'cand-002-adopted',
      mutantId: 'mutant-002',
      input: '0',
      expectedOutput: '0',
      category: 'boundary',
      visibility: 'hidden',
      verified: true,
      adoptionStatus: 'ADOPTED',
      adoptedTestCaseId: 'tc-adopted-999',
      adoptedAt: '2026-11-14T20:00:00.000Z'
    },
    {
      candidateId: 'cand-003-rejected',
      mutantId: 'mutant-001',
      input: '-5',
      expectedOutput: '-15',
      category: 'edge_case',
      visibility: 'hidden',
      verified: true,
      adoptionStatus: 'REJECTED',
      rejectionReason: 'Redundant with existing negative numbers test',
      rejectedAt: '2026-11-14T21:00:00.000Z'
    },
    {
      candidateId: 'cand-004-equiv',
      mutantId: 'mutant-eq-003',
      input: '10',
      expectedOutput: '10',
      category: 'sample',
      visibility: 'hidden',
      verified: true,
      adoptionStatus: 'PENDING'
    }
  ];

  // ── 1. Pending candidate rendering ──────────────────────────────────────────
  it('1. Pending candidate rendering: displays ID, mutant ID, operator, PENDING badge, and active action buttons', () => {
    render(
      <CandidateAdoptionSection
        questionId="q-100"
        runId="run-100"
        candidates={[mockCandidates[0]]}
        mutants={mockMutants}
      />
    );

    expect(screen.getByText(/cand-001/i)).toBeDefined();
    expect(screen.getByText(/mutant-001/i)).toBeDefined();
    expect(screen.getByText('AOR')).toBeDefined();
    expect(screen.getByText('PENDING')).toBeDefined();

    const adoptBtn = screen.getByRole('button', { name: /adopt to suite/i });
    const rejectBtn = screen.getByRole('button', { name: /^reject$/i });

    expect(adoptBtn.hasAttribute('disabled')).toBe(false);
    expect(rejectBtn.hasAttribute('disabled')).toBe(false);
  });

  // ── 2. Adopted candidate rendering ──────────────────────────────────────────
  it('2. Adopted candidate rendering: displays ADOPTED badge, adopted TestCase ID, and timestamp', () => {
    render(
      <CandidateAdoptionSection
        questionId="q-100"
        runId="run-100"
        candidates={[mockCandidates[1]]}
        mutants={mockMutants}
      />
    );

    expect(screen.getByText('ADOPTED')).toBeDefined();
    expect(screen.getByText(/TestCase:/i)).toBeDefined();
    expect(screen.getByText(/Adopted on/i)).toBeDefined();

    // Adopt button is disabled for already adopted candidate
    const adoptBtn = screen.getByRole('button', { name: /adopt to suite/i });
    expect(adoptBtn.hasAttribute('disabled')).toBe(true);
  });

  // ── 3. Rejected candidate rendering ─────────────────────────────────────────
  it('3. Rejected candidate rendering: displays REJECTED badge and teacher rejection reason', () => {
    render(
      <CandidateAdoptionSection
        questionId="q-100"
        runId="run-100"
        candidates={[mockCandidates[2]]}
        mutants={mockMutants}
      />
    );

    expect(screen.getByText('REJECTED')).toBeDefined();
    expect(screen.getByText(/Redundant with existing negative numbers test/i)).toBeDefined();

    const adoptBtn = screen.getByRole('button', { name: /adopt to suite/i });
    const rejectBtn = screen.getByRole('button', { name: /^reject$/i });

    expect(adoptBtn.hasAttribute('disabled')).toBe(true);
    expect(rejectBtn.hasAttribute('disabled')).toBe(true);
  });

  // ── 4. Successful adoption ──────────────────────────────────────────────────
  it('4. Successful adoption: opens modal, submits adoption with category & visibility, calls onAdoptCandidate', async () => {
    const onAdoptMock = vi.fn().mockResolvedValueOnce({
      statusCode: 201,
      alreadyAdopted: false,
      testCase: { _id: 'tc-new-123' }
    });

    render(
      <CandidateAdoptionSection
        questionId="q-100"
        runId="run-100"
        candidates={[mockCandidates[0]]}
        mutants={mockMutants}
        onAdoptCandidate={onAdoptMock}
      />
    );

    // Click "Adopt to Suite"
    fireEvent.click(screen.getByRole('button', { name: /adopt to suite/i }));

    // Modal opens
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText(/Adopt Candidate Test Case/i)).toBeDefined();

    // Confirm adoption
    fireEvent.click(screen.getByRole('button', { name: /confirm adoption/i }));

    await waitFor(() => {
      expect(onAdoptMock).toHaveBeenCalledWith('cand-001', {
        category: 'edge_case',
        visibility: 'hidden'
      });
    });
  });

  // ── 5. Already-adopted idempotent response ──────────────────────────────────
  it('5. Already-adopted idempotent response: handles alreadyAdopted: true gracefully without error', async () => {
    api.post.mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        data: {
          testCaseId: 'tc-existing-456',
          adoptionStatus: 'ADOPTED',
          alreadyAdopted: true
        }
      }
    });

    const result = await adoptCandidateTest('q-100', 'run-100', 'cand-001');
    expect(result.alreadyAdopted).toBe(true);
    expect(result.testCaseId).toBe('tc-existing-456');
    expect(api.post).toHaveBeenCalledWith(
      '/questions/q-100/mutation-runs/run-100/candidates/cand-001/adopt',
      { category: 'edge_case', visibility: 'hidden' }
    );
  });

  // ── 6. Successful rejection ─────────────────────────────────────────────────
  it('6. Successful rejection: opens confirmation modal, accepts reason, and calls onRejectCandidate', async () => {
    const onRejectMock = vi.fn().mockResolvedValueOnce({
      statusCode: 200,
      alreadyRejected: false
    });

    render(
      <CandidateAdoptionSection
        questionId="q-100"
        runId="run-100"
        candidates={[mockCandidates[0]]}
        mutants={mockMutants}
        onRejectCandidate={onRejectMock}
      />
    );

    // Click "Reject"
    fireEvent.click(screen.getByRole('button', { name: /^reject$/i }));

    // Rejection modal opens
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText(/Reject Candidate Test/i)).toBeDefined();

    // Enter reason
    const textarea = screen.getByPlaceholderText(/e\.g\. Redundant with existing/i);
    fireEvent.change(textarea, { target: { value: 'Covered by stress tests' } });

    // Confirm rejection
    fireEvent.click(screen.getByRole('button', { name: /confirm rejection/i }));

    await waitFor(() => {
      expect(onRejectMock).toHaveBeenCalledWith('cand-001', {
        rejectionReason: 'Covered by stress tests',
        reason: 'Covered by stress tests'
      });
    });
  });

  // ── 6b. Service API rejectionReason contract ────────────────────────────────
  it('6b. rejectCandidateTest service sends rejectionReason in POST request payload', async () => {
    api.post.mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        data: {
          candidateId: 'cand-001',
          adoptionStatus: 'REJECTED',
          rejectionReason: 'Redundant edge case',
          alreadyRejected: false
        }
      }
    });

    const result = await rejectCandidateTest('q-100', 'run-100', 'cand-001', {
      rejectionReason: 'Redundant edge case'
    });

    expect(result.adoptionStatus).toBe('REJECTED');
    expect(result.rejectionReason).toBe('Redundant edge case');
    expect(api.post).toHaveBeenCalledWith(
      '/questions/q-100/mutation-runs/run-100/candidates/cand-001/reject',
      { rejectionReason: 'Redundant edge case' }
    );
  });

  it('6c. rejectCandidateTest service supports reason option as backward compatibility fallback', async () => {
    api.post.mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        data: {
          candidateId: 'cand-001',
          adoptionStatus: 'REJECTED',
          rejectionReason: 'Legacy reason payload',
          alreadyRejected: false
        }
      }
    });

    const result = await rejectCandidateTest('q-100', 'run-100', 'cand-001', {
      reason: 'Legacy reason payload'
    });

    expect(result.adoptionStatus).toBe('REJECTED');
    expect(api.post).toHaveBeenCalledWith(
      '/questions/q-100/mutation-runs/run-100/candidates/cand-001/reject',
      { rejectionReason: 'Legacy reason payload' }
    );
  });

  // ── 7. Adoption disabled for rejected candidates ────────────────────────────
  it('7. Adoption disabled for rejected candidates: button is rendered disabled with opacity reduction', () => {
    render(
      <CandidateAdoptionSection
        questionId="q-100"
        runId="run-100"
        candidates={[mockCandidates[2]]}
        mutants={mockMutants}
      />
    );

    const adoptBtn = screen.getByRole('button', { name: /adopt to suite/i });
    expect(adoptBtn.hasAttribute('disabled')).toBe(true);
  });

  // ── 8. Adoption disabled for adopted candidates ─────────────────────────────
  it('8. Adoption disabled for adopted candidates: button is rendered disabled', () => {
    render(
      <CandidateAdoptionSection
        questionId="q-100"
        runId="run-100"
        candidates={[mockCandidates[1]]}
        mutants={mockMutants}
      />
    );

    const adoptBtn = screen.getByRole('button', { name: /adopt to suite/i });
    expect(adoptBtn.hasAttribute('disabled')).toBe(true);
  });

  // ── 9. Equivalent mutant ineligibility ───────────────────────────────────────
  it('9. Equivalent mutant ineligibility: candidate for equivalent mutant is INELIGIBLE and adoption is blocked', () => {
    render(
      <CandidateAdoptionSection
        questionId="q-100"
        runId="run-100"
        candidates={[mockCandidates[3]]}
        mutants={mockMutants}
      />
    );

    expect(screen.getByText('INELIGIBLE')).toBeDefined();
    expect(screen.getByText(/classified as equivalent/i)).toBeDefined();

    const adoptBtn = screen.getByRole('button', { name: /adopt to suite/i });
    expect(adoptBtn.hasAttribute('disabled')).toBe(true);
  });

  // ── 10. Duplicate submission prevention ─────────────────────────────────────
  it('10. Duplicate submission prevention: disables action button during in-flight request and shows loading indicator', async () => {
    let resolveAdopt;
    const pendingPromise = new Promise((resolve) => {
      resolveAdopt = resolve;
    });
    const onAdoptMock = vi.fn().mockReturnValue(pendingPromise);

    render(
      <CandidateAdoptionSection
        questionId="q-100"
        runId="run-100"
        candidates={[mockCandidates[0]]}
        mutants={mockMutants}
        onAdoptCandidate={onAdoptMock}
      />
    );

    // Open modal and confirm
    fireEvent.click(screen.getByRole('button', { name: /adopt to suite/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm adoption/i }));

    // Confirm button shows loading spinner and is disabled
    const confirmBtn = screen.getByRole('button', { name: /verifying & adopting/i });
    expect(confirmBtn.hasAttribute('disabled')).toBe(true);

    // Cannot click again while in flight
    fireEvent.click(confirmBtn);
    expect(onAdoptMock).toHaveBeenCalledTimes(1);

    // Finish request
    resolveAdopt({ statusCode: 201 });
  });

  // ── 11. 409 lock conflict handling ──────────────────────────────────────────
  it('11. 409 lock conflict handling: displays conflict explanation and retry button when locked by another adoption', async () => {
    const error409 = new Error(
      'Another adoption operation is currently in progress for this question. Please wait a few seconds and retry.'
    );
    error409.status = 409;
    error409.code = 'QUESTION_LOCKED_BY_ADOPTION';

    const onAdoptMock = vi.fn().mockRejectedValueOnce(error409);

    render(
      <CandidateAdoptionSection
        questionId="q-100"
        runId="run-100"
        candidates={[mockCandidates[0]]}
        mutants={mockMutants}
        onAdoptCandidate={onAdoptMock}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /adopt to suite/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm adoption/i }));

    await waitFor(() => {
      expect(screen.getByText(/Another adoption operation is currently in progress/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /retry adoption/i })).toBeDefined();
    });
  });

  // ── 12. 422 mutant verification failure handling ────────────────────────────
  it('12. 422 mutant verification failure handling: shows mutant verification error alert', async () => {
    const error422 = new Error(
      'Verification failed: Candidate test does not kill the target mutant (mutant survived the test).'
    );
    error422.status = 422;
    error422.code = 'CANDIDATE_DOES_NOT_KILL_MUTANT';

    const onAdoptMock = vi.fn().mockRejectedValueOnce(error422);

    render(
      <CandidateAdoptionSection
        questionId="q-100"
        runId="run-100"
        candidates={[mockCandidates[0]]}
        mutants={mockMutants}
        onAdoptCandidate={onAdoptMock}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /adopt to suite/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm adoption/i }));

    await waitFor(() => {
      expect(screen.getByText(/Candidate test does not kill the target mutant/i)).toBeDefined();
    });
  });

  // ── 13. 503 infrastructure error handling ───────────────────────────────────
  it('13. 503 infrastructure error handling: shows temporary unavailable notification', async () => {
    const error503 = new Error(
      'Sandbox execution infrastructure is temporarily unavailable. Please retry shortly.'
    );
    error503.status = 503;
    error503.code = 'MUTANT_VERIFICATION_INCONCLUSIVE';

    const onAdoptMock = vi.fn().mockRejectedValueOnce(error503);

    render(
      <CandidateAdoptionSection
        questionId="q-100"
        runId="run-100"
        candidates={[mockCandidates[0]]}
        mutants={mockMutants}
        onAdoptCandidate={onAdoptMock}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /adopt to suite/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm adoption/i }));

    await waitFor(() => {
      expect(screen.getByText(/Sandbox execution infrastructure is temporarily unavailable/i)).toBeDefined();
    });
  });

  // ── 14. TestCase Studio navigation after adoption ───────────────────────────
  it('14. TestCase Studio refresh: calls onNavigateToStudio when teacher clicks View in TestCase Studio', () => {
    const onNavigateMock = vi.fn();

    render(
      <CandidateAdoptionSection
        questionId="q-100"
        runId="run-100"
        candidates={[mockCandidates[1]]} // Adopted candidate
        mutants={mockMutants}
        onNavigateToStudio={onNavigateMock}
      />
    );

    const studioLink = screen.getByRole('button', { name: /view in testcase studio/i });
    fireEvent.click(studioLink);

    expect(onNavigateMock).toHaveBeenCalledTimes(1);
  });

  // ── 15. Responsive layout & empty states ────────────────────────────────────
  it('15. Responsive layout & empty states: displays informative empty state when 0 candidates exist or filter has no matches', () => {
    const { rerender } = render(
      <CandidateAdoptionSection
        questionId="q-100"
        runId="run-100"
        candidates={[]}
        mutants={mockMutants}
      />
    );

    expect(screen.getByText(/No candidate tests found/i)).toBeDefined();
    expect(screen.getByText(/Run mutation testing to discover surviving mutants/i)).toBeDefined();

    // Search filter empty state
    rerender(
      <CandidateAdoptionSection
        questionId="q-100"
        runId="run-100"
        candidates={[mockCandidates[0]]}
        mutants={mockMutants}
      />
    );

    const searchInput = screen.getByPlaceholderText(/search candidate, mutant id/i);
    fireEvent.change(searchInput, { target: { value: 'NONEXISTENT_QUERY' } });

    expect(screen.getByText(/No candidate test cases match your active search/i)).toBeDefined();
  });

  // ── SurvivingMutantsCandidateTests component integration ───────────────────
  it('SurvivingMutantsCandidateTests: integrates adoption badges and quick-actions', () => {
    const onAdoptQuickMock = vi.fn();

    render(
      <SurvivingMutantsCandidateTests
        mutants={mockMutants}
        candidateTests={[mockCandidates[0], mockCandidates[1]]}
        onAdoptCandidate={onAdoptQuickMock}
      />
    );

    // Shows ADOPTED badge for candidate 2
    expect(screen.getByText('ADOPTED')).toBeDefined();

    // Shows Adopt button for candidate 1
    const adoptQuickBtn = screen.getByRole('button', { name: /adopt candidate/i });
    fireEvent.click(adoptQuickBtn);
    expect(onAdoptQuickMock).toHaveBeenCalled();
  });
});
