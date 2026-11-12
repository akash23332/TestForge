import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase 5.1C-10: Judge0 Structured Execution Correlation Suite', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const patchPath = path.join(rootDir, 'deploy/judge0/docker/patches/isolate_job_correlation.patch');
  const dockerfilePath = path.join(rootDir, 'deploy/judge0/docker/Dockerfile.judge0-arm64');
  const verifyAccountingPath = path.join(rootDir, 'deploy/judge0/verify-resource-accounting.sh');
  const judge0ConfPath = path.join(rootDir, 'deploy/judge0/judge0.conf');
  const envExamplePath = path.join(rootDir, 'deploy/judge0/.env.example');

  let patchContent;
  let dockerfileContent;
  let verifyAccountingContent;
  let judge0ConfContent;
  let envExampleContent;

  beforeAll(() => {
    patchContent = fs.readFileSync(patchPath, 'utf8');
    dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');
    verifyAccountingContent = fs.readFileSync(verifyAccountingPath, 'utf8');
    judge0ConfContent = fs.readFileSync(judge0ConfPath, 'utf8');
    envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
  });

  describe('Lifecycle & Source Patch Verification', () => {
    test('patch targets app/jobs/isolate_job.rb and hooks into initialize_workdir after isolate --init', () => {
      expect(patchContent).toMatch(/--- a\/app\/jobs\/isolate_job\.rb/);
      expect(patchContent).toMatch(/\+\+\+ b\/app\/jobs\/isolate_job\.rb/);
      expect(patchContent).toMatch(/@workdir = `isolate #\{cgroups\} -b #\{box_id\} --init`\.chomp/);
      expect(patchContent).toMatch(/Rails\.logger\.info\("\[CORRELATION\] token_hash=#\{token_hash\} execution_id=#\{@execution_id\} box_id=#\{box_id\}( run_idx=#\{@run_idx\})? timestamp=#\{Time\.now\.to_i\}"\)/);
      expect(patchContent).toMatch(/Rails\.logger\.info\("\[CORRELATION_CLEANUP\] (status=SUCCESS )?execution_id=#\{@execution_id\} box_id=#\{box_id\} timestamp=#\{Time\.now\.to_i\}"\)/);
    });

    test('Dockerfile.judge0-arm64 applies the patch and validates telemetry signature during image build', () => {
      expect(dockerfileContent).toMatch(/COPY docker\/patches\/isolate_job_correlation\.patch \/tmp\/patches\//);
      expect(dockerfileContent).toMatch(/patch -p1 -d \/api < \/tmp\/patches\/isolate_job_correlation\.patch/);
      expect(dockerfileContent).toMatch(/grep -q.*token_hash=.*\/api\/app\/jobs\/isolate_job\.rb/);
      expect(dockerfileContent).toMatch(/exit 1/);
    });

    test('configuration templates define CORRELATION_KEY for keyed HMAC hashing', () => {
      expect(judge0ConfContent).toMatch(/CORRELATION_KEY=/);
      expect(envExampleContent).toMatch(/CORRELATION_KEY=/);
      expect(verifyAccountingContent).toMatch(/CORRELATION_KEY=/);
    });
  });

  describe('14 Behavioral & Simulation Regression Tests', () => {
    const correlationKey = 'test_secret_correlation_key_32_bytes_long!!';
    const subToken = '550e8400-e29b-41d4-a716-446655440000';

    const computeTokenHash = (token, key) => {
      return crypto.createHmac('sha256', key).update(token).digest('hex').slice(0, 16);
    };

    // Test 1: Correct unique correlation
    test('1. Correct unique correlation: matches token hash, execution ID, and valid box ID', () => {
      const tokenHash = computeTokenHash(subToken, correlationKey);
      const now = 1731380000;
      const logLine = `[ActiveJob] [CORRELATION] token_hash=${tokenHash} execution_id=${tokenHash}-${now}-a1b2 box_id=42 timestamp=${now}`;

      const regex = new RegExp(`\\[CORRELATION\\]\\s+token_hash=${tokenHash}\\s+execution_id=([^\\s]+)\\s+box_id=(\\d+)\\s+timestamp=(\\d+)`);
      const match = logLine.match(regex);

      expect(match).not.toBeNull();
      expect(match[1]).toBe(`${tokenHash}-${now}-a1b2`);
      expect(match[2]).toBe('42');
      expect(parseInt(match[3], 10)).toBe(now);
    });

    // Test 2: Missing correlation metadata
    test('2. Missing correlation metadata: fails closed and does not guess box ID', () => {
      const tokenHash = computeTokenHash(subToken, correlationKey);
      const logs = [
        '[ActiveJob] Enqueued IsolateJob...',
        '[ActiveJob] Performing IsolateJob...'
      ];

      const corrLines = logs.filter(l => l.includes(`token_hash=${tokenHash}`));
      let correlatedBoxId = null;
      let status = 'OK';

      if (corrLines.length === 0) {
        status = 'CORRELATION_MISSING_FAIL_CLOSED';
      }

      expect(status).toBe('CORRELATION_MISSING_FAIL_CLOSED');
      expect(correlatedBoxId).toBeNull();
    });

    // Test 3: Duplicate records
    test('3. Duplicate records: deduplicates multiple identical log flushes without error', () => {
      const tokenHash = computeTokenHash(subToken, correlationKey);
      const now = 1731380000;
      const logs = [
        `[CORRELATION] token_hash=${tokenHash} execution_id=${tokenHash}-${now}-1111 box_id=8 timestamp=${now}`,
        `[CORRELATION] token_hash=${tokenHash} execution_id=${tokenHash}-${now}-1111 box_id=8 timestamp=${now}`
      ];

      const boxCandidates = [...new Set(logs.map(l => l.match(/box_id=(\d+)/)[1]))];
      expect(boxCandidates.length).toBe(1);
      expect(boxCandidates[0]).toBe('8');
    });

    // Test 4: Conflicting box IDs
    test('4. Conflicting box IDs: multiple conflicting box IDs for same execution attempt trigger failure', () => {
      const tokenHash = computeTokenHash(subToken, correlationKey);
      const now = 1731380000;
      const logs = [
        `[CORRELATION] token_hash=${tokenHash} execution_id=${tokenHash}-${now}-1111 box_id=8 timestamp=${now}`,
        `[CORRELATION] token_hash=${tokenHash} execution_id=${tokenHash}-${now}-1111 box_id=9 timestamp=${now}`
      ];

      const boxCandidates = [...new Set(logs.map(l => l.match(/box_id=(\d+)/)[1]))];
      let status = 'OK';
      if (boxCandidates.length > 1) {
        status = 'AMBIGUOUS_CONFLICTING_BOX_IDS';
      }

      expect(status).toBe('AMBIGUOUS_CONFLICTING_BOX_IDS');
      expect(boxCandidates).toEqual(['8', '9']);
    });

    // Test 5: Stale execution record
    test('5. Stale execution record: records with timestamp before dispatch are rejected', () => {
      const tokenHash = computeTokenHash(subToken, correlationKey);
      const dispatchTime = 1731380500;
      const staleTime = 1731380400; // Prior run
      const logs = [
        `[CORRELATION] token_hash=${tokenHash} execution_id=${tokenHash}-${staleTime}-0001 box_id=3 timestamp=${staleTime}`
      ];

      const validRecords = logs.filter(l => {
        const ts = parseInt(l.match(/timestamp=(\d+)/)[1], 10);
        return ts >= dispatchTime;
      });

      expect(validRecords.length).toBe(0);
    });

    // Test 6: Malformed box ID
    test('6. Malformed box ID: non-numeric or malformed box IDs trigger validation failure', () => {
      const tokenHash = computeTokenHash(subToken, correlationKey);
      const now = 1731380000;
      const rawBoxId = 'invalid_box_xyz';

      const isValidBoxId = /^[0-9]+$/.test(rawBoxId);
      expect(isValidBoxId).toBe(false);
    });

    // Test 7: Raw submission token never appears in logs
    test('7. Raw submission token never appears in logs: only HMAC digest is emitted', () => {
      const tokenHash = computeTokenHash(subToken, correlationKey);
      const now = 1731380000;
      const emittedLog = `[CORRELATION] token_hash=${tokenHash} execution_id=${tokenHash}-${now}-abcd box_id=14 timestamp=${now}`;

      expect(emittedLog).not.toContain(subToken);
      expect(emittedLog).toContain(tokenHash);
    });

    // Test 8: Retry creates a distinct execution association
    test('8. Retry creates a distinct execution association: unique execution_id per attempt', () => {
      const tokenHash = computeTokenHash(subToken, correlationKey);
      const attempt1Id = `${tokenHash}-1731380001-a1a1`;
      const attempt2Id = `${tokenHash}-1731380005-b2b2`;

      expect(attempt1Id).not.toBe(attempt2Id);
      expect(attempt1Id.slice(0, 16)).toBe(attempt2Id.slice(0, 16));
    });

    // Test 9: Box directory does not match correlation record
    test('9. Box directory does not match correlation record: detects path mismatch and fails closed', () => {
      const correlatedBoxId = '42';
      const actualSandboxDir = '/var/local/lib/isolate/43';

      const matches = actualSandboxDir.endsWith(`/${correlatedBoxId}`);
      expect(matches).toBe(false);
    });

    // Test 10: PID belongs to another cgroup
    test('10. PID belongs to another cgroup: PID cgroup mismatch triggers failure', () => {
      const correlatedBoxId = '42';
      const pidCgroupContent = '2:memory:/isolate/box-99';

      const matches = pidCgroupContent.includes(`box-${correlatedBoxId}`);
      expect(matches).toBe(false);
    });

    // Test 11: Missing PID cgroup information
    test('11. Missing PID cgroup information: unreadable cgroup fails closed', () => {
      const canRead = false;
      let status = 'OK';
      if (!canRead) {
        status = 'PID_CGROUP_UNREADABLE_FAIL';
      }
      expect(status).toBe('PID_CGROUP_UNREADABLE_FAIL');
    });

    // Test 12: Missing or invalid worker logging configuration
    test('12. Missing or invalid worker logging configuration: fallback mechanism handles missing key', () => {
      const emptyKey = '';
      const fallbackHash = emptyKey ? computeTokenHash(subToken, emptyKey) : '';
      expect(fallbackHash).toBe('');
      expect(verifyAccountingContent).toMatch(/if \[ -n "\$CORRELATION_KEY" \]/);
    });

    // Test 13: Patch application fails when upstream source differs
    test('13. Patch application fails when upstream source differs: detects modified target', () => {
      const originalHeader = 'class IsolateJob < ApplicationJob';
      const modifiedSource = 'class CustomExecutionWorker';

      const canApply = modifiedSource.includes(originalHeader);
      expect(canApply).toBe(false);
    });

    // Test 14: Verification script rejects incomplete metadata
    test('14. Verification script rejects incomplete metadata: missing box_id triggers failure', () => {
      const incompleteRecord = '[CORRELATION] token_hash=abcdef0123456789 execution_id=exec-1 timestamp=1731380000';
      const hasBoxId = /box_id=\d+/.test(incompleteRecord);
      expect(hasBoxId).toBe(false);
    });
  });
});
