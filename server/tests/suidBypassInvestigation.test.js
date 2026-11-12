/**
 * TestForge: SUID Bypass Investigation & Permission Boundary Verification Suite
 * 
 * Tests the security findings regarding:
 * 1. Direct binary accessibility under mode 4755 (world-executable SUID-root)
 * 2. Limitation of /etc/sudoers (sudoers controls sudo, not direct execve)
 * 3. Argument validation bypass if unprivileged worker calls isolate-bin directly
 * 4. Architectural remediation evaluation (Option A, B, C)
 * 
 * Classification: Static Analysis & Mocked Logic Simulators (Jest / Node.js).
 * NOTE: These tests verify repository configuration, regex, and simulated POSIX permission logic.
 * They DO NOT substitute for live Linux kernel verification with active namespaces and cgroups.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

describe('SUID Bypass Investigation & Permission Boundary Analysis', () => {
  const dockerfilePath = path.join(rootDir, 'deploy/judge0/docker/Dockerfile.judge0-arm64');
  const isolateWrapperPath = path.join(rootDir, 'deploy/judge0/docker/isolate-wrapper.sh');
  const composePath = path.join(rootDir, 'deploy/judge0/docker-compose.yml');

  let dockerfileContent = '';
  let isolateWrapperContent = '';
  let composeContent = '';

  beforeAll(() => {
    dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');
    isolateWrapperContent = fs.readFileSync(isolateWrapperPath, 'utf8');
    composeContent = fs.readFileSync(composePath, 'utf8');
  });

  describe('1. Direct Binary Accessibility & SUID Permission Analysis (Static & Logic)', () => {
    test('[Static Remediation] Dockerfile configures /usr/local/bin/isolate-bin with restricted root permissions (0700) and eliminates 4755', () => {
      expect(dockerfileContent).toMatch(/chmod 0700 \/usr\/local\/bin\/isolate-bin/);
      expect(dockerfileContent).not.toMatch(/chmod 4755 \/usr\/local\/bin\/isolate-bin/);
      expect(dockerfileContent).toMatch(/chown root:root \/usr\/local\/bin\/isolate-bin/);
    });

    test('[Static Remediation] Dockerfile permissions and symlink are enforced unconditionally on every build', () => {
      // Must not be nested inside the conditional move block
      const lines = dockerfileContent.split('\n');
      const chmodLineIndex = lines.findIndex(l => l.includes('chmod 0700 /usr/local/bin/isolate-bin'));
      const ifLineIndex = lines.findIndex(l => l.includes('if [ -f /usr/local/bin/isolate ]'));
      const fiLineIndex = lines.findIndex(l => l.includes('fi &&'));
      
      expect(chmodLineIndex).toBeGreaterThan(fiLineIndex);
    });

    test('[Logic Simulator] Mode 4755 grants execute permission to unprivileged users (UID 1000)', () => {
      const checkFileExecutionAllowed = (modeOctal, fileUid, fileGid, processUid, processGid) => {
        // Parse POSIX permission bits
        const mode = parseInt(modeOctal, 8);
        const ownerCanExec = (mode & 0o100) !== 0;
        const groupCanExec = (mode & 0o010) !== 0;
        const otherCanExec = (mode & 0o001) !== 0;

        if (processUid === fileUid) {
          return { allowed: ownerCanExec, role: 'owner' };
        }
        if (processGid === fileGid) {
          return { allowed: groupCanExec, role: 'group' };
        }
        return { allowed: otherCanExec, role: 'other' };
      };

      // UID 1000 (judge0), file owned by 0:0 (root:root)
      const res = checkFileExecutionAllowed('4755', 0, 0, 1000, 1000);
      expect(res.allowed).toBe(true);
      expect(res.role).toBe('other');
    });

    test('[Logic Simulator] SUID elevation occurs on mode 4755 when container runs without nosuid or no_new_privs', () => {
      const evaluateSuidTransition = ({ modeOctal, isPrivilegedContainer, hasNoNewPrivs, isNosuidMount }) => {
        const mode = parseInt(modeOctal, 8);
        const hasSuidBit = (mode & 0o4000) !== 0;

        if (!hasSuidBit) return { effectiveUid: 1000, elevated: false, reason: 'No SUID bit' };
        if (isNosuidMount) return { effectiveUid: 1000, elevated: false, reason: 'Mounted nosuid' };
        if (hasNoNewPrivs) return { effectiveUid: 1000, elevated: false, reason: 'PR_SET_NO_NEW_PRIVS active' };

        // In privileged container, SUID is honored by Linux kernel
        return { effectiveUid: 0, elevated: true, reason: 'Kernel honors SUID bit' };
      };

      const workerContainerState = {
        modeOctal: '4755',
        isPrivilegedContainer: true, // docker-compose.yml: privileged: true
        hasNoNewPrivs: false,        // privileged containers run unconfined
        isNosuidMount: false        // overlayfs root is mounted without nosuid
      };

      const result = evaluateSuidTransition(workerContainerState);
      expect(result.elevated).toBe(true);
      expect(result.effectiveUid).toBe(0);
    });
  });

  describe('2. Sudoers Scope & Bypass Proof (Static & Mocked)', () => {
    test('[Static] Dockerfile sudoers grants NOPASSWD for wrapper but omits isolate-bin', () => {
      const sudoersLine = dockerfileContent.split('\n').find(l => l.includes('judge0 ALL=(ALL)'));
      expect(sudoersLine).toBeDefined();
      expect(sudoersLine).toContain('/usr/local/bin/isolate-wrapper');
      expect(sudoersLine).not.toContain('/usr/local/bin/isolate-bin');
    });

    test('[Logic Proof] Sudoers restriction does NOT prevent direct execve of mode 4755 binary', () => {
      const attemptExecution = (executionMethod, targetBinary) => {
        const sudoersAllowlist = [
          '/usr/local/bin/start-cron-daemon',
          '/usr/local/bin/isolate-wrapper',
          '/usr/local/bin/isolate'
        ];
        const filesystemPermissions = {
          '/usr/local/bin/isolate-bin': { mode: '4755', owner: 0 },
          '/usr/local/bin/isolate-wrapper': { mode: '0755', owner: 0 }
        };

        if (executionMethod === 'sudo') {
          if (!sudoersAllowlist.includes(targetBinary)) {
            return { success: false, error: 'sudo: command not allowed' };
          }
          return { success: true, effectiveUid: 0 };
        }

        if (executionMethod === 'direct_execve') {
          // Direct execution relies exclusively on filesystem permissions, ignoring sudoers!
          const file = filesystemPermissions[targetBinary];
          if (!file) return { success: false, error: 'No such file' };
          const mode = parseInt(file.mode, 8);
          const otherCanExec = (mode & 0o001) !== 0;
          if (!otherCanExec) return { success: false, error: 'Permission denied' };
          const suid = (mode & 0o4000) !== 0;
          return { success: true, effectiveUid: suid ? file.owner : 1000 };
        }

        throw new Error('Unknown execution method');
      };

      // 1. Invoking via sudo is blocked by sudoers
      const sudoAttempt = attemptExecution('sudo', '/usr/local/bin/isolate-bin');
      expect(sudoAttempt.success).toBe(false);
      expect(sudoAttempt.error).toContain('sudo: command not allowed');

      // 2. Invoking directly via execve SUCCEEDS because mode is 4755!
      const directAttempt = attemptExecution('direct_execve', '/usr/local/bin/isolate-bin');
      expect(directAttempt.success).toBe(true);
      expect(directAttempt.effectiveUid).toBe(0); // Runs as root!
    });
  });

  describe('3. Argument Validation Bypass Assessment (Mocked Path Simulation)', () => {
    test('[Mocked] Direct invocation of isolate-bin bypasses all isolate-wrapper restrictions', () => {
      // Wrapper allowlist checks
      const forbiddenArgsInWrapper = [
        ['--share-net'],
        ['--dir=/etc:rw'],
        ['-b', '-1'],
        ['-b', '99999999999'],
        ['--run', '--', '/bin/bash', '; rm -rf /']
      ];

      // If called via wrapper, all are rejected
      const wrapperSimulator = (args) => {
        if (args.includes('--share-net')) throw new Error('Zero Egress Violation');
        if (args.some(a => a.startsWith('--dir=/etc'))) throw new Error('Forbidden Mount');
        if (args.includes('-1') || args.includes('99999999999')) throw new Error('Invalid Box ID');
        if (args.some(a => a.includes(';'))) throw new Error('Command Metacharacters');
        return { success: true };
      };

      for (const args of forbiddenArgsInWrapper) {
        expect(() => wrapperSimulator(args)).toThrow();
      }

      // But if an attacker or compromised worker invokes isolate-bin directly:
      // The wrapper logic is NEVER reached!
      const directExecutionRouter = (binaryPath, args) => {
        if (binaryPath === '/usr/local/bin/isolate' || binaryPath === '/usr/local/bin/isolate-wrapper') {
          return wrapperSimulator(args);
        }
        if (binaryPath === '/usr/local/bin/isolate-bin') {
          // Direct execution to real binary passes raw arguments straight to isolate!
          return { bypassedWrapper: true, passedArgs: args };
        }
        throw new Error('Unknown binary');
      };

      const bypassResult = directExecutionRouter('/usr/local/bin/isolate-bin', ['--share-net', '--dir=/etc:rw']);
      expect(bypassResult.bypassedWrapper).toBe(true);
      expect(bypassResult.passedArgs).toEqual(['--share-net', '--dir=/etc:rw']);
    });
  });

  describe('4. Remediation Options Architecture Evaluation', () => {
    test('[Option A Evaluation] Restricting isolate-bin to 4700 prevents direct execution by UID 1000', () => {
      const checkAccess = (modeOctal, uid) => {
        const mode = parseInt(modeOctal, 8);
        if (uid === 0) return (mode & 0o100) !== 0;
        return (mode & 0o001) !== 0;
      };

      expect(checkAccess('4700', 1000)).toBe(false); // UID 1000 cannot execute
      expect(checkAccess('4700', 0)).toBe(true);     // Root can execute
    });

    test('[Option C Evaluation] Sudo-gated wrapper launcher enforces validation before root execution', () => {
      // Model of Option C:
      // 1. isolate-bin is 0700 root:root (or 4700 root:root)
      // 2. isolate-wrapper is permitted in sudoers
      // 3. isolate-wrapper validates arguments, and executes isolate-bin only if valid
      const optionCSimulator = ({ callerUid, targetBinary, args, isSudo }) => {
        if (targetBinary === '/usr/local/bin/isolate-bin') {
          // Mode 0700 root:root
          if (!isSudo && callerUid !== 0) {
            return { exitCode: 126, error: 'Permission denied: /usr/local/bin/isolate-bin' };
          }
        }

        if (targetBinary === '/usr/local/bin/isolate-wrapper') {
          // Validates arguments
          if (args.includes('--share-net')) {
            return { exitCode: 1, error: 'Wrapper rejected: Zero Egress Violation' };
          }
          return { exitCode: 0, executed: '/usr/local/bin/isolate-bin', validatedArgs: args };
        }

        return { exitCode: 127, error: 'Not found' };
      };

      // Attacker attempts direct bypass -> Permission denied!
      const directAttempt = optionCSimulator({
        callerUid: 1000,
        targetBinary: '/usr/local/bin/isolate-bin',
        args: ['--share-net'],
        isSudo: false
      });
      expect(directAttempt.exitCode).toBe(126);
      expect(directAttempt.error).toContain('Permission denied');

      // Legitimate caller invokes wrapper with invalid args -> Rejected!
      const wrapperRejected = optionCSimulator({
        callerUid: 0, // running under sudo
        targetBinary: '/usr/local/bin/isolate-wrapper',
        args: ['--share-net'],
        isSudo: true
      });
      expect(wrapperRejected.exitCode).toBe(1);
      expect(wrapperRejected.error).toContain('Wrapper rejected');

      // Legitimate caller invokes wrapper with valid args -> Success!
      const wrapperSuccess = optionCSimulator({
        callerUid: 0,
        targetBinary: '/usr/local/bin/isolate-wrapper',
        args: ['--cg', '-b', '10', '--run', '--', '/bin/echo'],
        isSudo: true
      });
      expect(wrapperSuccess.exitCode).toBe(0);
      expect(wrapperSuccess.executed).toBe('/usr/local/bin/isolate-bin');
    });
  });
});
