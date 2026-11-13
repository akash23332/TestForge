#!/usr/bin/env bash
# ==============================================================================
# TestForge Dedicated Execution Runner - Constrained Root-Owned Isolate Wrapper
# Target Path in Container: /usr/local/bin/isolate-wrapper
# Owner: root:root, File Mode: 0755
#
# PURPOSE & SECURITY SCOPE (Phase 5.1C-13 Audit Finding C13-01):
#   Enforces a strict allowlist for all Isolate invocations by the non-root
#   'judge0' worker process. Replaces all loose blacklists with a deterministic,
#   schema-enforced argument validator.
#
#   Constructs a brand-new, sanitized argument array before executing the canonical
#   /usr/local/bin/isolate binary. Never forwards raw unvalidated arguments.
#
# CRITICAL ARCHITECTURAL SECURITY NOTICE:
#   This wrapper restricts CLI argument injection by the unprivileged worker user.
#   HOWEVER, IT DOES NOT AND CANNOT NEUTRALIZE THE SECURITY RISKS OF RUNNING A
#   DOCKER CONTAINER WITH 'privileged: true'.
#   In a privileged container, container isolation boundaries are porous: any escape
#   to container root permits direct access to host devices, host namespaces, and
#   sibling cgroups.
#   Privileged container execution remains an UNRESOLVED ARCHITECTURAL HOST RISK
#   until cgroups v2 rootless container execution or unprivileged user namespaces
#   are deployed at the host infrastructure level.
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# Self-Elevation Gate (Option C Remediation for Finding SEC-002)
# Real binary /usr/local/bin/isolate-bin has mode 0700 (accessible exclusively by root).
# If invoked by an unprivileged user (e.g. 'judge0' UID 1000), self-elevate via sudo.
# /etc/sudoers.d/judge0 authorizes passwordless execution exclusively for this wrapper.
# ------------------------------------------------------------------------------
if [ "$(id -u)" -ne 0 ]; then
  exec sudo /usr/local/bin/isolate-wrapper "$@"
fi

# Canonical Isolate binary location after wrapper diversion (Phase 5.1C / Milestone B Objective 14)
# In production container, /usr/local/bin/isolate is the wrapper and /usr/local/bin/isolate-bin is the real SUID binary.
# The wrapper must NEVER fall back to /usr/local/bin/isolate when isolate-bin is missing,
# because that path points back to this wrapper and would cause infinite recursive execution loops.
# Upstream baseline reference (Finding C12-06): REAL_ISOLATE="/usr/local/bin/isolate" (diverted to isolate-bin)
REAL_ISOLATE="/usr/local/bin/isolate-bin"

if [ ! -x "$REAL_ISOLATE" ]; then
  echo "[FATAL isolate-wrapper] Real isolate binary $REAL_ISOLATE not found or not executable. Refusing fallback to prevent recursive invocation loops." >&2
  exit 127
fi

if [ $# -eq 0 ]; then
  echo "[SECURITY ERROR isolate-wrapper] No arguments provided" >&2
  exit 1
fi

# Upstream Judge0 info_controller (`isolate --version`) sanity handler
if [ "$#" -eq 1 ] && [ "$1" = "--version" ]; then
  if [ "$EUID" -ne 0 ]; then
    exec sudo -n "$0" --version
  fi
  exec "$REAL_ISOLATE" --version
fi

# ------------------------------------------------------------------------------
# State Tracking for Strict Allowlist & Mutual Exclusivity
# ------------------------------------------------------------------------------
OPERATION=""
OPERATION_COUNT=0
BOX_ID=""
BOX_ID_COUNT=0
CGROUPS_FLAG=false
CGROUPS_COUNT=0
CG_MEM=""
CG_TIMING=false
NO_CG_TIMING=false
SILENT_FLAG=false
STDERR_TO_STDOUT=false

# Allowed resource options for --run
OPT_MEM=""
OPT_TIME=""
OPT_WALL_TIME=""
OPT_EXTRA_TIME=""
OPT_STACK=""
OPT_PROCESSES=""
OPT_FSIZE=""
OPT_META=""
OPT_STDIN=""
OPT_STDOUT=""
OPT_STDERR=""
ENV_VARS=()
APPROVED_DIRS=()
COMMAND_ARGS=()
IN_COMMAND=false

# ------------------------------------------------------------------------------
# Strict Allowlist Argument Parsing
# ------------------------------------------------------------------------------
args=("$@")
i=0

while [ "$i" -lt "${#args[@]}" ]; do
  arg="${args[$i]}"

  # Check if we have entered the trailing command arguments after '--'
  if [ "$IN_COMMAND" = true ]; then
    # Reject shell metacharacters and path traversal in command tokens
    if [[ "$arg" =~ \.\. ]] || [[ "$arg" =~ [\;\&\|\`\$\<\>] ]]; then
      echo "[SECURITY ERROR isolate-wrapper] Forbidden characters or path traversal in command argument: $arg" >&2
      exit 1
    fi
    COMMAND_ARGS+=("$arg")
    i=$((i + 1))
    continue
  fi

  # Explicit Command Separator '--'
  if [ "$arg" = "--" ]; then
    if [ "$OPERATION" != "run" ]; then
      echo "[SECURITY ERROR isolate-wrapper] Command separator '--' is permitted only for --run operation" >&2
      exit 1
    fi
    IN_COMMAND=true
    i=$((i + 1))
    continue
  fi

  # Reject networking flags explicitly
  if [[ "$arg" =~ ^--share-net ]] || [[ "$arg" =~ ^--net ]]; then
    echo "[SECURITY ERROR isolate-wrapper] Forbidden flag --share-net detected: Zero Egress Policy enforced" >&2
    exit 1
  fi

  # Reject any path traversal attempt
  if [[ "$arg" =~ \.\. ]]; then
    echo "[SECURITY ERROR isolate-wrapper] Path traversal '..' rejected in argument: $arg" >&2
    exit 1
  fi

  case "$arg" in
    # --------------------------------------------------------------------------
    # Operations (Exactly one operation per invocation)
    # --------------------------------------------------------------------------
    --init)
      OPERATION="init"
      OPERATION_COUNT=$((OPERATION_COUNT + 1))
      i=$((i + 1))
      ;;
    --cleanup)
      OPERATION="cleanup"
      OPERATION_COUNT=$((OPERATION_COUNT + 1))
      i=$((i + 1))
      ;;
    --run)
      OPERATION="run"
      OPERATION_COUNT=$((OPERATION_COUNT + 1))
      i=$((i + 1))
      ;;

    # --------------------------------------------------------------------------
    # Output and Silent flags
    # --------------------------------------------------------------------------
    -s|--silent)
      SILENT_FLAG=true
      i=$((i + 1))
      ;;
    --stderr-to-stdout)
      STDERR_TO_STDOUT=true
      i=$((i + 1))
      ;;

    # --------------------------------------------------------------------------
    # Cgroups options (Strict allowlist)
    # --------------------------------------------------------------------------
    --cg)
      CGROUPS_FLAG=true
      CGROUPS_COUNT=$((CGROUPS_COUNT + 1))
      i=$((i + 1))
      ;;
    --cg-timing)
      CG_TIMING=true
      i=$((i + 1))
      ;;
    --no-cg-timing)
      NO_CG_TIMING=true
      i=$((i + 1))
      ;;
    --cg-mem=*)
      val="${arg#*=}"
      if [[ "$val" =~ ^[0-9]+$ ]]; then
        CG_MEM="$val"
      else
        echo "[SECURITY ERROR isolate-wrapper] Malformed --cg-mem value: $val (must be decimal integer)" >&2
        exit 1
      fi
      i=$((i + 1))
      ;;

    # --------------------------------------------------------------------------
    # Box ID Options (Exactly one box ID per invocation)
    # --------------------------------------------------------------------------
    -b|--box-id)
      next_idx=$((i + 1))
      if [ "$next_idx" -ge "${#args[@]}" ]; then
        echo "[SECURITY ERROR isolate-wrapper] Option $arg requires a parameter" >&2
        exit 1
      fi
      val="${args[$next_idx]}"
      if [[ "$val" =~ ^[0-9]+$ ]]; then
        BOX_ID="$val"
        BOX_ID_COUNT=$((BOX_ID_COUNT + 1))
        i=$((i + 2))
      else
        echo "[SECURITY ERROR isolate-wrapper] Malformed box ID: $val (must be decimal integer)" >&2
        exit 1
      fi
      ;;
    -b*|--box-id=*)
      val="${arg#*=}"
      val="${val#-b}"
      if [[ "$val" =~ ^[0-9]+$ ]]; then
        BOX_ID="$val"
        BOX_ID_COUNT=$((BOX_ID_COUNT + 1))
        i=$((i + 1))
      else
        echo "[SECURITY ERROR isolate-wrapper] Malformed box ID: $val (must be decimal integer)" >&2
        exit 1
      fi
      ;;

    # --------------------------------------------------------------------------
    # Approved Resource & Execution Options (Strictly for --run)
    # --------------------------------------------------------------------------
    --mem=*|-m=*)
      val="${arg#*=}"
      if [[ "$val" =~ ^[0-9]+$ ]]; then OPT_MEM="$val"; else
        echo "[SECURITY ERROR isolate-wrapper] Malformed memory limit: $val" >&2; exit 1
      fi
      i=$((i + 1))
      ;;
    -m)
      next_idx=$((i + 1))
      [ "$next_idx" -ge "${#args[@]}" ] && { echo "[SECURITY ERROR] -m requires parameter" >&2; exit 1; }
      val="${args[$next_idx]}"
      if [[ "$val" =~ ^[0-9]+$ ]]; then OPT_MEM="$val"; i=$((i + 2)); else
        echo "[SECURITY ERROR isolate-wrapper] Malformed memory limit: $val" >&2; exit 1
      fi
      ;;

    --time=*|-t=*)
      val="${arg#*=}"
      if [[ "$val" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then OPT_TIME="$val"; else
        echo "[SECURITY ERROR isolate-wrapper] Malformed time limit: $val" >&2; exit 1
      fi
      i=$((i + 1))
      ;;
    -t)
      next_idx=$((i + 1))
      [ "$next_idx" -ge "${#args[@]}" ] && { echo "[SECURITY ERROR] -t requires parameter" >&2; exit 1; }
      val="${args[$next_idx]}"
      if [[ "$val" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then OPT_TIME="$val"; i=$((i + 2)); else
        echo "[SECURITY ERROR isolate-wrapper] Malformed time limit: $val" >&2; exit 1
      fi
      ;;

    --wall-time=*|-w=*)
      val="${arg#*=}"
      if [[ "$val" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then OPT_WALL_TIME="$val"; else
        echo "[SECURITY ERROR isolate-wrapper] Malformed wall-time limit: $val" >&2; exit 1
      fi
      i=$((i + 1))
      ;;
    -w)
      next_idx=$((i + 1))
      [ "$next_idx" -ge "${#args[@]}" ] && { echo "[SECURITY ERROR] -w requires parameter" >&2; exit 1; }
      val="${args[$next_idx]}"
      if [[ "$val" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then OPT_WALL_TIME="$val"; i=$((i + 2)); else
        echo "[SECURITY ERROR isolate-wrapper] Malformed wall-time limit: $val" >&2; exit 1
      fi
      ;;

    --extra-time=*|-x=*)
      val="${arg#*=}"
      if [[ "$val" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then OPT_EXTRA_TIME="$val"; else
        echo "[SECURITY ERROR isolate-wrapper] Malformed extra-time limit: $val" >&2; exit 1
      fi
      i=$((i + 1))
      ;;
    -x)
      next_idx=$((i + 1))
      [ "$next_idx" -ge "${#args[@]}" ] && { echo "[SECURITY ERROR] -x requires parameter" >&2; exit 1; }
      val="${args[$next_idx]}"
      if [[ "$val" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then OPT_EXTRA_TIME="$val"; i=$((i + 2)); else
        echo "[SECURITY ERROR isolate-wrapper] Malformed extra-time limit: $val" >&2; exit 1
      fi
      ;;

    --stack=*|-k=*)
      val="${arg#*=}"
      if [[ "$val" =~ ^[0-9]+$ ]]; then OPT_STACK="$val"; else
        echo "[SECURITY ERROR isolate-wrapper] Malformed stack limit: $val" >&2; exit 1
      fi
      i=$((i + 1))
      ;;
    -k)
      next_idx=$((i + 1))
      [ "$next_idx" -ge "${#args[@]}" ] && { echo "[SECURITY ERROR] -k requires parameter" >&2; exit 1; }
      val="${args[$next_idx]}"
      if [[ "$val" =~ ^[0-9]+$ ]]; then OPT_STACK="$val"; i=$((i + 2)); else
        echo "[SECURITY ERROR isolate-wrapper] Malformed stack limit: $val" >&2; exit 1
      fi
      ;;

    --processes=*|-p=*)
      val="${arg#*=}"
      if [[ "$val" =~ ^[0-9]+$ ]]; then OPT_PROCESSES="$val"; else
        echo "[SECURITY ERROR isolate-wrapper] Malformed processes limit: $val" >&2; exit 1
      fi
      i=$((i + 1))
      ;;
    -p[0-9]*)
      val="${arg#-p}"
      if [[ "$val" =~ ^[0-9]+$ ]]; then OPT_PROCESSES="$val"; else
        echo "[SECURITY ERROR isolate-wrapper] Malformed processes limit: $val" >&2; exit 1
      fi
      i=$((i + 1))
      ;;
    -p)
      next_idx=$((i + 1))
      [ "$next_idx" -ge "${#args[@]}" ] && { echo "[SECURITY ERROR] -p requires parameter" >&2; exit 1; }
      val="${args[$next_idx]}"
      if [[ "$val" =~ ^[0-9]+$ ]]; then OPT_PROCESSES="$val"; i=$((i + 2)); else
        echo "[SECURITY ERROR isolate-wrapper] Malformed processes limit: $val" >&2; exit 1
      fi
      ;;

    --fsize=*|-f=*)
      val="${arg#*=}"
      if [[ "$val" =~ ^[0-9]+$ ]]; then OPT_FSIZE="$val"; else
        echo "[SECURITY ERROR isolate-wrapper] Malformed fsize limit: $val" >&2; exit 1
      fi
      i=$((i + 1))
      ;;
    -f)
      next_idx=$((i + 1))
      [ "$next_idx" -ge "${#args[@]}" ] && { echo "[SECURITY ERROR] -f requires parameter" >&2; exit 1; }
      val="${args[$next_idx]}"
      if [[ "$val" =~ ^[0-9]+$ ]]; then OPT_FSIZE="$val"; i=$((i + 2)); else
        echo "[SECURITY ERROR isolate-wrapper] Malformed fsize limit: $val" >&2; exit 1
      fi
      ;;

    --meta=*|-M=*)
      val="${arg#*=}"
      if [[ "$val" =~ ^/var/local/lib/isolate/[0-9]+/metadata\.txt$ ]] || [[ "$val" =~ ^/api/tmp/[A-Za-z0-9_.-]+$ ]] || [[ "$val" =~ ^/tmp/[A-Za-z0-9_.-]+$ ]] || [[ "$val" =~ ^[A-Za-z0-9_.-]+$ ]]; then
        OPT_META="$val"
      else
        echo "[SECURITY ERROR isolate-wrapper] Unauthorized --meta path: $val" >&2
        exit 1
      fi
      i=$((i + 1))
      ;;
    -M)
      next_idx=$((i + 1))
      [ "$next_idx" -ge "${#args[@]}" ] && { echo "[SECURITY ERROR] -M requires parameter" >&2; exit 1; }
      val="${args[$next_idx]}"
      if [[ "$val" =~ ^/var/local/lib/isolate/[0-9]+/metadata\.txt$ ]] || [[ "$val" =~ ^/api/tmp/[A-Za-z0-9_.-]+$ ]] || [[ "$val" =~ ^/tmp/[A-Za-z0-9_.-]+$ ]] || [[ "$val" =~ ^[A-Za-z0-9_.-]+$ ]]; then
        OPT_META="$val"
        i=$((i + 2))
      else
        echo "[SECURITY ERROR isolate-wrapper] Unauthorized -M path: $val" >&2
        exit 1
      fi
      ;;

    --stdin=*|-i=*)
      val="${arg#*=}"
      if [[ "$val" =~ ^/dev/null$ ]] || [[ "$val" =~ ^/var/local/lib/isolate/[0-9]+/[A-Za-z0-9_.-]+$ ]] || [[ "$val" =~ ^/tmp/[A-Za-z0-9_.-]+$ ]] || [[ "$val" =~ ^/api/tmp/[A-Za-z0-9_.-]+$ ]] || [[ "$val" =~ ^[A-Za-z0-9_.-]+$ ]]; then
        OPT_STDIN="$val"
      else
        echo "[SECURITY ERROR isolate-wrapper] Unauthorized --stdin path: $val" >&2
        exit 1
      fi
      i=$((i + 1))
      ;;
    -i)
      next_idx=$((i + 1))
      [ "$next_idx" -ge "${#args[@]}" ] && { echo "[SECURITY ERROR] -i requires parameter" >&2; exit 1; }
      val="${args[$next_idx]}"
      if [[ "$val" =~ ^/dev/null$ ]] || [[ "$val" =~ ^/var/local/lib/isolate/[0-9]+/[A-Za-z0-9_.-]+$ ]] || [[ "$val" =~ ^/tmp/[A-Za-z0-9_.-]+$ ]] || [[ "$val" =~ ^/api/tmp/[A-Za-z0-9_.-]+$ ]] || [[ "$val" =~ ^[A-Za-z0-9_.-]+$ ]]; then
        OPT_STDIN="$val"
        i=$((i + 2))
      else
        echo "[SECURITY ERROR isolate-wrapper] Unauthorized -i path: $val" >&2
        exit 1
      fi
      ;;

    --stdout=*)
      val="${arg#*=}"
      if [[ "$val" =~ ^/var/local/lib/isolate/[0-9]+/[A-Za-z0-9_.-]+$ ]] || [[ "$val" =~ ^[A-Za-z0-9_.-]+$ ]] || [[ "$val" =~ ^/api/tmp/[A-Za-z0-9_.-]+$ ]]; then
        OPT_STDOUT="$val"
      else
        echo "[SECURITY ERROR isolate-wrapper] Unauthorized --stdout path: $val" >&2
        exit 1
      fi
      i=$((i + 1))
      ;;

    --stderr=*)
      val="${arg#*=}"
      if [[ "$val" =~ ^/var/local/lib/isolate/[0-9]+/[A-Za-z0-9_.-]+$ ]] || [[ "$val" =~ ^[A-Za-z0-9_.-]+$ ]] || [[ "$val" =~ ^/api/tmp/[A-Za-z0-9_.-]+$ ]]; then
        OPT_STDERR="$val"
      else
        echo "[SECURITY ERROR isolate-wrapper] Unauthorized --stderr path: $val" >&2
        exit 1
      fi
      i=$((i + 1))
      ;;

    --env=*|-E=*)
      val="${arg#*=}"
      if [[ "$val" =~ ^[A-Za-z_][A-Za-z0-9_]*(=.*)?$ ]]; then
        ENV_VARS+=("--env=$val")
      else
        echo "[SECURITY ERROR isolate-wrapper] Malformed environment variable assignment: $val" >&2
        exit 1
      fi
      i=$((i + 1))
      ;;
    -E)
      next_idx=$((i + 1))
      [ "$next_idx" -ge "${#args[@]}" ] && { echo "[SECURITY ERROR] -E requires parameter" >&2; exit 1; }
      val="${args[$next_idx]}"
      if [[ "$val" =~ ^[A-Za-z_][A-Za-z0-9_]*(=.*)?$ ]]; then
        ENV_VARS+=("--env=$val")
        i=$((i + 2))
      else
        echo "[SECURITY ERROR isolate-wrapper] Malformed environment variable assignment: $val" >&2
        exit 1
      fi
      ;;

    # --------------------------------------------------------------------------
    # Strict Directory Mount Whitelisting
    # Allowed: strictly approved sandbox internal directories and standard isolate paths
    # --------------------------------------------------------------------------
    --dir=*|-d=*)
      val="${arg#*=}"
      if [[ "$val" =~ ^(/box|/tmp)(=(rw|/tmp|/box))?(:rw|:noexec|:maybe)?$ ]] || \
         [[ "$val" =~ ^/(usr/local|lib|usr/lib|etc):noexec$ ]]; then
        APPROVED_DIRS+=("--dir=$val")
      else
        echo "[SECURITY ERROR isolate-wrapper] Forbidden directory mount detected or syntax: $val" >&2
        exit 1
      fi
      i=$((i + 1))
      ;;
    -d)
      next_idx=$((i + 1))
      [ "$next_idx" -ge "${#args[@]}" ] && { echo "[SECURITY ERROR] -d requires parameter" >&2; exit 1; }
      val="${args[$next_idx]}"
      if [[ "$val" =~ ^(/box|/tmp)(=(rw|/tmp|/box))?(:rw|:noexec|:maybe)?$ ]] || \
         [[ "$val" =~ ^/(usr/local|lib|usr/lib|etc):noexec$ ]]; then
        APPROVED_DIRS+=("--dir=$val")
        i=$((i + 2))
      else
        echo "[SECURITY ERROR isolate-wrapper] Forbidden directory mount detected or syntax: $val" >&2
        exit 1
      fi
      ;;

    # --------------------------------------------------------------------------
    # Reject Every Unknown Argument
    # --------------------------------------------------------------------------
    *)
      echo "[SECURITY ERROR isolate-wrapper] Unknown or disallowed option: $arg" >&2
      exit 1
      ;;
  esac
done

# ------------------------------------------------------------------------------
# Validation of Operations & Cardinality
# ------------------------------------------------------------------------------
if [ "$OPERATION_COUNT" -eq 0 ]; then
  echo "[SECURITY ERROR isolate-wrapper] Missing mandatory action flag (--init, --cleanup, or --run)" >&2
  exit 1
elif [ "$OPERATION_COUNT" -ne 1 ]; then
  echo "[SECURITY ERROR isolate-wrapper] Expected exactly one operation (--init, --cleanup, or --run), got $OPERATION_COUNT" >&2
  exit 1
fi

if [ "$BOX_ID_COUNT" -eq 0 ] || [ -z "$BOX_ID" ]; then
  echo "[SECURITY ERROR isolate-wrapper] Missing or malformed box ID parameter" >&2
  exit 1
elif [ "$BOX_ID_COUNT" -ne 1 ]; then
  echo "[SECURITY ERROR isolate-wrapper] Expected exactly one box ID, got $BOX_ID_COUNT" >&2
  exit 1
fi

if [ "$BOX_ID" -lt 0 ] || [ "$BOX_ID" -gt 2147483647 ]; then
  echo "[SECURITY ERROR isolate-wrapper] Box ID $BOX_ID outside authorized range [0, 2147483647]" >&2
  exit 1
fi

if [ "$CGROUPS_COUNT" -gt 1 ]; then
  echo "[SECURITY ERROR isolate-wrapper] Duplicate --cg flag detected" >&2
  exit 1
fi

# ------------------------------------------------------------------------------
# Construct New Validated Argument Array
# ------------------------------------------------------------------------------
VALIDATED_ARGS=()

if [ "$CGROUPS_FLAG" = true ]; then
  VALIDATED_ARGS+=("--cg")
fi

VALIDATED_ARGS+=("-b" "$BOX_ID")

case "$OPERATION" in
  init)
    # --init permits ONLY cgroup flags and box ID. No run flags or commands allowed.
    if [ -n "$OPT_MEM" ] || [ -n "$OPT_TIME" ] || [ ${#APPROVED_DIRS[@]} -gt 0 ] || [ ${#COMMAND_ARGS[@]} -gt 0 ]; then
      echo "[SECURITY ERROR isolate-wrapper] Extraneous execution flags provided with --init operation" >&2
      exit 1
    fi
    VALIDATED_ARGS+=("--init")
    ;;

  cleanup)
    # --cleanup permits ONLY cgroup flags and box ID. No run flags or commands allowed.
    if [ -n "$OPT_MEM" ] || [ -n "$OPT_TIME" ] || [ ${#APPROVED_DIRS[@]} -gt 0 ] || [ ${#COMMAND_ARGS[@]} -gt 0 ]; then
      echo "[SECURITY ERROR isolate-wrapper] Extraneous execution flags provided with --cleanup operation" >&2
      exit 1
    fi
    VALIDATED_ARGS+=("--cleanup")
    ;;

  run)
    if [ "$SILENT_FLAG" = true ]; then VALIDATED_ARGS+=("-s"); fi
    if [ "$STDERR_TO_STDOUT" = true ]; then VALIDATED_ARGS+=("--stderr-to-stdout"); fi
    if [ "$CG_TIMING" = true ]; then VALIDATED_ARGS+=("--cg-timing"); fi
    if [ "$NO_CG_TIMING" = true ]; then VALIDATED_ARGS+=("--no-cg-timing"); fi
    if [ -n "$CG_MEM" ]; then VALIDATED_ARGS+=("--cg-mem=$CG_MEM"); fi
    if [ -n "$OPT_MEM" ]; then VALIDATED_ARGS+=("--mem=$OPT_MEM"); fi
    if [ -n "$OPT_TIME" ]; then VALIDATED_ARGS+=("--time=$OPT_TIME"); fi
    if [ -n "$OPT_WALL_TIME" ]; then VALIDATED_ARGS+=("--wall-time=$OPT_WALL_TIME"); fi
    if [ -n "$OPT_EXTRA_TIME" ]; then VALIDATED_ARGS+=("--extra-time=$OPT_EXTRA_TIME"); fi
    if [ -n "$OPT_STACK" ]; then VALIDATED_ARGS+=("--stack=$OPT_STACK"); fi
    if [ -n "$OPT_PROCESSES" ]; then VALIDATED_ARGS+=("--processes=$OPT_PROCESSES"); fi
    if [ -n "$OPT_FSIZE" ]; then VALIDATED_ARGS+=("--fsize=$OPT_FSIZE"); fi
    if [ -n "$OPT_META" ]; then VALIDATED_ARGS+=("--meta=$OPT_META"); fi
    if [ -n "$OPT_STDIN" ]; then VALIDATED_ARGS+=("--stdin=$OPT_STDIN"); fi
    if [ -n "$OPT_STDOUT" ]; then VALIDATED_ARGS+=("--stdout=$OPT_STDOUT"); fi
    if [ -n "$OPT_STDERR" ]; then VALIDATED_ARGS+=("--stderr=$OPT_STDERR"); fi

    for env_opt in "${ENV_VARS[@]}"; do
      VALIDATED_ARGS+=("$env_opt")
    done

    for dir_opt in "${APPROVED_DIRS[@]}"; do
      VALIDATED_ARGS+=("$dir_opt")
    done

    VALIDATED_ARGS+=("--run")

    if [ ${#COMMAND_ARGS[@]} -gt 0 ]; then
      VALIDATED_ARGS+=("--")
      for c_arg in "${COMMAND_ARGS[@]}"; do
        VALIDATED_ARGS+=("$c_arg")
      done
    fi
    ;;
esac

# ------------------------------------------------------------------------------
# Execute Canonical Binary Exclusively With Validated Array
# ------------------------------------------------------------------------------
if [ "$OPERATION" = "init" ] || [ "$OPERATION" = "run" ]; then
  OUTPUT=$("$REAL_ISOLATE" "${VALIDATED_ARGS[@]}")
  STATUS=$?
  if [ -d "/var/local/lib/isolate/$BOX_ID/box" ]; then
    chown -R judge0:judge0 "/var/local/lib/isolate/$BOX_ID/box" 2>/dev/null || chmod 777 "/var/local/lib/isolate/$BOX_ID/box" 2>/dev/null || true
  fi
  printf "%s\n" "$OUTPUT"
  exit $STATUS
fi

exec "$REAL_ISOLATE" "${VALIDATED_ARGS[@]}"


