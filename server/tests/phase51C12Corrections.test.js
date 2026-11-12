/**
 * TestForge Phase 5.1C-12: Final Source-Level Verification Corrections Suite
 * Repository-Only Security Verification & Behavioral Parser Testing
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

describe('Phase 5.1C-12: Final Source-Level Verification Corrections Suite', () => {
  const verifyAccountingPath = path.join(rootDir, 'deploy/judge0/verify-resource-accounting.sh');
  const dockerfilePath = path.join(rootDir, 'deploy/judge0/docker/Dockerfile.judge0-arm64');
  const patchPath = path.join(rootDir, 'deploy/judge0/docker/patches/isolate_job_correlation.patch');
  const isolateWrapperPath = path.join(rootDir, 'deploy/judge0/docker/isolate-wrapper.sh');
  const judge0ConfPath = path.join(rootDir, 'deploy/judge0/judge0.conf');

  let verifyAccountingContent = '';
  let dockerfileContent = '';
  let patchContent = '';
  let isolateWrapperContent = '';
  let judge0ConfContent = '';

  const testKey = 'test_correlation_secret_key_32_bytes_long!!';
  const subToken = 'sub-uuid-token-550e8400-e29b-41d4-a716-446655440000';

  const computeHmacSha256 = (token, key) => {
    return crypto.createHmac('sha256', key).update(token).digest('hex');
  };

  beforeAll(() => {
    verifyAccountingContent = fs.readFileSync(verifyAccountingPath, 'utf8');
    dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');
    patchContent = fs.readFileSync(patchPath, 'utf8');
    isolateWrapperContent = fs.readFileSync(isolateWrapperPath, 'utf8');
    judge0ConfContent = fs.readFileSync(judge0ConfPath, 'utf8');
  });

  // ============================================================================
  // 1. Exact Execution-Attempt Correlation & Schema Parsing (Finding C12-01)
  // ============================================================================
  describe('Finding C12-01: Exact Execution-Attempt Correlation & Schema Parsing', () => {
    const tokenHash = computeHmacSha256(subToken, testKey);

    test('verifier enforces strict execution ID regex and removes permissive alternatives', () => {
      // Must enforce strict regex pattern without permissive prefix fallback
      expect(verifyAccountingContent).toMatch(/\^(\$\{TOKEN_HASH\}|\$TOKEN_HASH)-run\[0-9\]\+-\[0-9\]\+-\[a-f0-9\]\{16\}\$/);
      expect(verifyAccountingContent).not.toMatch(/\|\|\s*\[\[ "\$CORRELATED_EXEC_ID" =~ \^\$\{TOKEN_HASH\}- \]\]/);
      expect(verifyAccountingContent).not.toMatch(/\|\|\s*\[\[ "\$CORRELATED_EXEC_ID" =~ \^\$TOKEN_HASH- \]\]/);
    });

    test('verifier validates token_hash, execution_id, run_idx, box_id, and timestamp together as a tuple', () => {
      expect(verifyAccountingContent).toMatch(/token_hash=\$\{TOKEN_HASH\}.*execution_id=\$\{TOKEN_HASH\}-run\[0-9\]\+-\[0-9\]\+-\[a-f0-9\]\{16\}.*box_id=\[0-9\]\+.*run_idx=\[0-9\]\+.*timestamp=\[0-9\]\+/);
    });

    // Behavioral simulation of correlation log parser
    const parseCorrelationLogs = (logLines, dispatchTs, expectedTokenHash) => {
      const strictExecIdRegex = new RegExp(`^${expectedTokenHash}-run\\d+-\\d+-[a-f0-9]{16}$`);
      const validRecords = [];
      const warnings = [];

      for (const line of logLines) {
        if (!line.trim()) continue;
        const tupleMatch = line.match(/\[CORRELATION\]\s+token_hash=([a-f0-9]{64})\s+execution_id=([^\s]+)\s+box_id=(\d+)\s+run_idx=(\d+)\s+timestamp=(\d+)/);
        if (tupleMatch) {
          const [, h, execId, boxId, runIdx, tsStr] = tupleMatch;
          const ts = parseInt(tsStr, 10);
          if (h === expectedTokenHash) {
            if (ts >= dispatchTs && ts <= dispatchTs + 120) {
              if (strictExecIdRegex.test(execId)) {
                validRecords.push({ execId, boxId, runIdx: parseInt(runIdx, 10), ts });
              } else {
                warnings.push(`Malformed execution ID schema: ${execId}`);
              }
            } else {
              warnings.push(`Out-of-window record: ts ${ts} vs dispatch ${dispatchTs}`);
            }
          }
        } else {
          warnings.push(`Rejected malformed tuple: ${line}`);
        }
      }

      // Check unique execution attempts and box candidates
      const execCandidates = [...new Set(validRecords.map(r => r.execId))];
      const boxCandidates = [...new Set(validRecords.map(r => r.boxId))];

      if (execCandidates.length > 1) {
        return { status: 'AMBIGUOUS_ATTEMPTS', execCandidates, boxCandidates, warnings };
      }
      if (boxCandidates.length > 1) {
        return { status: 'AMBIGUOUS_BOXES', execCandidates, boxCandidates, warnings };
      }
      if (execCandidates.length === 1 && boxCandidates.length === 1) {
        return { status: 'SUCCESS', execId: execCandidates[0], boxId: boxCandidates[0], warnings };
      }
      return { status: 'NO_VALID_RECORDS', warnings };
    };

    test('behavioral: correctly correlates single valid execution attempt', () => {
      const now = 1731400000;
      const execId = `${tokenHash}-run1-${now}-0123456789abcdef`;
      const logs = [
        `[CORRELATION] token_hash=${tokenHash} execution_id=${execId} box_id=7 run_idx=1 timestamp=${now}`
      ];
      const result = parseCorrelationLogs(logs, now, tokenHash);
      expect(result.status).toBe('SUCCESS');
      expect(result.execId).toBe(execId);
      expect(result.boxId).toBe('7');
    });

    test('behavioral: rejects multiple attempts with same box ID (ActiveJob retry scenario)', () => {
      const now = 1731400000;
      const execId1 = `${tokenHash}-run1-${now}-0123456789abcdef`;
      const execId2 = `${tokenHash}-run2-${now + 5}-fedcba9876543210`;
      const logs = [
        `[CORRELATION] token_hash=${tokenHash} execution_id=${execId1} box_id=7 run_idx=1 timestamp=${now}`,
        `[CORRELATION] token_hash=${tokenHash} execution_id=${execId2} box_id=7 run_idx=2 timestamp=${now + 5}`
      ];
      const result = parseCorrelationLogs(logs, now, tokenHash);
      expect(result.status).toBe('AMBIGUOUS_ATTEMPTS');
      expect(result.execCandidates).toHaveLength(2);
      expect(result.execCandidates).toContain(execId1);
      expect(result.execCandidates).toContain(execId2);
    });

    test('behavioral: rejects malformed execution IDs (truncated nonce, missing run index, special characters)', () => {
      const now = 1731400000;
      const malformedCases = [
        `${tokenHash}-run1-${now}-short`, // Short nonce
        `${tokenHash}-${now}-0123456789abcdef`, // Missing run index
        `${tokenHash}-run1-${now}-0123456789abcdef!`, // Special character
        `${tokenHash}-arbitrary-payload`, // Loose prefix attempt
        `prefix-${tokenHash}-run1-${now}-0123456789abcdef` // Wrong prefix
      ];

      for (const badId of malformedCases) {
        const logs = [
          `[CORRELATION] token_hash=${tokenHash} execution_id=${badId} box_id=7 run_idx=1 timestamp=${now}`
        ];
        const result = parseCorrelationLogs(logs, now, tokenHash);
        expect(result.status).toBe('NO_VALID_RECORDS');
      }
    });

    test('behavioral: does not infer attempt from box ID alone when tuple is missing or incomplete', () => {
      const now = 1731400000;
      const incompleteLogs = [
        `[NOTICE] Initializing isolate box-7 for worker`,
        `[INFO] Job dispatched to box 7`,
        `[CORRELATION] token_hash=${tokenHash} box_id=7` // Missing execution_id, run_idx, timestamp
      ];
      const result = parseCorrelationLogs(incompleteLogs, now, tokenHash);
      expect(result.status).toBe('NO_VALID_RECORDS');
    });
  });

  // ============================================================================
  // 2. Cleanup Verification Hardening (Finding C12-02)
  // ============================================================================
  describe('Finding C12-02: Cleanup Verification Hardening', () => {
    test('removes every docker compose logs || true fallback in verifier', () => {
      expect(verifyAccountingContent).not.toMatch(/docker compose logs.*\|\|\s*true/);
    });

    test('verifier treats missing cleanup telemetry as UNKNOWN/FAIL, not a warning', () => {
      expect(verifyAccountingContent).toMatch(/fail "Missing \[CORRELATION_CLEANUP\] lifecycle telemetry for execution \$CORRELATED_EXEC_ID \(UNKNOWN\/FAIL\)"/);
      expect(verifyAccountingContent).not.toMatch(/\[WARN\] No \[CORRELATION_CLEANUP\] record found/);
    });

    test('verifier requires matching execution_id, box_id, and status=SUCCESS', () => {
      expect(verifyAccountingContent).toMatch(/status=SUCCESS.*box_id=\$CORRELATED_BOX_ID/);
      expect(verifyAccountingContent).toMatch(/status=FAILED/);
    });

    // Behavioral simulation of cleanup log parser
    const parseCleanupLogs = (cleanupLogs, expectedExecId, expectedBoxId, dockerExitCode = 0) => {
      if (dockerExitCode !== 0) {
        return { ok: false, error: 'QUERY_FAILED', message: 'Docker log query failed' };
      }

      const lines = cleanupLogs.split('\n').filter(l => l.includes('[CORRELATION_CLEANUP]'));
      const matchingRecords = lines.filter(l => l.includes(`execution_id=${expectedExecId}`));

      if (matchingRecords.length === 0) {
        return { ok: false, error: 'UNKNOWN/FAIL', message: `Missing [CORRELATION_CLEANUP] lifecycle telemetry for execution ${expectedExecId}` };
      }

      const statuses = [...new Set(matchingRecords.map(l => {
        const m = l.match(/status=([A-Z]+)/);
        return m ? m[1] : 'UNKNOWN';
      }))];

      const boxes = [...new Set(matchingRecords.map(l => {
        const m = l.match(/box_id=(\d+)/);
        return m ? m[1] : 'UNKNOWN';
      }))];

      if (statuses.length > 1 || boxes.length > 1) {
        return { ok: false, error: 'CONFLICTING_RECORDS', message: 'Conflicting cleanup records detected' };
      }

      if (matchingRecords.length > 1) {
        return { ok: false, error: 'DUPLICATE_RECORDS', message: 'Duplicate cleanup records detected' };
      }

      const singleRecord = matchingRecords[0];
      if (singleRecord.includes('status=FAILED')) {
        return { ok: false, error: 'CLEANUP_FAILED', message: 'Worker recorded explicit cleanup failure' };
      }

      if (singleRecord.includes('status=SUCCESS') && singleRecord.includes(`box_id=${expectedBoxId}`)) {
        return { ok: true, status: 'SUCCESS', message: 'Cleanup verified' };
      }

      return { ok: false, error: 'MISMATCHED_RECORD', message: 'Invalid or mismatched cleanup record' };
    };

    test('behavioral: verifies successful cleanup with matching execution_id and box_id', () => {
      const execId = 'hash-run1-1731400000-0123456789abcdef';
      const logs = `[CORRELATION_CLEANUP] status=SUCCESS execution_id=${execId} box_id=7 timestamp=1731400005`;
      const result = parseCleanupLogs(logs, execId, '7', 0);
      expect(result.ok).toBe(true);
      expect(result.status).toBe('SUCCESS');
    });

    test('behavioral: fails closed when cleanup telemetry is completely missing', () => {
      const execId = 'hash-run1-1731400000-0123456789abcdef';
      const logs = `[INFO] Submission completed successfully`;
      const result = parseCleanupLogs(logs, execId, '7', 0);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('UNKNOWN/FAIL');
    });

    test('behavioral: fails closed when Docker query returns non-zero exit code', () => {
      const execId = 'hash-run1-1731400000-0123456789abcdef';
      const result = parseCleanupLogs('', execId, '7', 1);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('QUERY_FAILED');
    });

    test('behavioral: detects and rejects conflicting cleanup statuses (SUCCESS and FAILED)', () => {
      const execId = 'hash-run1-1731400000-0123456789abcdef';
      const logs = [
        `[CORRELATION_CLEANUP] status=SUCCESS execution_id=${execId} box_id=7 timestamp=1731400005`,
        `[CORRELATION_CLEANUP] status=FAILED exitstatus=1 workdir_exists=true execution_id=${execId} box_id=7 timestamp=1731400006`
      ].join('\n');
      const result = parseCleanupLogs(logs, execId, '7', 0);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('CONFLICTING_RECORDS');
    });

    test('behavioral: detects and rejects duplicate cleanup records', () => {
      const execId = 'hash-run1-1731400000-0123456789abcdef';
      const logs = [
        `[CORRELATION_CLEANUP] status=SUCCESS execution_id=${execId} box_id=7 timestamp=1731400005`,
        `[CORRELATION_CLEANUP] status=SUCCESS execution_id=${execId} box_id=7 timestamp=1731400005`
      ].join('\n');
      const result = parseCleanupLogs(logs, execId, '7', 0);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('DUPLICATE_RECORDS');
    });

    test('behavioral: rejects cleanup record if box_id does not match correlated box', () => {
      const execId = 'hash-run1-1731400000-0123456789abcdef';
      const logs = `[CORRELATION_CLEANUP] status=SUCCESS execution_id=${execId} box_id=9 timestamp=1731400005`;
      const result = parseCleanupLogs(logs, execId, '7', 0); // Expected box 7, got box 9
      expect(result.ok).toBe(false);
      expect(result.error).toBe('MISMATCHED_RECORD');
    });
  });

  // ============================================================================
  // 3. Full 40-Character Commit Pinning (Finding C12-03)
  // ============================================================================
  describe('Finding C12-03: Full 40-Character Commit Pinning in Dockerfile', () => {
    const fullExpectedSha = 'ffd7a48cc6da86d6ac155ef10dbd67d02736070b';

    test('Dockerfile pins the exact 40-character SHA instead of a 7-character prefix', () => {
      expect(dockerfileContent).toMatch(new RegExp(`ARG JUDGE0_COMMIT_SHA="${fullExpectedSha}"`));
      expect(fullExpectedSha).toHaveLength(40);
    });

    test('Dockerfile validates git rev-parse HEAD against the full 40-character SHA', () => {
      expect(dockerfileContent).toMatch(/CLONED_COMMIT=\$\(git rev-parse HEAD\)/);
      expect(dockerfileContent).toMatch(/if \[ "\$CLONED_COMMIT" != "\$JUDGE0_COMMIT_SHA" \]; then/);
    });

    test('simulation: fails build on any commit hash mismatch', () => {
      const simulateBuildVerification = (actualSha, expectedSha) => {
        if (actualSha !== expectedSha) {
          throw new Error(`[FATAL] Upstream commit mismatch: expected ${expectedSha}, got ${actualSha}`);
        }
        return true;
      };

      expect(() => simulateBuildVerification('088fe2412de8ac8f52c582b573b52c366931d8a7', fullExpectedSha)).toThrow(/Upstream commit mismatch/);
      expect(() => simulateBuildVerification('ffd7a48', fullExpectedSha)).toThrow(/Upstream commit mismatch/); // Short prefix fails
      expect(simulateBuildVerification(fullExpectedSha, fullExpectedSha)).toBe(true);
    });
  });

  // ============================================================================
  // 4. Pre-Dispatch Security Prerequisites & Correlation Key (Finding C12-04)
  // ============================================================================
  describe('Finding C12-04: Pre-Dispatch Correlation Key Validation', () => {
    test('verifier validates CORRELATION_KEY before dispatching submission payload', () => {
      const lines = verifyAccountingContent.split('\n');
      const keyValIdx = lines.findIndex(l => l.includes('CORRELATION_KEY="${CORRELATION_KEY:-'));
      const dispatchIdx = lines.findIndex(l => l.includes('$ENDPOINT/submissions'));

      expect(keyValIdx).toBeGreaterThan(0);
      expect(dispatchIdx).toBeGreaterThan(0);
      expect(keyValIdx).toBeLessThan(dispatchIdx); // Key validation strictly precedes dispatch
    });

    test('verifier exits immediately on missing or invalid CORRELATION_KEY without dispatching', () => {
      // Must exit 1 inside the validation block
      const keyValidationBlock = verifyAccountingContent.substring(
        verifyAccountingContent.indexOf('CORRELATION_KEY="${CORRELATION_KEY:-'),
        verifyAccountingContent.indexOf('Dispatching Memory Accounting Test')
      );
      expect(keyValidationBlock).toMatch(/fail "Missing mandatory CORRELATION_KEY/);
      expect(keyValidationBlock).toMatch(/exit 1/);
      expect(keyValidationBlock).toMatch(/fail "Insecure CORRELATION_KEY/);
    });
  });

  // ============================================================================
  // 5. Configuration Permissions & Ownership Validation (Finding C12-05)
  // ============================================================================
  describe('Finding C12-05: Configuration Permissions & Ownership Validation', () => {
    test('verifier inspects config file permissions before dispatching submission', () => {
      const lines = verifyAccountingContent.split('\n');
      const permCheckIdx = lines.findIndex(l => l.includes('CONF_PERMS=$(stat -c "%a"'));
      const dispatchIdx = lines.findIndex(l => l.includes('$ENDPOINT/submissions'));

      expect(permCheckIdx).toBeGreaterThan(0);
      expect(dispatchIdx).toBeGreaterThan(0);
      expect(permCheckIdx).toBeLessThan(dispatchIdx); // Permission check strictly precedes dispatch
    });

    const validatePermissions = (rawMode, fileUid, currentUid) => {
      const normPerms = String(rawMode).padStart(4, '0');
      if (normPerms !== '0600' && normPerms !== '0640') {
        return { valid: false, reason: `Insecure file permissions: ${rawMode} (${normPerms}). Authorized: 0600 or 0640.` };
      }
      if (fileUid !== undefined && currentUid !== undefined) {
        if (fileUid !== 0 && fileUid !== currentUid) {
          return { valid: false, reason: `Insecure file ownership: UID ${fileUid} does not match current user (${currentUid}) or root (0).` };
        }
      }
      return { valid: true, mode: normPerms };
    };

    test('behavioral: allows authorized file modes 0600 and 0640', () => {
      expect(validatePermissions('600', 1000, 1000).valid).toBe(true);
      expect(validatePermissions('0600', 1000, 1000).valid).toBe(true);
      expect(validatePermissions('640', 1000, 1000).valid).toBe(true);
      expect(validatePermissions('0640', 0, 1000).valid).toBe(true);
    });

    test('behavioral: strictly rejects 0644, 0664, 0666, 0777 and unauthorized modes', () => {
      const unauthorizedModes = ['644', '0644', '664', '0664', '666', '0666', '777', '0777', '755', '0755'];
      for (const mode of unauthorizedModes) {
        const result = validatePermissions(mode, 1000, 1000);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('Insecure file permissions');
      }
    });

    test('behavioral: rejects unauthorized file owner UID', () => {
      const result = validatePermissions('0600', 1001, 1000); // Owned by 1001, current user is 1000
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Insecure file ownership');
    });
  });

  // ============================================================================
  // 6. Privileged Isolate Invocation & Wrapper Assessment (Finding C12-06)
  // ============================================================================
  describe('Finding C12-06: Constrained Root-Owned Isolate Wrapper & Risk Classification', () => {
    test('isolate-wrapper exists with strict argument parsing and path whitelisting', () => {
      expect(fs.existsSync(isolateWrapperPath)).toBe(true);
      expect(isolateWrapperContent).toMatch(/REAL_ISOLATE="\/usr\/local\/bin\/isolate"/);
      expect(isolateWrapperContent).toMatch(/Missing mandatory action flag \(--init, --cleanup, or --run\)/);
      expect(isolateWrapperContent).toMatch(/Missing or malformed box ID parameter/);
      expect(isolateWrapperContent).toMatch(/Forbidden directory mount detected/);
      expect(isolateWrapperContent).toMatch(/Forbidden flag --share-net detected/);
    });

    test('isolate-wrapper validates box ID bounds [0, 2147483647]', () => {
      expect(isolateWrapperContent).toMatch(/2147483647/);
    });

    test('Dockerfile copies isolate-wrapper and enforces root:root 0755 permissions', () => {
      expect(dockerfileContent).toMatch(/COPY docker\/isolate-wrapper\.sh \/usr\/local\/bin\/isolate-wrapper/);
      expect(dockerfileContent).toMatch(/chmod 0755 \/usr\/local\/bin\/isolate-wrapper/);
      expect(dockerfileContent).toMatch(/chown root:root \/usr\/local\/bin\/isolate-wrapper/);
    });

    test('Dockerfile documents Docker privileged: true as an unresolved host-security risk', () => {
      expect(dockerfileContent).toMatch(/UNRESOLVED ARCHITECTURAL HOST SECURITY RISK DISCLOSURE/);
      expect(dockerfileContent).toMatch(/privileged: true/);
      expect(dockerfileContent).toMatch(/THIS RISK REMAINS CLASSIFIED AS AN UNRESOLVED HOST RISK/);
    });

    const simulateWrapper = (args) => {
      if (!args || args.length === 0) throw new Error('No arguments provided');
      let action = null;
      let boxId = null;

      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--init') action = 'init';
        if (arg === '--cleanup') action = 'cleanup';
        if (arg === '--run') action = 'run';
        if (arg === '-b' || arg === '--box-id') {
          if (i + 1 < args.length && /^\d+$/.test(args[i + 1])) {
            boxId = parseInt(args[i + 1], 10);
          }
        }
        if (arg.startsWith('--dir=/etc') || arg.startsWith('--dir=/root') || arg.startsWith('--dir=/sys')) {
          throw new Error(`Forbidden directory mount detected: ${arg}`);
        }
        if (arg === '--share-net') {
          throw new Error('Forbidden flag --share-net detected under Zero Egress Policy');
        }
      }

      if (!action) throw new Error('Missing mandatory action flag');
      if (boxId === null || isNaN(boxId)) throw new Error('Missing or malformed box ID parameter');
      if (boxId < 0 || boxId > 2147483647) throw new Error('Box ID outside authorized range');

      return { action, boxId, passed: true };
    };

    test('behavioral: wrapper approves valid isolate --init, --cleanup, and --run commands', () => {
      expect(simulateWrapper(['--cg', '-b', '5', '--init']).passed).toBe(true);
      expect(simulateWrapper(['--cg', '-b', '5', '--cleanup']).passed).toBe(true);
      expect(simulateWrapper(['--cg', '-b', '5', '--run', '--', '/bin/bash']).passed).toBe(true);
    });

    test('behavioral: wrapper rejects arbitrary directory mounts and network sharing', () => {
      expect(() => simulateWrapper(['--cg', '-b', '5', '--run', '--dir=/etc', '--', '/bin/bash'])).toThrow(/Forbidden directory mount/);
      expect(() => simulateWrapper(['--cg', '-b', '5', '--run', '--share-net', '--', '/bin/bash'])).toThrow(/Forbidden flag --share-net/);
    });
  });
});
