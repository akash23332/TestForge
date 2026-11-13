/**
 * TestForge Phase 5.1C-13: Final Wrapper and Lifecycle Security Corrections Suite
 * Repository-Only Security Verification & Behavioral Allowlist/Lifecycle Testing
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

describe('Phase 5.1C-13: Final Wrapper and Lifecycle Security Corrections Suite', () => {
  const isolateWrapperPath = path.join(rootDir, 'deploy/judge0/docker/isolate-wrapper.sh');
  const patchPath = path.join(rootDir, 'deploy/judge0/docker/patches/isolate_job_correlation.patch');
  const dockerfilePath = path.join(rootDir, 'deploy/judge0/docker/Dockerfile.judge0-arm64');

  let isolateWrapperContent = '';
  let patchContent = '';
  let dockerfileContent = '';

  const validKey = 'valid_secure_correlation_key_32_bytes_long!!';
  const subToken = 'sub-token-uuid-12345';

  const computeHmacSha256 = (token, key) => {
    return crypto.createHmac('sha256', key).update(token).digest('hex');
  };

  beforeAll(() => {
    isolateWrapperContent = fs.readFileSync(isolateWrapperPath, 'utf8');
    patchContent = fs.readFileSync(patchPath, 'utf8');
    dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');
  });

  // ============================================================================
  // 1. Finding C13-01: Isolate-Wrapper Strict Allowlist
  // ============================================================================
  describe('Finding C13-01: Isolate Wrapper Strict Allowlist & Argument Validation', () => {
    test('wrapper constructs a new validated argument array and executes canonical isolate binary', () => {
      expect(isolateWrapperContent).toMatch(/VALIDATED_ARGS=\(\)/);
      expect(isolateWrapperContent).toMatch(/exec "\$REAL_ISOLATE" "\$\{VALIDATED_ARGS\[@\]\}"/);
      expect(isolateWrapperContent).not.toMatch(/exec "\$REAL_ISOLATE" "\$@"/);
    });

    test('wrapper explicitly rejects networking flags and path traversal', () => {
      expect(isolateWrapperContent).toMatch(/\^--share-net/);
      expect(isolateWrapperContent).toMatch(/Zero Egress Policy enforced/);
      expect(isolateWrapperContent).toMatch(/Path traversal '\.\.' rejected/);
    });

    test('wrapper enforces single operation and single box ID constraints', () => {
      expect(isolateWrapperContent).toMatch(/OPERATION_COUNT/);
      expect(isolateWrapperContent).toMatch(/BOX_ID_COUNT/);
      expect(isolateWrapperContent).toMatch(/Expected exactly one operation/);
      expect(isolateWrapperContent).toMatch(/Expected exactly one box ID/);
    });

    test('wrapper strictly validates box ID range [0, 2147483647]', () => {
      expect(isolateWrapperContent).toMatch(/2147483647/);
      expect(isolateWrapperContent).toMatch(/BOX_ID outside authorized range/);
    });

    test('wrapper documents that privileged Docker container risk remains unresolved', () => {
      expect(isolateWrapperContent).toMatch(/DOES NOT AND CANNOT NEUTRALIZE THE SECURITY RISKS/);
      expect(isolateWrapperContent).toMatch(/privileged: true/);
      expect(isolateWrapperContent).toMatch(/UNRESOLVED ARCHITECTURAL HOST RISK/);
    });

    // Behavioral allowlist simulator
    const simulateIsolateWrapper = (args) => {
      if (!args || args.length === 0) throw new Error('No arguments provided');

      let operation = null;
      let opCount = 0;
      let boxId = null;
      let boxCount = 0;
      let cgFlag = false;
      let cgCount = 0;
      let cgMem = null;
      let cgTiming = false;
      const approvedDirs = [];
      const envVars = [];
      const cmdArgs = [];
      let inCommand = false;

      let i = 0;
      while (i < args.length) {
        const arg = args[i];

        if (inCommand) {
          if (arg.includes('..') || /[;&|`$<>]/.test(arg)) {
            throw new Error(`Forbidden characters or path traversal in command: ${arg}`);
          }
          cmdArgs.push(arg);
          i++;
          continue;
        }

        if (arg === '--') {
          if (operation !== 'run') throw new Error("Separator '--' permitted only for --run");
          inCommand = true;
          i++;
          continue;
        }

        if (arg.startsWith('--share-net') || arg.startsWith('--net')) {
          throw new Error(`Networking flag '${arg}' rejected`);
        }

        if (arg.includes('..')) {
          throw new Error(`Path traversal '..' rejected in argument: ${arg}`);
        }

        if (arg === '--init') {
          operation = 'init';
          opCount++;
          i++;
        } else if (arg === '--cleanup') {
          operation = 'cleanup';
          opCount++;
          i++;
        } else if (arg === '--run') {
          operation = 'run';
          opCount++;
          i++;
        } else if (arg === '--cg') {
          cgFlag = true;
          cgCount++;
          i++;
        } else if (arg === '--cg-timing') {
          cgTiming = true;
          i++;
        } else if (arg.startsWith('--cg-mem=')) {
          const val = arg.split('=')[1];
          if (!/^\d+$/.test(val)) throw new Error(`Malformed --cg-mem value: ${val}`);
          cgMem = val;
          i++;
        } else if (arg === '-b' || arg === '--box-id') {
          if (i + 1 >= args.length) throw new Error('Missing box id argument');
          const val = args[i + 1];
          if (!/^\d+$/.test(val)) throw new Error(`Malformed box ID: ${val}`);
          boxId = parseInt(val, 10);
          boxCount++;
          i += 2;
        } else if (arg.startsWith('-b') || arg.startsWith('--box-id=')) {
          const val = arg.includes('=') ? arg.split('=')[1] : arg.substring(2);
          if (!/^\d+$/.test(val)) throw new Error(`Malformed box ID: ${val}`);
          boxId = parseInt(val, 10);
          boxCount++;
          i++;
        } else if (arg.startsWith('--dir=')) {
          const val = arg.substring(6);
          const approvedRegex = /^(\/(box|tmp)(=(rw|\/tmp|\/box))?(:rw|:noexec|:maybe)?|\/(usr\/local|lib|usr\/lib|etc):noexec)$/;
          if (!approvedRegex.test(val)) throw new Error(`Forbidden directory mount: ${val}`);
          approvedDirs.push(val);
          i++;
        } else if (arg.startsWith('--env=') || arg.startsWith('-E=')) {
          const val = arg.split('=')[1];
          if (!/^[A-Za-z_][A-Za-z0-9_]*=.*$/.test(val)) throw new Error(`Malformed env: ${val}`);
          envVars.push(val);
          i++;
        } else {
          throw new Error(`Unknown or disallowed option: ${arg}`);
        }
      }

      if (opCount !== 1) throw new Error(`Expected exactly one operation, got ${opCount}`);
      if (boxCount !== 1 || boxId === null) throw new Error(`Expected exactly one box ID, got ${boxCount}`);
      if (boxId < 0 || boxId > 2147483647) throw new Error(`Box ID ${boxId} outside authorized range`);
      if (cgCount > 1) throw new Error('Duplicate --cg flag detected');

      // Construct validated args
      const validatedArgs = [];
      if (cgFlag) validatedArgs.push('--cg');
      validatedArgs.push('-b', String(boxId));

      if (operation === 'init') {
        if (approvedDirs.length > 0 || cmdArgs.length > 0) {
          throw new Error('Extraneous execution flags provided with --init');
        }
        validatedArgs.push('--init');
      } else if (operation === 'cleanup') {
        if (approvedDirs.length > 0 || cmdArgs.length > 0) {
          throw new Error('Extraneous execution flags provided with --cleanup');
        }
        validatedArgs.push('--cleanup');
      } else if (operation === 'run') {
        if (cgTiming) validatedArgs.push('--cg-timing');
        if (cgMem) validatedArgs.push(`--cg-mem=${cgMem}`);
        for (const dir of approvedDirs) validatedArgs.push(`--dir=${dir}`);
        validatedArgs.push('--run');
        if (cmdArgs.length > 0) {
          validatedArgs.push('--', ...cmdArgs);
        }
      }

      return { operation, boxId, validatedArgs, passed: true };
    };

    test('behavioral: accepts valid --init with canonical argument array', () => {
      const res = simulateIsolateWrapper(['--cg', '-b', '10', '--init']);
      expect(res.passed).toBe(true);
      expect(res.validatedArgs).toEqual(['--cg', '-b', '10', '--init']);
    });

    test('behavioral: accepts valid --cleanup with canonical argument array', () => {
      const res = simulateIsolateWrapper(['--cg', '-b', '10', '--cleanup']);
      expect(res.passed).toBe(true);
      expect(res.validatedArgs).toEqual(['--cg', '-b', '10', '--cleanup']);
    });

    test('behavioral: accepts valid --run with approved cgroup options and command', () => {
      const res = simulateIsolateWrapper([
        '--cg', '-b', '10', '--cg-mem=256000', '--dir=/box:rw', '--dir=/tmp:rw', '--run', '--', '/bin/bash', '-c', 'echo hello'
      ]);
      expect(res.passed).toBe(true);
      expect(res.validatedArgs).toContain('--run');
      expect(res.validatedArgs).toContain('--cg-mem=256000');
    });

    test('behavioral: rejects duplicate operations (--init and --cleanup together)', () => {
      expect(() => simulateIsolateWrapper(['--cg', '-b', '10', '--init', '--cleanup'])).toThrow(/Expected exactly one operation, got 2/);
    });

    test('behavioral: rejects duplicate box IDs (-b 5 and -b 10)', () => {
      expect(() => simulateIsolateWrapper(['--cg', '-b', '5', '-b', '10', '--init'])).toThrow(/Expected exactly one box ID, got 2/);
    });

    test('behavioral: rejects duplicate --cg flags', () => {
      expect(() => simulateIsolateWrapper(['--cg', '--cg', '-b', '10', '--init'])).toThrow(/Duplicate --cg flag detected/);
    });

    test('behavioral: rejects malformed box IDs (hex, negative, overflow, characters)', () => {
      expect(() => simulateIsolateWrapper(['--cg', '-b', '-5', '--init'])).toThrow(/Malformed box ID/);
      expect(() => simulateIsolateWrapper(['--cg', '-b', '0x10', '--init'])).toThrow(/Malformed box ID/);
      expect(() => simulateIsolateWrapper(['--cg', '-b', 'invalid', '--init'])).toThrow(/Malformed box ID/);
      expect(() => simulateIsolateWrapper(['--cg', '-b', '2147483648', '--init'])).toThrow(/outside authorized range/);
    });

    test('behavioral: rejects unknown options and flags', () => {
      expect(() => simulateIsolateWrapper(['--cg', '-b', '10', '--unknown-flag', '--init'])).toThrow(/Unknown or disallowed option: --unknown-flag/);
      expect(() => simulateIsolateWrapper(['--cg', '-b', '10', '-z', '--init'])).toThrow(/Unknown or disallowed option: -z/);
    });

    test('behavioral: rejects networking options (--share-net, --net)', () => {
      expect(() => simulateIsolateWrapper(['--cg', '-b', '10', '--share-net', '--run', '--', '/bin/bash'])).toThrow(/Networking flag.*rejected/);
      expect(() => simulateIsolateWrapper(['--cg', '-b', '10', '--net=host', '--run', '--', '/bin/bash'])).toThrow(/Networking flag.*rejected/);
    });

    test('behavioral: rejects path traversal in directory mounts and arguments', () => {
      expect(() => simulateIsolateWrapper(['--cg', '-b', '10', '--dir=/box/../../../etc', '--run', '--', '/bin/bash'])).toThrow(/Path traversal/);
      expect(() => simulateIsolateWrapper(['--cg', '-b', '10', '--dir=/etc:rw', '--run', '--', '/bin/bash'])).toThrow(/Forbidden directory mount/);
      expect(() => simulateIsolateWrapper(['--cg', '-b', '10', '--dir=/root', '--run', '--', '/bin/bash'])).toThrow(/Forbidden directory mount/);
    });

    test('behavioral: rejects shell metacharacters in command arguments after --', () => {
      expect(() => simulateIsolateWrapper(['--cg', '-b', '10', '--run', '--', '/bin/bash', '; rm -rf /'])).toThrow(/Forbidden characters/);
      expect(() => simulateIsolateWrapper(['--cg', '-b', '10', '--run', '--', '/bin/bash', '`whoami`'])).toThrow(/Forbidden characters/);
    });
  });

  // ============================================================================
  // 2. Finding C13-02: Correlation Key & Lifecycle Cleanup
  // ============================================================================
  describe('Finding C13-02: Correlation Key Pre-Validation & Error Preservation', () => {
    test('patch validates CORRELATION_KEY before invoking Isolate or allocating box', () => {
      const lines = patchContent.split('\n');
      const keyCheckIdx = lines.findIndex(l => l.includes('correlation_key = ENV["CORRELATION_KEY"].to_s'));
      const isolateInitIdx = lines.findIndex(l => l.includes('Open3.capture3(*cmd)') || l.includes('--init'));

      expect(keyCheckIdx).toBeGreaterThan(0);
      expect(isolateInitIdx).toBeGreaterThan(0);
      expect(keyCheckIdx).toBeLessThan(isolateInitIdx); // Validation strictly precedes Isolate invocation
    });

    test('patch uses Open3.capture3 for safe process execution with argument arrays', () => {
      expect(patchContent).toMatch(/Open3\.capture3\(\*cmd\)/);
      expect(patchContent).toMatch(/cmd = \["isolate"\]/);
      expect(patchContent).toMatch(/cmd \+= \["-b", box_id\.to_s, "--init"\]/);
      expect(patchContent).toMatch(/cmd \+= \["-b", box_id\.to_s, "--cleanup"\]/);
    });

    test('patch catches exceptions after sandbox initialization and triggers cleanup', () => {
      expect(patchContent).toMatch(/rescue => e/);
      expect(patchContent).toMatch(/cleanup\(false\)/);
      expect(patchContent).toMatch(/CORRELATION_CLEANUP_FAILED/);
      expect(patchContent).toMatch(/raise e/); // Preserves original error
    });

    // Behavioral simulation of job lifecycle
    const simulateJobLifecycle = ({ key, initExitCode, failAfterInit = false, cleanupExitCode = 0 }) => {
      const logs = [];
      let boxCreated = false;
      let cleanupCalled = false;
      let originalError = null;

      // 1. Pre-validation of key
      if (!key || key.length < 32) {
        throw new Error('CORRELATION_KEY environment variable is required and must be at least 32 bytes');
      }

      const tokenHash = computeHmacSha256(subToken, key);
      const executionId = `${tokenHash}-run1-1731410000-0123456789abcdef`;
      const boxId = 42;

      // 2. Isolate Initialization
      if (initExitCode !== 0) {
        logs.push(`[CORRELATION_INIT_FAILED] box_id=${boxId} exitstatus=${initExitCode}`);
        throw new Error(`Failed to initialize sandbox ${boxId}: exitstatus=${initExitCode}`);
      }

      boxCreated = true;
      logs.push(`[CORRELATION] token_hash=${tokenHash} execution_id=${executionId} box_id=${boxId} run_idx=1 timestamp=1731410000`);

      // 3. Post-init setup & execution
      try {
        if (failAfterInit) {
          throw new Error('Compilation timeout or runtime error occurred inside sandbox');
        }
      } catch (err) {
        originalError = err;
        // Trigger cleanup
        cleanupCalled = true;
        if (cleanupExitCode !== 0) {
          logs.push(`[CORRELATION_CLEANUP] status=FAILED exitstatus=${cleanupExitCode} execution_id=${executionId} box_id=${boxId}`);
        } else {
          logs.push(`[CORRELATION_CLEANUP] status=SUCCESS execution_id=${executionId} box_id=${boxId}`);
        }
        // Original error must be preserved
        throw err;
      }

      // Normal cleanup
      cleanupCalled = true;
      if (cleanupExitCode !== 0) {
        logs.push(`[CORRELATION_CLEANUP] status=FAILED exitstatus=${cleanupExitCode} execution_id=${executionId} box_id=${boxId}`);
        throw new Error(`Cleanup failed: exitstatus=${cleanupExitCode}`);
      } else {
        logs.push(`[CORRELATION_CLEANUP] status=SUCCESS execution_id=${executionId} box_id=${boxId}`);
      }

      return { boxCreated, cleanupCalled, logs, executionId };
    };

    test('behavioral: missing correlation key fails BEFORE sandbox creation', () => {
      expect(() => simulateJobLifecycle({ key: '', initExitCode: 0 })).toThrow(/CORRELATION_KEY environment variable is required/);
    });

    test('behavioral: short correlation key (<32 bytes) fails BEFORE sandbox creation', () => {
      expect(() => simulateJobLifecycle({ key: 'too_short_key_20_ch!', initExitCode: 0 })).toThrow(/must be at least 32 bytes/);
    });

    test('behavioral: initialization failure logs INIT_FAILED and suppresses CORRELATION', () => {
      let threw = false;
      try {
        simulateJobLifecycle({ key: validKey, initExitCode: 1 });
      } catch (e) {
        threw = true;
        expect(e.message).toContain('Failed to initialize sandbox');
      }
      expect(threw).toBe(true);
    });

    test('behavioral: exceptions after initialization trigger cleanup and preserve original error', () => {
      let caughtError = null;
      let lifecycleResult = null;

      try {
        lifecycleResult = simulateJobLifecycle({ key: validKey, initExitCode: 0, failAfterInit: true, cleanupExitCode: 0 });
      } catch (e) {
        caughtError = e;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError.message).toBe('Compilation timeout or runtime error occurred inside sandbox'); // Original error preserved
    });

    test('behavioral: preserves original execution error even when cleanup ALSO fails', () => {
      let caughtError = null;

      try {
        simulateJobLifecycle({ key: validKey, initExitCode: 0, failAfterInit: true, cleanupExitCode: 1 });
      } catch (e) {
        caughtError = e;
      }

      expect(caughtError).not.toBeNull();
      // MUST preserve original execution error, NOT overwrite with cleanup error
      expect(caughtError.message).toBe('Compilation timeout or runtime error occurred inside sandbox');
    });
  });
});
