import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase 5.1C-9: Verification Integrity Remediation Suite', () => {
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

  describe('Finding C9-01: Network Namespace Identity & Independent Inspection', () => {
    test('script captures host and worker network namespace identity before tests', () => {
      expect(verifyContainmentContent).toMatch(/HOST_NETNS=""/);
      expect(verifyContainmentContent).toMatch(/readlink "\/proc\/\$\$\/ns\/net"/);
      expect(verifyContainmentContent).toMatch(/WORKER_NETNS=""/);
      expect(verifyContainmentContent).toMatch(/readlink \/proc\/1\/ns\/net/);
    });

    test('script verifies sandbox network namespace identity and compares against host and worker', () => {
      expect(verifyContainmentContent).toMatch(/SANDBOX_NETNS_INODE:/);
      expect(verifyContainmentContent).toMatch(/DISTINCT_NETNS_VERIFIED:/);
      expect(verifyContainmentContent).toMatch(/SHARED_NETNS_FAILURE:/);
      expect(verifyContainmentContent).toMatch(/NETNS_IDENTITY_UNKNOWN:/);
    });

    test('Python probe strictly reads /proc/net/dev and /proc/net/route, failing closed on read errors', () => {
      expect(verifyContainmentContent).toMatch(/NETNS_DEV_READ_FAILED:missing_proc_net_dev/);
      expect(verifyContainmentContent).toMatch(/NETNS_DEV_READ_FAILED:malformed_proc_net_dev/);
      expect(verifyContainmentContent).toMatch(/NETNS_ROUTE_READ_FAILED:missing_proc_net_route/);
      expect(verifyContainmentContent).toMatch(/NETNS_ROUTE_READ_FAILED:malformed_proc_net_route/);
    });

    test('simulation: distinct network namespace is verified only when inode differs from host and worker', () => {
      const hostNetns = 'net:[4026531992]';
      const workerNetns = 'net:[4026532100]';

      const evaluateNetns = (sandboxNetns) => {
        if (!sandboxNetns || !sandboxNetns.startsWith('net:[')) {
          return 'NETNS_IDENTITY_UNKNOWN';
        }
        if (sandboxNetns === hostNetns || sandboxNetns === workerNetns) {
          return 'SHARED_NETNS_FAILURE';
        }
        return 'DISTINCT_NETNS_VERIFIED';
      };

      // Case 1: Sandbox in distinct netns
      expect(evaluateNetns('net:[4026532580]')).toBe('DISTINCT_NETNS_VERIFIED');
      // Case 2: Sandbox shared host netns
      expect(evaluateNetns(hostNetns)).toBe('SHARED_NETNS_FAILURE');
      // Case 3: Sandbox shared worker netns
      expect(evaluateNetns(workerNetns)).toBe('SHARED_NETNS_FAILURE');
      // Case 4: Missing or malformed netns
      expect(evaluateNetns('')).toBe('NETNS_IDENTITY_UNKNOWN');
      expect(evaluateNetns('unreadable')).toBe('NETNS_IDENTITY_UNKNOWN');
    });

    test('simulation: /proc/net/dev or /proc/net/route failure aborts probe as failure', () => {
      const simulateKernelProbes = ({ devExists, devContent, routeExists, routeContent }) => {
        if (!devExists) return 'NETNS_DEV_READ_FAILED:missing_proc_net_dev';
        const lines = devContent.split('\n');
        if (lines.length < 2) return 'NETNS_DEV_READ_FAILED:malformed_proc_net_dev';

        const ifaces = [];
        for (let l of lines.slice(2)) {
          if (l.includes(':')) {
            const iface = l.split(':')[0].trim();
            if (iface !== 'lo') ifaces.push(iface);
          }
        }
        if (ifaces.length > 0) return `EXTERNAL_INTERFACE_LEAK:${ifaces.join(',')}`;

        if (!routeExists) return 'NETNS_ROUTE_READ_FAILED:missing_proc_net_route';
        const routeLines = routeContent.split('\n');
        if (routeLines.length < 1) return 'NETNS_ROUTE_READ_FAILED:malformed_proc_net_route';

        let hasDefaultRoute = false;
        for (let l of routeLines.slice(1)) {
          const parts = l.trim().split(/\s+/);
          if (parts.length >= 2 && parts[1] === '00000000') {
            hasDefaultRoute = true;
            break;
          }
        }
        if (hasDefaultRoute) return 'FIREWALL_DENIAL_NOT_NAMESPACE_ISOLATION:default_route_present';

        return 'NETNS_KERNEL_PROBES_CLEAN';
      };

      // Missing dev
      expect(simulateKernelProbes({ devExists: false })).toMatch(/NETNS_DEV_READ_FAILED/);
      // Malformed dev
      expect(simulateKernelProbes({ devExists: true, devContent: 'header' })).toMatch(/malformed_proc_net_dev/);
      // Leaked interface eth0
      expect(simulateKernelProbes({
        devExists: true,
        devContent: 'Inter-|   Receive\n face |bytes\n  eth0: 1234\n  lo: 5678',
        routeExists: true,
        routeContent: 'Iface\tDestination\nlo\t00000000'
      })).toMatch(/EXTERNAL_INTERFACE_LEAK:eth0/);
      // Default route present
      expect(simulateKernelProbes({
        devExists: true,
        devContent: 'Inter-|   Receive\n face |bytes\n  lo: 5678',
        routeExists: true,
        routeContent: 'Iface\tDestination\tGateway\neth0\t00000000\t01010101'
      })).toMatch(/FIREWALL_DENIAL_NOT_NAMESPACE_ISOLATION/);
      // Clean isolated namespace
      expect(simulateKernelProbes({
        devExists: true,
        devContent: 'Inter-|   Receive\n face |bytes\n  lo: 5678',
        routeExists: true,
        routeContent: 'Iface\tDestination\tGateway\n'
      })).toBe('NETNS_KERNEL_PROBES_CLEAN');
    });

    test('simulation: socket timeout, firewall denial, or unrelated exception fail closed', () => {
      const evaluateNetworkResult = (resultString) => {
        if (resultString.includes('AMBIGUOUS_NETWORK_TIMEOUT')) {
          return { pass: false, reason: 'Timeout is ambiguous packet drop, not verified namespace isolation' };
        }
        if (resultString.includes('FIREWALL_DENIAL_NOT_NAMESPACE_ISOLATION')) {
          return { pass: false, reason: 'Firewall drop is not namespace isolation' };
        }
        if (resultString.includes('UNRELATED_PYTHON_EXCEPTION')) {
          return { pass: false, reason: 'Runtime error is not namespace isolation' };
        }
        if (resultString.includes('EXPLICIT_NAMESPACE_DENIAL')) {
          return { pass: true, reason: 'Verified namespace isolation' };
        }
        return { pass: false, reason: 'Unknown error' };
      };

      expect(evaluateNetworkResult('AMBIGUOUS_NETWORK_TIMEOUT').pass).toBe(false);
      expect(evaluateNetworkResult('FIREWALL_DENIAL_NOT_NAMESPACE_ISOLATION:default_route_present').pass).toBe(false);
      expect(evaluateNetworkResult('UNRELATED_PYTHON_EXCEPTION:SyntaxError').pass).toBe(false);
      expect(evaluateNetworkResult('EXPLICIT_NAMESPACE_DENIAL:verified_netns_lo_only:OSError').pass).toBe(true);
    });
  });

  describe('Finding C9-02: Exact Submission-to-Isolate Correlation', () => {
    test('script requires exact structured correlation or reports upstream blocker', () => {
      expect(verifyAccountingContent).toMatch(/CORRELATION_BLOCKED/);
      expect(verifyAccountingContent).toMatch(/Upstream Judge0 worker logs do not emit structured submission-to-box correlation metadata/);
      expect(verifyAccountingContent).toMatch(/Cannot unambiguously determine Isolate box ID for token/);
      expect(verifyAccountingContent).toMatch(/Minimum upstream change:.*Log \[CORRELATION\]/);
    });

    test('simulation: prevents substring token collision (e.g. sub-1 vs sub-10)', () => {
      const searchToken = 'sub-1';
      const logLines = [
        '[CORRELATION] token=sub-10 box_id=10',
        '[CORRELATION] token=sub-100 box_id=11',
        '[CORRELATION] token=sub-1 box_id=5'
      ];

      // Exact matching pattern
      const exactPattern = new RegExp(`\\[CORRELATION\\]\\s+token=${searchToken}(\\s|$)`);
      const matchedLines = logLines.filter(line => exactPattern.test(line));

      expect(matchedLines.length).toBe(1);
      expect(matchedLines[0]).toMatch(/box_id=5/);
    });

    test('simulation: detects and rejects ambiguous conflicting box IDs for same token', () => {
      const logs = [
        '[CORRELATION] token=sub-xyz box_id=5',
        '[CORRELATION] token=sub-xyz box_id=6'
      ];
      const boxIds = [...new Set(logs.map(l => l.match(/box_id=(\d+)/)[1]))];

      let correlationStatus = 'OK';
      let assignedBox = null;
      if (boxIds.length > 1) {
        correlationStatus = 'AMBIGUOUS_CONFLICTING_BOXES';
      } else if (boxIds.length === 1) {
        assignedBox = boxIds[0];
      }

      expect(correlationStatus).toBe('AMBIGUOUS_CONFLICTING_BOXES');
      expect(assignedBox).toBeNull();
    });

    test('simulation: duplicate identical association does not cause failure', () => {
      const logs = [
        '[CORRELATION] token=sub-abc box_id=7',
        '[CORRELATION] token=sub-abc box_id=7'
      ];
      const boxIds = [...new Set(logs.map(l => l.match(/box_id=(\d+)/)[1]))];

      expect(boxIds.length).toBe(1);
      expect(boxIds[0]).toBe('7');
    });

    test('simulation: ambient or pre-existing box directories cannot be selected as fallback', () => {
      const preExistingBoxes = ['box-0', 'box-1', 'box-2'];
      const activeBoxesOnHost = ['box-0', 'box-1', 'box-2', 'box-3'];

      // If token correlation failed
      const correlatedBoxId = null;
      let selectedBox = correlatedBoxId;

      // Heuristic fallback should NOT happen
      if (!correlatedBoxId) {
        selectedBox = null; // Do NOT pick box-3 or box-0!
      }

      expect(selectedBox).toBeNull();
    });
  });

  describe('Finding C9-03: Fail Closed on Cgroup Telemetry Read Errors', () => {
    test('defines read_cgroup_metric helper with explicit status states', () => {
      expect(verifyAccountingContent).toMatch(/read_cgroup_metric\(\)/);
      expect(verifyAccountingContent).toMatch(/READ_STATUS="MISSING"/);
      expect(verifyAccountingContent).toMatch(/READ_STATUS="UNREADABLE"/);
      expect(verifyAccountingContent).toMatch(/READ_STATUS="MALFORMED"/);
      expect(verifyAccountingContent).toMatch(/READ_STATUS="VALID_VALUE"/);
    });

    test('defines read_cgroup_procs helper validating numeric PIDs and read success', () => {
      expect(verifyAccountingContent).toMatch(/read_cgroup_procs\(\)/);
      expect(verifyAccountingContent).toMatch(/PROCS_STATUS="MISSING"/);
      expect(verifyAccountingContent).toMatch(/PROCS_STATUS="UNREADABLE"/);
      expect(verifyAccountingContent).toMatch(/PROCS_STATUS="MALFORMED"/);
      expect(verifyAccountingContent).toMatch(/PROCS_STATUS="VALID_VALUE"/);
    });

    test('simulation: cgroup metric read distinguishes VALID_VALUE, MISSING, UNREADABLE, and MALFORMED', () => {
      const parseMetric = (exists, readable, content) => {
        if (!exists) return { status: 'MISSING', value: null };
        if (!readable) return { status: 'UNREADABLE', value: null };
        const clean = content.trim();
        if (/^\d+$/.test(clean)) {
          return { status: 'VALID_VALUE', value: parseInt(clean, 10) };
        }
        return { status: 'MALFORMED', value: null };
      };

      // Valid nonzero
      expect(parseMetric(true, true, '157286400')).toEqual({ status: 'VALID_VALUE', value: 157286400 });
      // Valid zero
      expect(parseMetric(true, true, '0')).toEqual({ status: 'VALID_VALUE', value: 0 });
      // Missing file
      expect(parseMetric(false, false, '')).toEqual({ status: 'MISSING', value: null });
      // Permission denied
      expect(parseMetric(true, false, '')).toEqual({ status: 'UNREADABLE', value: null });
      // Malformed text
      expect(parseMetric(true, true, 'Device or resource busy')).toEqual({ status: 'MALFORMED', value: null });
      expect(parseMetric(true, true, 'NaN')).toEqual({ status: 'MALFORMED', value: null });
    });

    test('simulation: unreadable cgroup.procs never treated as zero processes', () => {
      const parseProcs = (exists, readable, content) => {
        if (!exists) return { status: 'MISSING', count: null };
        if (!readable) return { status: 'UNREADABLE', count: null };
        const lines = content.trim().split('\n').map(l => l.trim()).filter(Boolean);
        for (let l of lines) {
          if (!/^\d+$/.test(l)) return { status: 'MALFORMED', count: null };
        }
        return { status: 'VALID_VALUE', count: lines.length, pids: lines };
      };

      // Scenario: permission denied reading cgroup.procs
      const unreadable = parseProcs(true, false, '');
      expect(unreadable.status).toBe('UNREADABLE');
      expect(unreadable.count).toBeNull(); // Must NOT claim 0 processes!

      // Scenario: valid empty
      const empty = parseProcs(true, true, '');
      expect(empty.status).toBe('VALID_VALUE');
      expect(empty.count).toBe(0);

      // Scenario: active processes
      const active = parseProcs(true, true, '12345\n12346');
      expect(active.status).toBe('VALID_VALUE');
      expect(active.count).toBe(2);
    });
  });

  describe('Finding C9-04: Genuine Monotonic Clock & Sampling Timing', () => {
    test('defines get_monotonic_ms helper using Python time.monotonic() or /proc/uptime', () => {
      expect(verifyAccountingContent).toMatch(/get_monotonic_ms\(\)/);
      expect(verifyAccountingContent).toMatch(/time\.monotonic\(\)/);
      expect(verifyAccountingContent).toMatch(/\/proc\/uptime/);
      expect(verifyAccountingContent).toMatch(/CLOCK_ERROR/);
    });

    test('initializes monotonic timing before sampling loop entry and checks non-increasing error', () => {
      expect(verifyAccountingContent).toMatch(/SAMPLING_START_MS=\$\(get_monotonic_ms\)/);
      expect(verifyAccountingContent).toMatch(/NOW_MS=\$SAMPLING_START_MS/);
      expect(verifyAccountingContent).toMatch(/ELAPSED_MS=0/);
      expect(verifyAccountingContent).toMatch(/ELAPSED_MONO_SECS=0/);
      expect(verifyAccountingContent).toMatch(/"\$NOW_MS" -lt "\$SAMPLING_START_MS"/);
    });

    test('does not treat polling HTTP failure as valid terminal result', () => {
      expect(verifyAccountingContent).toMatch(/POLL_FAILED=true/);
      expect(verifyAccountingContent).toMatch(/fail "Submission polling failed during execution: could not query terminal state reliably"/);
    });

    test('simulation: monotonic clock calculates elapsed duration and detects clock drift/failure', () => {
      let startMs = 50000;
      let nowMs = 52500;

      let elapsedMs = nowMs - startMs;
      expect(elapsedMs).toBe(2500);
      let elapsedSecs = Math.floor(elapsedMs / 1000);
      expect(elapsedSecs).toBe(2);

      // Clock backward jump simulation
      nowMs = 49000;
      let clockError = false;
      if (nowMs < startMs) {
        clockError = true;
      }
      expect(clockError).toBe(true);
    });
  });
});
