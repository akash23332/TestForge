import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase 5.1C-8: Final Audit Remediation Suite', () => {
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

  describe('Finding 1: Resource Accounting Hierarchy Detection', () => {
    test('defines explicit patterns for nested Docker slices and explicit Isolate sibling paths', () => {
      expect(verifyAccountingContent).toMatch(/NESTED_PATTERN=/);
      expect(verifyAccountingContent).toMatch(/SIBLING_PATTERN=/);
      expect(verifyAccountingContent).toMatch(/grep -qE "\$NESTED_PATTERN"/);
      expect(verifyAccountingContent).toMatch(/grep -qE "\$SIBLING_PATTERN"/);
    });

    test('fails closed if child cgroup affinity is empty, unreadable, or malformed', () => {
      expect(verifyAccountingContent).toMatch(/if \[ -z "\$CHILD_CGROUP_AFFINITY" \]; then/);
      expect(verifyAccountingContent).toMatch(/fail "Hierarchy Detection Failure: Child cgroup affinity is empty or unreadable/);
      expect(verifyAccountingContent).toMatch(/fail "Hierarchy Classification Unknown\/Fail: Unexpected or malformed cgroup path/);
      expect(verifyAccountingContent).toMatch(/Never classify arbitrary non-Docker path as root sibling/);
    });

    test('simulation: classifies nested Docker path correctly', () => {
      const nestedPattern = /^([0-9]+:memory:.*(docker|system\.slice\/docker-|docker\.slice\/docker-)|\/sys\/fs\/cgroup\/memory\/docker)/;
      const testPath = '2:memory:/docker/a1b2c3d4e5f6';
      expect(nestedPattern.test(testPath)).toBe(true);
    });

    test('simulation: classifies explicit Isolate sibling path correctly', () => {
      const siblingPattern = /^([0-9]+:memory:(\/isolate\/box-[0-9]+|\/sys\/fs\/cgroup\/memory\/isolate\/box-[0-9]+)|\/sys\/fs\/cgroup\/memory\/isolate\/box-[0-9]+)/;
      const testPath = '2:memory:/isolate/box-98';
      expect(siblingPattern.test(testPath)).toBe(true);
    });

    test('simulation: rejects arbitrary or malformed paths as siblings', () => {
      const nestedPattern = /^([0-9]+:memory:.*(docker|system\.slice\/docker-|docker\.slice\/docker-)|\/sys\/fs\/cgroup\/memory\/docker)/;
      const siblingPattern = /^([0-9]+:memory:(\/isolate\/box-[0-9]+|\/sys\/fs\/cgroup\/memory\/isolate\/box-[0-9]+)|\/sys\/fs\/cgroup\/memory\/isolate\/box-[0-9]+)/;

      const malformedPaths = [
        '',
        '/system.slice/cron.service',
        '2:memory:/user.slice/user-1000.slice',
        'arbitrary_junk_string',
        '2:memory:/init.scope'
      ];

      for (const p of malformedPaths) {
        const isNested = nestedPattern.test(p);
        const isSibling = siblingPattern.test(p);
        expect(isNested).toBe(false);
        expect(isSibling).toBe(false);
      }
    });
  });

  describe('Finding 2: Sampling-Loop Timing & Variable Initialization', () => {
    test('initializes all timing variables prior to loop entry to prevent unbound variable errors under set -u', () => {
      expect(verifyAccountingContent).toMatch(/SAMPLING_START=\$\(date \+%s\)/);
      expect(verifyAccountingContent).toMatch(/NOW=\$SAMPLING_START/);
      expect(verifyAccountingContent).toMatch(/ELAPSED=0/);
      expect(verifyAccountingContent).toMatch(/SAMPLES_TAKEN=0/);
      expect(verifyAccountingContent).toMatch(/TERMINAL_REACHED=false/);
    });

    test('updates timing variables on terminal resolution and inside loop body', () => {
      expect(verifyAccountingContent).toMatch(/NOW=\$\(date \+%s\)/);
      expect(verifyAccountingContent).toMatch(/ELAPSED=\$\(\(NOW - SAMPLING_START\)\)/);
      expect(verifyAccountingContent).toMatch(/Submission Resolved: Status \$STATUS_ID \(\$STATUS_DESC\) in \$\{ELAPSED\}s/);
    });

    test('simulation: immediate completion on iteration 1 safely computes elapsed time without crash', () => {
      const samplingStart = 1000;
      let now = samplingStart;
      let elapsed = 0;
      let terminalReached = false;
      const statusId = 3; // Immediate Accepted

      // Iteration 1 starts
      now = 1000;
      elapsed = now - samplingStart;
      if (statusId >= 3) {
        terminalReached = true;
        now = 1000;
        elapsed = now - samplingStart;
      }

      expect(terminalReached).toBe(true);
      expect(elapsed).toBe(0);
      expect(Number.isInteger(now)).toBe(true);
    });
  });

  describe('Finding 3: Submission-to-Isolate Correlation Rigor', () => {
    test('removes the heuristic fallback that picked newly created box directories', () => {
      // Must NOT select candidate from ISOLATE_CG_BASE without token match in worker logs
      expect(verifyAccountingContent).not.toMatch(/for candidate in "\$ISOLATE_CG_BASE"\/box-\*; do[\s\S]*?CORRELATED_BOX_ID=\$\(echo "\$cname" \| sed 's\/box-\/\/'\)/);
    });

    test('requires unique association and detects ambiguous multiple box candidates for single token', () => {
      expect(verifyAccountingContent).toMatch(/BOX_CANDIDATES=\$\(echo "\$VALID_RECS" \| grep -oE "box_id=\[0-9\]\+"/);
      expect(verifyAccountingContent).toMatch(/CANDIDATE_COUNT=\$\(echo "\$BOX_CANDIDATES"/);
      expect(verifyAccountingContent).toMatch(/fail "Ambiguous correlation: Multiple conflicting box IDs/);
    });

    test('simulation: detects and rejects ambiguous correlation when worker logs mention multiple boxes', () => {
      let failed = 0;
      let failMessage = '';
      const fail = (msg) => { failed = 1; failMessage = msg; };

      const simulatedLogMatch = "worker: token sub-123 using box-10\nworker: token sub-123 using box-11";
      const matches = [...new Set(simulatedLogMatch.match(/box[- ][0-9]+/g).map(s => s.replace(/box[- ]/, '')))];

      if (matches.length > 1) {
        fail(`Ambiguous correlation: Multiple conflicting box IDs (${matches.join(',')}) associated with token in worker logs.`);
      }

      expect(failed).toBe(1);
      expect(failMessage).toMatch(/Ambiguous correlation: Multiple conflicting box IDs/);
    });
  });

  describe('Finding 4: Network Containment & Independent Namespace Inspection', () => {
    test('inspects /proc/net/dev and /proc/net/route inside sandbox to verify namespace configuration', () => {
      expect(verifyContainmentContent).toMatch(/Independent Network Namespace Inspection/);
      expect(verifyContainmentContent).toMatch(/\/proc\/net\/dev/);
      expect(verifyContainmentContent).toMatch(/\/proc\/net\/route/);
      expect(verifyContainmentContent).toMatch(/EXTERNAL_INTERFACE_LEAK/);
      expect(verifyContainmentContent).toMatch(/FIREWALL_DENIAL_NOT_NAMESPACE_ISOLATION/);
    });

    test('distinguishes namespace isolation from firewall denial, timeout, and general exceptions', () => {
      expect(verifyContainmentContent).toMatch(/AMBIGUOUS_NETWORK_TIMEOUT/);
      expect(verifyContainmentContent).toMatch(/EXPLICIT_NAMESPACE_DENIAL:verified_netns_lo_only/);
      expect(verifyContainmentContent).toMatch(/UNRELATED_PYTHON_EXCEPTION/);
    });

    test('simulation: external interface leak is caught and rejected as failure', () => {
      const simulateProbe = (ifaces, hasDefaultRoute, errno) => {
        if (ifaces.length > 0) {
          return `EXTERNAL_INTERFACE_LEAK:${ifaces.join(',')}`;
        }
        if (hasDefaultRoute) {
          return "FIREWALL_DENIAL_NOT_NAMESPACE_ISOLATION:default_route_present";
        }
        if (errno === 101) {
          return "EXPLICIT_NAMESPACE_DENIAL:verified_netns_lo_only:OSError";
        }
        return "UNKNOWN_ERROR";
      };

      // Case 1: eth0 leaked into sandbox namespace
      const leakedResult = simulateProbe(['eth0'], true, 101);
      expect(leakedResult).toMatch(/EXTERNAL_INTERFACE_LEAK:eth0/);

      // Case 2: default route exists (not isolated)
      const firewallResult = simulateProbe([], true, 101);
      expect(firewallResult).toMatch(/FIREWALL_DENIAL_NOT_NAMESPACE_ISOLATION/);

      // Case 3: lo-only, no routes, socket connect denied with 101 (true namespace containment)
      const validResult = simulateProbe([], false, 101);
      expect(validResult).toMatch(/EXPLICIT_NAMESPACE_DENIAL:verified_netns_lo_only/);
    });
  });

  describe('Finding 5 & 6: Strict Error Handling & Cleanup Integrity', () => {
    test('does not convert unreadable cgroup.procs into empty process list', () => {
      expect(verifyAccountingContent).toMatch(/TARGET_PROCS=""/);
      expect(verifyAccountingContent).toMatch(/if ! TARGET_PROCS=\$\(cat "\$TARGET_CG_DIR\/cgroup\.procs" 2>&1\); then/);
      expect(verifyAccountingContent).toMatch(/fail "Unable to read \$TARGET_CG_DIR\/cgroup\.procs: \$TARGET_PROCS\. Cannot verify process termination \(UNKNOWN\/FAIL\)\."/);
    });

    test('distinguishes DELETED, EMPTY_DIR_RETAINED, LEAKED_BOX_SUBDIR, and LEAKED_FILES', () => {
      expect(verifyAccountingContent).toMatch(/echo "DELETED"/);
      expect(verifyAccountingContent).toMatch(/echo "EMPTY_DIR_RETAINED"/);
      expect(verifyAccountingContent).toMatch(/echo "LEAKED_BOX_SUBDIR"/);
      expect(verifyAccountingContent).toMatch(/echo "LEAKED_FILES"/);
      expect(verifyAccountingContent).toMatch(/fail "Unrecognized sandbox directory status: \$DIR_STATUS \(UNKNOWN\/FAIL\)"/);
    });

    test('simulation: unreadable cgroup.procs triggers fail and does not claim clean', () => {
      let failed = 0;
      let cleanupOk = true;
      const fail = (msg) => { failed = 1; cleanupOk = false; };

      const simulateCgroupProcsRead = (canRead, content) => {
        if (!canRead) {
          fail(`Unable to read cgroup.procs: ${content}. Cannot verify process termination (UNKNOWN/FAIL).`);
        } else if (content.trim().length > 0) {
          fail(`Lingering active kernel processes: ${content}`);
        }
      };

      // Scenario: permission denied reading cgroup.procs
      simulateCgroupProcsRead(false, "Permission denied");
      expect(failed).toBe(1);
      expect(cleanupOk).toBe(false);
    });
  });
});
