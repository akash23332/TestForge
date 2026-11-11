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

pass_test() {
  echo "  ✔ RESULT: CONTAINED / ENFORCED ($1)"
  PASSED_TESTS=$((PASSED_TESTS + 1))
}

fail_test() {
  echo "  ✖ RESULT: POTENTIAL BREACH / UNEXPECTED BEHAVIOR ($1)"
}

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
  response=$(curl -s -X POST "${HEADERS[@]}" -d "$payload" "$ENDPOINT/submissions?wait=true&base64_encoded=false" || echo '{"status":{"id":13,"description":"Curl Error"}}')

  local status_id
  status_id=$(echo "$response" | jq -r '.status.id // 0')
  local status_desc
  status_desc=$(echo "$response" | jq -r '.status.description // "Unknown"')
  local stderr
  stderr=$(echo "$response" | jq -r '.stderr // ""')
  local stdout
  stdout=$(echo "$response" | jq -r '.stdout // ""')
  local compile_out
  compile_out=$(echo "$response" | jq -r '.compile_output // ""')

  echo "  Status ID:   $status_id ($status_desc)"
  if [ -n "$stderr" ]; then echo "  Stderr:      $(echo "$stderr" | head -n 2)"; fi
  if [ -n "$stdout" ]; then echo "  Stdout:      $(echo "$stdout" | head -n 1 | cut -c 1-80)"; fi

  local matched=false
  if [[ "$expected_status" == *"$status_id"* ]]; then
    if [ -n "$check_pattern" ]; then
      if echo "$stderr$stdout$compile_out$status_desc" | grep -qiE "$check_pattern"; then
        matched=true
      fi
    else
      matched=true
    fi
  fi

  if [ "$matched" = true ]; then
    pass_test "Defended by isolate/cgroups"
  else
    fail_test "Expected: Status $expected_status matching '$check_pattern', Got: $response"
  fi
}

# ------------------------------------------------------------------------------
# SECTION 2: NETWORK ISOLATION & OVERRIDE ATTEMPTS
# ------------------------------------------------------------------------------
CODE_NET='
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(1.0)
try:
    s.connect(("8.8.8.8", 53))
    print("VULNERABLE_NETWORK_OPEN")
except Exception as e:
    print("NETWORK_BLOCKED:", type(e).__name__)
'
run_code_test 4 "Outbound Network Egress (Default)" 71 "$CODE_NET" "3" "NETWORK_BLOCKED"

# Test 5: Client-side network override attempt (enable_network=true)
# Must still be blocked because ALLOW_ENABLE_NETWORK=false in judge0.conf
run_code_test 5 "Client Network Override (enable_network=true)" 71 "$CODE_NET" "3|11|12|13" "NETWORK_BLOCKED|error|invalid" '{"enable_network": true}'

CODE_META='
import urllib.request
try:
    res = urllib.request.urlopen("http://169.254.169.254/latest/meta-data/", timeout=1.0)
    print("VULNERABLE_METADATA_ACCESSED")
except Exception as e:
    print("METADATA_BLOCKED:", type(e).__name__)
'
run_code_test 6 "Cloud Metadata IP Access (169.254.169.254)" 71 "$CODE_META" "3" "METADATA_BLOCKED"

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
run_code_test 9 "Multi-Process Aggregate Cgroup Memory Bomb" 71 "$CODE_MEM_MULTI" "11|12|13" "Memory limit exceeded|Killed|NZEC"

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
run_code_test 18 "C++ Heap Memory Exhaustion" 54 "$CODE_CPP_MEM" "3|11|12|13" "CPP_MEMORY_CONTAINED|Memory limit exceeded|bad_alloc|Killed"

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
run_code_test 19 "C++ Excessive Process Spawning (Fork Bomb)" 54 "$CODE_CPP_FORK" "3|11|12|13" "CPP_FORK_BOMB_CONTAINED|Resource temporarily unavailable|error"

CODE_CPP_NET='
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <iostream>
int main() {
    int s = socket(AF_INET, SOCK_STREAM, 0);
    struct sockaddr_in serv;
    serv.sin_family = AF_INET;
    serv.sin_port = htons(53);
    inet_pton(AF_INET, "8.8.8.8", &serv.sin_addr);
    if (connect(s, (struct sockaddr*)&serv, sizeof(serv)) < 0) {
        std::cout << "CPP_NETWORK_BLOCKED" << std::endl;
    } else {
        std::cout << "VULNERABLE_CPP_NETWORK_OPEN" << std::endl;
    }
    close(s);
    return 0;
}
'
run_code_test 20 "C++ Outbound Socket Connection" 54 "$CODE_CPP_NET" "3" "CPP_NETWORK_BLOCKED"

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
run_code_test 22 "Java Heap Memory Exhaustion" 62 "$CODE_JAVA_MEM" "3|11|12|13" "JAVA_MEMORY_CONTAINED|OutOfMemoryError|Memory limit exceeded|Killed"

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
run_code_test 24 "JavaScript Heap Memory Exhaustion" 63 "$CODE_JS_MEM" "3|11|12|13" "JS_MEMORY_CONTAINED|allocation failure|out of memory|Memory limit exceeded"

CODE_JS_NET='
const net = require("net");
const client = net.createConnection({ port: 80, host: "1.1.1.1" }, () => {
    console.log("VULNERABLE_JS_NETWORK_OPEN");
    client.end();
});
client.on("error", (err) => {
    console.log("JS_NETWORK_BLOCKED: " + err.code);
});
setTimeout(() => {}, 500);
'
run_code_test 25 "JavaScript Outbound Network Connection" 63 "$CODE_JS_NET" "3" "JS_NETWORK_BLOCKED"

echo ""
echo "========================================================"
echo " Verification Complete: $PASSED_TESTS / $TOTAL_TESTS Tests Contained"
echo "========================================================"

if [ "$PASSED_TESTS" -eq "$TOTAL_TESTS" ]; then
  echo " STATUS: ALL HOSTILE ATTACK VECTORS CONTAINED."
  exit 0
else
  echo " STATUS: POTENTIAL VULNERABILITY DETECTED. DO NOT PROMOTE TO PRODUCTION."
  exit 1
fi
