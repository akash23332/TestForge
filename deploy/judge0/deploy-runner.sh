#!/usr/bin/env bash
# ==============================================================================
# TestForge Dedicated Execution Runner - Automated VM Setup Script
# Target: Ubuntu 22.04 LTS / 24.04 LTS (x86_64)
# Run as root or with sudo
# ==============================================================================

set -euo pipefail

echo "========================================================"
echo " TestForge Dedicated Execution Runner Setup (Judge0 CE) "
echo "========================================================"

# 1. Verify OS and Architecture
if [ "$(uname -s)" != "Linux" ]; then
  echo "[FATAL] This setup script must be run on a Linux VM."
  exit 1
fi

ARCH=$(uname -m)
if [ "$ARCH" != "x86_64" ] && [ "$ARCH" != "aarch64" ] && [ "$ARCH" != "arm64" ]; then
  echo "[FATAL] Unsupported architecture: $ARCH"
  exit 1
fi

DEFAULT_ARM64_IMAGE="testforge/judge0:v1.13.1-arm64"
DEFAULT_AMD64_IMAGE="judge0/judge0:v1.13.1"

if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
  echo "--------------------------------------------------------"
  echo "[NOTICE] Target Host Architecture: ARM64 ($ARCH)"
  echo "Official upstream 'judge0/judge0:v1.13.1' is strictly linux/amd64."
  if [ -n "${JUDGE0_IMAGE:-}" ]; then
    TARGET_JUDGE0_IMAGE="$JUDGE0_IMAGE"
    echo "Using explicit JUDGE0_IMAGE override: '$TARGET_JUDGE0_IMAGE'."
  else
    TARGET_JUDGE0_IMAGE="$DEFAULT_ARM64_IMAGE"
    echo "Defaulting to native ARM64 image: '$TARGET_JUDGE0_IMAGE'."
  fi
  echo "Running amd64 via QEMU emulation is strictly prohibited."
  echo "--------------------------------------------------------"
else
  TARGET_JUDGE0_IMAGE="${JUDGE0_IMAGE:-$DEFAULT_AMD64_IMAGE}"
  echo "[NOTICE] Target Host Architecture: x86_64 ($ARCH)"
  echo "Using Judge0 image: '$TARGET_JUDGE0_IMAGE'."
fi

# 2. Verify cgroups v1 Legacy Hierarchy (MANDATORY for Judge0 v1.13.1 isolate)
echo "[Step 1/6] Verifying cgroups v1 hierarchy..."
if ! grep -q "systemd.unified_cgroup_hierarchy=0" /proc/cmdline; then
  echo "[WARNING] Kernel is not currently booted with cgroups v1."
  echo "Applying systemd.unified_cgroup_hierarchy=0 to /etc/default/grub..."
  
  if [ -f "/etc/default/grub" ]; then
    if grep -q "GRUB_CMDLINE_LINUX=.*systemd.unified_cgroup_hierarchy=0" /etc/default/grub; then
      echo "GRUB already configured. A reboot is required to activate cgroups v1."
    else
      sed -i 's/GRUB_CMDLINE_LINUX="/GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=0 /' /etc/default/grub
      update-grub
      echo "======================================================================"
      echo "[ACTION REQUIRED] cgroups v1 kernel parameter added to GRUB."
      echo "Please REBOOT the VM now: 'sudo reboot'"
      echo "After reboot, re-run this deploy script to continue deployment."
      echo "======================================================================"
      exit 0
    fi
  else
    echo "[FATAL] /etc/default/grub not found. Ensure kernel boot parameter 'systemd.unified_cgroup_hierarchy=0' is set."
    exit 1
  fi
fi

echo "cgroups v1 legacy hierarchy active: OK"

# 3. Update packages & install dependencies
echo "[Step 2/6] Installing dependencies..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ufw jq ca-certificates gnupg lsb-release

# 4. Install Docker Engine & Compose
echo "[Step 3/6] Installing Docker Engine..."
if ! command -v docker &> /dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# 5. Configure Host Firewall (UFW)
echo "[Step 4/6] Configuring host firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH administration'
# Internal port 2358 remains bound to 127.0.0.1; only TLS port 443 is exposed externally
ufw allow 443/tcp comment 'HTTPS API endpoint for TestForge Background Worker'
ufw allow 80/tcp comment 'HTTP ACME challenge'
ufw --force enable

# 6. Generate Strong Random Cryptographic Secrets (Owner-Only Access)
echo "[Step 5/6] Generating cryptographic tokens..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/testforge-judge0"
mkdir -p "$INSTALL_DIR"

if [ "$SCRIPT_DIR" != "$INSTALL_DIR" ]; then
  echo "Staging deployment files from $SCRIPT_DIR to $INSTALL_DIR..."
  cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR"/
fi
cd "$INSTALL_DIR"

POSTGRES_PASS=$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 24)
REDIS_PASS=$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 24)
AUTHN_TOKEN=$(head -c 48 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 36)
AUTHZ_TOKEN=$(head -c 48 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 36)

# Set restrictive umask before creating secret-bearing files
OLD_UMASK=$(umask)
umask 077

# Pre-create files with strict owner-only permissions (0600)
touch "$INSTALL_DIR/.env"
chmod 600 "$INSTALL_DIR/.env"

# Write .env for docker compose
cat <<EOF > "$INSTALL_DIR/.env"
POSTGRES_USER=judge0
POSTGRES_PASSWORD=$POSTGRES_PASS
POSTGRES_DB=judge0
REDIS_PASSWORD=$REDIS_PASS
AUTHN_TOKEN=$AUTHN_TOKEN
AUTHZ_TOKEN=$AUTHZ_TOKEN
EOF

# Persist resolved Judge0 image to .env so docker compose adheres to target architecture
echo "JUDGE0_IMAGE=$TARGET_JUDGE0_IMAGE" >> "$INSTALL_DIR/.env"

# Update judge0.conf with actual values and harden permissions
if [ -f "judge0.conf" ]; then
  chmod 600 judge0.conf
  sed -i "s/^AUTHN_TOKEN=.*/AUTHN_TOKEN=$AUTHN_TOKEN/" judge0.conf
  sed -i "s/^AUTHZ_TOKEN=.*/AUTHZ_TOKEN=$AUTHZ_TOKEN/" judge0.conf
  sed -i "s/^REDIS_PASSWORD=.*/REDIS_PASSWORD=$REDIS_PASS/" judge0.conf
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$POSTGRES_PASS/" judge0.conf
  chmod 600 judge0.conf
fi

# Restore umask
umask "$OLD_UMASK"

# Explicit post-creation permission & ownership verification
ENV_PERMS=$(stat -c "%a" "$INSTALL_DIR/.env" 2>/dev/null || stat -f "%Lp" "$INSTALL_DIR/.env" 2>/dev/null || echo "unknown")
if [ "$ENV_PERMS" != "600" ]; then
  echo "[FATAL] Insecure file permissions on $INSTALL_DIR/.env: $ENV_PERMS (expected 600)."
  exit 1
fi
if [ -f "$INSTALL_DIR/judge0.conf" ]; then
  CONF_PERMS=$(stat -c "%a" "$INSTALL_DIR/judge0.conf" 2>/dev/null || stat -f "%Lp" "$INSTALL_DIR/judge0.conf" 2>/dev/null || echo "unknown")
  if [ "$CONF_PERMS" != "600" ]; then
    echo "[FATAL] Insecure file permissions on $INSTALL_DIR/judge0.conf: $CONF_PERMS (expected 600)."
    exit 1
  fi
fi
echo "Secret files verified with strict owner-only permissions (mode 0600)."

# 7. Start Services
echo "[Step 6/6] Verifying and acquiring container images..."

# Explicitly pull required external infrastructure dependencies (fail-fast if unreachable)
echo "Pulling external database and cache images (postgres:16-alpine, redis:7-alpine)..."
docker compose pull judge0-db judge0-redis

# Verify Judge0 image availability strictly adhering to host architecture policy
if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
  if docker image inspect "$TARGET_JUDGE0_IMAGE" &>/dev/null; then
    # Validate the architecture of the local image (fails closed if non-ARM64)
    RESOLVED_IMG_ARCH=$(docker image inspect "$TARGET_JUDGE0_IMAGE" --format '{{.Architecture}}' 2>/dev/null || echo "UNKNOWN")
    if [ "$RESOLVED_IMG_ARCH" != "arm64" ] && [ "$RESOLVED_IMG_ARCH" != "aarch64" ]; then
      echo "----------------------------------------------------------------------"
      echo "[FATAL] Image '$TARGET_JUDGE0_IMAGE' architecture is '$RESOLVED_IMG_ARCH', expected 'arm64' or 'aarch64'."
      echo "Refusing to deploy non-ARM64 image on an ARM64 host. Emulation is prohibited."
      echo "----------------------------------------------------------------------"
      exit 1
    fi
    echo "Verified native ARM64 Judge0 image present in Docker cache: $TARGET_JUDGE0_IMAGE ($RESOLVED_IMG_ARCH)"
  else
    echo "----------------------------------------------------------------------"
    echo "[FATAL] Required ARM64 Judge0 image '$TARGET_JUDGE0_IMAGE' not found in local Docker cache."
    echo "Upstream 'judge0/judge0:v1.13.1' does not provide an official linux/arm64 image."
    echo "You must build the native ARM64 image on this host before deploying:"
    echo "  sudo bash ./build-arm64.sh"
    echo "Refusing to pull upstream amd64 images on ARM64 architecture (emulation prohibited)."
    echo "----------------------------------------------------------------------"
    exit 1
  fi
else
  if docker image inspect "$TARGET_JUDGE0_IMAGE" &>/dev/null; then
    RESOLVED_IMG_ARCH=$(docker image inspect "$TARGET_JUDGE0_IMAGE" --format '{{.Architecture}}' 2>/dev/null || echo "UNKNOWN")
    echo "Verified Judge0 image in local Docker cache: $TARGET_JUDGE0_IMAGE ($RESOLVED_IMG_ARCH)"
  else
    echo "Image '$TARGET_JUDGE0_IMAGE' not found locally. Pulling from registry..."
    docker compose pull judge0-server judge0-workers
  fi
fi

# Assert all required images exist before starting containers
echo "Asserting image availability before launch..."
docker image inspect "$TARGET_JUDGE0_IMAGE" > /dev/null
docker image inspect postgres:16-alpine > /dev/null
docker image inspect redis:7-alpine > /dev/null
echo "All required container images verified present."

docker compose up -d

echo ""
echo "Running operational cgroups v1 & isolate verification..."
if [ -f "./verify-cgroups-isolate.sh" ]; then
  bash ./verify-cgroups-isolate.sh
fi

echo ""
echo "========================================================"
echo " Runner Deployment Completed Successfully! "
echo "========================================================"
echo " Runner API:       http://127.0.0.1:2358"
echo " Secrets File:     $INSTALL_DIR/.env (mode 0600, owner-only)"
echo " Tokens:           [REDACTED] View securely via: sudo cat $INSTALL_DIR/.env"
echo ""
echo " Next Steps:"
echo " 1. Configure Caddy / Nginx reverse proxy for domain TLS on port 443."
echo " 2. Run ./verify-containment.sh to execute hostile-code attack suite."
echo " 3. In TestForge Background Worker environment, configure:"
echo "    EXECUTION_PROVIDER=render_sandbox"
echo "    RENDER_SANDBOX_ENDPOINT=https://your-runner-domain.com"
echo "    RENDER_SANDBOX_API_KEY=\$(sudo grep '^AUTHN_TOKEN=' $INSTALL_DIR/.env | cut -d'=' -f2)"
echo "========================================================"
