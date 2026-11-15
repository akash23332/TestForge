/**
 * Canonical 8-field fingerprint contract representation.
 * Must match the backend computeSampleValidationFingerprint contract exactly.
 *
 * Protected fields:
 * 1. referenceSolution
 * 2. sampleInput (examples[0]?.input)
 * 3. expectedOutput (examples[0]?.output)
 * 4. language
 * 5. executionMode
 * 6. dataStructure
 * 7. functionName
 * 8. functionSignature (returnType and parameters)
 */
export const buildFingerprintPayload = ({
  referenceSolution = '',
  sampleInput = '',
  expectedOutput = '',
  language = 'python',
  executionMode = 'FUNCTION',
  dataStructure = 'NONE',
  functionName = 'solution',
  functionSignature = {}
} = {}) => {
  const normSol = String(referenceSolution || '').replace(/\r\n/g, '\n').trim();
  const normIn = String(sampleInput || '').replace(/\r\n/g, '\n').trim();
  const normOut = String(expectedOutput || '').replace(/\r\n/g, '\n').trim();
  const normLang = String(language || 'python').toLowerCase().trim();
  const normMode = String(executionMode || 'FUNCTION').toUpperCase().trim();
  const rawDS = String(dataStructure || '').toUpperCase().trim();
  const normDS = normMode === 'STDIN' ? 'NONE' : (rawDS && rawDS !== 'NONE' ? rawDS : 'ARRAY');
  const normFn = String(functionName || 'solution').trim();

  const params = Array.isArray(functionSignature?.parameters)
    ? functionSignature.parameters.map((p) => `${p.name}:${p.type}`).sort().join(',')
    : '';
  const retType = String(functionSignature?.returnType || 'void').trim();
  const sigKey = `${params}->${retType}`;

  return `${normSol}::${normIn}::${normOut}::${normLang}::${normMode}::${normDS}::${normFn}::${sigKey}`;
};
