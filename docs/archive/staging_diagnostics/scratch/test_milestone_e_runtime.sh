#!/usr/bin/env bash
set -euo pipefail

echo "========================================================"
echo " TestForge Milestone E - Basic Runtime Verification Suite"
echo " Target: Native ARM64 Staging VM (Standard_B2ps_v2)"
echo " Date:   $(date -u)"
echo "========================================================"

FAILED=0
pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILED=1; }

TOKEN=$(grep '^AUTHN_TOKEN=' /home/azureuser/deploy-judge0/.env | cut -d'=' -f2)
ENDPOINT="http://127.0.0.1:2358"

# Python JSON extraction helper
json_get() {
  local json_str="$1"
  local py_expr="$2"
  echo "$json_str" | python3 -c "import sys, json; data = json.load(sys.stdin); $py_expr" 2>/dev/null || echo ""
}

# 1. OPTION C DIRECT PERMISSION VERIFICATION
echo ""
echo "── 1. Option C Binary Diversion & Permissions ──"
PERMS=$(docker compose -f /home/azureuser/deploy-judge0/docker-compose.yml exec -T judge0-workers stat -c "%a %U:%G" /usr/local/bin/isolate-bin 2>&1 | tail -n 1 || echo "ERROR")
if [ "$PERMS" = "700 root:root" ]; then
  pass "/usr/local/bin/isolate-bin is strictly mode 0700 owned by root:root ($PERMS)"
else
  fail "/usr/local/bin/isolate-bin permissions mismatch: $PERMS (expected 700 root:root)"
fi

# Verify unprivileged user (UID 1000) cannot execute isolate-bin directly
DIRECT_EXEC_STATUS=0
docker compose -f /home/azureuser/deploy-judge0/docker-compose.yml exec -T judge0-workers bash -c '/usr/local/bin/isolate-bin' >/dev/null 2>&1 || DIRECT_EXEC_STATUS=$?
if [ "$DIRECT_EXEC_STATUS" -ne 0 ]; then
  pass "Direct execution of /usr/local/bin/isolate-bin by UID 1000 blocked (exit $DIRECT_EXEC_STATUS)"
else
  fail "SECURITY VIOLATION: UID 1000 executed /usr/local/bin/isolate-bin directly (Option C bypass!)"
fi

# 2. WRAPPER ARGUMENT VALIDATION & FAIL-CLOSED CHECKS
echo ""
echo "── 2. Isolate Wrapper Argument Validation ──"
WRAP_VER=$(docker compose -f /home/azureuser/deploy-judge0/docker-compose.yml exec -T judge0-workers isolate --version 2>&1 || echo "ERROR")
if echo "$WRAP_VER" | grep -q "The process isolator"; then
  VER_STR=$(echo "$WRAP_VER" | grep "The process isolator" | head -n 1)
  pass "Wrapper self-elevation and --version handler validated: $VER_STR"
else
  fail "Wrapper failed on --version: $WRAP_VER"
fi

# Verify --share-net is rejected
SHARE_NET_OUT=$(docker compose -f /home/azureuser/deploy-judge0/docker-compose.yml exec -T judge0-workers isolate --share-net --init --box-id=98 --cg 2>&1 || true)
if echo "$SHARE_NET_OUT" | grep -q "Forbidden flag --share-net detected"; then
  pass "Wrapper strictly rejected forbidden --share-net flag (Zero Egress enforced)"
else
  fail "Wrapper did not reject --share-net: $SHARE_NET_OUT"
fi

# Verify unknown flag is rejected
UNKNOWN_OUT=$(docker compose -f /home/azureuser/deploy-judge0/docker-compose.yml exec -T judge0-workers isolate --unknown-bogus-flag 2>&1 || true)
if echo "$UNKNOWN_OUT" | grep -q "Unknown or disallowed option"; then
  pass "Wrapper strictly rejected unrecognized argument (fail-closed)"
else
  fail "Wrapper did not reject unknown flag: $UNKNOWN_OUT"
fi

# 3. BENIGN PYTHON 3 EXECUTION CHECK
echo ""
echo "── 3. Benign Sandbox Execution (Python 3) ──"
PY_PAYLOAD='{"source_code": "print(\"TESTFORGE_STAGE_E_SANITY_SUCCESS\")", "language_id": 71, "cpu_time_limit": 2.0, "wall_time_limit": 4.0, "memory_limit": 128000}'
PY_RESP=$(curl -s -X POST -H "X-Auth-Token: $TOKEN" -H "Content-Type: application/json" -d "$PY_PAYLOAD" "$ENDPOINT/submissions?wait=true&base64_encoded=false")
PY_STATUS=$(json_get "$PY_RESP" "print(data.get('status', {}).get('id', 0))")
PY_STDOUT=$(json_get "$PY_RESP" "print(data.get('stdout', '').strip())")
PY_TIME=$(json_get "$PY_RESP" "print(data.get('time', ''))")
PY_MEM=$(json_get "$PY_RESP" "print(data.get('memory', ''))")

if [ "$PY_STATUS" -eq 3 ] && [ "$PY_STDOUT" = "TESTFORGE_STAGE_E_SANITY_SUCCESS" ]; then
  pass "Python 3 execution accepted: Status 3 (Accepted), time=${PY_TIME}s, mem=${PY_MEM}KB, stdout='$PY_STDOUT'"
else
  fail "Python 3 execution failed: Status $PY_STATUS, Response: $PY_RESP"
fi

# 4. HARMLESS TIMEOUT TEST (Status 5 TLE)
echo ""
echo "── 4. Benign Timeout Constraint Enforcement ──"
TLE_PAYLOAD='{"source_code": "import time\ntime.sleep(5)", "language_id": 71, "cpu_time_limit": 1.0, "wall_time_limit": 1.0}'
TLE_RESP=$(curl -s -X POST -H "X-Auth-Token: $TOKEN" -H "Content-Type: application/json" -d "$TLE_PAYLOAD" "$ENDPOINT/submissions?wait=true&base64_encoded=false")
TLE_STATUS=$(json_get "$TLE_RESP" "print(data.get('status', {}).get('id', 0))")
TLE_DESC=$(json_get "$TLE_RESP" "print(data.get('status', {}).get('description', ''))")

if [ "$TLE_STATUS" -eq 5 ]; then
  pass "Timeout enforcement verified: Status 5 ($TLE_DESC)"
else
  fail "Timeout enforcement failed: Status $TLE_STATUS ($TLE_DESC), Response: $TLE_RESP"
fi

# 5. COMPILER AVAILABILITY & C++ EXECUTION (Language 54: GCC 9.2.0)
echo ""
echo "── 5. Compiler Toolchain & Native Binary Execution (C++ GCC 9.2.0) ──"
CPP_PAYLOAD='{"source_code": "#include <iostream>\nint main(){ std::cout << \"TESTFORGE_CPP_BENIGN_OK\"; return 0; }", "language_id": 54, "cpu_time_limit": 5.0, "wall_time_limit": 10.0}'
CPP_RESP=$(curl -s -X POST -H "X-Auth-Token: $TOKEN" -H "Content-Type: application/json" -d "$CPP_PAYLOAD" "$ENDPOINT/submissions?wait=true&base64_encoded=false")
CPP_STATUS=$(json_get "$CPP_RESP" "print(data.get('status', {}).get('id', 0))")
CPP_STDOUT=$(json_get "$CPP_RESP" "print(data.get('stdout', '').strip())")

if [ "$CPP_STATUS" -eq 3 ] && [ "$CPP_STDOUT" = "TESTFORGE_CPP_BENIGN_OK" ]; then
  pass "C++ GCC 9.2.0 compiled and executed natively: Status 3 (Accepted), stdout='$CPP_STDOUT'"
else
  fail "C++ compilation/execution failed: Status $CPP_STATUS, Response: $CPP_RESP"
fi

# 6. ORPHAN PROCESS & CGROUP CLEANUP CHECK
echo ""
echo "── 6. Orphan Process & Sandbox Cleanup Check ──"
LINGERING_BOXES=$(find /sys/fs/cgroup/memory/isolate -mindepth 1 -maxdepth 1 -type d -name "box-*" 2>/dev/null || echo "")
if [ -z "$LINGERING_BOXES" ]; then
  pass "No lingering Isolate cgroup box directories in /sys/fs/cgroup/memory/isolate"
else
  fail "Lingering sandbox cgroup directories detected: $LINGERING_BOXES"
fi

ORPHAN_PROCS=$(pgrep -f "TESTFORGE_STAGE_E" 2>/dev/null || echo "")
if [ -z "$ORPHAN_PROCS" ]; then
  pass "Zero orphaned test processes lingering on host"
else
  fail "Orphaned processes detected: $ORPHAN_PROCS"
fi

# 7. RESOURCE ACCOUNTING & CAPACITY MEASUREMENTS
echo ""
echo "── 7. Host & Container Resource Telemetry ──"
echo "Host Memory Utilization:"
free -h

echo ""
echo "Container Resource Metrics:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.PIDs}}"

echo ""
echo "========================================================"
if [ "$FAILED" -eq 0 ]; then
  echo " MILESTONE E BASIC RUNTIME VERIFICATION: ALL CHECKS PASSED [SUCCESS]"
  exit 0
else
  echo " MILESTONE E BASIC RUNTIME VERIFICATION: FAILED"
  exit 1
fi
