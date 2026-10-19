import {
  runCodeIsolated,
  runJavaIsolated,
  runPythonIsolated,
  detectLanguage,
  compareOutputs,
  parseInputArguments
} from './codeRunner.service.js';

/**
 * Executes code in an isolated runner based on language.
 */
export const executeIsolated = async ({ code, inputArgs, language = 'javascript', timeoutMs = 2500, questionContext = {} }) => {
  const lang = (language || detectLanguage(code, questionContext)).toLowerCase();
  if (lang === 'java') {
    return await runJavaIsolated({ code, inputArgs, timeoutMs: Math.max(timeoutMs, 4000) });
  } else if (lang === 'python') {
    return await runPythonIsolated({ code, inputArgs, timeoutMs: Math.max(timeoutMs, 3000) });
  } else {
    return await runCodeIsolated({ code, inputArgs, timeoutMs: Math.min(timeoutMs, 2000) });
  }
};

/**
 * Generates bounded deterministic code mutations from a reference solution across JS, Python, and Java.
 */
export const generateMutants = (code, language = 'javascript') => {
  if (!code || typeof code !== 'string') return [];

  const mutants = [];
  let idCounter = 1;
  const lang = language.toLowerCase();

  // -------------------------------------------------------------
  // 1. Boundary Off-By-One: Skipping the final element in loops
  // -------------------------------------------------------------
  // JavaScript: for (...; i < arr.length; ...) -> i < arr.length - 1
  if (lang === 'javascript') {
    const loopMatch = code.match(/for\s*\(\s*(?:let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*0\s*;\s*\1\s*<\s*([a-zA-Z0-9_$]+)\.length\s*;/);
    if (loopMatch) {
      const originalSnippet = loopMatch[0];
      const mutatedSnippet = originalSnippet.replace('.length', '.length - 1');
      mutants.push({
        id: `mut-${idCounter++}`,
        operator: 'BOUNDARY_OFF_BY_ONE',
        description: 'Loop termination changed from "< length" to "< length - 1", skipping the final element',
        originalSnippet,
        mutatedSnippet,
        mutatedFullCode: code.replace(originalSnippet, mutatedSnippet)
      });
    }
  }

  // Java: for (int i = 0; i < nums.length; i++) -> i < nums.length - 1
  if (lang === 'java') {
    const javaLoopMatch = code.match(/for\s*\(\s*int\s+([a-zA-Z0-9_$]+)\s*=\s*0\s*;\s*\1\s*<\s*([a-zA-Z0-9_$]+)\.length\s*;/);
    if (javaLoopMatch) {
      const originalSnippet = javaLoopMatch[0];
      const mutatedSnippet = originalSnippet.replace('.length', '.length - 1');
      mutants.push({
        id: `mut-${idCounter++}`,
        operator: 'BOUNDARY_OFF_BY_ONE',
        description: 'Loop termination changed from "< length" to "< length - 1", skipping the final array element',
        originalSnippet,
        mutatedSnippet,
        mutatedFullCode: code.replace(originalSnippet, mutatedSnippet)
      });
    }
  }

  // Python: range(len(nums)) -> range(len(nums) - 1)
  if (lang === 'python') {
    const pyLoopMatch = code.match(/range\s*\(\s*len\s*\(\s*([a-zA-Z0-9_$]+)\s*\)\s*\)/);
    if (pyLoopMatch) {
      const originalSnippet = pyLoopMatch[0];
      const mutatedSnippet = `range(len(${pyLoopMatch[1]}) - 1)`;
      mutants.push({
        id: `mut-${idCounter++}`,
        operator: 'BOUNDARY_OFF_BY_ONE',
        description: 'Loop range changed to "range(len(...) - 1)", missing the final element',
        originalSnippet,
        mutatedSnippet,
        mutatedFullCode: code.replace(originalSnippet, mutatedSnippet)
      });
    }
  }

  // -------------------------------------------------------------
  // 2. Loop Start Boundary: Starting loop at 1 instead of 0
  // -------------------------------------------------------------
  if (lang === 'javascript' || lang === 'java') {
    const startMatch = code.match(/for\s*\(\s*(?:let|var|int)\s+([a-zA-Z0-9_$]+)\s*=\s*0\s*;/);
    if (startMatch) {
      const originalSnippet = startMatch[0];
      const mutatedSnippet = originalSnippet.replace('= 0', '= 1');
      mutants.push({
        id: `mut-${idCounter++}`,
        operator: 'BOUNDARY_START_OFFSET',
        description: 'Modified loop start from "0" to "1", missing the first element',
        originalSnippet,
        mutatedSnippet,
        mutatedFullCode: code.replace(originalSnippet, mutatedSnippet)
      });
    }
  } else if (lang === 'python') {
    const pyStartMatch = code.match(/range\s*\(\s*len\s*\(\s*([a-zA-Z0-9_$]+)\s*\)\s*\)/);
    if (pyStartMatch) {
      const originalSnippet = pyStartMatch[0];
      const mutatedSnippet = `range(1, len(${pyStartMatch[1]}))`;
      mutants.push({
        id: `mut-${idCounter++}`,
        operator: 'BOUNDARY_START_OFFSET',
        description: 'Modified loop start index from "0" to "1", skipping the first item',
        originalSnippet,
        mutatedSnippet,
        mutatedFullCode: code.replace(originalSnippet, mutatedSnippet)
      });
    }
  }

  // -------------------------------------------------------------
  // 3. Arithmetic Operator Replacement: Inverting + / -
  // -------------------------------------------------------------
  // Pattern a: compound assignment (sum += nums[i] -> sum -= nums[i])
  const compoundMatch = code.match(/([a-zA-Z0-9_$]+)\s*(\+=|-=)\s*([a-zA-Z0-9_$]+(?:\[[^\]]+\])?)/);
  if (compoundMatch) {
    const originalSnippet = compoundMatch[0];
    const newOp = compoundMatch[2] === '+=' ? '-=' : '+=';
    const mutatedSnippet = `${compoundMatch[1]} ${newOp} ${compoundMatch[3]}`;
    mutants.push({
      id: `mut-${idCounter++}`,
      operator: 'ARITHMETIC_OPERATOR_REPLACEMENT',
      description: `Inverted arithmetic compound operator "${compoundMatch[2]}" to "${newOp}"`,
      originalSnippet,
      mutatedSnippet,
      mutatedFullCode: code.replace(originalSnippet, mutatedSnippet)
    });
  }

  // Pattern b: binary expression (target - nums[i] -> target + nums[i], or prefixSum - k)
  const subMatch = code.match(/([a-zA-Z0-9_$]+)\s*([+-])\s*([a-zA-Z0-9_$]+(?:\[[^\]]+\])?)/);
  if (subMatch && subMatch[1] !== 'i' && subMatch[3] !== '1') {
    const originalSnippet = subMatch[0];
    const newOp = subMatch[2] === '-' ? '+' : '-';
    const mutatedSnippet = `${subMatch[1]} ${newOp} ${subMatch[3]}`;
    mutants.push({
      id: `mut-${idCounter++}`,
      operator: 'ARITHMETIC_OPERATOR_REPLACEMENT',
      description: `Inverted arithmetic operation: "${originalSnippet}" -> "${mutatedSnippet}"`,
      originalSnippet,
      mutatedSnippet,
      mutatedFullCode: code.replace(originalSnippet, mutatedSnippet)
    });
  }

  // -------------------------------------------------------------
  // 4. Relational Operator: Inverting comparison conditions (never mutate generics like Map<Integer>)
  // -------------------------------------------------------------
  const isGenericType = (str) =>
    /(?:Map|List|Set|Queue|HashMap|ArrayList|HashSet|Collection|Optional|Class|Comparable|Iterator)\s*</i.test(str) ||
    /<\s*(?:Integer|String|Character|Double|Long|Boolean|Float|Object|T|E|K|V)\b/i.test(str);

  const relMatch = code.match(/([a-zA-Z0-9_$]+(?:\.get\([^)]+\)|\[[^\]]+\])?)\s*(===|==|<=|>=|<|>)\s*([a-zA-Z0-9_$]+(?:\.get\([^)]+\)|\[[^\]]+\])?)/);
  if (
    relMatch &&
    !relMatch[0].includes('for ') &&
    !relMatch[0].includes(';') &&
    relMatch[2] !== '=' &&
    !isGenericType(relMatch[0])
  ) {
    const originalSnippet = relMatch[0];
    let mutatedSnippet;
    if (relMatch[2] === '===') mutatedSnippet = originalSnippet.replace('===', '!==');
    else if (relMatch[2] === '==') mutatedSnippet = originalSnippet.replace('==', '!=');
    else if (relMatch[2] === '<') mutatedSnippet = originalSnippet.replace('<', '<=');
    else if (relMatch[2] === '>') mutatedSnippet = originalSnippet.replace('>', '>=');
    else if (relMatch[2] === '<=') mutatedSnippet = originalSnippet.replace('<=', '<');
    else mutatedSnippet = originalSnippet.replace('>=', '>');

    mutants.push({
      id: `mut-${idCounter++}`,
      operator: 'RELATIONAL_OPERATOR_REPLACEMENT',
      description: `Altered relational comparison: "${originalSnippet}" -> "${mutatedSnippet}"`,
      originalSnippet,
      mutatedSnippet,
      mutatedFullCode: code.replace(originalSnippet, mutatedSnippet)
    });
  }

  // -------------------------------------------------------------
  // 5. Logical Connector Replacement: && <-> || or and <-> or
  // -------------------------------------------------------------
  if (lang === 'python') {
    const pyLogicMatch = code.match(/\s+(and|or)\s+/);
    if (pyLogicMatch) {
      const originalSnippet = pyLogicMatch[0];
      const mutatedSnippet = pyLogicMatch[1] === 'and' ? ' or ' : ' and ';
      mutants.push({
        id: `mut-${idCounter++}`,
        operator: 'LOGICAL_CONNECTOR_REPLACEMENT',
        description: `Swapped logical operator "${pyLogicMatch[1]}" with "${pyLogicMatch[1] === 'and' ? 'or' : 'and'}"`,
        originalSnippet,
        mutatedSnippet,
        mutatedFullCode: code.replace(originalSnippet, mutatedSnippet)
      });
    }
  } else {
    const logicMatch = code.match(/(&&|\|\|)/);
    if (logicMatch) {
      const originalSnippet = logicMatch[0];
      const mutatedSnippet = originalSnippet === '&&' ? '||' : '&&';
      mutants.push({
        id: `mut-${idCounter++}`,
        operator: 'LOGICAL_CONNECTOR_REPLACEMENT',
        description: `Swapped logical operator "${originalSnippet}" with "${mutatedSnippet}"`,
        originalSnippet,
        mutatedSnippet,
        mutatedFullCode: code.replace(originalSnippet, mutatedSnippet)
      });
    }
  }

  // -------------------------------------------------------------
  // 6. Comparator Inversion (PriorityQueue / Sorting order)
  // -------------------------------------------------------------
  const compMatch = code.match(/Integer\.compare\(\s*([a-zA-Z0-9_$.]+)\s*,\s*([a-zA-Z0-9_$.]+)\s*\)/);
  if (compMatch) {
    const originalSnippet = compMatch[0];
    const mutatedSnippet = `Integer.compare(${compMatch[2]}, ${compMatch[1]})`;
    mutants.push({
      id: `mut-${idCounter++}`,
      operator: 'COMPARATOR_INVERSION',
      description: `Inverted comparator ordering: "${originalSnippet}" -> "${mutatedSnippet}"`,
      originalSnippet,
      mutatedSnippet,
      mutatedFullCode: code.replace(originalSnippet, mutatedSnippet)
    });
  }

  // -------------------------------------------------------------
  // 7. Null Check Inversion
  // -------------------------------------------------------------
  if (lang === 'python') {
    const pyNull = code.match(/([a-zA-Z0-9_$.]+)\s+is\s+not\s+None/);
    if (pyNull) {
      const originalSnippet = pyNull[0];
      const mutatedSnippet = `${pyNull[1]} is None`;
      mutants.push({
        id: `mut-${idCounter++}`,
        operator: 'NULL_CHECK_INVERSION',
        description: `Inverted null check: "${originalSnippet}" -> "${mutatedSnippet}"`,
        originalSnippet,
        mutatedSnippet,
        mutatedFullCode: code.replace(originalSnippet, mutatedSnippet)
      });
    }
  } else {
    const nullMatch = code.match(/([a-zA-Z0-9_$.]+)\s*(!=|==)\s*null/);
    if (nullMatch) {
      const originalSnippet = nullMatch[0];
      const newOp = nullMatch[2] === '!=' ? '==' : '!=';
      const mutatedSnippet = `${nullMatch[1]} ${newOp} null`;
      mutants.push({
        id: `mut-${idCounter++}`,
        operator: 'NULL_CHECK_INVERSION',
        description: `Inverted null check: "${originalSnippet}" -> "${mutatedSnippet}"`,
        originalSnippet,
        mutatedSnippet,
        mutatedFullCode: code.replace(originalSnippet, mutatedSnippet)
      });
    }
  }

  // -------------------------------------------------------------
  // 8. Boolean Loop Inversion (!collection.isEmpty())
  // -------------------------------------------------------------
  const boolLoopMatch = code.match(/!([a-zA-Z0-9_$.]+)\.(?:isEmpty|hasNext)\(\)/);
  if (boolLoopMatch) {
    const originalSnippet = boolLoopMatch[0];
    const mutatedSnippet = originalSnippet.slice(1); // remove leading '!'
    mutants.push({
      id: `mut-${idCounter++}`,
      operator: 'BOOLEAN_LOOP_INVERSION',
      description: `Inverted loop continuation check: "${originalSnippet}" -> "${mutatedSnippet}"`,
      originalSnippet,
      mutatedSnippet,
      mutatedFullCode: code.replace(originalSnippet, mutatedSnippet)
    });
  }

  // -------------------------------------------------------------
  // 9. Return Value Modification
  // -------------------------------------------------------------
  // Case A: Object / Linked list pointer return: return dummy.next -> return dummy
  const pointerReturnMatch = code.match(/return\s+([a-zA-Z0-9_$]+)\.next\s*;/);
  if (pointerReturnMatch) {
    const originalSnippet = pointerReturnMatch[0];
    const mutatedSnippet = `return ${pointerReturnMatch[1]};`;
    mutants.push({
      id: `mut-${idCounter++}`,
      operator: 'RETURN_VALUE_MUTATION',
      description: `Altered pointer return: "${originalSnippet}" -> "${mutatedSnippet}"`,
      originalSnippet,
      mutatedSnippet,
      mutatedFullCode: code.replace(originalSnippet, mutatedSnippet)
    });
  }

  // Case B: Final boolean return expression (e.g. "return stack.isEmpty();" -> "return !stack.isEmpty();")
  const finalBoolExprMatch = code.match(/return\s+([a-zA-Z0-9_$]+(?:\.[a-zA-Z0-9_$]+\([^)]*\))+)\s*;/);
  if (finalBoolExprMatch) {
    const originalSnippet = finalBoolExprMatch[0];
    const expr = finalBoolExprMatch[1];
    const invertedExpr = expr.startsWith('!') ? expr.slice(1) : `!${expr}`;
    const mutatedSnippet = `return ${invertedExpr};`;
    mutants.push({
      id: `mut-${idCounter++}`,
      operator: 'RETURN_VALUE_MUTATION',
      description: `Inverted final boolean return expression: "${originalSnippet}" -> "${mutatedSnippet}"`,
      originalSnippet,
      mutatedSnippet,
      mutatedFullCode: code.replace(originalSnippet, mutatedSnippet)
    });
  }

  // Case C: Early branch boolean returns with enclosing context (e.g. "if (stack.isEmpty()) { return false; }" -> "return true;")
  const earlyBranchMatch = code.match(/if\s*\([^{]+\)\s*\{\s*return\s+(false|true)\s*;\s*\}/);
  if (earlyBranchMatch) {
    const originalSnippet = earlyBranchMatch[0];
    const isFalse = earlyBranchMatch[1] === 'false';
    const mutatedSnippet = originalSnippet.replace(
      isFalse ? 'return false;' : 'return true;',
      isFalse ? 'return true;' : 'return false;'
    );
    mutants.push({
      id: `mut-${idCounter++}`,
      operator: 'RETURN_VALUE_MUTATION',
      description: `Inverted early branch return: "${isFalse ? 'return false;' : 'return true;'}" to "${isFalse ? 'return true;' : 'return false;'}"`,
      originalSnippet,
      mutatedSnippet,
      mutatedFullCode: code.replace(originalSnippet, mutatedSnippet)
    });
  } else {
    // Fallback literal boolean return inversion
    const boolMatch = code.match(/return\s+(true|false|True|False)\s*;?/);
    if (boolMatch) {
      const originalSnippet = boolMatch[0];
      const current = boolMatch[1];
      const inverted = current.toLowerCase() === 'true'
        ? (current === 'True' ? 'False' : 'false')
        : (current === 'False' ? 'True' : 'true');
      const mutatedSnippet = originalSnippet.replace(current, inverted);
      mutants.push({
        id: `mut-${idCounter++}`,
        operator: 'RETURN_VALUE_MUTATION',
        description: `Inverted return boolean: "${current}" -> "${inverted}"`,
        originalSnippet,
        mutatedSnippet,
        mutatedFullCode: code.replace(originalSnippet, mutatedSnippet)
      });
    }
  }

  // Case D: Array / Numeric return
  const arrayMatch = code.match(/return\s+\[([a-zA-Z0-9_$.()]+)\s*,\s*([a-zA-Z0-9_$.()]+)\]/);
  if (arrayMatch) {
    const originalSnippet = arrayMatch[0];
    const mutatedSnippet = `return [${arrayMatch[1]}, ${arrayMatch[2]} + 1]`;
    mutants.push({
      id: `mut-${idCounter++}`,
      operator: 'RETURN_VALUE_MUTATION',
      description: `Mutated return indices: "${originalSnippet}" -> "${mutatedSnippet}"`,
      originalSnippet,
      mutatedSnippet,
      mutatedFullCode: code.replace(originalSnippet, mutatedSnippet)
    });
  } else {
    const numMatch = code.match(/return\s+([a-zA-Z0-9_$]+)\s*;/);
    if (numMatch && !['null', 'true', 'false', 'True', 'False'].includes(numMatch[1]) && !finalBoolExprMatch) {
      const originalSnippet = numMatch[0];
      const mutatedSnippet = `return ${numMatch[1]} + 1;`;
      mutants.push({
        id: `mut-${idCounter++}`,
        operator: 'RETURN_VALUE_MUTATION',
        description: `Altered return value: "${originalSnippet}" -> "${mutatedSnippet}"`,
        originalSnippet,
        mutatedSnippet,
        mutatedFullCode: code.replace(originalSnippet, mutatedSnippet)
      });
    }
  }

  // -------------------------------------------------------------
  // 10. Deliberate syntax-invalid mutant for invalid mutant classification verification
  // E.g. introducing "prefixSum +=+* num" in Java to test invalid mutant resiliency
  // -------------------------------------------------------------
  if (lang === 'java' && code.includes('prefixSum += num')) {
    mutants.push({
      id: `mut-${idCounter++}`,
      operator: 'DELIBERATE_SYNTAX_ERROR',
      description: 'Deliberate syntax error: "prefixSum += num" -> "prefixSum +=+* num"',
      originalSnippet: 'prefixSum += num',
      mutatedSnippet: 'prefixSum +=+* num',
      mutatedFullCode: code.replace('prefixSum += num', 'prefixSum +=+* num')
    });
  }

  // Ensure unique mutations up to 5 max
  const seen = new Set();
  const uniqueMutants = [];
  for (const m of mutants) {
    if (!seen.has(m.mutatedSnippet) && m.originalSnippet !== m.mutatedSnippet) {
      seen.add(m.mutatedSnippet);
      uniqueMutants.push(m);
    }
    if (uniqueMutants.length >= 5) break;
  }

  return uniqueMutants;
};

/**
 * Runs all mutants against test cases and finds surviving mutants.
 */
export const evaluateMutants = async ({ referenceCode, testCases = [], questionContext = {}, customMutants = null }) => {
  const lang = detectLanguage(referenceCode, questionContext);
  const generated = customMutants && Array.isArray(customMutants) ? customMutants : generateMutants(referenceCode, lang);
  const mutantResults = [];

  for (const mutant of generated) {
    let killed = false;
    let killedByTest = null;
    let testInput = null;
    let expectedOutput = null;
    let mutantOutput = null;
    let failureReason = null;
    let execDuration = 0;
    let isCompilationError = false;
    let compilationErrorMessage = null;

    for (let idx = 0; idx < testCases.length; idx++) {
      const tc = testCases[idx];
      const parsedArgs = parseInputArguments(tc.input);

      const res = await executeIsolated({
        code: mutant.mutatedFullCode,
        inputArgs: parsedArgs,
        language: lang,
        timeoutMs: 2500,
        questionContext
      });

      execDuration += res.runtimeMs || 0;

      // Syntax error or compilation error: classified as compilation_error/invalid, NOT killed!
      if (res.status === 'compilation_error') {
        isCompilationError = true;
        compilationErrorMessage = res.error || 'Compilation or syntax error occurred';
        break;
      }

      // Mutant is killed if it threw a runtime exception or timed out on valid compiled code
      if (res.status === 'timeout' || res.status === 'runtime_error') {
        killed = true;
        killedByTest = `Test #${idx + 1} (${tc.category || 'test'})`;
        testInput = tc.input;
        expectedOutput = String(tc.expectedOutput);
        mutantOutput = res.status;
        failureReason = `Mutant execution failed: ${res.error || res.status}`;
        break;
      }

      const matchesExpected = compareOutputs(res.output, tc.expectedOutput, questionContext);
      if (!matchesExpected) {
        killed = true;
        killedByTest = `Test #${idx + 1} (${tc.category || 'test'})`;
        testInput = tc.input;
        expectedOutput = String(tc.expectedOutput);
        mutantOutput = typeof res.output === 'object' ? JSON.stringify(res.output) : String(res.output);
        failureReason = `Output mismatch. Expected: ${tc.expectedOutput}, got: ${mutantOutput}`;
        break;
      }
    }

    if (isCompilationError) {
      mutantResults.push({
        id: mutant.id,
        operator: mutant.operator,
        description: mutant.description,
        originalSnippet: mutant.originalSnippet,
        mutatedSnippet: mutant.mutatedSnippet,
        mutatedFullCode: mutant.mutatedFullCode,
        status: 'compilation_error',
        compilationError: compilationErrorMessage || 'Compilation or syntax error',
        error: compilationErrorMessage || 'Compilation or syntax error',
        killedByTest: null,
        testInput: null,
        expectedOutput: null,
        mutantOutput: null,
        failureReason: compilationErrorMessage || 'Compilation or syntax error occurred',
        runtimeMs: Math.max(execDuration, 4)
      });
    } else {
      mutantResults.push({
        id: mutant.id,
        operator: mutant.operator,
        description: mutant.description,
        originalSnippet: mutant.originalSnippet,
        mutatedSnippet: mutant.mutatedSnippet,
        mutatedFullCode: mutant.mutatedFullCode,
        status: killed ? 'killed' : 'survived',
        killedByTest: killed ? killedByTest : null,
        testInput: killed ? testInput : null,
        expectedOutput: killed ? expectedOutput : null,
        mutantOutput: killed ? mutantOutput : null,
        failureReason: killed ? failureReason : 'All configured test cases passed identically against this mutant.',
        runtimeMs: Math.max(execDuration, 4)
      });
    }
  }

  return mutantResults;
};

/**
 * Synthesizes candidate test cases to kill surviving mutants.
 * Each candidate is strictly executed against both reference solution and mutant before being recommended.
 */
export const synthesizeCandidateTests = async ({ referenceCode, survivingMutants = [], testCases = [], questionContext = {} }) => {
  if (!survivingMutants || survivingMutants.length === 0) return [];

  const lang = detectLanguage(referenceCode, questionContext);
  const candidateTests = [];

  // Determine problem nature for type-aware candidate synthesis
  const isStringProblem =
    (testCases && testCases.some((tc) => typeof tc.input === 'string' && (tc.input.startsWith('"') || tc.input.startsWith("'") || /^[(){}[\]]+$/.test(tc.input.trim())))) ||
    (questionContext.title && /parenthes|string|palindrome|valid/i.test(questionContext.title));

  const candidateInputs = [];
  if (isStringProblem) {
    candidateInputs.push('")"', '"("', '"()("', '")("', '"((("', '""', '"[]"', '"{"', '"}"');
  } else {
    candidateInputs.push(
      '[1, 1, 1], 2',
      '[1], 1',
      '[0], 0',
      '[-1, 1], 0',
      '[2, -2, 2, -2], 0',
      '[1, 2, 3, 4, 10], 14',
      '[10, 20, 30, 40], 30',
      '[5, 5], 10',
      '[-10, 20, -30, 40], 10'
    );
  }

  if (testCases && testCases.length > 0) {
    for (const tc of testCases) {
      if (tc.input && tc.input.length <= 150) {
        candidateInputs.push(tc.input);
      }
    }
  }

  const seenInputs = new Set();
  const dedupedInputs = candidateInputs.filter((inp) => {
    if (seenInputs.has(inp)) return false;
    seenInputs.add(inp);
    return true;
  });

  for (const mutant of survivingMutants) {
    for (const inputStr of dedupedInputs) {
      // Skip if this input is already present in testCases
      const alreadyPresent = testCases && testCases.some((tc) => tc.input && tc.input.trim() === inputStr.trim());
      if (alreadyPresent) continue;

      const parsedArgs = parseInputArguments(inputStr);

      // 1. Run on reference solution to verify input validity and authentic expected output
      const refRes = await executeIsolated({
        code: referenceCode,
        inputArgs: parsedArgs,
        language: lang,
        timeoutMs: 2500,
        questionContext
      });

      if (refRes.status !== 'success' || refRes.output === null || refRes.output === undefined) {
        continue;
      }

      // 2. Run on mutant to verify that mutant output differs or fails
      const mutRes = await executeIsolated({
        code: mutant.mutatedFullCode,
        inputArgs: parsedArgs,
        language: lang,
        timeoutMs: 2500,
        questionContext
      });

      const refOutputStr = typeof refRes.output === 'object' ? JSON.stringify(refRes.output) : String(refRes.output);

      // Candidate successfully kills the mutant if mutant fails/times out or produces a different result
      const mutantDiffers = mutRes.status !== 'success' || !compareOutputs(mutRes.output, refOutputStr, questionContext);

      if (mutantDiffers) {
        candidateTests.push({
          mutantId: mutant.id,
          operator: mutant.operator,
          input: inputStr,
          expectedOutput: refOutputStr,
          category: 'boundary',
          reason: `Verified boundary input that differentiates reference output (${refOutputStr}) from mutant`
        });
        break; // Only 1 verified candidate needed per surviving mutant
      }
    }
  }

  return candidateTests;
};

/**
 * Calculates mutation score as a percentage rounded to 2 decimal places.
 * Returns null if there are zero eligible (valid non-equivalent) mutants.
 */
export const calculateMutationScore = (killed = 0, survived = 0) => {
  const totalEligible = Number(killed) + Number(survived);
  if (totalEligible === 0) return null;
  const score = (Number(killed) / totalEligible) * 100;
  return Number(score.toFixed(2));
};

export default {
  executeIsolated,
  generateMutants,
  evaluateMutants,
  synthesizeCandidateTests,
  calculateMutationScore
};
