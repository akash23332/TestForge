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
  if command -v docker &>/dev/null; then
    docker compose exec -T judge0-workers isolate --cleanup --box-id="$BOX_ID" &>/dev/null || true
  fi
}
trap cleanup_boxes EXIT INT TERM ERR
echo ""
echo "── 3. Isolate Container Sandbox Lifecycle ──"
if ! command -v docker &>/dev/null; then
  fail "Docker CLI is not installed or not in PATH."
else
  # Check if container is running
  if docker compose ps --services --filter "status=running" 2>/dev/null | grep -q "judge0-workers"; then
    pass "judge0-workers container is running"

    # Test isolate version inside container
    ISOLATE_VER=$(docker compose exec -T judge0-workers isolate --version 2>&1 || echo "ERROR")
    if echo "$ISOLATE_VER" | grep -qi "isolate"; then
      pass "isolate binary executable inside container: $ISOLATE_VER"
    else
      fail "isolate binary failed inside container: $ISOLATE_VER"
    fi

    # Test isolate box initialization (Box 98)
    BOX_ID=98
    docker compose exec -T judge0-workers isolate --cleanup --box-id=$BOX_ID &>/dev/null || true

    INIT_OUT=$(docker compose exec -T judge0-workers isolate --init --box-id=$BOX_ID --cg 2>&1 || echo "ERROR")
    if echo "$INIT_OUT" | grep -q "/var/local/lib/isolate"; then
      pass "isolate --init --cg succeeded (Box $BOX_ID directory created)"
      
      # Test sandbox execution with cgroup memory limit
      RUN_OUT=$(docker compose exec -T judge0-workers isolate --box-id=$BOX_ID --cg --cg-mem=64000 --run -- /bin/echo "TESTFORGE_ISOLATE_OK" 2>&1 || echo "ERROR")
      if echo "$RUN_OUT" | grep -q "TESTFORGE_ISOLATE_OK"; then
        pass "isolate sandboxed execution with cgroup accounting succeeded"
      else
        fail "isolate sandbox execution failed: $RUN_OUT"
      fi

      # Cleanup box
      if docker compose exec -T judge0-workers isolate --cleanup --box-id=$BOX_ID &>/dev/null; then
        pass "isolate --cleanup succeeded"
      else
        fail "isolate --cleanup failed to clean box $BOX_ID"
      fi
    else
      fail "isolate --init --cg failed: $INIT_OUT"
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
