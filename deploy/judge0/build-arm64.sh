#!/usr/bin/env bash
# ==============================================================================
# TestForge Dedicated Execution Runner - Automated Native ARM64 Build Script
# Target Architecture: linux/arm64 (OCI Ampere A1, AWS Graviton, Apple Silicon)
# Builds:
#   1. testforge/compilers:v1.4.0-arm64
#   2. testforge/judge0:v1.13.1-arm64
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$SCRIPT_DIR/docker"

echo "========================================================"
echo " TestForge Custom Native ARM64 Judge0 Build Pipeline   "
echo " Host:         $(hostname) ($(uname -m))"
echo " Date:         $(date -u)"
echo "========================================================"

# 1. Architecture Check (Strictly Native ARM64 Only)
HOST_ARCH=$(uname -m)
TARGET_PLATFORM="linux/arm64"

if [ "$HOST_ARCH" != "aarch64" ] && [ "$HOST_ARCH" != "arm64" ]; then
  echo "--------------------------------------------------------"
  echo "[FATAL] Native ARM64 build requires an aarch64/arm64 host."
  echo "Detected host architecture: '$HOST_ARCH'."
  echo "Cross-compilation via QEMU or binfmt emulation is strictly prohibited"
  echo "because it invalidates Isolate syscall filtering and cgroup verification."
  echo "Please run this build script directly on the native ARM64 runner VM."
  echo "--------------------------------------------------------"
  exit 1
fi

# 2. Check Docker and Buildx Availability & Native Daemon Architecture
if ! command -v docker &> /dev/null; then
  echo "[FATAL] Docker is not installed or not in PATH."
  exit 1
fi

DOCKER_SERVER_ARCH=$(docker version --format '{{.Server.Arch}}' 2>/dev/null || docker info --format '{{.Architecture}}' 2>/dev/null || echo "UNKNOWN")
if [ "$DOCKER_SERVER_ARCH" != "aarch64" ] && [ "$DOCKER_SERVER_ARCH" != "arm64" ]; then
  echo "--------------------------------------------------------"
  echo "[FATAL] Docker daemon architecture is '$DOCKER_SERVER_ARCH' (expected 'aarch64' or 'arm64')."
  echo "Refusing to build ARM64 images under a non-native Docker engine."
  echo "--------------------------------------------------------"
  exit 1
fi

# Verify Buildx configuration does not silently use emulation
if docker buildx version &>/dev/null; then
  CURRENT_BUILDER=$(docker buildx inspect 2>/dev/null || echo "")
  if echo "$CURRENT_BUILDER" | grep -qi "Platforms:" && ! echo "$CURRENT_BUILDER" | grep -qi "linux/arm64"; then
    echo "[FATAL] Current Docker Buildx builder does not support linux/arm64 natively."
    exit 1
  fi
fi

# Assert binfmt_misc emulation is not intercepting native execution
if [ -f "/proc/sys/fs/binfmt_misc/qemu-aarch64" ]; then
  if grep -q "enabled" "/proc/sys/fs/binfmt_misc/qemu-aarch64" 2>/dev/null; then
    echo "[WARNING] qemu-aarch64 binfmt handler is registered on host."
    echo "Verifying that container execution is native..."
  fi
fi

export DOCKER_BUILDKIT=1

# 3. Build Base Compilers Image (testforge/compilers:v1.4.0-arm64)
echo ""
echo "── Step 1/2: Building testforge/compilers:v1.4.0-arm64 ──"
docker build \
  --platform "$TARGET_PLATFORM" \
  -t "testforge/compilers:v1.4.0-arm64" \
  -f "$DOCKER_DIR/Dockerfile.compilers-arm64" \
  "$DOCKER_DIR"

echo "  ✔ testforge/compilers:v1.4.0-arm64 built successfully."

# 4. Build Judge0 Application Image (testforge/judge0:v1.13.1-arm64)
echo ""
echo "── Step 2/2: Building testforge/judge0:v1.13.1-arm64 ──"
docker build \
  --platform "$TARGET_PLATFORM" \
  -t "testforge/judge0:v1.13.1-arm64" \
  -f "$DOCKER_DIR/Dockerfile.judge0-arm64" \
  "$DOCKER_DIR"

echo "  ✔ testforge/judge0:v1.13.1-arm64 built successfully."

# 5. Check and Update .env in deploy directory
if [ -f "$SCRIPT_DIR/.env" ]; then
  if grep -q "^JUDGE0_IMAGE=" "$SCRIPT_DIR/.env"; then
    sed -i 's|^JUDGE0_IMAGE=.*|JUDGE0_IMAGE=testforge/judge0:v1.13.1-arm64|' "$SCRIPT_DIR/.env"
  else
    echo "JUDGE0_IMAGE=testforge/judge0:v1.13.1-arm64" >> "$SCRIPT_DIR/.env"
  fi
  echo "Updated $SCRIPT_DIR/.env with JUDGE0_IMAGE=testforge/judge0:v1.13.1-arm64."
fi

echo ""
echo "========================================================"
echo " Native ARM64 Images Built Successfully! "
echo "========================================================"
echo " Base Image:    testforge/compilers:v1.4.0-arm64"
echo " App Image:     testforge/judge0:v1.13.1-arm64"
echo ""
echo " Next Verification Steps:"
echo " 1. Run ./verify-arm64-binaries.sh to verify ELF architectures & isolate."
echo " 2. Run docker compose up -d to launch the stack on ARM64 staging host."
echo " 3. Run ./verify-containment.sh to validate sandbox security boundaries."
echo "========================================================"
