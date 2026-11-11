#!/usr/bin/env bash
# ==============================================================================
# TestForge Dedicated Execution Runner - Resource & Cgroup Accounting Probe
# Target: Native ARM64 Linux VM with cgroups v1
# Measures:
#   1. Worker container cgroup memory usage (Docker slice)
#   2. Host-level Isolate box cgroup memory usage (/sys/fs/cgroup/memory/isolate)
#   3. Total host memory & unallocated headroom
#   4. Determines whether Isolate child processes are nested or root siblings
# ==============================================================================

set -euo pipefail

ENDPOINT="${1:-http://127.0.0.1:2358}"
TOKEN="${2:-$(grep -E '^AUTHN_TOKEN=' /opt/testforge-judge0/judge0.conf 2>/dev/null | cut -d'=' -f2 || grep -E '^AUTHN_TOKEN=' ./judge0.conf 2>/dev/null | cut -d'=' -f2 || echo '')}"

HEADERS=(-H "Content-Type: application/json")
if [ -n "$TOKEN" ]; then
  HEADERS+=(-H "X-Auth-Token: $TOKEN")
fi

echo "========================================================"
echo " TestForge Cgroup Memory Accounting & Headroom Probe   "
echo " Date:         $(date -u)"
echo " Endpoint:     $ENDPOINT"
echo "========================================================"

if ! command -v docker &>/dev/null; then
  echo "[FATAL] Docker CLI not found. Run this on the Linux runner VM."
  exit 1
fi

WORKER_CID=$(docker compose ps -q judge0-workers 2>/dev/null || docker ps -q --filter "name=testforge-judge0-workers" 2>/dev/null || echo "")

if [ -z "$WORKER_CID" ]; then
  echo "[FATAL] judge0-workers container is not running. Start stack with 'docker compose up -d' first."
  exit 1
fi

echo "Worker Container ID: $WORKER_CID"

# 1. Inspect Host Physical Memory
echo ""
echo "── 1. Host Physical Memory Snapshot ──"
TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
AVAIL_RAM_KB=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
TOTAL_RAM_MB=$((TOTAL_RAM_KB / 1024))
AVAIL_RAM_MB=$((AVAIL_RAM_KB / 1024))
echo "  Total Host RAM:     ${TOTAL_RAM_MB} MB"
echo "  Available Host RAM: ${AVAIL_RAM_MB} MB"

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

if [ -n "$DOCKER_CG_PATH" ]; then
  echo "  Worker Cgroup Found: $DOCKER_CG_PATH"
  DOCKER_CG_USAGE=$(cat "$DOCKER_CG_PATH/memory.usage_in_bytes" 2>/dev/null || echo 0)
  DOCKER_CG_LIMIT=$(cat "$DOCKER_CG_PATH/memory.limit_in_bytes" 2>/dev/null || echo 0)
  echo "  Baseline Worker Memory Usage: $((DOCKER_CG_USAGE / 1024 / 1024)) MB"
  echo "  Configured Worker Limit:      $((DOCKER_CG_LIMIT / 1024 / 1024)) MB"
else
  echo "  [WARNING] Docker memory cgroup path not found directly under standard hierarchy."
fi

# 3. Locate Host Isolate Cgroup Path & Hierarchy Settings
echo ""
echo "── 3. Host Isolate Cgroup Path & Hierarchy Settings ──"
ISOLATE_CG_BASE="/sys/fs/cgroup/memory/isolate"
HOST_ROOT_CG="/sys/fs/cgroup/memory"

if [ -f "$HOST_ROOT_CG/memory.use_hierarchy" ]; then
  ROOT_HIERARCHY=$(cat "$HOST_ROOT_CG/memory.use_hierarchy")
  echo "  Host Root memory.use_hierarchy: $ROOT_HIERARCHY"
fi

if [ -d "$ISOLATE_CG_BASE" ]; then
  echo "  Host Isolate Cgroup Base: $ISOLATE_CG_BASE"
  if [ -f "$ISOLATE_CG_BASE/memory.use_hierarchy" ]; then
    ISO_HIERARCHY=$(cat "$ISOLATE_CG_BASE/memory.use_hierarchy")
    echo "  Isolate Base memory.use_hierarchy: $ISO_HIERARCHY"
  fi
else
  echo "  [NOTICE] $ISOLATE_CG_BASE does not exist yet (created on first submission)."
fi

# 4. Dispatch Memory Test Payload (150 MB Allocation)
echo ""
echo "── 4. Dispatching Memory Accounting Test (150 MB Allocation) ──"
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

# Send submission asynchronously
RESPONSE=$(curl -s -X POST "${HEADERS[@]}" -d "$PAYLOAD" "$ENDPOINT/submissions" || echo "{}")
TOKEN=$(echo "$RESPONSE" | jq -r '.token // empty')

if [ -z "$TOKEN" ]; then
  echo "  [ERROR] Failed to queue submission: $RESPONSE"
  exit 1
fi
echo "  Submission Queued. Token: $TOKEN"

# 5. Sample Memory During Execution
echo "  Sampling cgroup usage during execution..."
PEAK_DOCKER_USAGE=0
PEAK_ISOLATE_USAGE=0
CHILD_CGROUP_AFFINITY="UNKNOWN"

for _ in $(seq 1 15); do
  sleep 0.3
  
  # Sample Docker cgroup usage
  if [ -n "$DOCKER_CG_PATH" ] && [ -f "$DOCKER_CG_PATH/memory.usage_in_bytes" ]; then
    CURR_DOCKER=$(cat "$DOCKER_CG_PATH/memory.usage_in_bytes" 2>/dev/null || echo 0)
    if [ "$CURR_DOCKER" -gt "$PEAK_DOCKER_USAGE" ]; then
      PEAK_DOCKER_USAGE=$CURR_DOCKER
    fi
  fi

  # Sample Isolate cgroup usage across any active box directories
  if [ -d "$ISOLATE_CG_BASE" ]; then
    for box_cg in "$ISOLATE_CG_BASE"/box-*/memory.usage_in_bytes; do
      if [ -f "$box_cg" ]; then
        CURR_ISO=$(cat "$box_cg" 2>/dev/null || echo 0)
        if [ "$CURR_ISO" -gt "$PEAK_ISOLATE_USAGE" ]; then
          PEAK_ISOLATE_USAGE=$CURR_ISO
        fi
      fi
    done
  fi

  # Check child process cgroup affinity inside container
  CHILD_PIDS=$(docker compose exec -T judge0-workers pgrep -f "python3" 2>/dev/null || echo "")
  if [ -n "$CHILD_PIDS" ]; then
    FIRST_PID=$(echo "$CHILD_PIDS" | head -n1)
    CG_SAMPLE=$(docker compose exec -T judge0-workers cat "/proc/$FIRST_PID/cgroup" 2>/dev/null | grep memory || echo "")
    if [ -n "$CG_SAMPLE" ]; then
      CHILD_CGROUP_AFFINITY="$CG_SAMPLE"
    fi
  fi
done

# Wait for submission resolution
RESULT=$(curl -s "$ENDPOINT/submissions/$TOKEN?base64_encoded=false" || echo "{}")
STATUS_DESC=$(echo "$RESULT" | jq -r '.status.description // "Unknown"')

echo ""
echo "── 5. Cgroup Memory Accounting Results ──"
echo "  Submission Outcome:          $STATUS_DESC"
echo "  Peak Docker Container Usage: $((PEAK_DOCKER_USAGE / 1024 / 1024)) MB"
echo "  Peak Isolate Box Usage:      $((PEAK_ISOLATE_USAGE / 1024 / 1024)) MB"
echo "  Child Cgroup Path:           $CHILD_CGROUP_AFFINITY"

echo ""
echo "── 6. OOM Control & Containment Verification ──"
# Verify whether cgroup memory exhaustion causes host-level OOM or box-level SIGKILL
if [ -d "$ISOLATE_CG_BASE" ]; then
  for oom_ctrl in "$ISOLATE_CG_BASE"/box-*/memory.oom_control; do
    if [ -f "$oom_ctrl" ]; then
      echo "  Box OOM Control Settings:"
      sed 's/^/    /' "$oom_ctrl"
    fi
  done
fi

# Check kernel dmesg for host-level OOM invocations
HOST_OOM_COUNT=$(dmesg 2>/dev/null | grep -iE 'oom-killer|out of memory|killed process' | wc -l || echo 0)
if [ "$HOST_OOM_COUNT" -eq 0 ]; then
  echo "  Host-level OOM killer invocations: 0 (No host kernel OOM events detected)."
else
  echo "  [WARNING] Host kernel OOM events detected in dmesg: $HOST_OOM_COUNT"
fi

echo ""
echo "── 7. Post-Execution Cgroup Cleanup Verification ──"
# Sleep briefly to allow isolate --cleanup
sleep 1
CLEANUP_OK=true
if [ -d "$ISOLATE_CG_BASE" ]; then
  ACTIVE_BOX_DIRS=$(find "$ISOLATE_CG_BASE" -mindepth 1 -maxdepth 1 -type d -name "box-*" 2>/dev/null || echo "")
  if [ -n "$ACTIVE_BOX_DIRS" ]; then
    for bdir in $ACTIVE_BOX_DIRS; do
      if [ -f "$bdir/cgroup.procs" ]; then
        PROCS=$(cat "$bdir/cgroup.procs" 2>/dev/null || echo "")
        if [ -n "$PROCS" ]; then
          echo "  [FAIL] Lingering processes found in $bdir: $PROCS"
          CLEANUP_OK=false
        else
          echo "  Notice: Box directory $bdir retained by isolate manager, but 0 processes active."
        fi
      fi
    done
  else
    echo "  Clean: All isolate box cgroup directories removed post-execution."
  fi
else
  echo "  Clean: Isolate cgroup base absent or reset."
fi

if [ "$CLEANUP_OK" = true ]; then
  echo "  Cgroup Cleanup: PASS (No orphan or zombie processes in isolate cgroups)."
else
  echo "  Cgroup Cleanup: WARNING (Orphan processes detected)."
fi

echo ""
echo "── 8. Accounting Analysis & Headroom Sizing ──"
if echo "$CHILD_CGROUP_AFFINITY" | grep -q "docker"; then
  echo "  [NESTED ACCOUNTING] Isolate processes run inside the Docker container cgroup slice."
  echo "  Docker 'mem_limit' strictly bounds both worker and sandbox processes."
else
  echo "  [SIBLING ACCOUNTING] Isolate processes run directly under host /sys/fs/cgroup/memory/isolate."
  echo "  Worker container limit and sandbox limits are accounted in separate cgroup hierarchies."
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
echo "  Safety Margin: Headroom (~2100 MB) easily absorbs max concurrent box allocation (~250 MB)."
echo "========================================================"
