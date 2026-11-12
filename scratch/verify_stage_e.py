#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error

print("=" * 60)
print(" TestForge Milestone E - Basic Runtime Verification Suite")
print(" Target: Native ARM64 Staging VM (Standard_B2ps_v2)")
print("=" * 60)

# Read tokens from .env
env_path = "/home/azureuser/deploy-judge0/.env"
tokens = {}
with open(env_path, "r") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            tokens[k] = v

authn_token = tokens.get("AUTHN_TOKEN", "")
endpoint = "http://127.0.0.1:2358"

passed = 0
failed = 0

def pass_test(msg):
    global passed
    print(f"  [PASS] {msg}")
    passed += 1

def fail_test(msg):
    global failed
    print(f"  [FAIL] {msg}")
    failed += 1

def run_in_worker(cmd, user="judge0"):
    full_cmd = ["docker", "compose", "-f", "/home/azureuser/deploy-judge0/docker-compose.yml", "exec", "-T"]
    if user != "judge0":
        full_cmd += ["-u", user]
    full_cmd += ["judge0-workers"]
    if isinstance(cmd, list):
        full_cmd += cmd
    else:
        full_cmd += ["bash", "-c", cmd]
    res = subprocess.run(full_cmd, capture_output=True, text=True)
    return res.returncode, res.stdout, res.stderr

# 1. Option C Direct Permissions
print("\n── 1. Option C Binary Diversion & Permissions ──")
rc, out, err = run_in_worker("stat -c '%a %U:%G' /usr/local/bin/isolate-bin", user="root")
stat_line = out.strip().splitlines()[-1] if out.strip() else ""
if stat_line == "700 root:root":
    pass_test(f"/usr/local/bin/isolate-bin is strictly mode 0700 owned by root:root ({stat_line})")
else:
    fail_test(f"isolate-bin permissions mismatch: '{stat_line}' (expected '700 root:root')")

# Verify UID 1000 blocked directly
rc, out, err = run_in_worker("/usr/local/bin/isolate-bin")
if rc != 0:
    pass_test(f"Direct execution of /usr/local/bin/isolate-bin by UID 1000 blocked (exit {rc})")
else:
    fail_test("SECURITY VIOLATION: UID 1000 executed /usr/local/bin/isolate-bin directly!")

# 2. Wrapper Argument Validation
print("\n── 2. Isolate Wrapper Argument Validation ──")
rc, out, err = run_in_worker("isolate --version")
if "The process isolator" in out:
    ver_line = [l for l in out.splitlines() if "The process isolator" in l][0]
    pass_test(f"Wrapper self-elevation and --version handler validated: {ver_line}")
else:
    fail_test(f"Wrapper failed on --version: {out} {err}")

rc, out, err = run_in_worker("isolate --share-net --init --box-id=98 --cg")
if "Forbidden flag --share-net detected" in err or "Forbidden flag --share-net detected" in out:
    pass_test("Wrapper strictly rejected forbidden --share-net flag (Zero Egress enforced)")
else:
    fail_test(f"Wrapper did not reject --share-net: rc={rc}, out={out}, err={err}")

rc, out, err = run_in_worker("isolate --unknown-bogus-flag")
if "Unknown or disallowed option" in err or "Unknown or disallowed option" in out:
    pass_test("Wrapper strictly rejected unrecognized argument (fail-closed)")
else:
    fail_test(f"Wrapper did not reject unknown flag: rc={rc}, out={out}, err={err}")

# HTTP Helper
def judge0_request(path, method="GET", data=None):
    url = f"{endpoint}{path}"
    headers = {
        "X-Auth-Token": authn_token,
        "Content-Type": "application/json"
    }
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))

def submit_and_wait(payload, timeout_sec=30):
    status_code, resp = judge0_request("/submissions?base64_encoded=false", "POST", payload)
    token = resp.get("token")
    if not token:
        raise RuntimeError(f"No token returned from submission: {resp}")
    
    start_time = time.time()
    while time.time() - start_time < timeout_sec:
        s_code, sub_data = judge0_request(f"/submissions/{token}?base64_encoded=false", "GET")
        st_id = sub_data.get("status", {}).get("id", 1)
        if st_id not in (1, 2):  # 1 = In Queue, 2 = Processing
            return sub_data
        time.sleep(0.5)
    raise TimeoutError(f"Submission {token} did not complete within {timeout_sec}s: {sub_data}")

# 3. Benign Python 3 Submission
print("\n── 3. Benign Sandbox Execution (Python 3) ──")
try:
    resp = submit_and_wait({
        "source_code": "print('TESTFORGE_STAGE_E_SANITY_SUCCESS')",
        "language_id": 71,
        "cpu_time_limit": 2.0,
        "wall_time_limit": 4.0,
        "memory_limit": 128000
    })
    sub_status = resp.get("status", {}).get("id", 0)
    stdout = resp.get("stdout", "").strip() if resp.get("stdout") else ""
    exec_time = resp.get("time", "")
    exec_mem = resp.get("memory", "")
    if sub_status == 3 and stdout == "TESTFORGE_STAGE_E_SANITY_SUCCESS":
        pass_test(f"Python 3 execution accepted: Status 3 (Accepted), time={exec_time}s, mem={exec_mem}KB, stdout='{stdout}'")
    else:
        fail_test(f"Python 3 execution unexpected: status={sub_status}, stdout='{stdout}', resp={resp}")
except Exception as e:
    fail_test(f"Python 3 submission request failed: {e}")

# 4. Benign Timeout Test
print("\n── 4. Benign Timeout Constraint Enforcement ──")
try:
    resp = submit_and_wait({
        "source_code": "import time\ntime.sleep(5)",
        "language_id": 71,
        "cpu_time_limit": 1.0,
        "wall_time_limit": 1.0
    })
    sub_status = resp.get("status", {}).get("id", 0)
    desc = resp.get("status", {}).get("description", "")
    if sub_status == 5:
        pass_test(f"Timeout constraint enforced cleanly: Status 5 ({desc})")
    else:
        fail_test(f"Timeout constraint failed: status={sub_status} ({desc}), resp={resp}")
except Exception as e:
    fail_test(f"Timeout test request failed: {e}")

# 5. Compiler Toolchain & C++ Execution
print("\n── 5. Compiler Toolchain & Native Binary Execution (C++ GCC 9.2.0) ──")
try:
    resp = submit_and_wait({
        "source_code": "#include <iostream>\nint main(){ std::cout << \"TESTFORGE_CPP_BENIGN_OK\"; return 0; }",
        "language_id": 54,
        "cpu_time_limit": 5.0,
        "wall_time_limit": 10.0
    })
    sub_status = resp.get("status", {}).get("id", 0)
    stdout = resp.get("stdout", "").strip() if resp.get("stdout") else ""
    if sub_status == 3 and stdout == "TESTFORGE_CPP_BENIGN_OK":
        pass_test(f"C++ GCC 9.2.0 compiled and executed natively: Status 3 (Accepted), stdout='{stdout}'")
    else:
        fail_test(f"C++ compilation/execution failed: status={sub_status}, stdout='{stdout}', resp={resp}")
except Exception as e:
    fail_test(f"C++ submission request failed: {e}")

# 6. Orphan Processes & Cgroup Cleanup
print("\n── 6. Orphan Process & Sandbox Cleanup Check ──")
res = subprocess.run(["find", "/sys/fs/cgroup/memory/isolate", "-mindepth", "1", "-maxdepth", "1", "-type", "d", "-name", "box-*"], capture_output=True, text=True)
if not res.stdout.strip():
    pass_test("No lingering Isolate cgroup box directories in /sys/fs/cgroup/memory/isolate")
else:
    fail_test(f"Lingering sandbox cgroup directories detected: {res.stdout.strip()}")

res = subprocess.run(["pgrep", "-f", "TESTFORGE_STAGE_E"], capture_output=True, text=True)
if not res.stdout.strip():
    pass_test("Zero orphaned test processes lingering on host")
else:
    fail_test(f"Orphaned test processes detected: {res.stdout.strip()}")

# 7. Resource Metrics
print("\n── 7. Host & Container Resource Telemetry ──")
print("Host Memory Utilization:")
subprocess.run(["free", "-h"])

print("\nContainer Resource Metrics:")
subprocess.run(["docker", "stats", "--no-stream", "--format", "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.PIDs}}"])

print("\n" + "=" * 60)
if failed == 0:
    print(f" MILESTONE E BASIC RUNTIME VERIFICATION: ALL {passed} CHECKS PASSED [SUCCESS]")
    sys.exit(0)
else:
    print(f" MILESTONE E BASIC RUNTIME VERIFICATION: FAILED ({failed} failures, {passed} passed)")
    sys.exit(1)
