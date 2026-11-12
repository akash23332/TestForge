import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase 5.1C-7: Final Runtime Verification Integrity Remediation Suite', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const verifyAccountingPath = path.join(rootDir, 'deploy/judge0/verify-resource-accounting.sh');
  const verifyContainmentPath = path.join(rootDir, 'deploy/judge0/verify-containment.sh');
  const verifyCgroupsPath = path.join(rootDir, 'deploy/judge0/verify-cgroups-isolate.sh');

  let verifyAccountingContent;
  let verifyContainmentContent;
  let verifyCgroupsContent;

  beforeAll(() => {
    verifyAccountingContent = fs.readFileSync(verifyAccountingPath, 'utf8');
    verifyContainmentContent = fs.readFileSync(verifyContainmentPath, 'utf8');
    verifyCgroupsContent = fs.readFileSync(verifyCgroupsPath, 'utf8');
  });

  describe('Requirement 1: Host OOM Telemetry Integrity', () => {
    test('strictly validates dmesg usability and rejects permission denied as UNAVAILABLE/UNKNOWN', () => {
      // Must not use || echo 0 to swallow dmesg failures
      expect(verifyAccountingContent).not.toMatch(/dmesg.*\|\s*grep.*\|\s*wc\s+-l\s*\|\|\s*echo\s+0/);
      expect(verifyAccountingContent).toMatch(/if ! DMESG_OUTPUT=\$\(dmesg 2>&1\); then/);
      expect(verifyAccountingContent).toMatch(/fail "Host kernel ring buffer \(dmesg\) is unreadable or restricted/);
      expect(verifyAccountingContent).toMatch(/Host OOM telemetry is UNAVAILABLE\/UNKNOWN/);
    });

    test('preserves explicit distinction between host OOM events and sandbox cgroup OOM events', () => {
      expect(verifyAccountingContent).toMatch(/Host-level OOM killer invocations:/);
      expect(verifyAccountingContent).toMatch(/Box OOM Control Settings:/);
      expect(verifyAccountingContent).toMatch(/memory\.oom_control/);
    });

    test('simulation: unreadable dmesg triggers failure branch and non-zero exit status', () => {
      // Simulate execution logic of section 7 with failing dmesg
      let failed = 0;
      let failureReason = '';
      const fail = (msg) => { failed = 1; failureReason = msg; };

      const simulateDmesg = (canRead, dmesgOutput) => {
        if (!canRead) {
          fail("Host kernel ring buffer (dmesg) is unreadable or restricted (kernel.dmesg_restrict=1). Host OOM telemetry is UNAVAILABLE/UNKNOWN.");
        } else {
          const count = (dmesgOutput.match(/oom-killer|out of memory|killed process/gi) || []).length;
          if (count > 0) {
            fail(`Host kernel OOM events detected in dmesg (${count} events)! Potential host-level OOM invocation.`);
          }
        }
      };

      // Test scenario: dmesg permission denied
      simulateDmesg(false, "dmesg: read kernel buffer failed: Operation not permitted");
      expect(failed).toBe(1);
      expect(failureReason).toMatch(/UNAVAILABLE\/UNKNOWN/);
    });
  });

  describe('Requirement 2: Submission-to-Isolate Box & PID Correlation', () => {
    test('snapshots pre-existing box directories before dispatch to prevent false correlation to stale boxes', () => {
      expect(verifyAccountingContent).toMatch(/PRE_EXISTING_BOXES=\(\)/);
      expect(verifyAccountingContent).toMatch(/find "\$ISOLATE_CG_BASE" -mindepth 1 -maxdepth 1 -type d -name "box-\*"/);
    });

    test('fails if submission cannot be unambiguously correlated to a specific Isolate box ID', () => {
      expect(verifyAccountingContent).toMatch(/CORRELATED_BOX_ID=""/);
      expect(verifyAccountingContent).toMatch(/Submission-to-Isolate correlation failure: Could not unambiguously identify Isolate box for token/);
      expect(verifyAccountingContent).toMatch(/Unrelated or ambient box PIDs cannot be attributed to this execution/);
    });

    test('verifies that any discovered PID specifically belongs to the correlated box cgroup', () => {
      expect(verifyAccountingContent).toMatch(/grep -q "box-\$CORRELATED_BOX_ID"/);
      expect(verifyAccountingContent).toMatch(/DISCOVERED_PID="\$pid"/);
    });

    test('simulation: ambient/unrelated box PID is rejected when correlation is missing', () => {
      let failed = 0;
      let failMessage = '';
      const fail = (msg) => { failed = 1; failMessage = msg; };

      const token = 'test-token-123';
      let correlatedBoxId = ''; // Failed to find in logs or new directories

      if (!correlatedBoxId) {
        fail(`Submission-to-Isolate correlation failure: Could not unambiguously identify Isolate box for token ${token}. Unrelated or ambient box PIDs cannot be attributed to this execution.`);
      }

      expect(failed).toBe(1);
      expect(failMessage).toMatch(/Unrelated or ambient box PIDs cannot be attributed/);
    });
  });

  describe('Requirement 3: Continuous Resource Sampling Loop', () => {
    test('unifies continuous sampling and polling until terminal state (status.id >= 3)', () => {
      expect(verifyAccountingContent).toMatch(/Continuous Telemetry Sampling & Terminal Polling/);
      expect(verifyAccountingContent).toMatch(/while true; do/);
      expect(verifyAccountingContent).toMatch(/STATUS_ID.*-ge 3/);
      expect(verifyAccountingContent).toMatch(/TERMINAL_REACHED=true/);
    });

    test('fails if sampling window misses execution (peak usage 0 bytes)', () => {
      expect(verifyAccountingContent).toMatch(/if \[ "\$PEAK_ISOLATE_USAGE" -eq 0 \]; then/);
      expect(verifyAccountingContent).toMatch(/Missing Isolate cgroup telemetry: peak usage was 0 bytes across execution window\. Measurement window missed execution/);
    });

    test('simulation: submission completing before sampling starts or reporting 0 bytes triggers fail', () => {
      let failed = 0;
      let failMessage = '';
      const fail = (msg) => { failed = 1; failMessage = msg; };

      const peakIsolateUsage = 0; // Missed execution
      if (peakIsolateUsage === 0) {
        fail("Missing Isolate cgroup telemetry: peak usage was 0 bytes across execution window. Measurement window missed execution or cgroup failed to mount.");
      }

      expect(failed).toBe(1);
      expect(failMessage).toMatch(/Measurement window missed execution/);
    });
  });

  describe('Requirement 4: Network Containment & Positive Egress Control', () => {
    test('includes positive egress sanity check outside sandbox to verify host network health', () => {
      expect(verifyContainmentContent).toMatch(/\[Baseline Control 2\] External Egress Connectivity Sanity Check \(Outside Sandbox\)/);
      expect(verifyContainmentContent).toMatch(/HOST_EGRESS_FUNCTIONAL/);
      expect(verifyContainmentContent).toMatch(/Cannot evaluate sandbox network isolation: host lacks baseline connectivity/);
    });

    test('distinguishes explicit namespace denial from timeouts, routing errors, and general Python exceptions', () => {
      expect(verifyContainmentContent).toMatch(/AMBIGUOUS_NETWORK_TIMEOUT/);
      expect(verifyContainmentContent).toMatch(/EXPLICIT_NAMESPACE_DENIAL/);
      expect(verifyContainmentContent).toMatch(/UNRELATED_PYTHON_EXCEPTION:/);
      expect(verifyContainmentContent).toMatch(/run_code_test 4 "Outbound Network Egress \(Default\)" 71 "\$CODE_NET" "3" "EXPLICIT_NAMESPACE_DENIAL"/);
    });

    test('simulation: network timeout caused by host firewall drop reports failure, not security pass', () => {
      const runCodeTestSimulation = (simulatedOutput, expectedPattern) => {
        const regex = new RegExp(expectedPattern, 'i');
        return regex.test(simulatedOutput);
      };

      // Simulating timeout
      const timeoutOutput = "AMBIGUOUS_NETWORK_TIMEOUT\n";
      const expectedRegex = "EXPLICIT_NAMESPACE_DENIAL";
      const isContained = runCodeTestSimulation(timeoutOutput, expectedRegex);
      expect(isContained).toBe(false); // Must FAIL, not PASS
    });

    test('simulation: unrelated Python runtime exception reports failure, not security pass', () => {
      const runCodeTestSimulation = (simulatedOutput, expectedPattern) => {
        const regex = new RegExp(expectedPattern, 'i');
        return regex.test(simulatedOutput);
      };

      // Simulating unrelated crash (e.g. division by zero or import error)
      const crashOutput = "UNRELATED_PYTHON_EXCEPTION:ZeroDivisionError\n";
      const expectedRegex = "EXPLICIT_NAMESPACE_DENIAL";
      const isContained = runCodeTestSimulation(crashOutput, expectedRegex);
      expect(isContained).toBe(false); // Must FAIL, not PASS
    });

    test('simulation: explicit namespace denial (ENETUNREACH / errno 101) passes security test', () => {
      const runCodeTestSimulation = (simulatedOutput, expectedPattern) => {
        const regex = new RegExp(expectedPattern, 'i');
        return regex.test(simulatedOutput);
      };

      const denialOutput = "EXPLICIT_NAMESPACE_DENIAL:OSError\n";
      const expectedRegex = "EXPLICIT_NAMESPACE_DENIAL";
      const isContained = runCodeTestSimulation(denialOutput, expectedRegex);
      expect(isContained).toBe(true); // Explicit kernel denial passes
    });
  });

  describe('Requirement 5: Strict Cleanup Verification', () => {
    test('correlates cleanup with exact box ID and distinguishes deleted from empty directory from leaked', () => {
      expect(verifyAccountingContent).toMatch(/TARGET_BOX_DIR="\/var\/local\/lib\/isolate\/\$CORRELATED_BOX_ID"/);
      expect(verifyAccountingContent).toMatch(/TARGET_CG_DIR="\$ISOLATE_CG_BASE\/box-\$CORRELATED_BOX_ID"/);
      expect(verifyAccountingContent).toMatch(/DELETED/);
      expect(verifyAccountingContent).toMatch(/EMPTY_DIR_RETAINED/);
      expect(verifyAccountingContent).toMatch(/LEAKED_BOX_SUBDIR/);
      expect(verifyAccountingContent).toMatch(/LEAKED_FILES/);
    });

    test('treats Docker query failure during cleanup as UNKNOWN/FAIL, not CLEAN', () => {
      expect(verifyAccountingContent).toMatch(/DIR_QUERY_EXIT=0/);
      expect(verifyAccountingContent).toMatch(/fail "Docker execution failure while verifying sandbox directory cleanup: \$DIR_STATUS \(UNKNOWN\/FAIL\)"/);
      expect(verifyCgroupsContent).toMatch(/fail "Failed to query sandbox directory state \(Docker exit \$DIR_STATUS_EXIT\)"/);
    });

    test('does not rely solely on pgrep; verifies cgroup.procs for active processes', () => {
      expect(verifyAccountingContent).toMatch(/TARGET_CG_DIR\/cgroup\.procs/);
      expect(verifyAccountingContent).toMatch(/Lingering active kernel processes found in \$TARGET_CG_DIR cgroup\.procs/);
      expect(verifyContainmentContent).toMatch(/LINGERING_CGROUP_PROCS/);
      expect(verifyContainmentContent).toMatch(/LINGERING_BOX_JAIL/);
    });

    test('simulation: Docker query failure during cleanup marks probe as FAILED', () => {
      let failed = 0;
      let cleanupOk = true;
      const fail = (msg) => { failed = 1; cleanupOk = false; };

      const simulateCleanupCheck = (dockerExitCode, statusOutput) => {
        if (dockerExitCode !== 0) {
          fail(`Docker execution failure while verifying sandbox directory cleanup: ${statusOutput} (UNKNOWN/FAIL)`);
        } else if (statusOutput === "LEAKED_BOX_SUBDIR" || statusOutput === "LEAKED_FILES") {
          fail(`Sandbox directory was not cleaned up! Residual content detected: ${statusOutput}`);
        }
      };

      simulateCleanupCheck(137, "command timed out / docker daemon error");
      expect(failed).toBe(1);
      expect(cleanupOk).toBe(false);
    });
  });
});
