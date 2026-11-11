import { ExecutionProvider } from './ExecutionProvider.interface.js';
import { config } from '../../config/env.js';
import {
  runCodeIsolated,
  runJavaIsolated,
  runPythonIsolated,
  runCppIsolated,
  detectLanguage
} from '../codeRunner.service.js';

/**
 * Local Process Execution Provider.
 * Adapts existing language runners behind the standardized ExecutionProvider contract.
 * Note: Runs on host environment; strictly prohibited in production.
 */
export class LocalExecutionProvider extends ExecutionProvider {
  constructor(options = {}) {
    super('local');
    if (config.env === 'production' || process.env.NODE_ENV === 'production') {
      throw new Error('[LocalExecutionProvider] Execution via host processes is forbidden in production.');
    }
    const allowLocal = options.allowLocalExecution !== undefined
      ? options.allowLocalExecution
      : (config.execution?.allowLocalExecution || process.env.ALLOW_LOCAL_EXECUTION === 'true' || config.env === 'test');
    if (!allowLocal) {
      throw new Error('[LocalExecutionProvider] Local host execution is disabled by default. Set ALLOW_LOCAL_EXECUTION=true in development to enable.');
    }
  }

  async executeCode(params) {
    if (config.env === 'production' || process.env.NODE_ENV === 'production') {
      return {
        status: 'internal_error',
        output: null,
        error: '[LocalExecutionProvider FAIL-CLOSED] Execution via host processes is strictly forbidden in production.',
        runtimeMs: 0
      };
    }

    const {
      language: specifiedLanguage,
      code,
      inputArgs,
      timeoutMs = 3500,
      questionContext = {}
    } = params;

    const lang = specifiedLanguage || detectLanguage(code, questionContext);

    let rawResult;
    if (lang === 'java') {
      rawResult = await runJavaIsolated({ code, inputArgs, timeoutMs });
    } else if (lang === 'python') {
      rawResult = await runPythonIsolated({ code, inputArgs, timeoutMs });
    } else if (lang === 'cpp') {
      rawResult = await runCppIsolated({ code, inputArgs, timeoutMs });
    } else {
      rawResult = await runCodeIsolated({ code, inputArgs, timeoutMs });
    }

    return {
      status: rawResult.status || 'runtime_error',
      output: rawResult.output,
      error: rawResult.error,
      runtimeMs: rawResult.runtimeMs || 0,
      compileMs: rawResult.compileMs,
      memoryKb: rawResult.memoryKb
    };
  }

  getCapabilities() {
    return {
      name: 'local',
      supportsNetworkIsolation: false,
      supportsMemoryLimits: false,
      supportsProcessLimits: false,
      isHardenedSandbox: false,
      languages: ['javascript', 'python', 'java', 'cpp']
    };
  }
}

export default LocalExecutionProvider;
