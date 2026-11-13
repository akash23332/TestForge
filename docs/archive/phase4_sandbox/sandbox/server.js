import express from 'express';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { spawn, spawnSync } from 'child_process';

const app = express();
const PORT = process.env.PORT || 5050;
const API_KEY = process.env.SANDBOX_API_KEY || 'testforge_sandbox_internal_secret';
const SCRATCH_BASE = process.env.SCRATCH_BASE || path.join(os.tmpdir(), 'testforge-sandboxes');

// ── Probe Linux Kernel Isolation Capabilities ────────────────────────────────
let supportsUnshare = false;
let supportsPrlimit = false;

try {
  if (process.platform === 'linux') {
    const testPrlimit = spawnSync('prlimit', ['--version']);
    supportsPrlimit = testPrlimit.status === 0;

    const testUnshare = spawnSync('unshare', ['-r', '-n', 'true']);
    supportsUnshare = testUnshare.status === 0;
  }
} catch {
  // Graceful fallback on non-Linux or stripped environments
}

// Ensure base scratch directory exists with secure mode 0700
try {
  if (!fs.existsSync(SCRATCH_BASE)) {
    fs.mkdirSync(SCRATCH_BASE, { recursive: true, mode: 0o700 });
  }
} catch (err) {
  console.warn(`[Sandbox] Scratch base initialization warning: ${err.message}`);
}

app.use(helmet());
app.use(express.json({ limit: '5mb' }));

// ── Authentication Middleware ────────────────────────────────────────────────
const requireApiKey = (req, res, next) => {
  if (!API_KEY) return next();
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  const token = authHeader.split(' ')[1];
  if (token !== API_KEY) {
    return res.status(403).json({ error: 'Invalid sandbox API key' });
  }
  next();
};

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'TestForge Hardened Execution Sandbox',
    runtimes: ['javascript', 'python', 'java', 'cpp'],
    capabilities: {
      supportsUnshare,
      supportsPrlimit,
      processGroupKilling: true,
      pythonResourceLimits: true,
      ephemeralScratch: true
    },
    uptime: process.uptime()
  });
});

// ── Command Isolation Wrapper (Applies prlimit & unshare on Linux) ───────────
const buildSecureExecutionCommand = ({ command, args, memoryLimitMb, timeoutMs, disableNetwork = true }) => {
  // Fail-closed enforcement: In production on Linux, network isolation via unshare MUST be functional
  if (process.platform === 'linux') {
    if (disableNetwork && !supportsUnshare) {
      if (process.env.NODE_ENV === 'production' || process.env.STRICT_ISOLATION === 'true') {
        throw new Error('CRITICAL_SECURITY_ERROR: Linux network namespace isolation (unshare -r -n) is unavailable or unprivileged user namespaces are disabled. Refusing execution.');
      }
      console.warn('[Sandbox Security Warning] unshare unavailable on Linux; execution proceeding in degraded non-isolated mode.');
    }
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL_SECURITY_ERROR: Production execution sandbox must run on Linux with namespace support.');
  }

  if (process.platform !== 'linux' || (!supportsPrlimit && !supportsUnshare)) {
    return { finalCommand: command, finalArgs: args };
  }

  const memBytes = memoryLimitMb * 1024 * 1024;
  const cpuSec = Math.max(1, Math.ceil(timeoutMs / 1000) + 1);
  const maxProcs = 32;       // Prevent fork bombs
  const maxFiles = 64;       // Bound open file descriptors
  const maxFsize = 10485760; // 10MB maximum disk write

  let finalCommand = command;
  let finalArgs = args;

  if (supportsPrlimit) {
    finalArgs = [
      `--as=${memBytes}`,
      `--cpu=${cpuSec}`,
      `--nproc=${maxProcs}`,
      `--nofile=${maxFiles}`,
      `--fsize=${maxFsize}`,
      finalCommand,
      ...finalArgs
    ];
    finalCommand = 'prlimit';
  }

  if (disableNetwork && supportsUnshare) {
    finalArgs = ['-r', '-n', finalCommand, ...finalArgs];
    finalCommand = 'unshare';
  }

  return { finalCommand, finalArgs };
};

// ── Execution Helper (Process Group Tree Termination & Clean Environment) ────
const runProcess = ({ command, args, cwd, stdin, timeoutMs, memoryLimitMb = 256, maxBufferBytes = 1024 * 1024 }) => {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let isKilled = false;

    // ZERO LEAK: Clean minimal environment - strictly no application secrets or database URLs
    const cleanEnv = {
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      TMPDIR: cwd
    };

    const { finalCommand, finalArgs } = buildSecureExecutionCommand({
      command,
      args,
      memoryLimitMb,
      timeoutMs,
      disableNetwork: true
    });

    // Detach process on POSIX to create a distinct process group for clean group tree killing
    const proc = spawn(finalCommand, finalArgs, {
      cwd,
      env: cleanEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32'
    });

    const killProcessTree = () => {
      isKilled = true;
      try {
        if (proc.pid && process.platform !== 'win32') {
          // Negative PID sends signal to the entire process group
          process.kill(-proc.pid, 'SIGKILL');
        } else if (proc.pid) {
          proc.kill('SIGKILL');
        }
      } catch {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Process already terminated
        }
      }
    };

    const timer = setTimeout(killProcessTree, timeoutMs);

    if (stdin) {
      try {
        proc.stdin.write(stdin);
        proc.stdin.end();
      } catch {
        // Stream closed
      }
    } else {
      proc.stdin.end();
    }

    proc.stdout.on('data', (data) => {
      if (stdout.length < maxBufferBytes) {
        stdout += data.toString();
      }
    });

    proc.stderr.on('data', (data) => {
      if (stderr.length < maxBufferBytes) {
        stderr += data.toString();
      }
    });

    proc.on('close', (code, signal) => {
      clearTimeout(timer);
      // Ensure any lingering grandchild processes are eliminated
      killProcessTree();

      const runtimeMs = Date.now() - startTime;

      if (isKilled || signal === 'SIGKILL' || runtimeMs >= timeoutMs) {
        return resolve({
          status: 'timeout',
          output: stdout.trim(),
          error: `Execution timed out after ${timeoutMs}ms.`,
          runtimeMs,
          exitCode: code
        });
      }

      if (code !== 0) {
        const errorMsg = stderr.trim() || `Process exited with non-zero exit code ${code}`;
        const isMem =
          errorMsg.includes('OutOfMemoryError') ||
          errorMsg.includes('MemoryError') ||
          errorMsg.includes('std::bad_alloc') ||
          code === 137;

        return resolve({
          status: isMem ? 'memory_limit_exceeded' : 'runtime_error',
          output: stdout.trim(),
          error: errorMsg,
          runtimeMs,
          exitCode: code
        });
      }

      return resolve({
        status: 'success',
        output: stdout.trim(),
        error: stderr.trim() || null,
        runtimeMs,
        exitCode: code
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      killProcessTree();
      const runtimeMs = Date.now() - startTime;
      return resolve({
        status: 'runtime_error',
        output: stdout.trim(),
        error: err.message,
        runtimeMs,
        exitCode: -1
      });
    });
  });
};

// ── Execute Code Endpoint ────────────────────────────────────────────────────
app.post('/execute', requireApiKey, async (req, res) => {
  const {
    language = 'javascript',
    code,
    inputArgs = [],
    limits = {},
    context = {}
  } = req.body;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ status: 'internal_error', error: 'Missing source code string' });
  }

  const timeoutMs = Math.min(10000, Math.max(500, limits.timeoutMs || 3500));
  const memoryLimitMb = Math.min(512, Math.max(64, limits.memoryLimitMb || 256));
  const compileTimeoutMs = 5000;

  // Use cryptographic randomness for unguessable scratch directory
  const runId = `run_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  const runDir = path.join(SCRATCH_BASE, runId);

  try {
    // Mode 0700: Owner-only directory permissions
    fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });

    const normalizedLang = language.toLowerCase();
    let result = { status: 'internal_error', output: null, error: null, runtimeMs: 0 };
    let compileMs = 0;

    const serializedArgs = JSON.stringify(Array.isArray(inputArgs) ? inputArgs : [inputArgs]);

    // ── 1. JavaScript (Node.js) ──────────────────────────────────────────────
    if (normalizedLang === 'javascript' || normalizedLang === 'js') {
      const scriptPath = path.join(runDir, 'solution.js');
      const driverScript = `
"use strict";
${code}

try {
  const args = JSON.parse(process.argv[2] || "[]");
  let result;
  if (typeof solution === "function") {
    result = solution(...args);
  } else if (typeof twoSum === "function") {
    result = twoSum(...args);
  } else if (typeof solve === "function") {
    result = solve(...args);
  } else {
    result = typeof main === "function" ? main(...args) : undefined;
  }
  if (result !== undefined) {
    console.log(typeof result === "object" ? JSON.stringify(result) : result);
  }
} catch (err) {
  console.error(err.message || String(err));
  process.exit(1);
}
`;
      fs.writeFileSync(scriptPath, driverScript, 'utf8');

      result = await runProcess({
        command: 'node',
        args: [
          `--max-old-space-size=${memoryLimitMb}`,
          '--disallow-code-generation-from-strings',
          scriptPath,
          serializedArgs
        ],
        cwd: runDir,
        timeoutMs,
        memoryLimitMb
      });
    }

    // ── 2. Python (Hardened with in-process RLIMIT_AS and RLIMIT_NPROC) ───────
    else if (normalizedLang === 'python' || normalizedLang === 'py') {
      const scriptPath = path.join(runDir, 'solution.py');
      const memBytes = memoryLimitMb * 1024 * 1024;

      const driverScript = `
import sys
import json

# Enforce OS resource limits inside Python runtime
try:
    import resource
    resource.setrlimit(resource.RLIMIT_AS, (${memBytes}, ${memBytes}))
    resource.setrlimit(resource.RLIMIT_NPROC, (32, 32))
except Exception:
    pass

${code}

def __run_test():
    try:
        raw_args = sys.argv[1] if len(sys.argv) > 1 else "[]"
        args = json.loads(raw_args)
        
        target_fn = None
        for fn_name in ['solution', 'twoSum', 'solve', 'main']:
            if fn_name in globals() and callable(globals()[fn_name]):
                target_fn = globals()[fn_name]
                break
                
        if target_fn:
            res = target_fn(*args)
            if res is not None:
                print(json.dumps(res) if isinstance(res, (dict, list)) else str(res))
    except MemoryError:
        sys.stderr.write("Memory limit exceeded in Python")
        sys.exit(137)
    except Exception as e:
        sys.stderr.write(str(e))
        sys.exit(1)

if __name__ == '__main__':
    __run_test()
`;
      fs.writeFileSync(scriptPath, driverScript, 'utf8');

      result = await runProcess({
        command: 'python3',
        args: ['-u', '-B', '-S', scriptPath, serializedArgs],
        cwd: runDir,
        timeoutMs,
        memoryLimitMb
      });
    }

    // ── 3. Java ──────────────────────────────────────────────────────────────
    else if (normalizedLang === 'java') {
      const srcPath = path.join(runDir, 'Solution.java');
      fs.writeFileSync(srcPath, code, 'utf8');

      // Step A: Compilation
      const compileStart = Date.now();
      const compileRes = await runProcess({
        command: 'javac',
        args: ['-J-Xmx512m', '-encoding', 'UTF-8', 'Solution.java'],
        cwd: runDir,
        timeoutMs: compileTimeoutMs,
        memoryLimitMb: 512
      });
      compileMs = Date.now() - compileStart;

      if (compileRes.status !== 'success') {
        return res.json({
          status: 'compilation_error',
          output: null,
          error: compileRes.error || 'Java compilation failed',
          compileMs,
          runtimeMs: 0
        });
      }

      // Step B: Execution
      result = await runProcess({
        command: 'java',
        args: [
          `-Xmx${memoryLimitMb}m`,
          '-Xss1m',
          '-XX:MaxRAMPercentage=80',
          'Solution',
          serializedArgs
        ],
        cwd: runDir,
        stdin: serializedArgs,
        timeoutMs,
        memoryLimitMb
      });
    }

    // ── 4. C++ ───────────────────────────────────────────────────────────────
    else if (normalizedLang === 'cpp' || normalizedLang === 'c++') {
      const srcPath = path.join(runDir, 'solution.cpp');
      const binPath = path.join(runDir, 'solution');
      fs.writeFileSync(srcPath, code, 'utf8');

      // Step A: Compilation
      const compileStart = Date.now();
      const compileRes = await runProcess({
        command: 'g++',
        args: ['-O2', '-std=c++20', '-o', binPath, srcPath],
        cwd: runDir,
        timeoutMs: compileTimeoutMs,
        memoryLimitMb: 512
      });
      compileMs = Date.now() - compileStart;

      if (compileRes.status !== 'success') {
        return res.json({
          status: 'compilation_error',
          output: null,
          error: compileRes.error || 'C++ compilation failed',
          compileMs,
          runtimeMs: 0
        });
      }

      // Step B: Execution
      result = await runProcess({
        command: binPath,
        args: [serializedArgs],
        cwd: runDir,
        stdin: serializedArgs,
        timeoutMs,
        memoryLimitMb
      });
    } else {
      return res.status(400).json({
        status: 'internal_error',
        error: `Unsupported sandbox language: ${language}`
      });
    }

    let parsedOutput = result.output;
    try {
      if (typeof result.output === 'string' && (result.output.startsWith('{') || result.output.startsWith('['))) {
        parsedOutput = JSON.parse(result.output);
      }
    } catch {
      // Keep as raw string
    }

    return res.json({
      status: result.status,
      output: parsedOutput,
      error: result.error,
      runtimeMs: result.runtimeMs,
      compileMs,
      memoryKb: memoryLimitMb * 1024
    });

  } catch (err) {
    return res.status(500).json({
      status: 'internal_error',
      output: null,
      error: `Sandbox daemon failure: ${err.message}`,
      runtimeMs: 0
    });
  } finally {
    // Immediate cleanup of ephemeral scratchpad
    try {
      fs.rmSync(runDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  }
});

// Start listener
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Sandbox] TestForge isolated sandbox daemon listening on port ${PORT}`);
});

export default app;
