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
if [ "$ARCH" != "x86_64" ] && [ "$ARCH" != "aarch64" ]; then
  echo "[FATAL] Unsupported architecture: $ARCH"
  exit 1
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

# 6. Generate Strong Random Cryptographic Secrets
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

# Write .env for docker compose
cat <<EOF > "$INSTALL_DIR/.env"
POSTGRES_USER=judge0
POSTGRES_PASSWORD=$POSTGRES_PASS
POSTGRES_DB=judge0
REDIS_PASSWORD=$REDIS_PASS
AUTHN_TOKEN=$AUTHN_TOKEN
AUTHZ_TOKEN=$AUTHZ_TOKEN
EOF

# Update judge0.conf with actual values
if [ -f "judge0.conf" ]; then
  sed -i "s/^AUTHN_TOKEN=.*/AUTHN_TOKEN=$AUTHN_TOKEN/" judge0.conf
  sed -i "s/^AUTHZ_TOKEN=.*/AUTHZ_TOKEN=$AUTHZ_TOKEN/" judge0.conf
  sed -i "s/^REDIS_PASSWORD=.*/REDIS_PASSWORD=$REDIS_PASS/" judge0.conf
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$POSTGRES_PASS/" judge0.conf
fi

# 7. Start Services
echo "[Step 6/6] Launching Judge0 CE services..."
docker compose pull
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
echo " Auth Token:       $AUTHN_TOKEN"
echo " Admin Token:      $AUTHZ_TOKEN"
echo ""
echo " Next Steps:"
echo " 1. Configure Caddy / Nginx reverse proxy for domain TLS on port 443."
echo " 2. Run ./verify-containment.sh to execute hostile-code attack suite."
echo " 3. In TestForge Background Worker environment, configure:"
echo "    EXECUTION_PROVIDER=render_sandbox"
echo "    RENDER_SANDBOX_ENDPOINT=https://your-runner-domain.com"
echo "    RENDER_SANDBOX_API_KEY=$AUTHN_TOKEN"
echo "========================================================"
