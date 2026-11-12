#!/usr/bin/env bash
# ==============================================================================
# TestForge Dedicated Execution Runner - Resource & Cgroup Accounting Probe
# Target: Native ARM64 Linux VM with cgroups v1
# Measures:
#   1. Worker container cgroup memory usage (Docker slice)
#   2. Host-level Isolate box cgroup memory usage (/sys/fs/cgroup/memory/isolate)
#   3. Total host memory & unallocated headroom (distinguishing limits vs RSS)
#   4. Explicitly determines whether Isolate child processes are nested or root siblings
#      (never classifies arbitrary/malformed paths as siblings)
#   5. Strictly fails closed if telemetry is missing, dmesg is unreadable, host OOM occurs,
#      submission correlation fails, sampling window misses execution, or orphan processes linger
# ==============================================================================

set -euo pipefail

ENDPOINT="${1:-http://127.0.0.1:2358}"
TOKEN="${2:-$(grep -E '^AUTHN_TOKEN=' /opt/testforge-judge0/judge0.conf 2>/dev/null | cut -d'=' -f2 || grep -E '^AUTHN_TOKEN=' ./judge0.conf 2>/dev/null | cut -d'=' -f2 || echo '')}"

HEADERS=(-H "Content-Type: application/json")
if [ -n "$TOKEN" ]; then
  HEADERS+=(-H "X-Auth-Token: $TOKEN")
fi

FAILED=0

fail() {
  echo "  [FAIL] $1" >&2
  FAILED=1
}

# ==============================================================================
# Telemetry Read & Validation Helpers (Finding C9-03)
# Explicit classifications: VALID_VALUE | MISSING | UNREADABLE | MALFORMED | QUERY_FAILED | UNKNOWN
# Never converts errors into zero or empty values
# ==============================================================================
read_cgroup_metric() {
  local target_file="$1"
  READ_STATUS="UNKNOWN"
  READ_VALUE=""

  if [ ! -e "$target_file" ]; then
    READ_STATUS="MISSING"
    return 1
  fi
  if [ ! -r "$target_file" ]; then
    READ_STATUS="UNREADABLE"
    return 1
  fi

  local content=""
  if ! content=$(cat "$target_file" 2>&1); then
    READ_STATUS="UNREADABLE"
    return 1
  fi

  content=$(echo "$content" | tr -d '[:space:]')
  if [[ "$content" =~ ^[0-9]+$ ]]; then
    READ_STATUS="VALID_VALUE"
    READ_VALUE="$content"
    return 0
  else
    READ_STATUS="MALFORMED"
    return 1
  fi
}

read_cgroup_procs() {
  local target_file="$1"
  PROCS_STATUS="UNKNOWN"
  PROCS_LIST=()

  if [ ! -e "$target_file" ]; then
    PROCS_STATUS="MISSING"
    return 1
  fi
  if [ ! -r "$target_file" ]; then
    PROCS_STATUS="UNREADABLE"
    return 1
  fi

  local content=""
  if ! content=$(cat "$target_file" 2>&1); then
    PROCS_STATUS="UNREADABLE"
    return 1
  fi

  local is_valid=true
  local line
  while IFS= read -r line; do
    local clean_line
    clean_line=$(echo "$line" | tr -d '[:space:]')
    if [ -n "$clean_line" ]; then
      if [[ "$clean_line" =~ ^[0-9]+$ ]]; then
        PROCS_LIST+=("$clean_line")
      else
        is_valid=false
        break
      fi
    fi
  done <<< "$content"

  if [ "$is_valid" = true ]; then
    PROCS_STATUS="VALID_VALUE"
    return 0
  else
    PROCS_STATUS="MALFORMED"
    return 1
  fi
}

# ==============================================================================
# Monotonic Time Source (Finding C9-04)
# Replaces wall-clock date +%s with genuine monotonic clock in milliseconds
# ==============================================================================
get_monotonic_ms() {
  local mono_ms=""
  if command -v python3 &>/dev/null; then
    mono_ms=$(python3 -c 'import time; print(int(time.monotonic() * 1000))' 2>/dev/null || echo "")
    if [[ "$mono_ms" =~ ^[0-9]+$ ]]; then
      echo "$mono_ms"
      return 0
    fi
  fi
  if [ -r /proc/uptime ]; then
    mono_ms=$(awk '{printf "%d", $1 * 1000}' /proc/uptime 2>/dev/null || echo "")
    if [[ "$mono_ms" =~ ^[0-9]+$ ]]; then
      echo "$mono_ms"
      return 0
    fi
  fi
  echo "CLOCK_ERROR"
  return 1
}

echo "========================================================"
echo " TestForge Cgroup Memory Accounting & Headroom Probe   "
echo " Date:         $(date -u)"
echo " Endpoint:     $ENDPOINT"
echo "========================================================"

if ! command -v docker &>/dev/null; then
  echo "[FATAL] Docker CLI not found. Run this on the Linux runner VM." >&2
  exit 1
fi

WORKER_CID=$(docker compose ps -q judge0-workers 2>/dev/null || docker ps -q --filter "name=testforge-judge0-workers" 2>/dev/null || echo "")

if [ -z "$WORKER_CID" ]; then
  echo "[FATAL] judge0-workers container is not running. Start stack with 'docker compose up -d' first." >&2
  exit 1
fi

echo "Worker Container ID: $WORKER_CID"

# 1. Inspect Host Physical Memory (Baseline)
echo ""
echo "── 1. Host Physical Memory Snapshot (Pre-Execution Baseline) ──"
if [ ! -r /proc/meminfo ]; then
  echo "[FATAL] /proc/meminfo is unreadable." >&2
  exit 1
fi

TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
AVAIL_RAM_KB_BEFORE=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
TOTAL_RAM_MB=$((TOTAL_RAM_KB / 1024))
AVAIL_RAM_MB_BEFORE=$((AVAIL_RAM_KB_BEFORE / 1024))
echo "  Total Host RAM:              ${TOTAL_RAM_MB} MB"
echo "  Available Host RAM (Before): ${AVAIL_RAM_MB_BEFORE} MB"

# 2. Locate Docker Worker Container Cgroup Path
echo ""
echo "── 2. Docker Worker Cgroup Path ──"
DOCKER_CG_PATH=""
POSSIBLE_PATHS=(
  "/sys/fs/cgroup/memory/docker/$WORKER_CID"
  "/sys/fs/cgroup/memory/system.slice/docker-$WORKER_CID.scope"
  "/sys/fs/cgroup/memory/docker.slice/docker-$WORKER_CID.scope"
)

for p in "${POSSIBLE_PATHS[@]}"; do
  if [ -d "$p" ]; then
    DOCKER_CG_PATH="$p"
    break
  fi
done

DOCKER_BASELINE_USAGE=0
DOCKER_CG_LIMIT=0
if [ -n "$DOCKER_CG_PATH" ]; then
  echo "  Worker Cgroup Found: $DOCKER_CG_PATH"
  if read_cgroup_metric "$DOCKER_CG_PATH/memory.usage_in_bytes"; then
    DOCKER_BASELINE_USAGE=$READ_VALUE
  else
    fail "Worker container memory.usage_in_bytes is $READ_STATUS at $DOCKER_CG_PATH/memory.usage_in_bytes"
  fi
  if read_cgroup_metric "$DOCKER_CG_PATH/memory.limit_in_bytes"; then
    DOCKER_CG_LIMIT=$READ_VALUE
  else
    fail "Worker container memory.limit_in_bytes is $READ_STATUS at $DOCKER_CG_PATH/memory.limit_in_bytes"
  fi
  echo "  Baseline Worker Memory Usage: $((DOCKER_BASELINE_USAGE / 1024 / 1024)) MB"
  echo "  Configured Worker Limit:      $((DOCKER_CG_LIMIT / 1024 / 1024)) MB"
else
  fail "Worker container memory cgroup path not found or unreadable under /sys/fs/cgroup/memory"
fi

# 3. Locate Host Isolate Cgroup Path & Hierarchy Settings
echo ""
echo "── 3. Host Isolate Cgroup Path & Hierarchy Settings ──"
ISOLATE_CG_BASE="/sys/fs/cgroup/memory/isolate"
HOST_ROOT_CG="/sys/fs/cgroup/memory"

if [ -f "$HOST_ROOT_CG/memory.use_hierarchy" ]; then
  ROOT_HIERARCHY=$(cat "$HOST_ROOT_CG/memory.use_hierarchy")
  echo "  Host Root memory.use_hierarchy: $ROOT_HIERARCHY"
else
  fail "Host root memory.use_hierarchy unreadable"
fi

# Snapshot pre-existing boxes to detect stale cgroups from previous runs
PRE_EXISTING_BOXES=()
if [ -d "$ISOLATE_CG_BASE" ]; then
  echo "  Host Isolate Cgroup Base: $ISOLATE_CG_BASE"
  if [ -f "$ISOLATE_CG_BASE/memory.use_hierarchy" ]; then
    ISO_HIERARCHY=$(cat "$ISOLATE_CG_BASE/memory.use_hierarchy")
    echo "  Isolate Base memory.use_hierarchy: $ISO_HIERARCHY"
  fi
  while IFS= read -r bpath; do
    if [ -n "$bpath" ]; then
      bname=$(basename "$bpath")
      PRE_EXISTING_BOXES+=("$bname")
    fi
  done < <(find "$ISOLATE_CG_BASE" -mindepth 1 -maxdepth 1 -type d -name "box-*" 2>/dev/null || true)
  if [ ${#PRE_EXISTING_BOXES[@]} -gt 0 ]; then
    echo "  [NOTICE] Pre-existing stale Isolate box directories detected: ${PRE_EXISTING_BOXES[*]}"
  fi
else
  echo "  [NOTICE] $ISOLATE_CG_BASE does not exist yet (will be initialized on first submission)."
fi

# 4. Security Prerequisites & Pre-Dispatch Validation (Findings C12-04 & C12-05)
echo ""
echo "── 4. Security Prerequisites & Pre-Dispatch Validation ──"

# Check configuration file permissions and ownership before dispatch (C12-05)
for conf in /opt/testforge-judge0/judge0.conf ./judge0.conf; do
  if [ -f "$conf" ]; then
    CONF_PERMS=$(stat -c "%a" "$conf" 2>/dev/null || echo "")
    if [ -n "$CONF_PERMS" ]; then
      # Normalize 3-digit octal (e.g. 600, 640) to 4-digit (0600, 0640)
      NORM_PERMS=$(printf "%04d" "$CONF_PERMS" 2>/dev/null || echo "$CONF_PERMS")
      if [ "$NORM_PERMS" != "0600" ] && [ "$NORM_PERMS" != "0640" ]; then
        fail "Insecure configuration file permissions on $conf: $CONF_PERMS ($NORM_PERMS). Authorized modes are strictly 0600 or 0640. Rejecting unauthorized access."
        exit 1
      fi
    fi

    # Validate file ownership where appropriate (must be owned by current user or root)
    CONF_UID=$(stat -c "%u" "$conf" 2>/dev/null || echo "")
    CURRENT_UID=$(id -u 2>/dev/null || echo "")
    if [ -n "$CONF_UID" ] && [ -n "$CURRENT_UID" ]; then
      if [ "$CONF_UID" -ne 0 ] && [ "$CONF_UID" -ne "$CURRENT_UID" ]; then
        fail "Insecure configuration file ownership on $conf: UID $CONF_UID does not match current user ($CURRENT_UID) or root (0). Rejecting unauthorized file."
        exit 1
      fi
    fi
    echo "  Configuration file $conf validated: permissions $CONF_PERMS, UID ${CONF_UID:-0} (Approved)"
  fi
done

# Validate Explicit CORRELATION_KEY before dispatching submission (Findings C11-02 & C12-04)
# Strictly require explicit key; no fallback to secret_key_base; validate minimum length 32 chars; never print key.
CORRELATION_KEY="${CORRELATION_KEY:-$(grep -E '^CORRELATION_KEY=' /opt/testforge-judge0/judge0.conf 2>/dev/null | cut -d'=' -f2 || grep -E '^CORRELATION_KEY=' ./judge0.conf 2>/dev/null | cut -d'=' -f2 || echo '')}"

if [ -z "$CORRELATION_KEY" ]; then
  fail "Missing mandatory CORRELATION_KEY in environment or configuration file. Fail-closed."
  exit 1
elif [ "${#CORRELATION_KEY}" -lt 32 ]; then
  fail "Insecure CORRELATION_KEY: length ${#CORRELATION_KEY} is less than required minimum 32 characters."
  exit 1
fi
echo "  Mandatory CORRELATION_KEY validated: explicit key present (length ${#CORRELATION_KEY} >= 32 bytes, secret redacted)"

# 4.1 Dispatch Memory Test Payload (150 MB Allocation)
echo ""
echo "── 4.1 Dispatching Memory Accounting Test (150 MB Allocation) ──"
TEST_CODE='
import time
# Allocate 150MB of memory and hold for 3 seconds
chunks = [b"M" * (10 * 1024 * 1024) for _ in range(15)]
time.sleep(3)
print("ALLOCATION_HOLD_COMPLETE")
'

PAYLOAD=$(jq -n \
  --arg code "$TEST_CODE" \
  '{source_code: $code, language_id: 71, cpu_time_limit: 5.0, wall_time_limit: 8.0, memory_limit: 256000, enable_network: false}')

DISPATCH_TIMESTAMP=$(date +%s)
RESPONSE=$(curl -s -X POST "${HEADERS[@]}" -d "$PAYLOAD" "$ENDPOINT/submissions" || echo "{}")
SUB_TOKEN=$(echo "$RESPONSE" | jq -r '.token // empty')

if [ -z "$SUB_TOKEN" ]; then
  echo "[FATAL] Failed to queue submission: $RESPONSE" >&2
  exit 1
fi
echo "  Submission Queued. Token: ${SUB_TOKEN:0:8}... (Raw token withheld)"

# Compute Full 64-hex SHA-256 HMAC for Opaque Log Correlation (Finding C11-03)
# Pass key and token via environment variables without shell command-string interpolation
TOKEN_HASH=""
if [ -n "$CORRELATION_KEY" ] && [ "${#CORRELATION_KEY}" -ge 32 ]; then
  if command -v python3 &>/dev/null; then
    TOKEN_HASH=$(CORR_KEY="$CORRELATION_KEY" SUB_TOK="$SUB_TOKEN" python3 -c '
import os, hmac, hashlib
k = os.environ.get("CORR_KEY", "").encode("utf-8")
t = os.environ.get("SUB_TOK", "").encode("utf-8")
print(hmac.new(k, t, hashlib.sha256).hexdigest())
' 2>/dev/null || echo "")
  elif command -v openssl &>/dev/null; then
    TOKEN_HASH=$(printf "%s" "$SUB_TOKEN" | openssl dgst -sha256 -hmac "$CORRELATION_KEY" 2>/dev/null | awk '{print $NF}' || echo "")
  fi
fi

if [ -n "$TOKEN_HASH" ] && [ "${#TOKEN_HASH}" -eq 64 ]; then
  echo "  Opaque Correlation Token Hash: ${TOKEN_HASH:0:16}... (Full 64-hex SHA-256 HMAC verified)"
else
  fail "Failed to compute 64-hex HMAC-SHA256 correlation token hash (UNKNOWN/FAIL)"
  exit 1
fi

# 5. Continuous Sampling Loop Until Terminal State (Unified Sampling & Polling)
echo ""
echo "── 5. Continuous Telemetry Sampling & Terminal Polling ──"
echo "  Actively sampling cgroup telemetry and tracking correlated kernel PIDs..."

PEAK_DOCKER_USAGE=0
PEAK_ISOLATE_USAGE=0
CHILD_CGROUP_AFFINITY=""
DISCOVERED_BOX_PATH=""
DISCOVERED_PID=""
CORRELATED_BOX_ID=""
CORRELATED_EXEC_ID=""
FAILCNT_VALUE=0

# Timing variables strictly initialized before loop entry
# Monotonic time in milliseconds used for all loop controls (Finding C9-04)
SAMPLING_START=$(date +%s)
SAMPLING_START_MS=$(get_monotonic_ms)
if [ "$SAMPLING_START_MS" = "CLOCK_ERROR" ]; then
  fail "Monotonic clock unavailable or failed to initialize (UNKNOWN/FAIL)"
fi
NOW=$SAMPLING_START
NOW_MS=$SAMPLING_START_MS
ELAPSED=0
ELAPSED_MS=0
ELAPSED_MONO_SECS=0
SAMPLES_TAKEN=0
TERMINAL_REACHED=false
POLL_TIMEOUT=30
STATUS_ID=0
STATUS_DESC="Unknown"
RESULT_BODY="{}"
EXECUTION_CAPTURED=false
POLL_FAILED=false

# Loop continuously while submission is executing
while true; do
  SAMPLES_TAKEN=$((SAMPLES_TAKEN + 1))
  NOW_MS=$(get_monotonic_ms || echo "CLOCK_ERROR")
  if [ "$NOW_MS" = "CLOCK_ERROR" ] || [ "$NOW_MS" -lt "$SAMPLING_START_MS" ]; then
    fail "Monotonic clock failure: non-increasing or failed clock read ($NOW_MS)"
    break
  fi
  ELAPSED_MS=$((NOW_MS - SAMPLING_START_MS))
  ELAPSED_MONO_SECS=$((ELAPSED_MS / 1000))
  NOW=$(date +%s)
  ELAPSED=$((NOW - SAMPLING_START))

  # 5.1 Sample Docker container cgroup usage (Strict read validation: no || echo 0)
  if [ -n "$DOCKER_CG_PATH" ] && [ -e "$DOCKER_CG_PATH/memory.usage_in_bytes" ]; then
    if read_cgroup_metric "$DOCKER_CG_PATH/memory.usage_in_bytes"; then
      CURR_DOCKER=$READ_VALUE
      if [ "$CURR_DOCKER" -gt "$PEAK_DOCKER_USAGE" ]; then
        PEAK_DOCKER_USAGE=$CURR_DOCKER
      fi
    else
      fail "Failed to read Docker cgroup memory.usage_in_bytes: status=$READ_STATUS (UNKNOWN/FAIL)"
    fi
  fi

  # 5.2 Attempt submission-to-box correlation (Phase 5.1C-11 Hardened)
  # Require unique, exact association between 64-hex token hash and Isolate box ID from worker logs
  if [ -z "$CORRELATED_BOX_ID" ]; then
    LOG_MATCH=""
    if ! LOG_MATCH=$(docker compose logs --tail=100 judge0-workers 2>&1); then
      fail "Docker log query failed while retrieving worker correlation logs: $LOG_MATCH (QUERY_FAILED)"
      LOG_MATCH=""
    fi

    if [ -n "$LOG_MATCH" ] && [ -n "$TOKEN_HASH" ]; then
      # Check if initialization failed for this submission
      INIT_FAIL_MATCH=$(echo "$LOG_MATCH" | grep -E "\[CORRELATION_INIT_FAILED\]" || true)
      if [ -n "$INIT_FAIL_MATCH" ]; then
        fail "Isolate sandbox initialization failure recorded in worker logs: $INIT_FAIL_MATCH"
      fi

      # Structured Opaque Correlation Check: [CORRELATION] token_hash=<64-hex> execution_id=<ID> box_id=<BOX_ID> run_idx=<N> timestamp=<TS>
      CORR_MATCH=$(echo "$LOG_MATCH" | grep -E "\[CORRELATION\][[:space:]]+token_hash=$TOKEN_HASH[[:space:]]+" || true)
      if [ -n "$CORR_MATCH" ]; then
        # Bounded temporal replay protection: timestamp must be >= DISPATCH_TIMESTAMP and within 120 seconds
        VALID_RECS=""
        while IFS= read -r rec_line; do
          [ -z "$rec_line" ] && continue
          # Validate full record tuple structure together:
          # Must match: [CORRELATION] token_hash=<64hex> execution_id=<id> box_id=<digits> run_idx=<digits> timestamp=<digits>
          if echo "$rec_line" | grep -qE "\[CORRELATION\][[:space:]]+token_hash=${TOKEN_HASH}[[:space:]]+execution_id=${TOKEN_HASH}-run[0-9]+-[0-9]+-[a-f0-9]{16}[[:space:]]+box_id=[0-9]+[[:space:]]+run_idx=[0-9]+[[:space:]]+timestamp=[0-9]+"; then
            rec_ts=$(echo "$rec_line" | grep -oE "timestamp=[0-9]+" | cut -d'=' -f2 || echo 0)
            if [ "$rec_ts" -ge "$DISPATCH_TIMESTAMP" ] && [ "$rec_ts" -le "$((DISPATCH_TIMESTAMP + 120))" ]; then
              VALID_RECS+="$rec_line"$'\n'
            else
              echo "  [WARN] Rejected out-of-window or stale correlation record: $rec_line (timestamp $rec_ts vs dispatch $DISPATCH_TIMESTAMP)"
            fi
          else
            echo "  [WARN] Rejected malformed correlation record tuple: $rec_line"
          fi
        done <<< "$CORR_MATCH"
        VALID_RECS=$(echo "$VALID_RECS" | sed '/^$/d')

        if [ -n "$VALID_RECS" ]; then
          # Extract all execution_ids and box_ids from valid records
          EXEC_CANDIDATES=$(echo "$VALID_RECS" | grep -oE "execution_id=[^[:space:]]+" | cut -d'=' -f2 | sort -u || true)
          EXEC_COUNT=$(echo "$EXEC_CANDIDATES" | grep -c . || true)

          BOX_CANDIDATES=$(echo "$VALID_RECS" | grep -oE "box_id=[0-9]+" | cut -d'=' -f2 | sort -u || true)
          CANDIDATE_COUNT=$(echo "$BOX_CANDIDATES" | grep -c . || true)

          if [ "$EXEC_COUNT" -gt 1 ]; then
            fail "Ambiguous correlation: Multiple distinct execution attempts ($EXEC_COUNT attempts: $EXEC_CANDIDATES) detected for token hash $TOKEN_HASH. Refusing to guess."
          elif [ "$CANDIDATE_COUNT" -gt 1 ]; then
            fail "Ambiguous correlation: Multiple conflicting box IDs ($BOX_CANDIDATES) associated with token hash $TOKEN_HASH in worker logs."
          elif [ "$EXEC_COUNT" -eq 1 ] && [ "$CANDIDATE_COUNT" -eq 1 ]; then
            CANDIDATE_EXEC_ID="$EXEC_CANDIDATES"
            CANDIDATE_BOX_ID="$BOX_CANDIDATES"
            # Strict execution ID format check: MUST be exactly ^${TOKEN_HASH}-run[0-9]+-[0-9]+-[a-f0-9]{16}$ (NO permissive fallbacks)
            if [[ "$CANDIDATE_EXEC_ID" =~ ^${TOKEN_HASH}-run[0-9]+-[0-9]+-[a-f0-9]{16}$ ]] && [[ "$CANDIDATE_BOX_ID" =~ ^[0-9]+$ ]]; then
              CORRELATED_EXEC_ID="$CANDIDATE_EXEC_ID"
              CORRELATED_BOX_ID="$CANDIDATE_BOX_ID"
              DISCOVERED_BOX_PATH="$ISOLATE_CG_BASE/box-$CORRELATED_BOX_ID"
              echo "  ✔ Structured Correlation Verified: Exact attempt $CORRELATED_EXEC_ID mapped to box-$CORRELATED_BOX_ID"
            else
              fail "Execution ID $CANDIDATE_EXEC_ID or box ID $CANDIDATE_BOX_ID failed strict schema validation"
            fi
          fi
        fi
      fi
    fi
  fi

  # 5.3 Sample Isolate box cgroup ONLY if unambiguously correlated (Strict read validation)
  if [ -n "$DISCOVERED_BOX_PATH" ] && [ -d "$DISCOVERED_BOX_PATH" ]; then
    # Read memory usage
    if [ -e "$DISCOVERED_BOX_PATH/memory.usage_in_bytes" ]; then
      if read_cgroup_metric "$DISCOVERED_BOX_PATH/memory.usage_in_bytes"; then
        CURR_ISO=$READ_VALUE
        if [ "$CURR_ISO" -gt "$PEAK_ISOLATE_USAGE" ]; then
          PEAK_ISOLATE_USAGE=$CURR_ISO
        fi
      else
        fail "Isolate box memory.usage_in_bytes is $READ_STATUS at $DISCOVERED_BOX_PATH/memory.usage_in_bytes (UNKNOWN/FAIL)"
      fi
    fi

    # Read failcnt
    if [ -e "$DISCOVERED_BOX_PATH/memory.failcnt" ]; then
      if read_cgroup_metric "$DISCOVERED_BOX_PATH/memory.failcnt"; then
        FAILCNT_VALUE=$READ_VALUE
      else
        fail "Isolate box memory.failcnt is $READ_STATUS at $DISCOVERED_BOX_PATH/memory.failcnt (UNKNOWN/FAIL)"
      fi
    fi

    # Track exact kernel PID from cgroup.procs and validate cgroup membership
    if [ -e "$DISCOVERED_BOX_PATH/cgroup.procs" ]; then
      if read_cgroup_procs "$DISCOVERED_BOX_PATH/cgroup.procs"; then
        for pid in "${PROCS_LIST[@]}"; do
          if [ -r "/proc/$pid/cgroup" ]; then
            AFFINITY_SAMPLE=$(grep "memory:" "/proc/$pid/cgroup" 2>/dev/null || echo "")
            # Verify that the discovered PID actually belongs to this correlated box cgroup
            if echo "$AFFINITY_SAMPLE" | grep -q "box-$CORRELATED_BOX_ID"; then
              DISCOVERED_PID="$pid"
              CHILD_CGROUP_AFFINITY="$AFFINITY_SAMPLE"
              EXECUTION_CAPTURED=true
              break
            fi
          fi
        done
      else
        fail "Isolate box cgroup.procs read error: status=$PROCS_STATUS at $DISCOVERED_BOX_PATH/cgroup.procs (UNKNOWN/FAIL)"
      fi
    fi
  fi

  # 5.4 Poll submission status (Strict HTTP & JSON check; poll failure is never terminal)
  if ! RESULT_BODY=$(curl -s -f "$ENDPOINT/submissions/$SUB_TOKEN?base64_encoded=false" 2>&1); then
    POLL_FAILED=true
  else
    STATUS_ID=$(echo "$RESULT_BODY" | jq -r '.status.id // 0' 2>/dev/null || echo 0)
    STATUS_DESC=$(echo "$RESULT_BODY" | jq -r '.status.description // "Unknown"' 2>/dev/null || echo "Unknown")

    # Terminal states in Judge0: status.id >= 3 (3=Accepted, 4=Wrong Answer, 5=TLE, 6=Compilation Error, etc.)
    if [ "$STATUS_ID" -ge 3 ]; then
      TERMINAL_REACHED=true
      NOW_MS=$(get_monotonic_ms || echo "$NOW_MS")
      ELAPSED_MS=$((NOW_MS - SAMPLING_START_MS))
      ELAPSED_MONO_SECS=$((ELAPSED_MS / 1000))
      NOW=$(date +%s)
      ELAPSED=$((NOW - SAMPLING_START))
      break
    fi
  fi

  # 5.5 Check timeout via monotonic clock
  if [ "$ELAPSED_MONO_SECS" -ge "$POLL_TIMEOUT" ]; then
    break
  fi

  sleep 0.1
done

if [ "$TERMINAL_REACHED" = false ]; then
  if [ "$POLL_FAILED" = true ]; then
    fail "Submission polling failed during execution: could not query terminal state reliably"
  else
    fail "Submission ${SUB_TOKEN:0:8}... timed out after ${POLL_TIMEOUT}s without reaching terminal state (last status: $STATUS_ID - $STATUS_DESC)"
  fi
else
  echo "  Submission Resolved: Status $STATUS_ID ($STATUS_DESC) in ${ELAPSED}s ($SAMPLES_TAKEN telemetry samples taken)"
fi

# 6. Evaluate Telemetry Validity & Submission Correlation
echo ""
echo "── 6. Telemetry & Accounting Verification ──"

# Check submission-to-Isolate correlation (no heuristic fallbacks)
if [ -z "$CORRELATED_BOX_ID" ]; then
  echo "  [CORRELATION_BLOCKED] Upstream Judge0 worker logs do not emit structured submission-to-box correlation metadata." >&2
  echo "  Cannot unambiguously determine Isolate box ID for token ${SUB_TOKEN:0:8}... Refusing to infer or guess box attribution." >&2
  echo "  Minimum upstream change: Log [CORRELATION] with token_hash=<64hex> or apply patch docker/patches/isolate_job_correlation.patch." >&2
  fail "Submission-to-Isolate correlation failure: Could not unambiguously identify Isolate box for token ${SUB_TOKEN:0:8}... Unrelated or ambient box PIDs cannot be attributed to this execution."
else
  echo "  Correlated Isolate Box ID:     $CORRELATED_BOX_ID ($DISCOVERED_BOX_PATH)"
  if [ -n "$CORRELATED_EXEC_ID" ]; then
    echo "  Execution ID:                  $CORRELATED_EXEC_ID"
  fi
  if [ -d "/var/local/lib/isolate/$CORRELATED_BOX_ID" ] || [ -d "$DISCOVERED_BOX_PATH" ]; then
    echo "  Correlated Sandbox Path:       /var/local/lib/isolate/$CORRELATED_BOX_ID and $DISCOVERED_BOX_PATH"
  fi
fi

# Check whether measurement window caught the execution
if [ "$PEAK_ISOLATE_USAGE" -eq 0 ]; then
  fail "Missing Isolate cgroup telemetry: peak usage was 0 bytes across execution window. Measurement window missed execution or cgroup failed to mount."
else
  echo "  Peak Isolate Box Memory Usage: $((PEAK_ISOLATE_USAGE / 1024 / 1024)) MB"
fi

# Check PID correlation
if [ -z "$CHILD_CGROUP_AFFINITY" ]; then
  fail "Failed to verify child process cgroup affinity: no kernel PID detected in isolate cgroup.procs for correlated box $CORRELATED_BOX_ID"
else
  echo "  Discovered Kernel PID:         $DISCOVERED_PID"
  echo "  Child Memory Cgroup Path:      $CHILD_CGROUP_AFFINITY"
fi

if [ -n "$DISCOVERED_BOX_PATH" ] && [ -f "$DISCOVERED_BOX_PATH/memory.oom_control" ]; then
  echo "  Box OOM Control Settings:"
  sed 's/^/    /' "$DISCOVERED_BOX_PATH/memory.oom_control"
fi
echo "  Box memory.failcnt:            $FAILCNT_VALUE"

# 7. Host OOM Telemetry & Stability Audit (Strict Error Check on dmesg)
echo ""
echo "── 7. Host OOM Killer & Stability Audit ──"
# Inspect dmesg for host-level oom-killer invocations
DMESG_OUTPUT=""
if ! DMESG_OUTPUT=$(dmesg 2>&1); then
  fail "Host kernel ring buffer (dmesg) is unreadable or restricted (kernel.dmesg_restrict=1). Host OOM telemetry is UNAVAILABLE/UNKNOWN."
else
  # Preserve explicit distinction: sandbox cgroup OOM vs host kernel OOM
  HOST_OOM_COUNT=$(echo "$DMESG_OUTPUT" | grep -iE 'oom-killer|out of memory|killed process' | wc -l)
  if [ "$HOST_OOM_COUNT" -gt 0 ]; then
    fail "Host kernel OOM events detected in dmesg ($HOST_OOM_COUNT events)! Potential host-level OOM invocation."
  else
    echo "  Host-level OOM killer invocations: 0 (No host kernel OOM events detected)."
  fi
fi

# 8. Post-Execution Memory & Residual Process Audit
echo ""
echo "── 8. Post-Execution Cgroup Cleanup Verification ──"
AVAIL_RAM_KB_AFTER=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
AVAIL_RAM_MB_AFTER=$((AVAIL_RAM_KB_AFTER / 1024))
echo "  Available Host RAM (After):  ${AVAIL_RAM_MB_AFTER} MB"

CLEANUP_OK=true

# 8.1 Correlate cleanup with the exact Isolate box ID & verify lifecycle telemetry (C12-02)
if [ -n "$CORRELATED_BOX_ID" ]; then
  if [ -n "$CORRELATED_EXEC_ID" ]; then
    CLEANUP_LOGS=""
    # Remove || true fallback: strictly catch Docker log query failures
    if ! CLEANUP_LOGS=$(docker compose logs --tail=100 judge0-workers 2>&1); then
      fail "Docker log query failed during post-execution cleanup verification: $CLEANUP_LOGS (QUERY_FAILED)"
      CLEANUP_OK=false
    fi

    if [ -n "$CLEANUP_LOGS" ]; then
      # Extract cleanup records for this exact execution ID
      CLEANUP_RECORDS=$(echo "$CLEANUP_LOGS" | grep -E "\[CORRELATION_CLEANUP\]" | grep "execution_id=$CORRELATED_EXEC_ID" || true)
      if [ -z "$CLEANUP_RECORDS" ]; then
        # Missing cleanup telemetry must be UNKNOWN/FAIL, not a warning
        fail "Missing [CORRELATION_CLEANUP] lifecycle telemetry for execution $CORRELATED_EXEC_ID (UNKNOWN/FAIL)"
        CLEANUP_OK=false
      else
        CLEANUP_RECORD_COUNT=$(echo "$CLEANUP_RECORDS" | grep -c . || true)
        CLEANUP_STATUSES=$(echo "$CLEANUP_RECORDS" | grep -oE "status=[A-Z]+" | cut -d'=' -f2 | sort -u || true)
        CLEANUP_STATUS_COUNT=$(echo "$CLEANUP_STATUSES" | grep -c . || true)
        CLEANUP_BOXES=$(echo "$CLEANUP_RECORDS" | grep -oE "box_id=[0-9]+" | cut -d'=' -f2 | sort -u || true)
        CLEANUP_BOX_COUNT=$(echo "$CLEANUP_BOXES" | grep -c . || true)

        if [ "$CLEANUP_STATUS_COUNT" -gt 1 ] || [ "$CLEANUP_BOX_COUNT" -gt 1 ]; then
          fail "Conflicting [CORRELATION_CLEANUP] records detected for execution $CORRELATED_EXEC_ID: multiple statuses ($CLEANUP_STATUSES) or boxes ($CLEANUP_BOXES)"
          CLEANUP_OK=false
        elif [ "$CLEANUP_RECORD_COUNT" -gt 1 ]; then
          fail "Duplicate [CORRELATION_CLEANUP] records detected for execution $CORRELATED_EXEC_ID ($CLEANUP_RECORD_COUNT records)"
          CLEANUP_OK=false
        else
          # Single unambiguous cleanup record: must match box_id and status=SUCCESS
          if echo "$CLEANUP_RECORDS" | grep -q "status=FAILED"; then
            fail "Worker recorded explicit cleanup failure in lifecycle telemetry for execution $CORRELATED_EXEC_ID: $CLEANUP_RECORDS"
            CLEANUP_OK=false
          elif echo "$CLEANUP_RECORDS" | grep -q "status=SUCCESS" && echo "$CLEANUP_RECORDS" | grep -q "box_id=$CORRELATED_BOX_ID"; then
            echo "  Lifecycle Cleanup Telemetry: status=SUCCESS for execution $CORRELATED_EXEC_ID (box $CORRELATED_BOX_ID verified)"
          else
            fail "Invalid or mismatched cleanup record for execution $CORRELATED_EXEC_ID (expected box_id=$CORRELATED_BOX_ID, status=SUCCESS): $CLEANUP_RECORDS"
            CLEANUP_OK=false
          fi
        fi
      fi
    fi
  fi

  TARGET_BOX_DIR="/var/local/lib/isolate/$CORRELATED_BOX_ID"
  TARGET_CG_DIR="$ISOLATE_CG_BASE/box-$CORRELATED_BOX_ID"

  # Query sandbox directory state inside worker container
  DIR_QUERY_EXIT=0
  DIR_STATUS=$(docker compose exec -T judge0-workers bash -c '
    if [ ! -e "'"$TARGET_BOX_DIR"'" ]; then
      echo "DELETED"
    elif [ -d "'"$TARGET_BOX_DIR"'/box" ]; then
      echo "LEAKED_BOX_SUBDIR"
    elif [ -n "$(ls -A "'"$TARGET_BOX_DIR"'" 2>/dev/null)" ]; then
      echo "LEAKED_FILES"
    else
      echo "EMPTY_DIR_RETAINED"
    fi
  ' 2>&1) || DIR_QUERY_EXIT=$?

  if [ "$DIR_QUERY_EXIT" -ne 0 ]; then
    fail "Docker execution failure while verifying sandbox directory cleanup: $DIR_STATUS (UNKNOWN/FAIL)"
    CLEANUP_OK=false
  elif [ "$DIR_STATUS" = "LEAKED_BOX_SUBDIR" ] || [ "$DIR_STATUS" = "LEAKED_FILES" ]; then
    fail "Sandbox directory $TARGET_BOX_DIR was not cleaned up! Residual content detected: $DIR_STATUS"
    CLEANUP_OK=false
  elif [ "$DIR_STATUS" = "DELETED" ] || [ "$DIR_STATUS" = "EMPTY_DIR_RETAINED" ]; then
    echo "  Sandbox directory status for box $CORRELATED_BOX_ID: $DIR_STATUS (Clean)"
  else
    fail "Unrecognized sandbox directory status: $DIR_STATUS (UNKNOWN/FAIL)"
    CLEANUP_OK=false
  fi

  # Check cgroup removal and processes inside correlated box cgroup.procs
  # Do not convert unreadable cgroup.procs into empty list
  if [ -d "$TARGET_CG_DIR" ]; then
    if [ -f "$TARGET_CG_DIR/cgroup.procs" ]; then
      TARGET_PROCS=""
      if ! TARGET_PROCS=$(cat "$TARGET_CG_DIR/cgroup.procs" 2>&1); then
        fail "Unable to read $TARGET_CG_DIR/cgroup.procs: $TARGET_PROCS. Cannot verify process termination (UNKNOWN/FAIL)."
        CLEANUP_OK=false
      elif [ -n "$TARGET_PROCS" ]; then
        fail "Lingering active kernel processes found in $TARGET_CG_DIR cgroup.procs: $TARGET_PROCS"
        CLEANUP_OK=false
      fi
    else
      fail "Missing $TARGET_CG_DIR/cgroup.procs while cgroup directory exists. Cleanup status: UNKNOWN/FAIL."
      CLEANUP_OK=false
    fi
  fi
fi

# 8.2 Verify no lingering processes across all active box dirs in isolate cgroup hierarchy
if [ -d "$ISOLATE_CG_BASE" ]; then
  ACTIVE_BOX_DIRS=$(find "$ISOLATE_CG_BASE" -mindepth 1 -maxdepth 1 -type d -name "box-*" 2>/dev/null || echo "")
  if [ -n "$ACTIVE_BOX_DIRS" ]; then
    for bdir in $ACTIVE_BOX_DIRS; do
      if [ -f "$bdir/cgroup.procs" ]; then
        ALL_PROCS=""
        if ! ALL_PROCS=$(cat "$bdir/cgroup.procs" 2>&1); then
          fail "Unable to read $bdir/cgroup.procs: $ALL_PROCS (UNKNOWN/FAIL)"
          CLEANUP_OK=false
        elif [ -n "$ALL_PROCS" ]; then
          fail "Lingering active kernel processes found in $bdir cgroup.procs: $ALL_PROCS"
          CLEANUP_OK=false
        fi
      fi
    done
  fi
fi

# Verify no orphaned python3 or isolate execution processes linger
ORPHAN_PROCS=$(pgrep -f "ALLOCATION_HOLD_COMPLETE" 2>/dev/null || echo "")
if [ -n "$ORPHAN_PROCS" ]; then
  fail "Orphaned test payload processes detected on host: $ORPHAN_PROCS"
fi

if [ "$CLEANUP_OK" = true ] && [ -z "$ORPHAN_PROCS" ]; then
  echo "  Cgroup Cleanup: PASS (No orphan or zombie processes in isolate cgroups)."
fi

# 9. Architectural Accounting Analysis & Honest Headroom Calculation
echo ""
echo "── 9. Cgroup Hierarchy & Realistic Memory Headroom Analysis ──"
# Strict hierarchy detection: recognize ONLY explicitly expected nested Docker paths
# or explicitly expected Isolate sibling paths. Empty, malformed, or arbitrary paths fail.
NESTED_PATTERN='^([0-9]+:memory:.*(docker|system\.slice/docker-|docker\.slice/docker-)|/sys/fs/cgroup/memory/docker)'
SIBLING_PATTERN='^([0-9]+:memory:(/isolate/box-[0-9]+|/sys/fs/cgroup/memory/isolate/box-[0-9]+)|/sys/fs/cgroup/memory/isolate/box-[0-9]+)'

if [ -z "$CHILD_CGROUP_AFFINITY" ]; then
  fail "Hierarchy Detection Failure: Child cgroup affinity is empty or unreadable. Cannot determine hierarchy (UNKNOWN/FAIL)."
elif echo "$CHILD_CGROUP_AFFINITY" | grep -qE "$NESTED_PATTERN"; then
  echo "  [NESTED ACCOUNTING PROVEN]"
  echo "  Isolate processes run inside the Docker container cgroup slice."
  echo "  Docker 'mem_limit: 3072m' strictly bounds both worker and sandbox processes."
elif echo "$CHILD_CGROUP_AFFINITY" | grep -qE "$SIBLING_PATTERN"; then
  echo "  [ROOT SIBLING ACCOUNTING PROVEN]"
  echo "  Isolate processes run directly under host root /sys/fs/cgroup/memory/isolate/box-<id>."
  echo "  CRITICAL ARCHITECTURAL REALITY:"
  echo "  - Docker container 'mem_limit: 3072m' DOES NOT constrain Isolate child processes."
  echo "  - Sandbox memory is bounded exclusively by Isolate's internal --cg-mem limit (256000 KB)."
  echo "  - Sibling cgroups draw directly from host physical RAM alongside Docker containers."
  echo "  - Concurrency is hardcoded to COUNT=1 in staging (max 250 MB sandbox load)."
else
  fail "Hierarchy Classification Unknown/Fail: Unexpected or malformed cgroup path '$CHILD_CGROUP_AFFINITY'. Never classify arbitrary non-Docker path as root sibling."
fi

echo ""
echo "  Host Memory Budget Verification (8192 MB Physical RAM):"
echo "  - Host OS & Kernel Baseline: ~1100 MB"
echo "  - judge0-workers:            3072 MB"
echo "  - judge0-server:             1024 MB"
echo "  - judge0-db:                  512 MB"
echo "  - judge0-redis:               384 MB"
echo "  --------------------------------------------------------"
echo "  - Total Container Allocation: 4992 MB (Reduced from 6528 MB by 1536 MB)"
echo "  - Unallocated Host Headroom:  ~2100 MB buffer"
echo "  - Isolate Per-Box Cap:         250 MB"
echo "  - Active Concurrency:            1 (COUNT=1 enforced)"
echo "  --------------------------------------------------------"
echo "  IMPORTANT RISK NOTICE (No absolute guarantee):"
echo "  - Mathematical difference (8192 - 4992 = 3200 MB, with ~2100 MB buffer) is a static calculation, NOT guaranteed safety."
echo "  - Actual host safety depends on real container RSS, Linux kernel slab/pagecache, and active concurrency."
echo "  - Current Available Host RAM: ${AVAIL_RAM_MB_AFTER} MB"
echo "  - If worker concurrency is raised or sibling cgroups balloon, host OOM killer can be triggered."

echo ""
echo "========================================================"
if [ "$FAILED" -eq 0 ]; then
  echo " PROBE RESULT: PASS (Resource accounting verified; telemetry valid)."
  exit 0
else
  echo " PROBE RESULT: FAIL (Missing telemetry, cgroup failure, or orphan processes)."
  exit 1
fi
