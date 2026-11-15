import { describe, it, expect, afterEach } from 'vitest';
import React, { useState, useEffect, useRef } from 'react';
import { render, act, fireEvent, cleanup } from '@testing-library/react';
import { buildFingerprintPayload } from '../fingerprintContract';

afterEach(() => {
  cleanup();
});

describe('Frontend Fingerprint Contract & Invalidation Matrix', () => {
  const baseContract = {
    referenceSolution: 'def solution(nums, target):\n    return [0, 1]\n',
    sampleInput: '[2,7,11,15], 9',
    expectedOutput: '[0, 1]',
    language: 'python',
    executionMode: 'FUNCTION',
    dataStructure: 'ARRAY',
    functionName: 'solution',
    functionSignature: {
      returnType: 'int[]',
      parameters: [
        { name: 'nums', type: 'int[]' },
        { name: 'target', type: 'int' }
      ]
    }
  };

  it('generates a stable deterministic fingerprint payload for identical inputs', () => {
    const payload1 = buildFingerprintPayload(baseContract);
    const payload2 = buildFingerprintPayload({ ...baseContract });
    expect(payload1).toBe(payload2);
  });

  it('Field 1: Changing referenceSolution produces a different payload and triggers invalidation', () => {
    const initial = buildFingerprintPayload(baseContract);
    const modified = buildFingerprintPayload({
      ...baseContract,
      referenceSolution: 'def solution(nums, target):\n    return [1, 2]\n'
    });
    expect(modified).not.toBe(initial);
  });

  it('Field 2: Changing sampleInput produces a different payload and triggers invalidation', () => {
    const initial = buildFingerprintPayload(baseContract);
    const modified = buildFingerprintPayload({
      ...baseContract,
      sampleInput: '[3,2,4], 6'
    });
    expect(modified).not.toBe(initial);
  });

  it('Field 3: Changing expectedOutput produces a different payload and triggers invalidation', () => {
    const initial = buildFingerprintPayload(baseContract);
    const modified = buildFingerprintPayload({
      ...baseContract,
      expectedOutput: '[1, 2]'
    });
    expect(modified).not.toBe(initial);
  });

  it('Field 4: Changing language produces a different payload and triggers invalidation', () => {
    const initial = buildFingerprintPayload(baseContract);
    const modified = buildFingerprintPayload({
      ...baseContract,
      language: 'javascript'
    });
    expect(modified).not.toBe(initial);
  });

  it('Field 5: Changing executionMode produces a different payload and triggers invalidation', () => {
    const initial = buildFingerprintPayload(baseContract);
    const modified = buildFingerprintPayload({
      ...baseContract,
      executionMode: 'STDIN'
    });
    expect(modified).not.toBe(initial);
  });

  it('Field 6: Changing dataStructure produces a different payload and triggers invalidation', () => {
    const initial = buildFingerprintPayload(baseContract);
    const modified = buildFingerprintPayload({
      ...baseContract,
      dataStructure: 'LINKED_LIST'
    });
    expect(modified).not.toBe(initial);
  });

  it('Field 7: Changing functionName produces a different payload and triggers invalidation', () => {
    const initial = buildFingerprintPayload(baseContract);
    const modified = buildFingerprintPayload({
      ...baseContract,
      functionName: 'twoSum'
    });
    expect(modified).not.toBe(initial);
  });

  it('Field 8a: Changing returnType in functionSignature produces a different payload and triggers invalidation', () => {
    const initial = buildFingerprintPayload(baseContract);
    const modified = buildFingerprintPayload({
      ...baseContract,
      functionSignature: {
        ...baseContract.functionSignature,
        returnType: 'void'
      }
    });
    expect(modified).not.toBe(initial);
  });

  it('Field 8b: Changing parameter types in functionSignature produces a different payload and triggers invalidation', () => {
    const initial = buildFingerprintPayload(baseContract);
    const modified = buildFingerprintPayload({
      ...baseContract,
      functionSignature: {
        ...baseContract.functionSignature,
        parameters: [
          { name: 'nums', type: 'string[]' },
          { name: 'target', type: 'int' }
        ]
      }
    });
    expect(modified).not.toBe(initial);
  });

  it('Normalizes carriage returns and whitespace without triggering false positive invalidation', () => {
    const payloadCRLF = buildFingerprintPayload({
      ...baseContract,
      referenceSolution: 'def solution(nums, target):\r\n    return [0, 1]\r\n'
    });
    const payloadLF = buildFingerprintPayload({
      ...baseContract,
      referenceSolution: 'def solution(nums, target):\n    return [0, 1]\n'
    });
    expect(payloadCRLF).toBe(payloadLF);
  });
});

// =========================================================================
// COMPONENT-LEVEL REACT STATE INVALIDATION TEST SUITE
// =========================================================================
const SampleValidationStateHarness = ({ initialQuestion, onStateChange }) => {
  const [referenceSolution, setReferenceSolution] = useState(initialQuestion?.referenceSolution || '');
  const [examples, setExamples] = useState(initialQuestion?.examples || [{ input: '', output: '' }]);
  const [language, setLanguage] = useState(initialQuestion?.language || 'python');
  const [executionMode, setExecutionMode] = useState(initialQuestion?.executionMode || 'FUNCTION');
  const [dataStructure, setDataStructure] = useState(initialQuestion?.dataStructure || 'ARRAY');
  const [functionName, setFunctionName] = useState(initialQuestion?.functionName || 'solution');
  const [returnType, setReturnType] = useState(initialQuestion?.returnType || 'int');

  const [sampleTestVerified, setSampleTestVerified] = useState(Boolean(initialQuestion?.sampleValidationFingerprint));
  const [validationToken, setValidationToken] = useState(initialQuestion?.validationToken || null);
  const [draftId, setDraftId] = useState(initialQuestion?.draftId || null);
  const [sampleValidationResult, setSampleValidationResult] = useState(initialQuestion?.sampleValidationResult || null);

  const currentFingerprintPayload = buildFingerprintPayload({
    referenceSolution,
    sampleInput: examples[0]?.input || '',
    expectedOutput: examples[0]?.output || '',
    language,
    executionMode,
    dataStructure,
    functionName,
    functionSignature: {
      returnType,
      parameters: []
    }
  });

  const lastVerifiedFingerprintPayloadRef = useRef(
    initialQuestion?.sampleValidationFingerprint ? currentFingerprintPayload : null
  );

  // Exact invalidation logic from QuestionCreatorView.jsx:
  useEffect(() => {
    if (
      lastVerifiedFingerprintPayloadRef.current !== null &&
      lastVerifiedFingerprintPayloadRef.current !== currentFingerprintPayload
    ) {
      setSampleTestVerified(false);
      setValidationToken(null);
      setDraftId(null);
      setSampleValidationResult(null);
      lastVerifiedFingerprintPayloadRef.current = null;
    }
  }, [currentFingerprintPayload]);

  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        sampleTestVerified,
        validationToken,
        draftId,
        sampleValidationResult
      });
    }
  }, [sampleTestVerified, validationToken, draftId, sampleValidationResult]);

  return (
    <div>
      <span data-testid="verified">{String(sampleTestVerified)}</span>
      <span data-testid="token">{String(validationToken)}</span>
      <span data-testid="draft">{String(draftId)}</span>
      <button data-testid="change-ref-sol" onClick={() => setReferenceSolution('def solution(x): return x + 1')} />
      <button data-testid="change-sample-in" onClick={() => setExamples([{ input: '100', output: examples[0]?.output }])} />
      <button data-testid="change-sample-out" onClick={() => setExamples([{ input: examples[0]?.input, output: '200' }])} />
      <button data-testid="change-lang" onClick={() => setLanguage('javascript')} />
      <button data-testid="change-mode" onClick={() => setExecutionMode('STDIN')} />
      <button data-testid="change-ds" onClick={() => setDataStructure('LINKED_LIST')} />
      <button data-testid="change-fn" onClick={() => setFunctionName('solveMe')} />
      <button data-testid="change-ret" onClick={() => setReturnType('void')} />
    </div>
  );
};

describe('Component-Level React State Invalidation (QuestionCreatorView)', () => {
  const getInitialProps = () => ({
    referenceSolution: 'def solution(x): return x',
    examples: [{ input: '5', output: '5' }],
    language: 'python',
    executionMode: 'FUNCTION',
    dataStructure: 'ARRAY',
    functionName: 'solution',
    returnType: 'int',
    sampleValidationFingerprint: 'existing-verified-fp-12345',
    validationToken: 'valid-signed-token-xyz',
    draftId: 'draft-uuid-9999'
  });

  it('initially mounts in verified state with token and draftId', () => {
    let currentState;
    const { getByTestId } = render(
      <SampleValidationStateHarness
        initialQuestion={getInitialProps()}
        onStateChange={(s) => { currentState = s; }}
      />
    );

    expect(getByTestId('verified').textContent).toBe('true');
    expect(getByTestId('token').textContent).toBe('valid-signed-token-xyz');
    expect(getByTestId('draft').textContent).toBe('draft-uuid-9999');
    expect(currentState.sampleTestVerified).toBe(true);
    expect(currentState.validationToken).toBe('valid-signed-token-xyz');
    expect(currentState.draftId).toBe('draft-uuid-9999');
  });

  it('Field 1: Editing referenceSolution clears sampleTestVerified, validationToken, and draftId', () => {
    let currentState;
    const { getByTestId } = render(
      <SampleValidationStateHarness
        initialQuestion={getInitialProps()}
        onStateChange={(s) => { currentState = s; }}
      />
    );

    act(() => {
      fireEvent.click(getByTestId('change-ref-sol'));
    });

    expect(getByTestId('verified').textContent).toBe('false');
    expect(getByTestId('token').textContent).toBe('null');
    expect(getByTestId('draft').textContent).toBe('null');
    expect(currentState.sampleTestVerified).toBe(false);
    expect(currentState.validationToken).toBeNull();
    expect(currentState.draftId).toBeNull();
  });

  it('Field 2: Editing sampleInput clears sampleTestVerified, validationToken, and draftId', () => {
    let currentState;
    const { getByTestId } = render(
      <SampleValidationStateHarness
        initialQuestion={getInitialProps()}
        onStateChange={(s) => { currentState = s; }}
      />
    );

    act(() => {
      fireEvent.click(getByTestId('change-sample-in'));
    });

    expect(getByTestId('verified').textContent).toBe('false');
    expect(getByTestId('token').textContent).toBe('null');
    expect(getByTestId('draft').textContent).toBe('null');
    expect(currentState.sampleTestVerified).toBe(false);
    expect(currentState.validationToken).toBeNull();
    expect(currentState.draftId).toBeNull();
  });

  it('Field 3: Editing expectedOutput clears sampleTestVerified, validationToken, and draftId', () => {
    let currentState;
    const { getByTestId } = render(
      <SampleValidationStateHarness
        initialQuestion={getInitialProps()}
        onStateChange={(s) => { currentState = s; }}
      />
    );

    act(() => {
      fireEvent.click(getByTestId('change-sample-out'));
    });

    expect(getByTestId('verified').textContent).toBe('false');
    expect(getByTestId('token').textContent).toBe('null');
    expect(getByTestId('draft').textContent).toBe('null');
    expect(currentState.sampleTestVerified).toBe(false);
    expect(currentState.validationToken).toBeNull();
    expect(currentState.draftId).toBeNull();
  });

  it('Field 4: Editing language clears sampleTestVerified, validationToken, and draftId', () => {
    let currentState;
    const { getByTestId } = render(
      <SampleValidationStateHarness
        initialQuestion={getInitialProps()}
        onStateChange={(s) => { currentState = s; }}
      />
    );

    act(() => {
      fireEvent.click(getByTestId('change-lang'));
    });

    expect(getByTestId('verified').textContent).toBe('false');
    expect(getByTestId('token').textContent).toBe('null');
    expect(getByTestId('draft').textContent).toBe('null');
    expect(currentState.sampleTestVerified).toBe(false);
    expect(currentState.validationToken).toBeNull();
    expect(currentState.draftId).toBeNull();
  });

  it('Field 5: Editing executionMode clears sampleTestVerified, validationToken, and draftId', () => {
    let currentState;
    const { getByTestId } = render(
      <SampleValidationStateHarness
        initialQuestion={getInitialProps()}
        onStateChange={(s) => { currentState = s; }}
      />
    );

    act(() => {
      fireEvent.click(getByTestId('change-mode'));
    });

    expect(getByTestId('verified').textContent).toBe('false');
    expect(getByTestId('token').textContent).toBe('null');
    expect(getByTestId('draft').textContent).toBe('null');
    expect(currentState.sampleTestVerified).toBe(false);
    expect(currentState.validationToken).toBeNull();
    expect(currentState.draftId).toBeNull();
  });

  it('Field 6: Editing dataStructure clears sampleTestVerified, validationToken, and draftId', () => {
    let currentState;
    const { getByTestId } = render(
      <SampleValidationStateHarness
        initialQuestion={getInitialProps()}
        onStateChange={(s) => { currentState = s; }}
      />
    );

    act(() => {
      fireEvent.click(getByTestId('change-ds'));
    });

    expect(getByTestId('verified').textContent).toBe('false');
    expect(getByTestId('token').textContent).toBe('null');
    expect(getByTestId('draft').textContent).toBe('null');
    expect(currentState.sampleTestVerified).toBe(false);
    expect(currentState.validationToken).toBeNull();
    expect(currentState.draftId).toBeNull();
  });

  it('Field 7: Editing functionName clears sampleTestVerified, validationToken, and draftId', () => {
    let currentState;
    const { getByTestId } = render(
      <SampleValidationStateHarness
        initialQuestion={getInitialProps()}
        onStateChange={(s) => { currentState = s; }}
      />
    );

    act(() => {
      fireEvent.click(getByTestId('change-fn'));
    });

    expect(getByTestId('verified').textContent).toBe('false');
    expect(getByTestId('token').textContent).toBe('null');
    expect(getByTestId('draft').textContent).toBe('null');
    expect(currentState.sampleTestVerified).toBe(false);
    expect(currentState.validationToken).toBeNull();
    expect(currentState.draftId).toBeNull();
  });

  it('Field 8: Editing returnType in functionSignature clears sampleTestVerified, validationToken, and draftId', () => {
    let currentState;
    const { getByTestId } = render(
      <SampleValidationStateHarness
        initialQuestion={getInitialProps()}
        onStateChange={(s) => { currentState = s; }}
      />
    );

    act(() => {
      fireEvent.click(getByTestId('change-ret'));
    });

    expect(getByTestId('verified').textContent).toBe('false');
    expect(getByTestId('token').textContent).toBe('null');
    expect(getByTestId('draft').textContent).toBe('null');
    expect(currentState.sampleTestVerified).toBe(false);
    expect(currentState.validationToken).toBeNull();
    expect(currentState.draftId).toBeNull();
  });
});
