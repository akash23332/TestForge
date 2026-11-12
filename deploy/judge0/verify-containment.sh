#!/usr/bin/env bash
# ==============================================================================
# TestForge Dedicated Execution Runner - Hostile-Code Containment Test Suite
# Target: Dedicated Linux VM with Judge0 CE v1.13.1
# Usage: ./verify-containment.sh [OPTIONAL_ENDPOINT] [OPTIONAL_AUTHN_TOKEN] [OPTIONAL_AUTHZ_TOKEN]
# ==============================================================================

set -euo pipefail

ENDPOINT="${1:-http://127.0.0.1:2358}"
AUTHN_TOKEN="${2:-$(grep -E '^AUTHN_TOKEN=' /opt/testforge-judge0/judge0.conf 2>/dev/null | cut -d'=' -f2 || grep -E '^AUTHN_TOKEN=' ./judge0.conf 2>/dev/null | cut -d'=' -f2 || echo '')}"
AUTHZ_TOKEN="${3:-$(grep -E '^AUTHZ_TOKEN=' /opt/testforge-judge0/judge0.conf 2>/dev/null | cut -d'=' -f2 || grep -E '^AUTHZ_TOKEN=' ./judge0.conf 2>/dev/null | cut -d'=' -f2 || echo '')}"

HEADERS=(-H "Content-Type: application/json")
if [ -n "$AUTHN_TOKEN" ]; then
  HEADERS+=(-H "X-Auth-Token: $AUTHN_TOKEN")
fi

echo "========================================================"
echo " TestForge Hostile-Code Containment Verification Suite "
echo " Endpoint: $ENDPOINT"
echo " Date:     $(date -u)"
echo "========================================================"

TOTAL_TESTS=25
PASSED_TESTS=0
FAILED=0

pass_test() {
  echo "  ✔ RESULT: CONTAINED / ENFORCED ($1)"
  PASSED_TESTS=$((PASSED_TESTS + 1))
}

fail_test() {
  echo "  ✖ RESULT: POTENTIAL BREACH / UNEXPECTED BEHAVIOR ($1)" >&2
  FAILED=1
}

# ------------------------------------------------------------------------------
# SECTION 0: POSITIVE BASELINE CONTROLS (EXECUTION & NETWORK SANITY)
# ------------------------------------------------------------------------------
echo ""
echo "── [Baseline Control] Valid Execution Sanity Check ──"
BASELINE_CODE='print("BASELINE_VALID_EXECUTION")'
BASELINE_PAYLOAD=$(jq -n \
  --arg code "$BASELINE_CODE" \
  '{source_code: $code, language_id: 71, cpu_time_limit: 2.0, wall_time_limit: 4.0, memory_limit: 128000, enable_network: false}')

BASELINE_RESP=$(curl -s -X POST "${HEADERS[@]}" -d "$BASELINE_PAYLOAD" "$ENDPOINT/submissions?wait=true&base64_encoded=false" || echo "")

if [ -z "$BASELINE_RESP" ]; then
  echo "[FATAL] Runner failed to respond to baseline valid submission. Aborting suite." >&2
  exit 1
fi

BASE_STATUS=$(echo "$BASELINE_RESP" | jq -r '.status.id // 0')
BASE_STDOUT=$(echo "$BASELINE_RESP" | jq -r '.stdout // ""' | tr -d '\r\n')

if [ "$BASE_STATUS" -ne 3 ] || [ "$BASE_STDOUT" != "BASELINE_VALID_EXECUTION" ]; then
  echo "[FATAL] Positive control failed! Status: $BASE_STATUS, Stdout: '$BASE_STDOUT'. Response: $BASELINE_RESP" >&2
  echo "[FATAL] The runner cannot reliably execute valid code. Containment tests cannot be evaluated." >&2
  exit 1
fi
echo "  ✔ Baseline valid code executed successfully (Status 3: Accepted)."

echo ""
echo "── [Baseline Control 2] External Egress Connectivity Sanity Check (Outside Sandbox) ──"
# Verify that the runner host/worker container can reach 8.8.8.8:53 when network is enabled
# If the host itself lacks outbound connectivity, sandbox network containment tests would produce false positives
HOST_EGRESS_VERIFIED=false
HOST_NETNS=""
WORKER_NETNS=""

# Capture host network namespace identity
if [ -e "/proc/$$/ns/net" ]; then
  HOST_NETNS=$(readlink "/proc/$$/ns/net" 2>/dev/null || echo "UNREADABLE_HOST_NETNS")
fi
echo "  Host Network Namespace:    ${HOST_NETNS:-UNKNOWN}"

if command -v docker &>/dev/null; then
  # Capture worker container network namespace identity
  WORKER_NETNS=$(docker compose exec -T judge0-workers bash -c 'readlink /proc/1/ns/net 2>/dev/null || echo "UNREADABLE_WORKER_NETNS"' 2>/dev/null || echo "DOCKER_EXEC_FAIL")
  echo "  Worker Network Namespace:  ${WORKER_NETNS:-UNKNOWN}"

  EGRESS_PROBE=$(docker compose exec -T judge0-workers python3 -c '
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(3.0)
try:
    s.connect(("8.8.8.8", 53))
    s.close()
    print("HOST_EGRESS_FUNCTIONAL")
except Exception as e:
    print("HOST_EGRESS_FAILED:", type(e).__name__, str(e))
' 2>&1 || echo "DOCKER_EXEC_FAIL")

  if echo "$EGRESS_PROBE" | grep -q "HOST_EGRESS_FUNCTIONAL"; then
    echo "  ✔ Host/container external network connectivity verified functional outside sandbox."
    HOST_EGRESS_VERIFIED=true
  else
    echo "  [FATAL] Host/container outbound network connectivity is BROKEN ($EGRESS_PROBE)." >&2
    echo "  [FATAL] Cannot evaluate sandbox network isolation: host lacks baseline connectivity (false-positive risk). Aborting." >&2
    exit 1
  fi
else
  # Direct host check if docker CLI is not present
  if python3 -c 'import socket; s=socket.socket(); s.settimeout(3.0); s.connect(("8.8.8.8", 53)); s.close()' 2>/dev/null; then
    echo "  ✔ Outbound network egress functional outside sandbox on host."
    HOST_EGRESS_VERIFIED=true
  else
    echo "  [FATAL] Host network egress failed. Cannot evaluate sandbox network isolation. Aborting." >&2
    exit 1
  fi
fi

# ------------------------------------------------------------------------------
# SECTION 1: AUTHENTICATION & ACCESS CONTROL TESTS
# ------------------------------------------------------------------------------
echo ""
echo "── [Test 1/$TOTAL_TESTS] Authentication Guard (Missing Token) ──"
HTTP_NO_AUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"source_code":"print(1)","language_id":71}' "$ENDPOINT/submissions?wait=true" || echo "000")
if [ "$HTTP_NO_AUTH" = "401" ]; then
  pass_test "HTTP 401 on missing X-Auth-Token"
else
  fail_test "Expected HTTP 401, got HTTP $HTTP_NO_AUTH"
fi

echo ""
echo "── [Test 2/$TOTAL_TESTS] Authentication Guard (Invalid Token) ──"
HTTP_BAD_AUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "X-Auth-Token: bad_invalid_token_999" -d '{"source_code":"print(1)","language_id":71}' "$ENDPOINT/submissions?wait=true" || echo "000")
if [ "$HTTP_BAD_AUTH" = "401" ]; then
  pass_test "HTTP 401 on invalid X-Auth-Token"
else
  fail_test "Expected HTTP 401, got HTTP $HTTP_BAD_AUTH"
fi

echo ""
echo "── [Test 3/$TOTAL_TESTS] Administrative Authorization Guard (/system_info) ──"
HTTP_ADMIN_NO_AUTH=$(curl -s -o /dev/null -w "%{http_code}" -X GET -H "X-Auth-Token: $AUTHN_TOKEN" "$ENDPOINT/system_info" || echo "000")
if [ "$HTTP_ADMIN_NO_AUTH" = "401" ] || [ "$HTTP_ADMIN_NO_AUTH" = "403" ]; then
  pass_test "Admin endpoint rejected without X-Auth-User"
else
  fail_test "Expected HTTP 401/403 on /system_info without admin token, got HTTP $HTTP_ADMIN_NO_AUTH"
fi

# ------------------------------------------------------------------------------
# HELPER: CODE EXECUTION RUNNER
# ------------------------------------------------------------------------------
run_code_test() {
  local num="$1"
  local title="$2"
  local lang_id="$3"
  local code="$4"
  local expected_status="$5"
  local check_pattern="$6"
  local extra_payload="${7:-}"

  echo ""
  echo "── [Test $num/$TOTAL_TESTS] $title ──"

  local payload
  if [ -n "$extra_payload" ]; then
    payload=$(jq -n \
      --arg code "$code" \
      --argjson lang "$lang_id" \
      --argjson extra "$extra_payload" \
      '{source_code: $code, language_id: $lang, cpu_time_limit: 2.0, wall_time_limit: 4.0, memory_limit: 128000} + $extra')
  else
    payload=$(jq -n \
      --arg code "$code" \
      --argjson lang "$lang_id" \
      '{source_code: $code, language_id: $lang, cpu_time_limit: 2.0, wall_time_limit: 4.0, memory_limit: 128000, enable_network: false}')
  fi

  local response
  response=$(curl -s -X POST "${HEADERS[@]}" -d "$payload" "$ENDPOINT/submissions?wait=true&base64_encoded=false" || echo "")

  if [ -z "$response" ]; then
    fail_test "Curl execution failure: empty response from runner"
    return
  fi

  local status_id
  status_id=$(echo "$response" | jq -r '.status.id // 0' 2>/dev/null || echo 0)
  local status_desc
  status_desc=$(echo "$response" | jq -r '.status.description // "Unknown"' 2>/dev/null || echo "Unknown")
  local stderr
  stderr=$(echo "$response" | jq -r '.stderr // ""' 2>/dev/null || echo "")
  local stdout
  stdout=$(echo "$response" | jq -r '.stdout // ""' 2>/dev/null || echo "")
  local compile_out
  compile_out=$(echo "$response" | jq -r '.compile_output // ""' 2>/dev/null || echo "")

  echo "  Status ID:   $status_id ($status_desc)"
  if [ -n "$stderr" ]; then echo "  Stderr:      $(echo "$stderr" | head -n 2)"; fi
  if [ -n "$stdout" ]; then echo "  Stdout:      $(echo "$stdout" | head -n 1 | cut -c 1-80)"; fi

  # Reject Status 13 (Internal Error) - an internal server crash is NEVER security containment
  if [ "$status_id" -eq 13 ]; then
    fail_test "Runner returned Status 13 (Internal Error) - infrastructure error, not security containment"
    return
  fi

  local matched=false
  # Split expected_status by '|' and check exact match
  IFS='|' read -ra ALLOWED_STATUSES <<< "$expected_status"
  for s in "${ALLOWED_STATUSES[@]}"; do
    if [ "$status_id" -eq "$s" ]; then
      if [ -n "$check_pattern" ]; then
        if echo "$stderr$stdout$compile_out$status_desc" | grep -qiE "$check_pattern"; then
          matched=true
          break
        fi
      else
        matched=true
        break
      fi
    fi
  done

  # Network Namespace Identity Verification (Finding C9-01)
  if echo "$stdout" | grep -q "SANDBOX_NETNS_INODE:"; then
    local sandbox_netns
    sandbox_netns=$(echo "$stdout" | grep -oE "SANDBOX_NETNS_INODE:net:\[[0-9]+\]" | cut -d':' -f2-3 || echo "")
    if [ -z "$sandbox_netns" ]; then
      fail_test "NETNS_IDENTITY_UNKNOWN: Missing or unreadable sandbox netns inode in stdout"
      return
    fi
    echo "  Sandbox Netns Inode:         $sandbox_netns"
    if [ -n "$HOST_NETNS" ] && [ "$sandbox_netns" = "$HOST_NETNS" ]; then
      fail_test "SHARED_NETNS_FAILURE: Sandbox process shares network namespace with host ($sandbox_netns)"
      return
    fi
    if [ -n "$WORKER_NETNS" ] && [ "$sandbox_netns" = "$WORKER_NETNS" ]; then
      fail_test "SHARED_NETNS_FAILURE: Sandbox process shares network namespace with Judge0 worker container ($sandbox_netns)"
      return
    fi
    echo "  ✔ DISTINCT_NETNS_VERIFIED: Sandbox ($sandbox_netns) is distinct from Host (${HOST_NETNS:-UNKNOWN}) and Worker (${WORKER_NETNS:-UNKNOWN})"
  fi

  if [ "$matched" = true ]; then
    pass_test "Defended by isolate/cgroups"
  else
    fail_test "Expected: Status in [$expected_status] matching '$check_pattern', Got: Status $status_id ($status_desc)"
  fi
}

# ------------------------------------------------------------------------------
# SECTION 2: NETWORK ISOLATION & OVERRIDE ATTEMPTS
# ------------------------------------------------------------------------------
# Explicitly separates connection denial from proof of network namespace isolation
# by inspecting /proc/self/ns/net (kernel netns identity), /proc/net/dev (only lo allowed),
# and /proc/net/route (no default routes). Requires successful reads of all kernel tables.
CODE_NET='
import socket, errno, os, sys

# 1. Independent Network Namespace Inspection
# Captures kernel namespace identity: readlink /proc/self/ns/net
try:
    if not os.path.exists("/proc/self/ns/net"):
        print("NETNS_IDENTITY_UNKNOWN:missing_proc_self_ns_net")
        sys.exit(1)
    sandbox_netns = os.readlink("/proc/self/ns/net")
    if not sandbox_netns or not sandbox_netns.startswith("net:["):
        print(f"NETNS_IDENTITY_UNKNOWN:malformed_netns:{sandbox_netns}")
        sys.exit(1)
    print(f"SANDBOX_NETNS_INODE:{sandbox_netns}")
except Exception as e:
    print(f"NETNS_IDENTITY_UNKNOWN:readlink_failed:{type(e).__name__}")
    sys.exit(1)

# 2. Strict read and validation of /proc/net/dev (Requires successful read)
if not os.path.exists("/proc/net/dev"):
    print("NETNS_DEV_READ_FAILED:missing_proc_net_dev")
    sys.exit(1)

ifaces = []
try:
    with open("/proc/net/dev", "r") as f:
        lines = f.readlines()
        if len(lines) < 2:
            print("NETNS_DEV_READ_FAILED:malformed_proc_net_dev")
            sys.exit(1)
        for line in lines[2:]:
            if ":" in line:
                iface = line.split(":")[0].strip()
                if iface != "lo":
                    ifaces.append(iface)
except Exception as e:
    print(f"NETNS_DEV_READ_FAILED:{type(e).__name__}")
    sys.exit(1)

if ifaces:
    print(f"EXTERNAL_INTERFACE_LEAK:{','.join(ifaces)}")
    sys.exit(1)

# 3. Strict read and validation of /proc/net/route (Requires successful read)
if not os.path.exists("/proc/net/route"):
    print("NETNS_ROUTE_READ_FAILED:missing_proc_net_route")
    sys.exit(1)

has_default_route = False
try:
    with open("/proc/net/route", "r") as f:
        lines = f.readlines()
        if len(lines) < 1:
            print("NETNS_ROUTE_READ_FAILED:malformed_proc_net_route")
            sys.exit(1)
        for line in lines[1:]:
            parts = line.strip().split()
            if len(parts) >= 2 and parts[1] == "00000000":
                has_default_route = True
                break
except Exception as e:
    print(f"NETNS_ROUTE_READ_FAILED:{type(e).__name__}")
    sys.exit(1)

if has_default_route:
    print("FIREWALL_DENIAL_NOT_NAMESPACE_ISOLATION:default_route_present")
    sys.exit(1)

# 4. Connection Denial Attempt
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(2.0)
try:
    s.connect(("8.8.8.8", 53))
    print("VULNERABLE_NETWORK_OPEN")
    sys.exit(1)
except socket.timeout:
    # A timeout means packets were lost or dropped by external firewall, NOT explicit namespace denial
    print("AMBIGUOUS_NETWORK_TIMEOUT")
    sys.exit(1)
except OSError as e:
    # Explicit namespace denial manifests as ENETUNREACH (101), EHOSTUNREACH (113), EPERM (1), or EACCES (13)
    if e.errno in (errno.ENETUNREACH, errno.EHOSTUNREACH, errno.EPERM, errno.EACCES):
        print(f"EXPLICIT_NAMESPACE_DENIAL:verified_netns_lo_only:{type(e).__name__}")
    else:
        print(f"UNEXPECTED_OS_ERROR:{e.errno}:{type(e).__name__}")
        sys.exit(1)
except Exception as e:
    # Unrelated exception (e.g. syntax, runtime) is NOT proof of network isolation
    print(f"UNRELATED_PYTHON_EXCEPTION:{type(e).__name__}")
    sys.exit(1)
'
run_code_test 4 "Outbound Network Egress (Default)" 71 "$CODE_NET" "3" "EXPLICIT_NAMESPACE_DENIAL"

# Test 5: Client-side network override attempt (enable_network=true)
# Must still be blocked because ALLOW_ENABLE_NETWORK=false in judge0.conf
run_code_test 5 "Client Network Override (enable_network=true)" 71 "$CODE_NET" "3|11|12" "EXPLICIT_NAMESPACE_DENIAL|Operation not permitted|Network is unreachable|Cannot enable network" '{"enable_network": true}'

CODE_META='
import urllib.request, urllib.error, socket
try:
    res = urllib.request.urlopen("http://169.254.169.254/latest/meta-data/", timeout=1.0)
    print("VULNERABLE_METADATA_ACCESSED")
except urllib.error.URLError as e:
    if isinstance(e.reason, socket.timeout):
        print("AMBIGUOUS_METADATA_TIMEOUT")
    elif isinstance(e.reason, OSError) and e.reason.errno in (101, 113, 1, 13):
        print(f"METADATA_EXPLICIT_DENIAL:{e.reason.errno}:{type(e.reason).__name__}")
    else:
        print("METADATA_BLOCKED:", type(e.reason).__name__)
except Exception as e:
    print("UNRELATED_METADATA_EXCEPTION:", type(e).__name__)
'
run_code_test 6 "Cloud Metadata IP Access (169.254.169.254)" 71 "$CODE_META" "3" "METADATA_EXPLICIT_DENIAL|METADATA_BLOCKED"

# ------------------------------------------------------------------------------
# SECTION 3: RESOURCE CONSTRAINTS & MULTI-PROCESS CONTAINMENT
# ------------------------------------------------------------------------------
CODE_FORK='
import os, time
count = 0
try:
    while True:
        pid = os.fork()
        if pid == 0:
            time.sleep(10)
            os._exit(0)
        count += 1
except Exception as e:
    print(f"FORK_BOMB_CONTAINED: at {count} forks ({type(e).__name__})")
'
run_code_test 7 "Process Fork Bomb" 71 "$CODE_FORK" "3|11|12" "FORK_BOMB_CONTAINED|BlockingIOError|Resource temporarily unavailable"

# Single process memory bomb
CODE_MEM_SINGLE='
chunks = []
try:
    for i in range(100):
        chunks.append(b"X" * (10 * 1024 * 1024))
    print("VULNERABLE_MEMORY_LEAK")
except MemoryError:
    print("MEMORY_LIMIT_CONTAINED: MemoryError")
'
run_code_test 8 "Single-Process Heap Memory Exhaustion" 71 "$CODE_MEM_SINGLE" "3|11|12" "MEMORY_LIMIT_CONTAINED|Memory limit exceeded|MemoryError"

# Multi-process memory bomb (Verifies aggregate cgroup memory across child processes)
CODE_MEM_MULTI='
import os, sys, time
# Fork 5 children each allocating 30MB (Total = 150MB > 128MB limit)
for i in range(5):
    pid = os.fork()
    if pid == 0:
        b = b"Y" * (30 * 1024 * 1024)
        time.sleep(2)
        os._exit(0)
for i in range(5):
    os.wait()
print("VULNERABLE_MULTI_PROCESS_MEMORY_LEAK")
'
run_code_test 9 "Multi-Process Aggregate Cgroup Memory Bomb" 71 "$CODE_MEM_MULTI" "11|12" "Memory limit exceeded|Killed|NZEC"

CODE_CPU='
# Infinite loop consuming 100% CPU
i = 0
while True:
    i += 1
'
run_code_test 10 "Infinite CPU Loop (CPU & Wall Timeout)" 71 "$CODE_CPU" "5" "Time Limit Exceeded"

CODE_DISK='
try:
    with open("bigfile.tmp", "wb") as f:
        f.write(b"0" * (25 * 1024 * 1024))
    print("VULNERABLE_DISK_FLOOD")
except Exception as e:
    print("DISK_LIMIT_CONTAINED:", type(e).__name__)
'
run_code_test 11 "Disk Space Exhaustion (/box quota)" 71 "$CODE_DISK" "3|8|11" "DISK_LIMIT_CONTAINED|SIGXFSZ|File size limit exceeded"

# ------------------------------------------------------------------------------
# SECTION 4: PRIVILEGE ESCALATION & HOST INTEGRITY
# ------------------------------------------------------------------------------
CODE_PASSWD='
try:
    with open("/etc/passwd", "a") as f:
        f.write("hacker:x:0:0::/:/bin/sh\n")
    print("VULNERABLE_ROOT_OVERWRITE")
except Exception as e:
    print("PASSWD_READONLY_CONTAINED:", type(e).__name__)
'
run_code_test 12 "Host Filesystem Overwrite (/etc/passwd)" 71 "$CODE_PASSWD" "3" "PASSWD_READONLY_CONTAINED"

CODE_ENV='
import os
secrets = [v for k, v in os.environ.items() if "AUTH" in k or "PASS" in k or "SECRET" in k or "TOKEN" in k]
if secrets:
    print("VULNERABLE_SECRETS_FOUND")
else:
    print("ENV_SECRETS_SANITIZED")
'
run_code_test 13 "Environment Secret Sniffing" 71 "$CODE_ENV" "3" "ENV_SECRETS_SANITIZED"

CODE_PROC='
import os
try:
    pids = [int(p) for p in os.listdir("/proc") if p.isdigit()]
    # Isolate PID namespace hides all host/container processes except sandbox init & self
    if len(pids) <= 3:
        print(f"PID_NAMESPACE_ISOLATED: {len(pids)} PIDs visible")
    else:
        print(f"VULNERABLE_HOST_PIDS_VISIBLE: {len(pids)} PIDs")
except Exception as e:
    print("PROC_ACCESS_DENIED:", type(e).__name__)
'
run_code_test 14 "Host Process Sniffing (/proc)" 71 "$CODE_PROC" "3" "PID_NAMESPACE_ISOLATED|PROC_ACCESS_DENIED"

CODE_PRIV='
import ctypes
try:
    libc = ctypes.CDLL("libc.so.6")
    res = libc.setuid(0)
    if res == 0:
        print("VULNERABLE_SETUID_ROOT_SUCCESS")
    else:
        print("PRIVILEGE_ESCALATION_BLOCKED")
except Exception as e:
    print("PRIVILEGE_ESCALATION_BLOCKED:", type(e).__name__)
'
run_code_test 15 "Privilege Escalation (setuid 0)" 71 "$CODE_PRIV" "3|11" "PRIVILEGE_ESCALATION_BLOCKED"

CODE_RAW_SOCK='
import socket
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_RAW, socket.IPPROTO_ICMP)
    print("VULNERABLE_RAW_SOCKET_OPENED")
except Exception as e:
    print("RAW_SOCKET_BLOCKED:", type(e).__name__)
'
run_code_test 16 "Raw Socket Packet Sniffing (CAP_NET_RAW)" 71 "$CODE_RAW_SOCK" "3|11" "RAW_SOCKET_BLOCKED|PermissionError"

# ------------------------------------------------------------------------------
# SECTION 5: MULTI-LANGUAGE SANDBOX CONTAINMENT (C++, Java, JavaScript)
# ------------------------------------------------------------------------------

# C++ (Language ID 54)
CODE_CPP_CPU='
#include <iostream>
int main() {
    while (true) {}
    return 0;
}
'
run_code_test 17 "C++ Infinite CPU Loop (Timeout Enforcement)" 54 "$CODE_CPP_CPU" "5" "Time Limit Exceeded"

CODE_CPP_MEM='
#include <iostream>
#include <vector>
int main() {
    try {
        std::vector<char*> chunks;
        for (int i = 0; i < 50; ++i) {
            chunks.push_back(new char[20 * 1024 * 1024]);
        }
        std::cout << "VULNERABLE_CPP_MEMORY_LEAK" << std::endl;
    } catch (...) {
        std::cout << "CPP_MEMORY_CONTAINED" << std::endl;
    }
    return 0;
}
'
run_code_test 18 "C++ Heap Memory Exhaustion" 54 "$CODE_CPP_MEM" "3|11|12" "CPP_MEMORY_CONTAINED|Memory limit exceeded|bad_alloc|Killed"

CODE_CPP_FORK='
#include <unistd.h>
#include <iostream>
int main() {
    int count = 0;
    while (true) {
        pid_t p = fork();
        if (p < 0) {
            std::cout << "CPP_FORK_BOMB_CONTAINED" << std::endl;
            break;
        }
        if (p == 0) {
            pause();
            return 0;
        }
        count++;
    }
    return 0;
}
'
run_code_test 19 "C++ Excessive Process Spawning (Fork Bomb)" 54 "$CODE_CPP_FORK" "3|11|12" "CPP_FORK_BOMB_CONTAINED|Resource temporarily unavailable|BlockingIOError"

CODE_CPP_NET='
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <cerrno>
#include <fstream>
#include <string>
#include <iostream>
int main() {
    // 1. Independent netns check
    std::ifstream dev("/proc/net/dev");
    std::string line;
    bool external_iface = false;
    while (std::getline(dev, line)) {
        if (line.find(":") != std::string::npos) {
            std::string iface = line.substr(0, line.find(":"));
            iface.erase(0, iface.find_first_not_of(" \t"));
            iface.erase(iface.find_last_not_of(" \t") + 1);
            if (iface != "lo") external_iface = true;
        }
    }
    
    // 2. Outbound socket probe
    int s = socket(AF_INET, SOCK_STREAM, 0);
    struct sockaddr_in serv;
    serv.sin_family = AF_INET;
    serv.sin_port = htons(53);
    inet_pton(AF_INET, "8.8.8.8", &serv.sin_addr);
    if (connect(s, (struct sockaddr*)&serv, sizeof(serv)) < 0) {
        int err = errno;
        if (external_iface) {
            std::cout << "CPP_EXTERNAL_INTERFACE_LEAK" << std::endl;
        } else if (err == ENETUNREACH || err == EHOSTUNREACH || err == EPERM || err == EACCES) {
            std::cout << "CPP_EXPLICIT_NAMESPACE_DENIAL" << std::endl;
        } else {
            std::cout << "CPP_AMBIGUOUS_ERRNO:" << err << std::endl;
        }
    } else {
        std::cout << "VULNERABLE_CPP_NETWORK_OPEN" << std::endl;
    }
    close(s);
    return 0;
}
'
run_code_test 20 "C++ Outbound Socket Connection" 54 "$CODE_CPP_NET" "3" "CPP_EXPLICIT_NAMESPACE_DENIAL"

# Java (Language ID 62)
CODE_JAVA_CPU='
public class Main {
    public static void main(String[] args) {
        while (true) {}
    }
}
'
run_code_test 21 "Java Infinite CPU Loop (Timeout Enforcement)" 62 "$CODE_JAVA_CPU" "5" "Time Limit Exceeded"

CODE_JAVA_MEM='
import java.util.ArrayList;
public class Main {
    public static void main(String[] args) {
        try {
            ArrayList<byte[]> list = new ArrayList<>();
            while (true) {
                list.add(new byte[10 * 1024 * 1024]);
            }
        } catch (OutOfMemoryError e) {
            System.out.println("JAVA_MEMORY_CONTAINED");
        }
    }
}
'
run_code_test 22 "Java Heap Memory Exhaustion" 62 "$CODE_JAVA_MEM" "3|11|12" "JAVA_MEMORY_CONTAINED|OutOfMemoryError|Memory limit exceeded|Killed"

# JavaScript (Language ID 63)
CODE_JS_CPU='
while (true) {}
'
run_code_test 23 "JavaScript Infinite CPU Loop (Timeout Enforcement)" 63 "$CODE_JS_CPU" "5" "Time Limit Exceeded"

CODE_JS_MEM='
const chunks = [];
try {
    while (true) {
        chunks.push(Buffer.alloc(10 * 1024 * 1024));
    }
} catch (e) {
    console.log("JS_MEMORY_CONTAINED");
}
'
run_code_test 24 "JavaScript Heap Memory Exhaustion" 63 "$CODE_JS_MEM" "3|11|12" "JS_MEMORY_CONTAINED|allocation failure|out of memory|Memory limit exceeded"

CODE_JS_NET='
const net = require("net");
const os = require("os");
const ifaces = os.networkInterfaces();
const nonLo = Object.keys(ifaces).filter(k => k !== "lo");

const client = net.createConnection({ port: 80, host: "1.1.1.1" }, () => {
    console.log("VULNERABLE_JS_NETWORK_OPEN");
    client.end();
});
client.on("error", (err) => {
    if (nonLo.length > 0) {
        console.log("JS_EXTERNAL_INTERFACE_LEAK");
    } else if (err.code === "ENETUNREACH" || err.code === "EHOSTUNREACH" || err.code === "EPERM" || err.code === "EACCES") {
        console.log("JS_EXPLICIT_NAMESPACE_DENIAL:" + err.code);
    } else {
        console.log("JS_AMBIGUOUS_ERROR:" + err.code);
    }
});
setTimeout(() => {}, 500);
'
run_code_test 25 "JavaScript Outbound Network Connection" 63 "$CODE_JS_NET" "3" "JS_EXPLICIT_NAMESPACE_DENIAL"

# ------------------------------------------------------------------------------
# SECTION 6: POST-EXECUTION CLEANUP & RESIDUAL AUDIT
# ------------------------------------------------------------------------------
echo ""
echo "── Section 6: Post-Execution Sandbox & Cleanup Integrity Audit ──"
if command -v docker &>/dev/null; then
  # Check if any isolate box directories contain lingering processes or uncleaned files
  CLEANUP_AUDIT=$(docker compose exec -T judge0-workers bash -c '
    FOUND_LEAKS=0
    if [ -d "/sys/fs/cgroup/memory/isolate" ]; then
      for cg_procs in /sys/fs/cgroup/memory/isolate/box-*/cgroup.procs; do
        if [ -f "$cg_procs" ]; then
          pids=""
          if ! pids=$(cat "$cg_procs" 2>&1); then
            echo "UNREADABLE_CGROUP_PROCS:$cg_procs"
            FOUND_LEAKS=$((FOUND_LEAKS + 1))
          elif [ -n "$pids" ]; then
            echo "LINGERING_CGROUP_PROCS:$cg_procs:$pids"
            FOUND_LEAKS=$((FOUND_LEAKS + 1))
          fi
        fi
      done
    fi
    if [ -d "/var/local/lib/isolate" ]; then
      for bdir in /var/local/lib/isolate/*; do
        if [ -d "$bdir/box" ]; then
          echo "LINGERING_BOX_JAIL:$bdir/box"
          FOUND_LEAKS=$((FOUND_LEAKS + 1))
        fi
      done
    fi
    echo "AUDIT_COMPLETE:$FOUND_LEAKS"
  ' 2>&1 || echo "DOCKER_AUDIT_FAIL")

  if [ "$CLEANUP_AUDIT" = "DOCKER_AUDIT_FAIL" ] || ! echo "$CLEANUP_AUDIT" | grep -q "AUDIT_COMPLETE:0"; then
    fail_test "Post-execution cleanup audit detected leaked sandbox state or Docker failure: $CLEANUP_AUDIT"
  else
    echo "  ✔ Post-execution cleanup audit: 0 lingering sandbox jails and 0 active cgroup processes."
  fi
fi

echo ""
echo "========================================================"
echo " Verification Complete: $PASSED_TESTS / $TOTAL_TESTS Tests Contained"
echo "========================================================"

if [ "$PASSED_TESTS" -eq "$TOTAL_TESTS" ] && [ "$FAILED" -eq 0 ]; then
  echo " STATUS: ALL HOSTILE ATTACK VECTORS CONTAINED."
  exit 0
else
  echo " STATUS: POTENTIAL VULNERABILITY DETECTED. DO NOT PROMOTE TO PRODUCTION."
  exit 1
fi
