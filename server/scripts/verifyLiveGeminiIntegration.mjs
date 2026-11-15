import { GoogleGenAI } from '@google/genai';
import { GeminiProvider } from '../src/services/ai/providers/gemini.provider.js';
import { questionGeneratorService } from '../src/services/ai/questionGenerator.service.js';
import { validateGeneratedQuestion } from '../src/services/ai/questionValidator.service.js';
import { validateSampleTestCase } from '../src/services/sampleValidation.service.js';
import { config } from '../src/config/env.js';

async function runLiveVerification() {
  console.log('=== TestForge Live Gemini API Verification ===\n');

  // 1. Environment Verification
  const hasKey = Boolean(config.ai?.geminiApiKey);
  const keyLength = config.ai?.geminiApiKey ? config.ai.geminiApiKey.length : 0;
  const configuredModel = config.ai?.geminiModel || 'gemini-2.5-flash';
  const sdkName = '@google/genai';

  console.log('[1] Environment Verification:');
  console.log(`    - GEMINI_API_KEY Loaded: ${hasKey} (Length: ${keyLength} chars, Secret masked)`);
  console.log(`    - Configured Model: ${configuredModel}`);
  console.log(`    - Installed SDK: ${sdkName}`);

  if (!hasKey) {
    console.error('    [FATAL] GEMINI_API_KEY is not loaded.');
    process.exit(1);
  }

  // 2. Live API Call through GeminiProvider
  console.log('\n[2] Executing Real Request to Gemini API...');
  const provider = new GeminiProvider();
  
  const startTime = Date.now();
  let generated;
  try {
    generated = await provider.generateQuestion({
      topic: 'Array reversal and palindrome check',
      difficulty: 'Easy',
      language: 'python',
      executionMode: 'FUNCTION',
      timeoutMs: 30000
    });
  } catch (err) {
    console.error(`    [FAIL] Live Gemini API call failed: ${err.message}`, err.details || '');
    process.exit(1);
  }
  const durationMs = Date.now() - startTime;

  console.log(`    - Live Gemini Request Succeeded in ${durationMs}ms`);
  console.log(`    - Question Title: "${generated.title}"`);
  console.log(`    - Difficulty: ${generated.difficulty}`);
  console.log(`    - Tags: [${(generated.tags || []).join(', ')}]`);
  console.log(`    - Execution Mode: ${generated.executionMode}`);
  console.log(`    - Function Name: ${generated.functionName}`);
  console.log(`    - Statement Length: ${generated.statement?.length || 0} characters`);
  console.log(`    - Constraints Length: ${generated.constraints?.length || 0} characters`);
  console.log(`    - Input Format: "${generated.inputFormat}"`);
  console.log(`    - Output Format: "${generated.outputFormat}"`);

  // Verify Sample Test Case
  const hasSampleTestCase = Boolean(generated.sampleTestCase);
  const sampleInput = generated.sampleTestCase?.input;
  const sampleExpected = generated.sampleTestCase?.expectedOutput;
  const examplesCount = Array.isArray(generated.examples) ? generated.examples.length : 0;

  console.log(`    - Has sampleTestCase object: ${hasSampleTestCase}`);
  console.log(`    - Sample Input: "${sampleInput}"`);
  console.log(`    - Sample Expected Output: "${sampleExpected}"`);
  console.log(`    - Illustrative Examples Count: ${examplesCount}`);

  if (!hasSampleTestCase || sampleInput === undefined || sampleExpected === undefined) {
    console.error('    [FAIL] Missing required sampleTestCase in structured output.');
    process.exit(1);
  }

  // Verify Code
  console.log(`    - Starter Code Present: ${Boolean(generated.starterCode)}`);
  console.log(`    - Reference Solution Present: ${Boolean(generated.referenceSolution)}`);

  // 3. Schema Post-Validation through questionValidatorService
  console.log('\n[3] Running Question Validator Service...');
  const validatedQuestion = validateGeneratedQuestion(generated, {
    language: 'python',
    executionMode: 'FUNCTION'
  });
  console.log('    - Schema Validation: PASSED');
  console.log(`    - Primary Language: ${validatedQuestion.language}`);
  console.log(`    - Function Return Type: ${validatedQuestion.functionSignature?.returnType}`);

  // 4. Authoritative Sample Test Case Execution
  console.log('\n[4] Executing Reference Solution against Gemini-Generated Sample Test...');
  console.log('    - Reference Solution Snippet:\n' + validatedQuestion.referenceSolution.split('\n').map(l => '        ' + l).join('\n'));
  console.log(`    - Function Name: ${validatedQuestion.functionName}`);
  console.log(`    - Sample Input: "${validatedQuestion.sampleTestCase.input}"`);
  console.log(`    - Expected Output: "${validatedQuestion.sampleTestCase.expectedOutput}"`);

  const sampleValidationResult = await validateSampleTestCase({
    code: validatedQuestion.referenceSolution,
    referenceSolution: validatedQuestion.referenceSolution,
    sampleInput: validatedQuestion.sampleTestCase.input,
    expectedOutput: validatedQuestion.sampleTestCase.expectedOutput,
    language: 'python',
    executionMode: validatedQuestion.executionMode,
    dataStructure: validatedQuestion.dataStructure,
    functionName: validatedQuestion.functionName,
    functionSignature: validatedQuestion.functionSignature,
    title: validatedQuestion.title
  });

  console.log('    - Execution Status:', sampleValidationResult.executionStatus);
  console.log('    - Compilation Status:', sampleValidationResult.compilationStatus);
  console.log('    - Output Comparison:', sampleValidationResult.outputComparisonStatus);
  console.log('    - Overall Passed:', sampleValidationResult.passed);
  console.log('    - Runtime:', `${sampleValidationResult.runtimeMs}ms`);
  console.log('    - Actual Output:', `"${sampleValidationResult.actualOutput}"`);
  console.log('    - Expected Output:', `"${sampleValidationResult.expectedOutput}"`);
  console.log('    - Fingerprint Issued:', Boolean(sampleValidationResult.fingerprint));
  console.log('    - Validation Token Signed:', Boolean(sampleValidationResult.validationToken));
  console.log('    - Draft ID Assigned:', Boolean(sampleValidationResult.draftId));

  if (!sampleValidationResult.passed) {
    console.error(`    [FAIL] Reference solution execution failed:\n${sampleValidationResult.error || sampleValidationResult.status}`);
    process.exit(1);
  }

  // 5. Live Section Regeneration Test
  console.log('\n[5] Executing Live Section Regeneration (Statement)...');
  const regenStartTime = Date.now();
  const regeneratedStatement = await provider.regenerateSection({
    section: 'statement',
    currentQuestion: validatedQuestion,
    instructions: 'Make the story context about space exploration and satellite telemetry.'
  });
  console.log(`    - Section Regeneration Succeeded in ${Date.now() - regenStartTime}ms`);
  console.log(`    - Regenerated Statement Preview: "${regeneratedStatement.statement?.slice(0, 100)}..."`);

  // 6. Security Check
  console.log('\n[6] Security Checks:');
  const jsonStr = JSON.stringify({ generated, validatedQuestion, sampleValidationResult });
  const keyLeak = config.ai?.geminiApiKey && jsonStr.includes(config.ai.geminiApiKey);
  console.log(`    - API Key Leaked in Generated Data: ${keyLeak ? 'YES (CRITICAL VULNERABILITY)' : 'NO (SECURE)'}`);

  console.log('\n=== LIVE GEMINI API VERIFICATION COMPLETED SUCCESSFULLY ===');
}

runLiveVerification().catch((err) => {
  console.error('[UNCAUGHT ERROR]', err);
  process.exit(1);
});
