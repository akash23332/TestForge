import { spawnSync, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PYTHON_WORKER_PATH = path.join(__dirname, 'pythonWorker.py');

/**
 * Synchronous Python AST mutation using Python's standard-library ast module.
 * Preserves synchronous contracts for generateMutants().
 * Never falls back to regex.
 *
 * @param {string} code - Python source code
 * @param {object} options - { maxMutants: number, timeoutMs: number, useShortNames: boolean }
 * @returns {Array<object>} Array of validated mutant objects
 */
export const mutatePythonAstSync = (code, options = {}) => {
  if (!code || typeof code !== 'string') return [];
  const maxMutants = Number(options.maxMutants) || 5;
  const timeoutMs = Number(options.timeoutMs) || 15000;

  const payload = JSON.stringify({ code, maxMutants });

  const res = spawnSync('python', [PYTHON_WORKER_PATH], {
    input: payload,
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024
  });

  if (res.error) {
    throw new Error(`[Python AST Mutator] Process error: ${res.error.message}`);
  }

  if (res.status !== 0 && (!res.stdout || !res.stdout.trim())) {
    throw new Error(`[Python AST Mutator] Process failed with exit code ${res.status}: ${res.stderr || 'unknown error'}`);
  }

  try {
    const data = JSON.parse((res.stdout || '').trim());
    if (!data.success) {
      throw new Error(data.error || 'Python AST mutation parsing failed');
    }
    const mutants = data.mutants || [];
    if (options.useShortNames) {
      return mutants.map((m) => ({
        ...m,
        operator: m.operatorType
      }));
    }
    return mutants;
  } catch (err) {
    throw new Error(`[Python AST Mutator] Invalid response from worker: ${err.message}. Raw output: ${(res.stdout || '').slice(0, 150)}`);
  }
};

/**
 * Asynchronous Python AST mutation using child_process.spawn.
 */
export const mutatePythonAst = async (code, options = {}) => {
  return mutatePythonAstSync(code, options);
};

export default {
  mutatePythonAstSync,
  mutatePythonAst
};
