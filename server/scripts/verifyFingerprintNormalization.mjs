import crypto from 'crypto';
import { computeSampleValidationFingerprint } from '../src/services/sampleValidation.service.js';
import { buildFingerprintPayload } from '../../client/src/features/questions/fingerprintContract.js';

function check(name, pass, details = {}) {
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}`, details);
  if (!pass) throw new Error(`Assertion failed: ${name}`);
}

console.log('=== Fingerprint Normalization & Semantics Verification ===\n');

// 1. Exact match between Frontend payload SHA-256 and Backend Fingerprint
const testContract = {
  referenceSolution: 'def solution(x):\n    if x > 0:\n        return x * 2\n    return 0\n',
  sampleInput: '5\n',
  expectedOutput: '10\n',
  language: 'python',
  executionMode: 'FUNCTION',
  dataStructure: 'ARRAY',
  functionName: 'solution',
  functionSignature: {
    returnType: 'int',
    parameters: [{ name: 'x', type: 'int' }]
  }
};

const backendFp = computeSampleValidationFingerprint(testContract);
const frontendPayload = buildFingerprintPayload(testContract);
const frontendHash = crypto.createHash('sha256').update(frontendPayload).digest('hex');

check('Frontend payload SHA-256 matches Backend computeSampleValidationFingerprint identically',
  backendFp === frontendHash,
  { backendFp, frontendHash }
);

// 2. CRLF vs LF normalization
const crlfContract = {
  ...testContract,
  referenceSolution: 'def solution(x):\r\n    if x > 0:\r\n        return x * 2\r\n    return 0\r\n',
  sampleInput: '5\r\n',
  expectedOutput: '10\r\n'
};

const crlfFp = computeSampleValidationFingerprint(crlfContract);
check('CRLF vs LF produces identical fingerprint across OS line ending variations',
  crlfFp === backendFp,
  { crlfFp, backendFp }
);

// 3. Python Indentation Preservation (Semantic Whitespace)
const differentIndentSol = 'def solution(x):\n    if x > 0:\n        return x * 2\n        return 0\n'; // syntax/semantic indentation change
const differentIndentFp = computeSampleValidationFingerprint({
  ...testContract,
  referenceSolution: differentIndentSol
});

check('Python indentation change produces different fingerprint (whitespace preserved)',
  differentIndentFp !== backendFp,
  { differentIndentFp, backendFp }
);

// 4. Code internal spaces and semantics
const extraSpaceInsideSol = 'def solution(x):\n    if x  > 0:\n        return x * 2\n    return 0\n';
const extraSpaceFp = computeSampleValidationFingerprint({
  ...testContract,
  referenceSolution: extraSpaceInsideSol
});

check('Internal code whitespace changes produce different fingerprint',
  extraSpaceFp !== backendFp,
  { extraSpaceFp, backendFp }
);

// 5. JavaScript / Java / C++ code semantics
const jsContract = {
  referenceSolution: 'function solution(nums) {\n  return nums.map(x => x * 2);\n}',
  sampleInput: '[1, 2, 3]',
  expectedOutput: '[2, 4, 6]',
  language: 'javascript',
  executionMode: 'FUNCTION',
  dataStructure: 'ARRAY',
  functionName: 'solution',
  functionSignature: { returnType: 'int[]', parameters: [{ name: 'nums', type: 'int[]' }] }
};

const jsFp = computeSampleValidationFingerprint(jsContract);
const jsFrontendPayload = buildFingerprintPayload(jsContract);
const jsFrontendHash = crypto.createHash('sha256').update(jsFrontendPayload).digest('hex');

check('JavaScript contract produces identical hash frontend vs backend',
  jsFp === jsFrontendHash,
  { jsFp, jsFrontendHash }
);

// 6. Each of the 8 fields independently causes fingerprint divergence
const fields = [
  ['referenceSolution', 'def solution(x): return x'],
  ['sampleInput', '99'],
  ['expectedOutput', '198'],
  ['language', 'javascript'],
  ['executionMode', 'STDIN'],
  ['dataStructure', 'LINKED_LIST'],
  ['functionName', 'customSolution'],
  ['functionSignature', { returnType: 'void', parameters: [] }]
];

for (const [field, newVal] of fields) {
  const alteredContract = { ...testContract, [field]: newVal };
  const alteredFp = computeSampleValidationFingerprint(alteredContract);
  check(`Field alteration [${field}] alters fingerprint`,
    alteredFp !== backendFp,
    { field }
  );
}

console.log('\nAll 12 Fingerprint Normalization & Semantics checks passed!');
