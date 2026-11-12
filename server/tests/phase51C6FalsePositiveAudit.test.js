import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase 5.1C-6: Security Verification False-Positive Elimination Audit Suite', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const verifyCgroupsPath = path.join(rootDir, 'deploy/judge0/verify-cgroups-isolate.sh');
  const verifyAccountingPath = path.join(rootDir, 'deploy/judge0/verify-resource-accounting.sh');
  const verifyContainmentPath = path.join(rootDir, 'deploy/judge0/verify-containment.sh');

  let verifyCgroupsContent;
  let verifyAccountingContent;
  let verifyContainmentContent;

  beforeAll(() => {
    verifyCgroupsContent = fs.readFileSync(verifyCgroupsPath, 'utf8');
    verifyAccountingContent = fs.readFileSync(verifyAccountingPath, 'utf8');
    verifyContainmentContent = fs.readFileSync(verifyContainmentPath, 'utf8');
  });

  describe('Critical Finding 1: verify-cgroups-isolate.sh False-Positive Elimination', () => {
    test('cleanup trap records non-zero errors and sets FAILED=1 instead of suppressing errors', () => {
      expect(verifyCgroupsContent).toMatch(/trap\s+cleanup_boxes\s+EXIT/);
      const trapBody = verifyCgroupsContent.match(/cleanup_boxes\(\)\s*\{([\s\S]*?)\n\}/);
      expect(trapBody).not.toBeNull();
      expect(trapBody[1]).toMatch(/FAILED=1/);
      expect(trapBody[1]).not.toMatch(/\|\|\s*true/);
    });

    test('filesystem boundary test includes positive control and explicit negative control with EROFS verification', () => {
      // Positive control in sandbox /box
      expect(verifyCgroupsContent).toMatch(/\/box\/positive_probe\.txt/);
      expect(verifyCgroupsContent).toMatch(/Positive control: Sandbox allowed write within \/box/);

      // Negative boundary probe
      expect(verifyCgroupsContent).toMatch(/\/test_boundary_probe/);
      expect(verifyCgroupsContent).toMatch(/Read-only file system|EROFS/);
      expect(verifyCgroupsContent).toMatch(/test\s+!\s+-e\s+"\/test_boundary_probe"/);
      expect(verifyCgroupsContent).not.toMatch(/echo "\$FS_OUT" \| grep -qiE ".*\|error"/);
    });

    test('network test validates probe initiation, specific socket errnos, and rejects interpreter crashes', () => {
      expect(verifyCgroupsContent).toMatch(/PROBE_INITIATED/);
      expect(verifyCgroupsContent).toMatch(/NETWORK_ISOLATED:/);
      expect(verifyCgroupsContent).toMatch(/str\(e\.errno\)/);
      expect(verifyCgroupsContent).toMatch(/fail "Network probe did not initiate cleanly/);
    });

    test('memory test inspects Isolate meta file for cgroup OOM termination instead of string absence', () => {
      expect(verifyCgroupsContent).toMatch(/-M \/tmp\/isolate_mem_meta/);
      expect(verifyCgroupsContent).toMatch(/status:SG|status:RE|exitsig:9|cg-oom-killed:1/);
      expect(verifyCgroupsContent).not.toMatch(/!\s*echo\s+"\$MEM_OUT"\s*\|\s*grep\s+-q\s+"VULNERABLE_MEM_OVERRUN"\s*&&\s*pass/);
    });

    test('CPU test inspects Isolate meta file for timeout signal, fails on zero exit, and has no unconditional PASS branch', () => {
      expect(verifyCgroupsContent).toMatch(/-M \/tmp\/isolate_cpu_meta/);
      expect(verifyCgroupsContent).toMatch(/status:TO|exitsig:9|exitsig:24/);
      expect(verifyCgroupsContent).toMatch(/Runaway CPU process unexpectedly exited cleanly/);
      // Ensure no dangling unconditional pass
      expect(verifyCgroupsContent).not.toMatch(/else\s+pass "Isolate CPU timeout prevented runaway execution"/);
    });

    test('cleanup test distinguishes missing directory (CLEAN) from Docker CLI failures', () => {
      expect(verifyCgroupsContent).toMatch(/DIR_STATUS_EXIT=\$\?/);
      expect(verifyCgroupsContent).toMatch(/box directory already cleaned up/);
      expect(verifyCgroupsContent).toMatch(/fail "Failed to query sandbox directory state \(Docker exit/);
    });

    test('residual process audit checks for lingering sandbox processes', () => {
      expect(verifyCgroupsContent).toMatch(/pgrep -f "box-'\$BOX_ID'"/);
      expect(verifyCgroupsContent).toMatch(/Lingering processes detected for box-\$BOX_ID/);
    });
  });

  describe('Critical Finding 2: verify-resource-accounting.sh Rigor & Telemetry Validation', () => {
    test('polls submission status until terminal state (status.id >= 3) with explicit timeout', () => {
      expect(verifyAccountingContent).toMatch(/POLL_TIMEOUT=30/);
      expect(verifyAccountingContent).toMatch(/STATUS_ID.*-ge 3/);
      expect(verifyAccountingContent).toMatch(/TERMINAL_REACHED=true/);
      expect(verifyAccountingContent).toMatch(/timed out after \$\{POLL_TIMEOUT\}s without reaching terminal state/);
    });

    test('tracks exact kernel PID directly from isolate cgroup.procs and inspects /proc/$pid/cgroup', () => {
      expect(verifyAccountingContent).toMatch(/cgroup\.procs/);
      expect(verifyAccountingContent).toMatch(/\/proc\/\$pid\/cgroup/);
      expect(verifyAccountingContent).toMatch(/DISCOVERED_PID/);
    });

    test('measures pre-execution, active peak, and post-execution memory', () => {
      expect(verifyAccountingContent).toMatch(/AVAIL_RAM_KB_BEFORE/);
      expect(verifyAccountingContent).toMatch(/PEAK_ISOLATE_USAGE/);
      expect(verifyAccountingContent).toMatch(/AVAIL_RAM_KB_AFTER/);
      expect(verifyAccountingContent).toMatch(/memory\.failcnt/);
      expect(verifyAccountingContent).toMatch(/memory\.oom_control/);
    });

    test('fails closed if Isolate telemetry is missing (peak usage 0 or missing PID)', () => {
      expect(verifyAccountingContent).toMatch(/Missing Isolate cgroup telemetry: peak usage was 0 bytes/);
      expect(verifyAccountingContent).toMatch(/Failed to verify child process cgroup affinity: no kernel PID detected/);
      expect(verifyAccountingContent).toMatch(/if \[ "\$FAILED" -eq 0 \]; then/);
    });

    test('treats host OOM events and orphaned processes as explicit release blockers (fails probe)', () => {
      expect(verifyAccountingContent).toMatch(/HOST_OOM_COUNT.*-gt 0/);
      expect(verifyAccountingContent).toMatch(/fail "Host kernel OOM events detected in dmesg/);
      expect(verifyAccountingContent).toMatch(/fail "Lingering active kernel processes found in \$bdir cgroup\.procs/);
      expect(verifyAccountingContent).toMatch(/fail "Orphaned test payload processes detected on host/);
    });

    test('removes false guarantee of 2100 MB headroom and distinguishes limits vs RSS and host memory', () => {
      expect(verifyAccountingContent).not.toMatch(/Safety Margin: Headroom \(~2100 MB\) easily absorbs max concurrent box allocation/);
      expect(verifyAccountingContent).toMatch(/Mathematical difference \(8192 - 4992 = 3200 MB, with ~2100 MB buffer\) is a static calculation, NOT guaranteed safety/);
      expect(verifyAccountingContent).toMatch(/Total Container Allocation: 4992 MB/);
      expect(verifyAccountingContent).toMatch(/Current Available Host RAM/);
    });
  });

  describe('Critical Finding 3: verify-containment.sh Positive Baseline & Error Rejection', () => {
    test('contains Test 0 positive baseline control that aborts suite on failure', () => {
      expect(verifyContainmentContent).toMatch(/\[Baseline Control\] Valid Execution Sanity Check/);
      expect(verifyContainmentContent).toMatch(/BASELINE_VALID_EXECUTION/);
      expect(verifyContainmentContent).toMatch(/Positive control failed!/);
      expect(verifyContainmentContent).toMatch(/The runner cannot reliably execute valid code\. Containment tests cannot be evaluated/);
    });

    test('run_code_test strictly rejects empty responses, curl failures, and Status 13 (Internal Error)', () => {
      expect(verifyContainmentContent).not.toMatch(/echo '\{"status":\{"id":13,"description":"Curl Error"\}\}'/);
      expect(verifyContainmentContent).toMatch(/Curl execution failure: empty response from runner/);
      expect(verifyContainmentContent).toMatch(/status_id.*-eq 13/);
      expect(verifyContainmentContent).toMatch(/Runner returned Status 13 \(Internal Error\) - infrastructure error, not security containment/);
    });

    test('removes Status 13 from all expected status codes', () => {
      // Check that none of the run_code_test invocations accept 13
      const invocations = verifyContainmentContent.match(/run_code_test\s+\d+[\s\S]*?\n/g) || [];
      for (const invocation of invocations) {
        expect(invocation).not.toMatch(/"[^"]*13[^"]*"/);
      }
    });

    test('eliminates loose pattern matching for error in security tests', () => {
      expect(verifyContainmentContent).not.toMatch(/"NETWORK_BLOCKED\|error\|invalid"/);
      expect(verifyContainmentContent).not.toMatch(/"CPP_FORK_BOMB_CONTAINED\|Resource temporarily unavailable\|error"/);
    });

    test('ensures overall script fails if any containment test fails', () => {
      expect(verifyContainmentContent).toMatch(/if \[ "\$PASSED_TESTS" -eq "\$TOTAL_TESTS" \] && \[ "\$FAILED" -eq 0 \]; then/);
      expect(verifyContainmentContent).toMatch(/exit 1/);
    });
  });
});
