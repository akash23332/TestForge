#!/usr/bin/env bash
# ==============================================================================
# TestForge Dedicated Execution Runner - Concurrency Benchmarking Harness
# Usage: ./benchmark.sh [OPTIONAL_ENDPOINT] [OPTIONAL_AUTHN_TOKEN]
# Measures: Concurrency, Throughput (RPS), p50/p95 Latency, CPU/RAM utilization,
# and clearly distinguishes HTTP roundtrip, sandbox CPU time, and isolate wall-clock time.
# ==============================================================================

set -euo pipefail

ENDPOINT="${1:-http://127.0.0.1:2358}"
TOKEN="${2:-$(grep -E '^AUTHN_TOKEN=' /opt/testforge-judge0/judge0.conf 2>/dev/null | cut -d'=' -f2 || grep -E '^AUTHN_TOKEN=' ./judge0.conf 2>/dev/null | cut -d'=' -f2 || echo '')}"

HEADERS=(-H "Content-Type: application/json")
if [ -n "$TOKEN" ]; then
  HEADERS+=(-H "X-Auth-Token: $TOKEN")
fi

echo "========================================================"
echo " TestForge Concurrency & Performance Benchmark Harness "
echo " Host:     $(hostname) ($(uname -m))"
echo " OS:       $(lsb_release -ds 2>/dev/null || uname -s)"
echo " CPUs:     $(nproc) cores"
echo " RAM:      $(free -h 2>/dev/null | awk '/Mem:/ {print $2}' || echo 'N/A')"
echo " Endpoint: $ENDPOINT"
echo " Date:     $(date -u)"
echo "========================================================"

# Helper function to read total and idle CPU ticks from /proc/stat
get_cpu_ticks() {
  if [ -f "/proc/stat" ]; then
    local line
    line=$(grep '^cpu ' /proc/stat)
    local u n s id io irq sirq st
    read -r _ u n s id io irq sirq st _ <<< "$line"
    local total=$((u + n + s + id + io + irq + sirq + st))
    local idle=$((id + io))
    echo "$total $idle"
  else
    echo "0 0"
  fi
}

# Standard test payload: Pure computation in Python (sum of squares)
BENCH_CODE='
import sys
n = 150000
total = sum(i * i for i in range(n))
print(total)
'

CONCURRENCY_LEVELS=(1 5 10 25 50)

for CONCURRENCY in "${CONCURRENCY_LEVELS[@]}"; do
  echo ""
  echo "── Running Concurrency Level: $CONCURRENCY Concurrent Requests ──"

  TMP_DIR=$(mktemp -d)
  PIDS=()
  START_TIME=$(date +%s%3N)

  # Pre-batch CPU and Memory snapshot
  PRE_MEM=$(free -m 2>/dev/null | awk '/Mem:/ {print $3}' || echo 0)
  read -r PRE_CPU_TOTAL PRE_CPU_IDLE <<< "$(get_cpu_ticks)"

  for i in $(seq 1 "$CONCURRENCY"); do
    (
      REQ_START=$(date +%s%3N)
      PAYLOAD=$(jq -n --arg code "$BENCH_CODE" '{source_code: $code, language_id: 71, cpu_time_limit: 3.0, wall_time_limit: 5.0, enable_network: false}')
      RESP=$(curl -s -w "\n%{http_code}\n%{time_total}" -X POST "${HEADERS[@]}" -d "$PAYLOAD" "$ENDPOINT/submissions?wait=true&base64_encoded=false" || echo -e '{"status":{"id":13}}\n500\n0')

      HTTP_CODE=$(echo "$RESP" | tail -n 2 | head -n 1)
      TOTAL_SEC=$(echo "$RESP" | tail -n 1)
      RAW_JSON=$(echo "$RESP" | head -n -2)

      STATUS_ID=$(echo "$RAW_JSON" | jq -r '.status.id // 0' 2>/dev/null || echo 0)
      CPU_TIME_SEC=$(echo "$RAW_JSON" | jq -r '.time // "0"' 2>/dev/null || echo 0)
      WALL_TIME_SEC=$(echo "$RAW_JSON" | jq -r '.wall_time // "0"' 2>/dev/null || echo 0)
      MEM_VAL=$(echo "$RAW_JSON" | jq -r '.memory // 0' 2>/dev/null || echo 0)

      REQ_END=$(date +%s%3N)
      TOTAL_HTTP_MS=$((REQ_END - REQ_START))
      CPU_EXEC_MS=$(awk "BEGIN {printf \"%d\", $CPU_TIME_SEC * 1000}")
      WALL_EXEC_MS=$(awk "BEGIN {printf \"%d\", $WALL_TIME_SEC * 1000}")
      OVERHEAD_MS=$((TOTAL_HTTP_MS - WALL_EXEC_MS))
      if [ "$OVERHEAD_MS" -lt 0 ]; then OVERHEAD_MS=0; fi

      # Format: HTTP_CODE STATUS_ID TOTAL_HTTP_MS CPU_EXEC_MS WALL_EXEC_MS OVERHEAD_MS MEM_KB
      echo "$HTTP_CODE $STATUS_ID $TOTAL_HTTP_MS $CPU_EXEC_MS $WALL_EXEC_MS $OVERHEAD_MS $MEM_VAL" > "$TMP_DIR/result_$i.txt"
    ) &
    PIDS+=($!)
  done

  # Await completion of all concurrent requests in this batch
  for pid in "${PIDS[@]}"; do
    wait "$pid"
  done

  END_TIME=$(date +%s%3N)
  BATCH_DURATION=$((END_TIME - START_TIME))
  POST_MEM=$(free -m 2>/dev/null | awk '/Mem:/ {print $3}' || echo 0)
  read -r POST_CPU_TOTAL POST_CPU_IDLE <<< "$(get_cpu_ticks)"

  # Calculate CPU Utilization percentage during the batch
  DIFF_TOTAL=$((POST_CPU_TOTAL - PRE_CPU_TOTAL))
  DIFF_IDLE=$((POST_CPU_IDLE - PRE_CPU_IDLE))
  CPU_UTIL_PCT="N/A"
  if [ "$DIFF_TOTAL" -gt 0 ]; then
    CPU_UTIL_PCT=$(awk "BEGIN {printf \"%.1f%%\", (($DIFF_TOTAL - $DIFF_IDLE) * 100) / $DIFF_TOTAL}")
  fi

  # Metrics aggregation
  SUCCESS_COUNT=0
  FAIL_COUNT=0
  TIMEOUT_COUNT=0
  TOTAL_HTTP_SUM=0
  TOTAL_CPU_EXEC_SUM=0
  TOTAL_WALL_EXEC_SUM=0
  TOTAL_OVERHEAD_SUM=0
  LATENCIES=()

  for f in "$TMP_DIR"/result_*.txt; do
    read -r HTTP_C STATUS_ID HTTP_D CPU_D WALL_D OVERHEAD_D MEM_V < "$f"
    TOTAL_HTTP_SUM=$((TOTAL_HTTP_SUM + HTTP_D))
    TOTAL_CPU_EXEC_SUM=$((TOTAL_CPU_EXEC_SUM + CPU_D))
    TOTAL_WALL_EXEC_SUM=$((TOTAL_WALL_EXEC_SUM + WALL_D))
    TOTAL_OVERHEAD_SUM=$((TOTAL_OVERHEAD_SUM + OVERHEAD_D))
    LATENCIES+=("$HTTP_D")

    if [ "$HTTP_C" -eq 201 ] && [ "$STATUS_ID" -eq 3 ]; then
      SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    elif [ "$STATUS_ID" -eq 5 ]; then
      TIMEOUT_COUNT=$((TIMEOUT_COUNT + 1))
      FAIL_COUNT=$((FAIL_COUNT + 1))
    else
      FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
  done

  # Sort latencies for percentiles
  IFS=$'\n' SORTED_LAT=($(sort -n <<<"${LATENCIES[*]}"))
  unset IFS

  IDX_50=$(( (CONCURRENCY * 50) / 100 ))
  IDX_95=$(( (CONCURRENCY * 95) / 100 ))
  if [ "$IDX_95" -ge "$CONCURRENCY" ]; then IDX_95=$(( CONCURRENCY - 1 )); fi

  P50_LATENCY=${SORTED_LAT[$IDX_50]:-0}
  P95_LATENCY=${SORTED_LAT[$IDX_95]:-0}

  AVG_HTTP=$((TOTAL_HTTP_SUM / CONCURRENCY))
  AVG_CPU_EXEC=$((TOTAL_CPU_EXEC_SUM / CONCURRENCY))
  AVG_WALL_EXEC=$((TOTAL_WALL_EXEC_SUM / CONCURRENCY))
  AVG_OVERHEAD=$((TOTAL_OVERHEAD_SUM / CONCURRENCY))
  RPS=$(awk "BEGIN {printf \"%.2f\", $CONCURRENCY / ($BATCH_DURATION / 1000)}")

  echo "  Batch Duration:         ${BATCH_DURATION} ms"
  echo "  Throughput (RPS):       ${RPS} req/sec"
  echo "  HTTP Latency p50 / p95: ${P50_LATENCY} ms / ${P95_LATENCY} ms"
  echo "  Avg HTTP Roundtrip:     ${AVG_HTTP} ms"
  echo "    ├─ Sandbox Wall Time: ${AVG_WALL_EXEC} ms (CPU Time: ${AVG_CPU_EXEC} ms)"
  echo "    └─ Network & Queue:   ${AVG_OVERHEAD} ms (Transit, Resque queuing, & Puma processing)"
  echo "  Success Rate:           $SUCCESS_COUNT / $CONCURRENCY ($(( SUCCESS_COUNT * 100 / CONCURRENCY ))%)"
  echo "  Failures / Errors:      $FAIL_COUNT"
  echo "  Timeouts (TLE):         $TIMEOUT_COUNT"
  echo "  CPU Utilization:        ${CPU_UTIL_PCT}"
  echo "  RAM Usage Shift:        ${PRE_MEM} MB -> ${POST_MEM} MB (Δ $((POST_MEM - PRE_MEM)) MB)"

  rm -rf "$TMP_DIR"
done

echo ""
echo "========================================================"
echo " Concurrency Benchmark Completed."
echo " Note: BullMQ worker queue delay is tracked in TestForge"
echo " worker logs (job.timestamp -> job.processedOn)."
echo "========================================================"
