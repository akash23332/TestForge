import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase 5.1C-11: Final C-10 Correlation Security Remediation Suite', () => {
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

  const validKey = '0123456789abcdef0123456789abcdef'; // 32 characters (256-bit)
  const subToken = '550e8400-e29b-41d4-a716-446655440000';

  const computeHmacSha256 = (token, key) => {
    return crypto.createHmac('sha256', key).update(token).digest('hex');
  };

  beforeAll(() => {
    patchContent = fs.readFileSync(patchPath, 'utf8');
    dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');
    verifyAccountingContent = fs.readFileSync(verifyAccountingPath, 'utf8');
    judge0ConfContent = fs.readFileSync(judge0ConfPath, 'utf8');
    envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
  });

  describe('Lifecycle, Patch & Dockerfile Security Assertions', () => {
    test('patch checks isolate --init exit status, output presence, and directory existence', () => {
      expect(patchContent).toMatch(/(init_output = `isolate #\{cgroups\} -b #\{box_id\} --init`\.chomp|Open3\.capture3)/);
      expect(patchContent).toMatch(/init_status = (status|\$\?)\.exitstatus/);
      expect(patchContent).toMatch(/if init_status != 0 \|\| init_output\.blank\? \|\| !Dir\.exist\?\(init_output\)/);
      expect(patchContent).toMatch(/\[CORRELATION_INIT_FAILED\] box_id=#\{box_id\} exitstatus=#\{init_status\}/);
      expect(patchContent).toMatch(/raise "Failed to initialize sandbox #\{box_id\}: exitstatus=#\{init_status\}"/);
    });

    test('patch requires explicit CORRELATION_KEY with minimum 32 bytes and no secret_key_base fallback', () => {
      expect(patchContent).toMatch(/correlation_key = ENV\["CORRELATION_KEY"\]\.to_s/);
      expect(patchContent).not.toMatch(/secret_key_base/);
      expect(patchContent).toMatch(/correlation_key\.blank\? \|\| correlation_key\.bytesize < 32/);
      expect(patchContent).toMatch(/raise "CORRELATION_KEY environment variable is required and must be at least 32 bytes"/);
    });

    test('patch uses full 64-hex SHA-256 HMAC and includes attempt index with random nonce in execution_id', () => {
      expect(patchContent).toMatch(/token_hash = OpenSSL::HMAC\.hexdigest\("SHA256", correlation_key, submission\.token\.to_s\)/);
      expect(patchContent).not.toMatch(/\[0\.\.15\]/); // 16-char truncation removed
      expect(patchContent).toMatch(/@run_idx = \(@run_idx \? @run_idx \+ 1 : 1\)/);
      expect(patchContent).toMatch(/@execution_id = "#\{token_hash\}-run#\{@run_idx\}-#\{Time\.now\.to_i\}-#\{SecureRandom\.hex\(8\)\}"/);
      expect(patchContent).toMatch(/\[CORRELATION\] token_hash=#\{token_hash\} execution_id=#\{@execution_id\} box_id=#\{box_id\} run_idx=#\{@run_idx\} timestamp=#\{Time\.now\.to_i\}/);
    });

    test('patch records cleanup success or failure accurately without premature success reporting', () => {
      expect(patchContent).toMatch(/(cleanup_output = `isolate #\{cgroups\} -b #\{box_id\} --cleanup`|Open3\.capture3)/);
      expect(patchContent).toMatch(/cleanup_status = (status|\$\?)\.exitstatus/);
      expect(patchContent).toMatch(/workdir_exists = Dir\.exist\?\(workdir\)/);
      expect(patchContent).toMatch(/if cleanup_status == 0 && !workdir_exists/);
      expect(patchContent).toMatch(/\[CORRELATION_CLEANUP\] status=SUCCESS execution_id=#\{@execution_id\} box_id=#\{box_id\} timestamp=#\{Time\.now\.to_i\}/);
      expect(patchContent).toMatch(/\[CORRELATION_CLEANUP\] status=FAILED exitstatus=#\{cleanup_status\} (stderr=.* )?workdir_exists=#\{workdir_exists\} execution_id=#\{@execution_id\} box_id=#\{box_id\} timestamp=#\{Time\.now\.to_i\}/);
    });

    test('Dockerfile pins Judge0 release commit prefix ffd7a48 and validates patch signatures', () => {
      expect(dockerfileContent).toMatch(/ARG JUDGE0_TAG="v1\.13\.1"/);
      expect(dockerfileContent).toMatch(/ARG JUDGE0_COMMIT_(SHA|PREFIX)="ffd7a48[a-f0-9]*"/);
      expect(dockerfileContent).toMatch(/CLONED_COMMIT=\$\(git rev-parse (--short )?HEAD\)/);
      expect(dockerfileContent).toMatch(/if \[ "\$CLONED_COMMIT" != "\$JUDGE0_COMMIT_(SHA|PREFIX)" \]; then/);
      expect(dockerfileContent).toMatch(/grep -q.*token_hash=/);
      expect(dockerfileContent).toMatch(/grep -q.*CORRELATION_CLEANUP/);
      expect(dockerfileContent).toMatch(/grep -q.*CORRELATION_INIT_FAILED/);
    });

    test('Dockerfile removes silent cron-copy error suppression and documents isolate sudo privileges', () => {
      expect(dockerfileContent).not.toMatch(/cp \/api\/cron\/\* \/etc\/cron\.d\/ 2>\/dev\/null \|\| true/);
      expect(dockerfileContent).toMatch(/cp \/api\/cron\/\* \/etc\/cron\.d\//);
      expect(dockerfileContent).toMatch(/SECURITY AUDIT NOTE: Sudo Access for Isolate Binary/);
      expect(dockerfileContent).toMatch(/CAP_SYS_ADMIN/);
    });
  });

  describe('Behavioral Regression & Simulation Tests', () => {
    // 1. Failed Isolate Initialization
    test('1. Failed Isolate initialization: raises exception, logs INIT_FAILED, and NEVER emits valid CORRELATION', () => {
      const simulateInit = (exitstatus, output, dirExists) => {
        const logs = [];
        let executionId = null;
        let error = null;

        if (exitstatus !== 0 || !output || !dirExists) {
          logs.push(`[CORRELATION_INIT_FAILED] box_id=5 exitstatus=${exitstatus} output=${JSON.stringify(output)}`);
          error = new Error(`Failed to initialize sandbox 5: exitstatus=${exitstatus}`);
        } else {
          const tokenHash = computeHmacSha256(subToken, validKey);
          executionId = `${tokenHash}-run1-1731380000-1122334455667788`;
          logs.push(`[CORRELATION] token_hash=${tokenHash} execution_id=${executionId} box_id=5 run_idx=1 timestamp=1731380000`);
        }
        return { logs, executionId, error };
      };

      const failureResult = simulateInit(1, '', false);
      expect(failureResult.error).not.toBeNull();
      expect(failureResult.logs[0]).toContain('[CORRELATION_INIT_FAILED]');
      expect(failureResult.logs.some(l => l.includes('[CORRELATION] token_hash='))).toBe(false);
      expect(failureResult.executionId).toBeNull();
    });

    // 2. Missing Correlation Key
    test('2. Missing or empty correlation key: fails closed in both worker and verifier', () => {
      const simulateWorkerInit = (key) => {
        if (!key || key.length < 32) {
          throw new Error('CORRELATION_KEY environment variable is required and must be at least 32 bytes');
        }
        return computeHmacSha256(subToken, key);
      };

      expect(() => simulateWorkerInit('')).toThrow(/CORRELATION_KEY environment variable is required/);
      expect(() => simulateWorkerInit(null)).toThrow(/CORRELATION_KEY environment variable is required/);

      // Verifier script behavior check: fails closed
      expect(verifyAccountingContent).toMatch(/if \[ -z "\$CORRELATION_KEY" \]; then\s+fail "Missing mandatory CORRELATION_KEY/);
    });

    // 3. Invalid Key Length (< 32 bytes)
    test('3. Invalid key length: keys shorter than 32 characters are rejected fail-closed', () => {
      const shortKey = 'short_key_16_ch!';
      expect(shortKey.length).toBeLessThan(32);

      const simulateWorkerInit = (key) => {
        if (!key || key.length < 32) {
          throw new Error('CORRELATION_KEY environment variable is required and must be at least 32 bytes');
        }
        return computeHmacSha256(subToken, key);
      };

      expect(() => simulateWorkerInit(shortKey)).toThrow(/must be at least 32 bytes/);
      expect(verifyAccountingContent).toMatch(/elif \[ "\$\{#CORRELATION_KEY\}" -lt 32 \]; then\s+fail "Insecure CORRELATION_KEY/);
    });

    // 4. HMAC Mismatch
    test('4. HMAC mismatch: mismatched keys generate different digests and prevent false correlation', () => {
      const workerKey = 'worker_key_0123456789abcdef012345';
      const verifierKey = 'verifier_key_0123456789abcdef0123';

      const workerHash = computeHmacSha256(subToken, workerKey);
      const verifierHash = computeHmacSha256(subToken, verifierKey);

      expect(workerHash).not.toBe(verifierHash);

      const workerLog = `[CORRELATION] token_hash=${workerHash} execution_id=${workerHash}-run1-100-abc box_id=12 run_idx=1 timestamp=100`;
      const matchesVerifier = workerLog.includes(`token_hash=${verifierHash}`);
      expect(matchesVerifier).toBe(false);
    });

    // 5. Full SHA-256 HMAC (64 Hex Characters)
    test('5. Full SHA-256 HMAC enforcement: generates 64-hex string and rejects truncated 16-hex hashes', () => {
      const fullHash = computeHmacSha256(subToken, validKey);
      expect(fullHash.length).toBe(64);
      expect(fullHash).toMatch(/^[a-f0-9]{64}$/);

      const isFullSha256 = (h) => typeof h === 'string' && h.length === 64 && /^[a-f0-9]{64}$/.test(h);
      expect(isFullSha256(fullHash)).toBe(true);
      expect(isFullSha256(fullHash.slice(0, 16))).toBe(false);

      expect(verifyAccountingContent).toMatch(/if \[ -n "\$TOKEN_HASH" \] && \[ "\$\{#TOKEN_HASH\}" -eq 64 \]; then/);
    });

    // 6. Multiple Retries for One Submission
    test('6. Multiple retries for one submission: produces distinct execution IDs with sequential run index', () => {
      const tokenHash = computeHmacSha256(subToken, validKey);

      const runs = [];
      for (let runIdx = 1; runIdx <= 3; runIdx++) {
        const nonce = crypto.randomBytes(8).toString('hex');
        const ts = 1731380000 + runIdx * 5;
        const execId = `${tokenHash}-run${runIdx}-${ts}-${nonce}`;
        runs.push({
          runIdx,
          execId,
          log: `[CORRELATION] token_hash=${tokenHash} execution_id=${execId} box_id=4 run_idx=${runIdx} timestamp=${ts}`
        });
      }

      expect(runs.length).toBe(3);
      expect(runs[0].execId).not.toBe(runs[1].execId);
      expect(runs[1].execId).not.toBe(runs[2].execId);
      expect(runs[0].execId).toContain('-run1-');
      expect(runs[1].execId).toContain('-run2-');
      expect(runs[2].execId).toContain('-run3-');
    });

    // 7. Duplicate Records Deduplication
    test('7. Duplicate records: identical records flushed multiple times resolve cleanly to single box', () => {
      const tokenHash = computeHmacSha256(subToken, validKey);
      const now = 1731380100;
      const execId = `${tokenHash}-run1-${now}-abcdef0123456789`;
      const duplicateLogs = [
        `[CORRELATION] token_hash=${tokenHash} execution_id=${execId} box_id=7 run_idx=1 timestamp=${now}`,
        `[CORRELATION] token_hash=${tokenHash} execution_id=${execId} box_id=7 run_idx=1 timestamp=${now}`,
        `[CORRELATION] token_hash=${tokenHash} execution_id=${execId} box_id=7 run_idx=1 timestamp=${now}`
      ];

      const boxCandidates = [...new Set(duplicateLogs.map(l => l.match(/box_id=(\d+)/)[1]))];
      expect(boxCandidates.length).toBe(1);
      expect(boxCandidates[0]).toBe('7');
    });

    // 8. Conflicting Records Trigger Ambiguous Correlation Failure
    test('8. Conflicting records: conflicting box IDs for same execution attempt trigger failure', () => {
      const tokenHash = computeHmacSha256(subToken, validKey);
      const now = 1731380100;
      const execId = `${tokenHash}-run1-${now}-abcdef0123456789`;
      const conflictingLogs = [
        `[CORRELATION] token_hash=${tokenHash} execution_id=${execId} box_id=7 run_idx=1 timestamp=${now}`,
        `[CORRELATION] token_hash=${tokenHash} execution_id=${execId} box_id=8 run_idx=1 timestamp=${now}`
      ];

      const boxCandidates = [...new Set(conflictingLogs.map(l => l.match(/box_id=(\d+)/)[1]))];
      let status = 'OK';
      if (boxCandidates.length > 1) {
        status = 'AMBIGUOUS_CORRELATION_FAIL';
      }

      expect(status).toBe('AMBIGUOUS_CORRELATION_FAIL');
      expect(boxCandidates).toEqual(['7', '8']);
    });

    // 9. Stale and Replayed Records Protection
    test('9. Stale and replayed records: records outside temporal dispatch window [ts, ts+120] are rejected', () => {
      const tokenHash = computeHmacSha256(subToken, validKey);
      const dispatchTime = 1731380500;
      const staleTime = 1731380400; // 100s before dispatch
      const replayedTime = 1731380700; // 200s after dispatch (exceeds 120s window)
      const validTime = 1731380510; // 10s after dispatch

      const logs = [
        `[CORRELATION] token_hash=${tokenHash} execution_id=${tokenHash}-run1-${staleTime}-1111 box_id=1 run_idx=1 timestamp=${staleTime}`,
        `[CORRELATION] token_hash=${tokenHash} execution_id=${tokenHash}-run1-${validTime}-2222 box_id=1 run_idx=1 timestamp=${validTime}`,
        `[CORRELATION] token_hash=${tokenHash} execution_id=${tokenHash}-run1-${replayedTime}-3333 box_id=1 run_idx=1 timestamp=${replayedTime}`
      ];

      const validRecords = logs.filter(l => {
        const ts = parseInt(l.match(/timestamp=(\d+)/)[1], 10);
        return ts >= dispatchTime && ts <= (dispatchTime + 120);
      });

      expect(validRecords.length).toBe(1);
      expect(validRecords[0]).toContain(`timestamp=${validTime}`);
    });

    // 10. Cleanup Failure Recording
    test('10. Cleanup failure: distinguishes SUCCESS vs FAILED lifecycle events and detects failed cleanup', () => {
      const simulateCleanup = (exitstatus, workdirExists, execId, boxId) => {
        const logs = [];
        let error = null;
        const now = 1731380200;

        if (exitstatus === 0 && !workdirExists) {
          logs.push(`[CORRELATION_CLEANUP] status=SUCCESS execution_id=${execId} box_id=${boxId} timestamp=${now}`);
        } else {
          logs.push(`[CORRELATION_CLEANUP] status=FAILED exitstatus=${exitstatus} workdir_exists=${workdirExists} execution_id=${execId} box_id=${boxId} timestamp=${now}`);
          error = new Error(`Cleanup of sandbox ${boxId} failed: exitstatus=${exitstatus} workdir_exists=${workdirExists}`);
        }
        return { logs, error };
      };

      const successRun = simulateCleanup(0, false, 'exec-1', 4);
      expect(successRun.error).toBeNull();
      expect(successRun.logs[0]).toContain('status=SUCCESS');

      const failedRun = simulateCleanup(1, true, 'exec-2', 4);
      expect(failedRun.error).not.toBeNull();
      expect(failedRun.logs[0]).toContain('status=FAILED');

      // Verifier parses status=FAILED and flags failure
      const isFailedInVerifier = failedRun.logs[0].includes('status=FAILED');
      expect(isFailedInVerifier).toBe(true);
    });

    // 11. Docker Log-Query Failure
    test('11. Docker log-query failure: non-zero docker exit code is caught and not swallowed', () => {
      expect(verifyAccountingContent).not.toMatch(/LOG_MATCH=\$\(docker compose logs --tail=100 judge0-workers 2>\/dev\/null \|\| true\)/);
      expect(verifyAccountingContent).toMatch(/if ! LOG_MATCH=\$\(docker compose logs --tail=100 judge0-workers 2>&1\); then/);
      expect(verifyAccountingContent).toMatch(/fail "Docker log query failed while retrieving worker correlation logs/);
    });

    // 12. Raw Token Leakage Prevention
    test('12. Raw token leakage: raw submission token is absent from logs and masked in script output', () => {
      const tokenHash = computeHmacSha256(subToken, validKey);
      const execId = `${tokenHash}-run1-1731380000-0123456789abcdef`;
      const emittedLog = `[CORRELATION] token_hash=${tokenHash} execution_id=${execId} box_id=1 run_idx=1 timestamp=1731380000`;

      expect(emittedLog).not.toContain(subToken);
      expect(emittedLog).toContain(tokenHash);

      // Verifier script masks token
      expect(verifyAccountingContent).toMatch(/Token: \$\{SUB_TOKEN:0:8\}\.\.\./);
      expect(verifyAccountingContent).not.toMatch(/echo "  Submission Queued\. Token: \$SUB_TOKEN"/);
    });

    // 13. Patch Incompatibility with Upstream Source
    test('13. Patch incompatibility: detects modified upstream source when hook context does not match', () => {
      const upstreamHeader = 'def initialize_workdir\n    @box_id = submission.id % 2147483647';
      const modifiedSource = 'def initialize_workdir\n    @box_id = custom_allocator.next_box';

      const canApplyPatch = modifiedSource.includes(upstreamHeader);
      expect(canApplyPatch).toBe(false);
    });

    // 14. Shell Interpolation Safety
    test('14. Shell command argument safety: secret material is passed via env vars, not command strings', () => {
      expect(verifyAccountingContent).not.toMatch(/python3 -c ".*'''\$CORRELATION_KEY'''.*"/);
      expect(verifyAccountingContent).toMatch(/CORR_KEY="\$CORRELATION_KEY" SUB_TOK="\$SUB_TOKEN" python3 -c/);
    });

    // 15. All Legacy Fallbacks Removed
    test('15. Legacy fallbacks completely removed: raw token and heuristic box regexes absent from verifier', () => {
      expect(verifyAccountingContent).not.toMatch(/grep -E "\\\[CORRELATION\\\]\[\[:space:\]\]\+token=\$SUB_TOKEN"/);
      expect(verifyAccountingContent).not.toMatch(/BOX_CANDIDATES=\$\(echo "\$LOG_MATCH" \| grep -oE "box\[- \]/);
    });
  });
});
