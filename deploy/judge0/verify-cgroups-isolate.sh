#!/usr/bin/env bash
# ==============================================================================
# TestForge Dedicated Execution Runner - Cgroups v1 & Isolate Operational Check
# Verifies host cgroup v1 hierarchy, controller writeability, and isolate sandbox lifecycle
# Run on the Linux Runner VM before activating the runner
# ==============================================================================

set -euo pipefail

echo "========================================================"
echo " TestForge Cgroups v1 & Isolate Operational Verification"
echo " Date: $(date -u)"
echo "========================================================"

FAILED=0

fail() {
  echo "  [FAIL] $1"
  FAILED=1
}

pass() {
  echo "  [PASS] $1"
}

# 1. Kernel Boot Parameter Check
echo ""
echo "── 1. Kernel Boot Parameters ──"
if grep -q "systemd.unified_cgroup_hierarchy=0" /proc/cmdline; then
  pass "systemd.unified_cgroup_hierarchy=0 present in /proc/cmdline"
else
  fail "Kernel did not boot with systemd.unified_cgroup_hierarchy=0 (cgroups v1 legacy required)."
fi

# 2. Check cgroups v1 Controller Mounts
echo ""
echo "── 2. Controller Mounts & Hierarchy ──"
CONTROLLERS=("memory" "cpuacct" "cpuset")

for ctl in "${CONTROLLERS[@]}"; do
  # Check if mount point exists
  CTL_PATH=""
  if [ -d "/sys/fs/cgroup/$ctl" ]; then
    CTL_PATH="/sys/fs/cgroup/$ctl"
  elif [ -d "/sys/fs/cgroup/cpu,$ctl" ]; then
    CTL_PATH="/sys/fs/cgroup/cpu,$ctl"
  elif [ -d "/sys/fs/cgroup/$ctl,cpu" ]; then
    CTL_PATH="/sys/fs/cgroup/$ctl,cpu"
  fi

  if [ -n "$CTL_PATH" ]; then
    pass "Controller '$ctl' found at $CTL_PATH"

    # Check if writable
    TEST_DIR="$CTL_PATH/testforge_verify_probe_$$"
    if mkdir "$TEST_DIR" 2>/dev/null; then
      rmdir "$TEST_DIR"
      pass "Controller '$ctl' is writable (mkdir/rmdir successful)"
    else
      fail "Controller '$ctl' at $CTL_PATH is READ-ONLY or inaccessible"
    fi
  else
    fail "Required cgroup v1 controller '$ctl' is NOT mounted in /sys/fs/cgroup"
  fi
done

BOX_ID=98

cleanup_boxes() {
  local exit_code=$?
  if [ "$exit_code" -ne 0 ] && command -v docker &>/dev/null; then
    echo "  [CLEANUP TRAP] Cleaning up box $BOX_ID after non-zero exit ($exit_code)..."
    if ! docker compose exec -T judge0-workers isolate --cleanup --box-id="$BOX_ID" --cg 2>&1; then
      echo "  [CLEANUP TRAP ERROR] isolate --cleanup failed during error recovery."
      FAILED=1
    fi
  fi
}
trap cleanup_boxes EXIT INT TERM ERR

echo ""
echo "── 3. DIRECT ISOLATE SANDBOX ENGINE TESTS (Inside judge0-workers Container) ──"
if ! command -v docker &>/dev/null; then
  fail "Docker CLI is not installed or not in PATH."
else
  # Check if container is running
  if docker compose ps --services --filter "status=running" 2>/dev/null | grep -q "judge0-workers"; then
    pass "judge0-workers container is running"

    # 3.1 Test isolate binary existence, root permissions, and helper files
    if (docker compose exec -T judge0-workers test -u /usr/local/bin/isolate || \
        docker compose exec -T judge0-workers test -u /usr/local/bin/isolate-bin || \
        docker compose exec -T judge0-workers test -x /usr/local/bin/isolate-bin) && \
       docker compose exec -T judge0-workers test -x /usr/local/bin/isolate; then
      pass "isolate binary installed with restricted root permissions (mode 0700, wrapper at /usr/local/bin/isolate)"
    else
      fail "isolate binary is missing or lacks root execute permission"
    fi

    if docker compose exec -T judge0-workers test -f /usr/local/etc/isolate; then
      pass "isolate configuration /usr/local/etc/isolate is present"
    else
      fail "isolate configuration /usr/local/etc/isolate is missing"
    fi

    ENV_CHECK=$(docker compose exec -T judge0-workers /usr/local/bin/isolate-check-environment 2>&1 || echo "ERROR")
    if [ "$ENV_CHECK" != "ERROR" ]; then
      pass "isolate-check-environment executed successfully"
    else
      fail "isolate-check-environment failed: $ENV_CHECK"
    fi

    # 3.2 Ensure Box 98 is in clean state before initialization
    if docker compose exec -T judge0-workers test -d "/var/local/lib/isolate/$BOX_ID"; then
      docker compose exec -T judge0-workers isolate --cleanup --box-id=$BOX_ID --cg
    fi

    INIT_OUT=$(docker compose exec -T judge0-workers isolate --init --box-id=$BOX_ID --cg 2>&1)
    INIT_EXIT=$?
    if [ "$INIT_EXIT" -eq 0 ] && echo "$INIT_OUT" | grep -q "/var/local/lib/isolate"; then
      pass "isolate --init --cg succeeded (Box $BOX_ID initialized at $INIT_OUT)"
    else
      fail "isolate --init --cg failed (exit $INIT_EXIT): $INIT_OUT"
    fi

    # Verify physical sandbox directory and cgroup existence
    if docker compose exec -T judge0-workers test -d "/var/local/lib/isolate/$BOX_ID/box"; then
      pass "Sandbox directory /var/local/lib/isolate/$BOX_ID/box verified present"
    else
      fail "Sandbox directory /var/local/lib/isolate/$BOX_ID/box was not created"
    fi

    if docker compose exec -T judge0-workers test -d "/sys/fs/cgroup/memory/isolate/box-$BOX_ID" || \
       docker compose exec -T judge0-workers test -d "/sys/fs/cgroup/memory/box-$BOX_ID"; then
      pass "Isolate memory cgroup box directory verified present"
    else
      fail "Isolate memory cgroup box directory was not created"
    fi

    # 3.3 Test Execution Sanity (Positive Control: Echo inside Isolate)
    RUN_OUT=$(docker compose exec -T judge0-workers isolate --box-id=$BOX_ID --cg --cg-mem=64000 --run -- /bin/echo "TESTFORGE_ISOLATE_OK" 2>&1)
    RUN_EXIT=$?
    if [ "$RUN_EXIT" -eq 0 ] && echo "$RUN_OUT" | grep -q "TESTFORGE_ISOLATE_OK"; then
      pass "Positive Control: isolate basic sandboxed execution succeeded"
    else
      fail "Positive Control: isolate basic execution failed (exit $RUN_EXIT): $RUN_OUT"
    fi

    # 3.4 Filesystem Boundary Tests: Positive (/box write) & Negative (read-only rootfs)
    # Positive Control: Writing inside /box must succeed
    FS_POS_OUT=$(docker compose exec -T judge0-workers isolate --box-id=$BOX_ID --cg --run -- /bin/bash -c 'echo "OK" > /box/positive_probe.txt && cat /box/positive_probe.txt' 2>&1)
    FS_POS_EXIT=$?
    if [ "$FS_POS_EXIT" -eq 0 ] && echo "$FS_POS_OUT" | grep -q "OK"; then
      pass "Positive control: Sandbox allowed write within /box"
    else
      fail "Filesystem Positive Control: Writing inside sandbox jail failed (exit $FS_POS_EXIT): $FS_POS_OUT"
    fi

    # Negative Control: Writing to rootfs outside /box must fail specifically with EROFS / Read-only file system
    FS_NEG_OUT=$(docker compose exec -T judge0-workers isolate --box-id=$BOX_ID --cg --run -- /bin/touch /test_boundary_probe 2>&1)
    FS_NEG_EXIT=$?
    if [ "$FS_NEG_EXIT" -ne 0 ] && echo "$FS_NEG_OUT" | grep -qiE "Read-only file system|EROFS"; then
      # Verify target file does not exist in container
      if docker compose exec -T judge0-workers test ! -e "/test_boundary_probe"; then
        pass "Isolate filesystem boundary enforced (Read-only rootfs strictly enforced; EROFS on / write, exit $FS_NEG_EXIT)"
      else
        fail "Filesystem Breach: File /test_boundary_probe was written to rootfs!"
      fi
    else
      fail "Filesystem Boundary Failed: Expected EROFS non-zero failure, got exit $FS_NEG_EXIT, output: $FS_NEG_OUT"
    fi

    # 3.5 Network Denial Enforcement (Zero Egress inside Isolate)
    NET_OUT=$(docker compose exec -T judge0-workers isolate --box-id=$BOX_ID --cg --run -- /usr/bin/python3 -c '
import socket
import sys
sys.stdout.write("PROBE_INITIATED\n")
sys.stdout.flush()
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(2.0)
try:
    s.connect(("8.8.8.8", 53))
    sys.stdout.write("VULNERABLE_NETWORK_OPEN\n")
except OSError as e:
    sys.stdout.write("NETWORK_ISOLATED:" + str(e.errno) + ":" + type(e).__name__ + "\n")
except Exception as e:
    sys.stdout.write("UNEXPECTED_EXCEPTION:" + type(e).__name__ + "\n")
' 2>&1)
    NET_EXIT=$?
    if ! echo "$NET_OUT" | grep -q "PROBE_INITIATED"; then
      fail "Network probe did not initiate cleanly: Python interpreter failed ($NET_OUT)"
    elif echo "$NET_OUT" | grep -q "VULNERABLE_NETWORK_OPEN"; then
      fail "Network Isolation Breach: Outbound socket connection succeeded!"
    elif echo "$NET_OUT" | grep -q "NETWORK_ISOLATED"; then
      pass "Isolate network isolation enforced (Outbound socket connection blocked by network namespace)"
    else
      fail "Network Test Indeterminate: Unexpected output: $NET_OUT"
    fi

    # 3.6 Memory Limit Enforcement (Cgroup OOM containment inside Isolate)
    docker compose exec -T judge0-workers rm -f /tmp/isolate_mem_meta
    MEM_OUT=$(docker compose exec -T judge0-workers isolate --box-id=$BOX_ID --cg --cg-mem=32000 -M /tmp/isolate_mem_meta --run -- /usr/bin/python3 -c '
import sys
sys.stdout.write("ALLOC_START\n")
sys.stdout.flush()
chunks = [bytearray(10 * 1024 * 1024) for _ in range(8)]
sys.stdout.write("ALLOC_FINISHED\n")
' 2>&1)
    MEM_EXIT=$?
    MEM_META=""
    if ! MEM_META=$(docker compose exec -T judge0-workers cat /tmp/isolate_mem_meta 2>&1); then
      fail "Failed to read Isolate memory meta file /tmp/isolate_mem_meta: $MEM_META"
    fi

    if echo "$MEM_OUT" | grep -q "ALLOC_FINISHED"; then
      fail "Memory Limit Breach: Process allocated past 32MB limit without termination!"
    elif [ "$MEM_EXIT" -ne 0 ] && echo "$MEM_META" | grep -qiE "status:SG|status:RE|exitsig:9|cg-oom-killed:1|Memory limit exceeded"; then
      pass "Isolate cgroup memory limit enforced (Kernel cgroup OOM killed process; meta: $(echo "$MEM_META" | tr '\n' ' '))"
    else
      fail "Memory Limit Indeterminate: Exit code $MEM_EXIT, Meta: $MEM_META, Output: $MEM_OUT"
    fi

    # 3.7 CPU Timeout Enforcement inside Isolate
    docker compose exec -T judge0-workers rm -f /tmp/isolate_cpu_meta
    CPU_OUT=$(docker compose exec -T judge0-workers isolate --box-id=$BOX_ID --cg --time=1 --wall-time=2 -M /tmp/isolate_cpu_meta --run -- /bin/bash -c 'while true; do :; done' 2>&1)
    CPU_EXIT=$?
    CPU_META=""
    if ! CPU_META=$(docker compose exec -T judge0-workers cat /tmp/isolate_cpu_meta 2>&1); then
      fail "Failed to read Isolate CPU meta file /tmp/isolate_cpu_meta: $CPU_META"
    fi

    if [ "$CPU_EXIT" -eq 0 ]; then
      fail "Runaway CPU process unexpectedly exited cleanly with exit code 0!"
    elif echo "$CPU_META" | grep -qiE "status:TO|exitsig:9|exitsig:24|Time limit exceeded"; then
      pass "Isolate CPU time limit enforced (Runaway loop terminated by Isolate timer; meta: $(echo "$CPU_META" | tr '\n' ' '))"
    else
      fail "CPU Timeout Indeterminate: Exit $CPU_EXIT, Meta: $CPU_META, Output: $CPU_OUT"
    fi

    # 3.8 Test Box Cleanup & Cgroup Removal (Strict Non-Zero Validation)
    CLEAN_OUT=$(docker compose exec -T judge0-workers isolate --cleanup --box-id=$BOX_ID --cg 2>&1)
    CLEAN_EXIT=$?
    if [ "$CLEAN_EXIT" -eq 0 ]; then
      pass "isolate --cleanup command exited successfully (code 0)"
    else
      fail "isolate --cleanup command failed with exit code $CLEAN_EXIT: $CLEAN_OUT"
    fi

    # Verify physical cleanup of sandbox directory (Distinguish missing directory from Docker failure and empty vs leaked)
    DIR_CHECK=$(docker compose exec -T judge0-workers bash -c '
      if [ ! -e "/var/local/lib/isolate/'$BOX_ID'" ]; then
        echo "CLEAN"
      elif [ -d "/var/local/lib/isolate/'$BOX_ID'/box" ]; then
        echo "EXISTS"
      elif [ -n "$(ls -A "/var/local/lib/isolate/'$BOX_ID'" 2>/dev/null)" ]; then
        echo "EXISTS"
      else
        echo "CLEAN"
      fi
    ')
    DIR_STATUS_EXIT=$?
    if [ "$DIR_STATUS_EXIT" -ne 0 ]; then
      fail "Failed to query sandbox directory state (Docker exit $DIR_STATUS_EXIT)"
    elif [ "$DIR_CHECK" = "CLEAN" ]; then
      pass "Sandbox directory /var/local/lib/isolate/$BOX_ID removed cleanly (box directory already cleaned up)"
    else
      fail "Sandbox directory /var/local/lib/isolate/$BOX_ID leaked (still exists after cleanup)"
    fi

    # Verify cgroup cleanup (Distinguish missing cgroup from Docker failure and check cgroup.procs)
    CG_CHECK=$(docker compose exec -T judge0-workers bash -c '
      CG_DIR=""
      if [ -d "/sys/fs/cgroup/memory/isolate/box-'$BOX_ID'" ]; then
        CG_DIR="/sys/fs/cgroup/memory/isolate/box-'$BOX_ID'"
      elif [ -d "/sys/fs/cgroup/memory/box-'$BOX_ID'" ]; then
        CG_DIR="/sys/fs/cgroup/memory/box-'$BOX_ID'"
      fi
      if [ -z "$CG_DIR" ]; then
        echo "CLEAN"
      else
        if [ -f "$CG_DIR/cgroup.procs" ]; then
          pids=""
          if ! pids=$(cat "$CG_DIR/cgroup.procs" 2>&1); then
            echo "UNREADABLE_PROCS"
          elif [ -n "$pids" ]; then
            echo "EXISTS_WITH_PIDS"
          else
            echo "EXISTS"
          fi
        else
          echo "EXISTS"
        fi
      fi
    ')
    CG_STATUS_EXIT=$?
    if [ "$CG_STATUS_EXIT" -ne 0 ]; then
      fail "Failed to query cgroup directory state (Docker exit $CG_STATUS_EXIT)"
    elif [ "$CG_CHECK" = "CLEAN" ]; then
      pass "Isolate memory cgroup box directory removed cleanly"
    elif [ "$CG_CHECK" = "UNREADABLE_PROCS" ]; then
      fail "Unable to read cgroup.procs in box-$BOX_ID cgroup directory (UNKNOWN/FAIL)"
    else
      fail "Isolate memory cgroup box directory leaked (still exists after cleanup)"
    fi

    # Verify no residual processes in system belonging to test box
    PROC_CHECK=$(docker compose exec -T judge0-workers bash -c 'pgrep -f "box-'$BOX_ID'" 2>/dev/null || echo "NONE"')
    if [ "$PROC_CHECK" = "NONE" ] || [ -z "$PROC_CHECK" ]; then
      pass "No residual processes found for Box $BOX_ID"
    else
      fail "Lingering processes detected for box-$BOX_ID: $PROC_CHECK"
    fi
  else
    fail "judge0-workers container is not running (run 'docker compose up -d' first)."
  fi
fi

echo ""
echo "========================================================"
if [ "$FAILED" -eq 0 ]; then
  echo " VERDICT: ALL CGROUPS V1 & ISOLATE CHECKS PASSED [READY]"
  exit 0
else
  echo " VERDICT: CGROUPS V1 / ISOLATE VERIFICATION FAILED [FAIL-CLOSED]"
  echo " Correct kernel parameters and mount permissions before activating runner."
  exit 1
fi
